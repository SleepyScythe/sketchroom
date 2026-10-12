/* Sketchroom: Fill, line, shapes and smudge, plus the tool strip over the canvas that changes with the tool.
   Plain script. Shares globals with the other files in js/; load order is set in index.html. */
'use strict';

/* ---------- the tool strip ----------
   Brush and eraser are on the rail. The other tools sit behind "…" (MORE_TOOLS), and while one of them is picked a small
   strip at the top of the canvas names it and holds its settings. Size and opacity are always the rail sliders. */
var MORE_TOOLS = ['smudge', 'fill', 'line', 'shape', 'select', 'text', 'picker', 'hand'];
function quickTitle() {
  var t = S.tool, bn = S.brushName + (S.dirty ? ' (edited)' : '');
  if (isPixel() && { brush: 1, eraser: 1, line: 1, shape: 1 }[t]) return { brush: 'Pixel pencil', eraser: 'Pixel eraser', line: 'Pixel line', shape: 'Pixel shapes' }[t];
  return t === 'eraser' ? 'Eraser' : t === 'smudge' ? 'Smudge' : t === 'fill' ? 'Fill' : t === 'select' ? 'Select and move'
    : t === 'line' ? 'Line with ' + bn : t === 'shape' ? 'Shapes with ' + bn : t === 'text' ? 'Text: tap the canvas to place it'
    : t === 'picker' ? 'Pick a color: tap the canvas' : t === 'hand' ? 'Move canvas: drag to move, pinch to zoom' : bn;
}
function updateQuick() {
  var t = S.tool, more = MORE_TOOLS.indexOf(t) >= 0;
  $('#toolStrip').hidden = !more;
  $('#moreTools').setAttribute('aria-pressed', String(more));
  $('#qFill').hidden = t !== 'fill'; $('#qShape').hidden = t !== 'shape'; $('#qSelect').hidden = t !== 'select'; $('#qText').hidden = t !== 'text';
  if (quickSliders[1]) quickSliders[1].setLabel(t === 'smudge' ? 'Strength' : 'Opacity');
  $$('[data-shape-kind]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.shapeKind === S.shape.kind)); });
  $$('[data-shape-fill]').forEach(function (b) { b.setAttribute('aria-pressed', String((b.dataset.shapeFill === '1') === S.shape.filled)); });
  $$('[data-sel-kind]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.selKind === S.selKind)); });
  $('#selNone').disabled = $('#selDelete').disabled = !S.sel;
  $('#quickWho').textContent = quickTitle();
}
function initTools() {
  var q = $('#qFill'), chk = $('#fillAll').closest('label');
  q.insertBefore(makeSlider('Tolerance', 0, 100, '%', function () { return S.fill.tolerance; }, function (v) { S.fill.tolerance = v; }), chk);
  q.insertBefore(makeSlider('Opacity', 1, 100, '%', function () { return S.fill.opacity; }, function (v) { S.fill.opacity = v; }), chk);
  $('#fillAll').addEventListener('change', function (e) { S.fill.allLayers = e.target.checked; });
  $$('[data-shape-kind]').forEach(function (b) { b.addEventListener('click', function () { S.shape.kind = b.dataset.shapeKind; updateQuick(); }); });
  $$('[data-shape-fill]').forEach(function (b) { b.addEventListener('click', function () { S.shape.filled = b.dataset.shapeFill === '1'; updateQuick(); }); });
  $$('[data-sel-kind]').forEach(function (b) { b.addEventListener('click', function () { S.selKind = b.dataset.selKind; updateQuick(); }); });
  $('#textOpen').addEventListener('click', function () { openPanel('text'); });
  $('#selNone').addEventListener('click', function () { dropSelection(true); });
  $('#selDelete').addEventListener('click', deleteSelection);
}

/* ---------- fill ---------- */
// Scanline flood fill. Colors are compared premultiplied, so all fully transparent pixels count as the same color.
function floodMask(d, W, Hh, sx, sy, tolPct) {
  var tol = tolPct * 2.55, mask = new Uint8Array(W * Hh);
  var i0 = (sy * W + sx) * 4, sa = d[i0 + 3], sr = d[i0] * sa / 255, sg = d[i0 + 1] * sa / 255, sb = d[i0 + 2] * sa / 255;
  var match = function (p) {
    var j = p * 4, a = d[j + 3];
    return Math.abs(a - sa) <= tol && Math.abs(d[j] * a / 255 - sr) <= tol && Math.abs(d[j + 1] * a / 255 - sg) <= tol && Math.abs(d[j + 2] * a / 255 - sb) <= tol;
  };
  var stack = [sx, sy], bb = { x0: sx, y0: sy, x1: sx, y1: sy };
  while (stack.length) {
    var y = stack.pop(), x = stack.pop(), row = y * W;
    if (mask[row + x] || !match(row + x)) continue;
    var lx = x, rx = x;
    while (lx > 0 && !mask[row + lx - 1] && match(row + lx - 1)) lx--;
    while (rx < W - 1 && !mask[row + rx + 1] && match(row + rx + 1)) rx++;
    for (var i = lx; i <= rx; i++) mask[row + i] = 1;
    if (lx < bb.x0) bb.x0 = lx; if (rx > bb.x1) bb.x1 = rx; if (y < bb.y0) bb.y0 = y; if (y > bb.y1) bb.y1 = y;
    for (var ny = y - 1; ny <= y + 1; ny += 2) {
      if (ny < 0 || ny >= Hh) continue;
      var nrow = ny * W, run = false;
      for (var k = lx; k <= rx; k++) {
        if (!mask[nrow + k] && match(nrow + k)) { if (!run) { stack.push(k, ny); run = true; } } else run = false;
      }
    }
  }
  return { mask: mask, bb: bb };
}
function fillAt(pos) {
  var L = activeLayer(); if (!canDraw(L)) return;
  var W = DOC_W, Hh = DOC_H, x = Math.floor(pos.x), y = Math.floor(pos.y);
  if (x < 0 || y < 0 || x >= W || y >= Hh) return;
  var src = L.canvas;
  if (S.fill.allLayers) {
    src = document.createElement('canvas'); src.width = W; src.height = Hh;
    var g = src.getContext('2d');
    S.layers.forEach(function (K) {
      if (!K.visible) return;
      g.globalAlpha = K.opacity; g.globalCompositeOperation = K.blend === 'normal' ? 'source-over' : K.blend; g.drawImage(K.canvas, 0, 0);
    });
  }
  var f = floodMask(src.getContext('2d').getImageData(0, 0, W, Hh).data, W, Hh, x, y, S.fill.tolerance), mask = f.mask, bb = f.bb;
  // The filled area, plus a 2px ring around it painted *behind* existing pixels, so it tucks under soft line edges without a halo.
  // Pixel art has no soft edges, so it gets an exact fill with no ring.
  var R = isPixel() ? 0 : 2, bx0 = Math.max(0, bb.x0 - R), by0 = Math.max(0, bb.y0 - R), bx1 = Math.min(W - 1, bb.x1 + R), by1 = Math.min(Hh - 1, bb.y1 + R);
  var bw = bx1 - bx0 + 1, bh = by1 - by0 + 1, core = new ImageData(bw, bh), ring = new ImageData(bw, bh);
  var rgb = hexToRgb(S.color), A = Math.round(S.fill.opacity * 2.55);
  var put = function (img, px, py) { var j = ((py - by0) * bw + (px - bx0)) * 4; img.data[j] = rgb[0]; img.data[j + 1] = rgb[1]; img.data[j + 2] = rgb[2]; img.data[j + 3] = A; };
  for (var py = bb.y0; py <= bb.y1; py++) {
    for (var px = bb.x0; px <= bb.x1; px++) {
      var p = py * W + px; if (!mask[p]) continue;
      put(core, px, py);
      var edge = (px > 0 && !mask[p - 1]) || (px < W - 1 && !mask[p + 1]) || (py > 0 && !mask[p - W]) || (py < Hh - 1 && !mask[p + W]);
      if (!edge) continue;
      for (var dy = -R; dy <= R; dy++) for (var dx = -R; dx <= R; dx++) {
        var nx = px + dx, ny = py + dy;
        if (dx * dx + dy * dy > R * R + 1 || nx < 0 || ny < 0 || nx >= W || ny >= Hh || mask[ny * W + nx]) continue;
        put(ring, nx, ny);
      }
    }
  }
  var snap = crop(L.canvas, 0, 0, W, Hh), tmp = document.createElement('canvas'); tmp.width = bw; tmp.height = bh;
  var tg = tmp.getContext('2d');
  tg.putImageData(core, 0, 0); L.ctx.drawImage(tmp, bx0, by0);
  tg.clearRect(0, 0, bw, bh); tg.putImageData(ring, 0, 0);
  L.ctx.globalCompositeOperation = 'destination-over'; L.ctx.drawImage(tmp, bx0, by0); L.ctx.globalCompositeOperation = 'source-over';
  recordCrop(L, snap, { x0: bx0, y0: by0, x1: bx1 + 1, y1: by1 + 1 });
  setColor(S.color, true);
}

/* ---------- line and shapes ---------- */
// Shift snaps a line to 15 degree steps and makes shapes square or round.
function constrainEnd(tool, a, z, shift) {
  if (!shift) return z;
  var dx = z.x - a.x, dy = z.y - a.y;
  if (tool === 'line') {
    var len = Math.hypot(dx, dy), ang = Math.round(Math.atan2(dy, dx) / (Math.PI / 12)) * (Math.PI / 12);
    return { x: a.x + Math.cos(ang) * len, y: a.y + Math.sin(ang) * len };
  }
  var m = Math.max(Math.abs(dx), Math.abs(dy));
  return { x: a.x + (dx < 0 ? -m : m), y: a.y + (dy < 0 ? -m : m) };
}
// Draws the line or shape with the current brush and returns the area it touched (or null).
function drawShape(g, tool, a, z, b) {
  if (isPixel()) return drawPixelShape(g, tool, a, z);
  if (tool === 'line') { var le = new Engine(g, b, S.color, 1, 1); le.add(a.x, a.y, 1); le.add(z.x, z.y, 1); return le.bb; }
  var x0 = Math.min(a.x, z.x), y0 = Math.min(a.y, z.y), x1 = Math.max(a.x, z.x), y1 = Math.max(a.y, z.y);
  if (x1 - x0 < 1 && y1 - y0 < 1) return null;
  var cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, rx = (x1 - x0) / 2, ry = (y1 - y0) / 2;
  if (S.shape.filled) {
    g.fillStyle = S.color; g.beginPath();
    if (S.shape.kind === 'rect') g.rect(x0, y0, x1 - x0, y1 - y0); else g.ellipse(cx, cy, Math.max(rx, 0.5), Math.max(ry, 0.5), 0, 0, Math.PI * 2);
    g.fill();
    return { x0: x0 - 2, y0: y0 - 2, x1: x1 + 2, y1: y1 + 2 };
  }
  var pts = [];
  if (S.shape.kind === 'rect') pts = [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]];
  else {
    var n = clamp(Math.round((rx + ry) * 0.6), 24, 360);
    for (var i = 0; i <= n; i++) { var t = i / n * Math.PI * 2; pts.push([cx + rx * Math.cos(t), cy + ry * Math.sin(t)]); }
  }
  var e = new Engine(g, b, S.color, 1, 1);
  pts.forEach(function (p) { e.add(p[0], p[1], 1); });
  return e.bb;
}
// Line and shapes preview in the stroke buffer above the layer, then land on it in one undo step.
function beginShape(e, pos) {
  var L = activeLayer(); if (!canDraw(L)) return;
  var tool = S.tool, b = P(S.brush); b.smoothing = 0; // straight means straight
  if (isPixel()) b.opacity = S.pxPen.opacity;
  var snap = crop(L.canvas, 0, 0, DOC_W, DOC_H), st = { a: pos, z: pos, bb: null };
  bctx.setTransform(1, 0, 0, 1, 0, 0); bctx.globalAlpha = 1; bctx.clearRect(0, 0, DOC_W, DOC_H);
  buffer.style.opacity = (b.opacity / 100) * L.opacity; buffer.style.mixBlendMode = L.blend;
  stage.insertBefore(buffer, L.canvas.nextSibling);
  var render = function () { bctx.clearRect(0, 0, DOC_W, DOC_H); st.bb = drawShape(bctx, tool, st.a, st.z, b); };
  render();
  drag = {
    id: e.pointerId,
    move: function (ev) { st.z = constrainEnd(tool, st.a, docPos(ev), ev.shiftKey); render(); },
    end: function (ev) {
      st.z = constrainEnd(tool, st.a, docPos(ev), ev.shiftKey); render();
      if (!st.bb) { buffer.remove(); return; }
      L.ctx.globalAlpha = b.opacity / 100; L.ctx.drawImage(buffer, 0, 0); L.ctx.globalAlpha = 1; buffer.remove();
      recordCrop(L, snap, st.bb); setColor(S.color, true);
    },
    cancel: function () { buffer.remove(); }
  };
}

/* ---------- smudge ---------- */
// Carries a patch of the layer along the stroke and blends it in, picking up a little of what it passes over.
function beginSmudge(e, pos) {
  var L = activeLayer(); if (!canDraw(L)) return;
  var b = S.smudge, d = Math.max(4, Math.round(b.size)), type = e.pointerType;
  var mk = function () { var c = document.createElement('canvas'); c.width = c.height = d; return c; };
  var carry = mk(), cg = carry.getContext('2d'), tmp = mk(), tg = tmp.getContext('2d'), mask = mk(), mg = mask.getContext('2d');
  var grad = mg.createRadialGradient(d / 2, d / 2, 0, d / 2, d / 2, d / 2);
  grad.addColorStop(0, 'rgba(0,0,0,1)'); grad.addColorStop(clamp(b.hardness / 100, 0, 0.95), 'rgba(0,0,0,1)'); grad.addColorStop(1, 'rgba(0,0,0,0)');
  mg.fillStyle = grad; mg.fillRect(0, 0, d, d);
  var snap = crop(L.canvas, 0, 0, DOC_W, DOC_H), bb = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  var corner = function (v) { return Math.round(v - d / 2); };
  cg.drawImage(L.canvas, corner(pos.x), corner(pos.y), d, d, 0, 0, d, d);
  var step = Math.max(1, d * 0.1), last = { x: pos.x, y: pos.y }, acc = 0, pst = newPressure(type);
  var dab = function (x, y, p) {
    var st = clamp(b.opacity / 100, 0.01, 0.95) * (type === 'pen' ? 0.3 + 0.7 * p : 1), x0 = corner(x), y0 = corner(y);
    tg.globalCompositeOperation = 'copy'; tg.drawImage(carry, 0, 0);
    tg.globalCompositeOperation = 'destination-in'; tg.drawImage(mask, 0, 0); tg.globalCompositeOperation = 'source-over';
    L.ctx.globalAlpha = st; L.ctx.drawImage(tmp, x0, y0); L.ctx.globalAlpha = 1;
    cg.globalAlpha = 1 - st; cg.drawImage(L.canvas, x0, y0, d, d, 0, 0, d, d); cg.globalAlpha = 1;
    if (x0 < bb.x0) bb.x0 = x0; if (y0 < bb.y0) bb.y0 = y0; if (x0 + d > bb.x1) bb.x1 = x0 + d; if (y0 + d > bb.y1) bb.y1 = y0 + d;
  };
  var to = function (x, y, p) {
    var dx = x - last.x, dy = y - last.y, dist = Math.hypot(dx, dy);
    if (dist < 0.01) return;
    var at = step - acc;
    while (at <= dist) { dab(last.x + dx * at / dist, last.y + dy * at / dist, p); at += step; }
    acc = dist - (at - step); last = { x: x, y: y };
  };
  drag = {
    id: e.pointerId,
    move: function (ev) {
      var list = ev.getCoalescedEvents ? ev.getCoalescedEvents() : [ev]; if (!list.length) list = [ev];
      list.forEach(function (c) { var q = docPos(c); to(q.x, q.y, samplePressure(pst, c, ev)); });
    },
    end: function () { finishPressure(pst); if (bb.x1 > bb.x0) recordCrop(L, snap, bb); },
    cancel: function () { restore(L, snap, 0, 0); }
  };
}
