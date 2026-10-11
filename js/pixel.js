/* Sketchroom: Pixel art. The crisp pencil, eraser, line and shapes on whole pixels, the pixel and tile grid,
   and hard-edged selection masks. An image is pixel art when S.doc.px is set ({ tile, cols, rows }).
   Plain script. Shares globals with the other files in js/; load order is set in index.html. */
'use strict';

function isPixel() { return !!(S.doc && S.doc.px); }
function pixelAt(e) { var p = docPos(e); return { x: Math.floor(p.x), y: Math.floor(p.y) }; }
function pixelSize() { return clamp(Math.round(curParams().size), 1, 64); }
function newBB() { return { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity }; }
// Every whole pixel on the line from a to b, both ends included (Bresenham).
function pixelLine(a, b, plot) {
  var x = a.x, y = a.y, dx = Math.abs(b.x - x), dy = -Math.abs(b.y - y), sx = x < b.x ? 1 : -1, sy = y < b.y ? 1 : -1, err = dx + dy;
  for (var guard = 0; guard < 100000; guard++) {
    plot(x, y);
    if (x === b.x && y === b.y) break;
    var e2 = 2 * err;
    if (e2 >= dy) { err += dy; x += sx; }
    if (e2 <= dx) { err += dx; y += sy; }
  }
}
// Plots an n by n square of pixels centered on (x, y) and grows bb to cover it.
function plotter(g, n, erase, bb) {
  var o = (n - 1) >> 1;
  return function (x, y) {
    var x0 = x - o, y0 = y - o;
    if (erase) g.clearRect(x0, y0, n, n); else g.fillRect(x0, y0, n, n);
    if (x0 < bb.x0) bb.x0 = x0; if (y0 < bb.y0) bb.y0 = y0; if (x0 + n > bb.x1) bb.x1 = x0 + n; if (y0 + n > bb.y1) bb.y1 = y0 + n;
  };
}

/* ---------- pencil and eraser ---------- */
// Like a brush stroke: the pencil draws into the buffer (so its opacity doesn't stack) and lands as one undo step.
function beginPixelStroke(e) {
  var L = activeLayer(); if (!canDraw(L)) return;
  var erase = S.tool === 'eraser', p = curParams(), snap = crop(L.canvas, 0, 0, DOC_W, DOC_H), bb = newBB();
  if (!erase) {
    bctx.setTransform(1, 0, 0, 1, 0, 0); bctx.globalAlpha = 1; bctx.clearRect(0, 0, DOC_W, DOC_H); bctx.fillStyle = S.color;
    buffer.style.opacity = (p.opacity / 100) * L.opacity; buffer.style.mixBlendMode = L.blend;
    stage.insertBefore(buffer, L.canvas.nextSibling);
  }
  var plot = plotter(erase ? L.ctx : bctx, pixelSize(), erase, bb), last = pixelAt(e);
  plot(last.x, last.y);
  drag = {
    id: e.pointerId,
    move: function (ev) {
      var list = ev.getCoalescedEvents ? ev.getCoalescedEvents() : [ev]; if (!list.length) list = [ev];
      list.forEach(function (c) { var q = pixelAt(c); if (q.x !== last.x || q.y !== last.y) { pixelLine(last, q, plot); last = q; } });
    },
    end: function () {
      if (!erase) { L.ctx.globalAlpha = p.opacity / 100; L.ctx.drawImage(buffer, 0, 0); L.ctx.globalAlpha = 1; buffer.remove(); }
      recordCrop(L, snap, bb);
      if (!erase) setColor(S.color, true);
    },
    cancel: function () { if (erase) restore(L, snap, 0, 0); else buffer.remove(); }
  };
}

/* ---------- line and shapes ---------- */
// Rows of an ellipse filling the pixel box x0..x1, y0..y1 (inclusive): { y: [left, right] }.
function ellipseSpans(x0, y0, x1, y1) {
  var cx = (x0 + x1 + 1) / 2, cy = (y0 + y1 + 1) / 2, rx = (x1 - x0 + 1) / 2, ry = (y1 - y0 + 1) / 2, rows = {};
  for (var y = y0; y <= y1; y++) {
    var t = (y + 0.5 - cy) / ry; if (Math.abs(t) > 1) continue;
    var hw = rx * Math.sqrt(1 - t * t), a = Math.ceil(cx - hw - 0.5), b = Math.floor(cx + hw - 0.5);
    if (a > b) a = b = Math.round(cx - 0.5);
    rows[y] = [a, b];
  }
  return rows;
}
function drawPixelShape(g, tool, a, z) {
  var bb = newBB(), plot = plotter(g, pixelSize(), false, bb);
  g.fillStyle = S.color;
  a = { x: Math.floor(a.x), y: Math.floor(a.y) }; z = { x: Math.floor(z.x), y: Math.floor(z.y) };
  if (tool === 'line') { pixelLine(a, z, plot); return bb; }
  var x0 = Math.min(a.x, z.x), y0 = Math.min(a.y, z.y), x1 = Math.max(a.x, z.x), y1 = Math.max(a.y, z.y);
  if (S.shape.kind === 'rect') {
    if (S.shape.filled) { g.fillRect(x0, y0, x1 - x0 + 1, y1 - y0 + 1); return { x0: x0, y0: y0, x1: x1 + 1, y1: y1 + 1 }; }
    var c = [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
    for (var i = 0; i < 4; i++) pixelLine(c[i], c[(i + 1) % 4], plot);
    return bb;
  }
  var rows = ellipseSpans(x0, y0, x1, y1);
  var inside = function (x, y) { var r = rows[y]; return !!r && x >= r[0] && x <= r[1]; };
  Object.keys(rows).forEach(function (k) {
    var y = Number(k), r = rows[y];
    if (S.shape.filled) { g.fillRect(r[0], y, r[1] - r[0] + 1, 1); return; }
    // The outline is every filled pixel that touches the outside, so it stays one pixel thick and unbroken.
    for (var x = r[0]; x <= r[1]; x++) {
      if (!inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1)) plot(x, y);
    }
  });
  if (S.shape.filled) return { x0: x0, y0: y0, x1: x1 + 1, y1: y1 + 1 };
  return bb;
}

/* ---------- grid ---------- */
// Drawn on its own screen-sized canvas over the viewport, so the lines stay one screen pixel thick at any zoom.
function drawGrid() {
  var c = $('#grid'), r = vp.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
  var W = Math.max(1, Math.round(r.width * dpr)), Hh = Math.max(1, Math.round(r.height * dpr));
  if (c.width !== W || c.height !== Hh) { c.width = W; c.height = Hh; }
  var g = c.getContext('2d'); g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, W, Hh);
  if (!isPixel() || !r.width) return;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  var v = S.view, s = v.s, px = S.doc.px;
  var x0 = clamp(Math.floor(-v.x / s), 0, DOC_W), x1 = clamp(Math.ceil((r.width - v.x) / s), 0, DOC_W);
  var y0 = clamp(Math.floor(-v.y / s), 0, DOC_H), y1 = clamp(Math.ceil((r.height - v.y) / s), 0, DOC_H);
  var X = function (x) { return Math.round(v.x + x * s) + 0.5; }, Y = function (y) { return Math.round(v.y + y * s) + 0.5; };
  var lines = function (step, style) {
    g.strokeStyle = style; g.lineWidth = 1; g.beginPath();
    for (var x = Math.ceil(x0 / step) * step; x <= x1; x += step) { g.moveTo(X(x), Y(y0)); g.lineTo(X(x), Y(y1)); }
    for (var y = Math.ceil(y0 / step) * step; y <= y1; y += step) { g.moveTo(X(x0), Y(y)); g.lineTo(X(x1), Y(y)); }
    g.stroke();
  };
  if (s >= 8) lines(1, 'rgba(0,0,0,0.12)');
  if (px.tile && px.tile * s >= 4) lines(px.tile, 'rgba(15,143,128,0.75)');
}

/* ---------- hard-edged selections ---------- */
// The selection shape as a mask with no soft edge, so moved or deleted pixel art keeps crisp edges.
function hardMask(path, x0, y0, w, h) {
  var m = document.createElement('canvas'); m.width = w; m.height = h;
  var g = m.getContext('2d'); g.translate(-x0, -y0); g.fill(path);
  var img = g.getImageData(0, 0, w, h), d = img.data;
  for (var i = 3; i < d.length; i += 4) d[i] = d[i] >= 128 ? 255 : 0;
  g.putImageData(img, 0, 0); return m;
}
