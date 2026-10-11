/* Sketchroom: View (pan and zoom), tools and pointer handling.
   Plain script. Shares globals with the other files in js/; load order is set in index.html. */
'use strict';

/* ---------- view, pan and zoom ---------- */
function applyView() {
  var v = S.view; stage.style.transform = 'translate(' + v.x + 'px,' + v.y + 'px) scale(' + v.s + ')';
  $('#zoomVal').textContent = Math.round(v.s * 100) + '%';
}
function fit() {
  var r = vp.getBoundingClientRect(); if (!r.width) return;
  var s = clamp(Math.min((r.width - 32) / DOC_W, (r.height - 32) / DOC_H), 0.05, 2);
  S.view.s = s; S.view.x = (r.width - DOC_W * s) / 2; S.view.y = (r.height - DOC_H * s) / 2; applyView();
}
function zoomAt(factor, cx, cy) {
  var r = vp.getBoundingClientRect(), v = S.view;
  var px = cx == null ? r.width / 2 : cx - r.left, py = cy == null ? r.height / 2 : cy - r.top;
  var ns = clamp(v.s * factor, 0.1, 8), k = ns / v.s;
  v.x = px - (px - v.x) * k; v.y = py - (py - v.y) * k; v.s = ns; S.userZoomed = true; applyView();
}
function docPos(e) { var r = vp.getBoundingClientRect(); return { x: (e.clientX - r.left - S.view.x) / S.view.s, y: (e.clientY - r.top - S.view.y) / S.view.s }; }

/* ---------- tools ---------- */
function setTool(t) {
  S.tool = t;
  $$('[data-tool]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.tool === t)); });
  vp.style.cursor = t === 'hand' ? 'grab' : (t === 'text' ? 'text' : 'crosshair');
  ring.hidden = true; octx.clearRect(0, 0, DOC_W, DOC_H);
  syncSliders();
}

/* ---------- pointer handling ---------- */
var pointers = new Map(), cur = null, panState = null, pinch = null, spaceDown = false;
function readPressure(type, ev, parent, lastP) {
  if (type !== 'pen') return 1;
  var p = ev.pressure;
  if (!(p > 0)) p = parent && parent.pressure;
  if (!(p > 0)) p = lastP || 0.5;
  return p;
}
function showPressure(type, lo, hi) {
  var el = $('#pressureReadout'); if (!el) return;
  if (type === 'pen') el.textContent = 'Pen pressure that stroke: ' + lo.toFixed(2) + ' to ' + hi.toFixed(2) + (hi - lo < 0.03 ? '. That is flat, so the pen is not sending varying pressure here.' : '.');
  else el.textContent = 'Fingers and mouse draw at full pressure. Use the Pencil to test pressure.';
}
function startPan(e) { panState = { id: e.pointerId, sx: e.clientX, sy: e.clientY, vx: S.view.x, vy: S.view.y }; vp.style.cursor = 'grabbing'; }
function touchList() { var a = []; pointers.forEach(function (p, id) { if (p.type === 'touch') a.push({ id: id, x: p.x, y: p.y }); }); return a; }
function startPinch() {
  var t = touchList(); if (t.length < 2) return;
  var mx = (t[0].x + t[1].x) / 2, my = (t[0].y + t[1].y) / 2;
  pinch = { d0: Math.hypot(t[0].x - t[1].x, t[0].y - t[1].y) || 1, s0: S.view.s, doc: docPos({ clientX: mx, clientY: my }) };
  panState = null;
}
function onDown(e) {
  try { vp.setPointerCapture(e.pointerId); } catch (x) { /* capture is best effort */ }
  if (e.pointerType === 'pen') S.penSeen = true;
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, type: e.pointerType });
  if (e.pointerType === 'touch') {
    if (touchList().length >= 2) { abortStroke(); startPinch(); return; }
    if (S.penSeen && !S.fingerDraws) { startPan(e); return; }
  }
  if (e.pointerType === 'mouse' && e.button === 1) { e.preventDefault(); startPan(e); return; }
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  if (spaceDown || S.tool === 'hand') { startPan(e); return; }
  var pos = docPos(e);
  if (S.tool === 'picker') { var c = sampleAt(pos); if (c) setColor(c, true); return; }
  if (S.tool === 'text') { placeText(pos); return; }
  beginStroke(e);
}
function onMove(e) {
  var rec = pointers.get(e.pointerId);
  if (rec) { rec.x = e.clientX; rec.y = e.clientY; }
  if (pinch) {
    var t = touchList();
    if (t.length >= 2) {
      var mx = (t[0].x + t[1].x) / 2, my = (t[0].y + t[1].y) / 2, d = Math.hypot(t[0].x - t[1].x, t[0].y - t[1].y) || 1;
      var r = vp.getBoundingClientRect(), ns = clamp(pinch.s0 * d / pinch.d0, 0.1, 8);
      S.view.s = ns; S.view.x = (mx - r.left) - pinch.doc.x * ns; S.view.y = (my - r.top) - pinch.doc.y * ns; S.userZoomed = true; applyView();
    }
    return;
  }
  if (panState && e.pointerId === panState.id) {
    S.view.x = panState.vx + (e.clientX - panState.sx); S.view.y = panState.vy + (e.clientY - panState.sy); S.userZoomed = true; applyView(); return;
  }
  if (cur && e.pointerId === cur.id) { addPoints(e); return; }
  if (e.pointerType !== 'touch') {
    if (S.tool === 'brush' || S.tool === 'eraser') {
      var d2 = curParams().size * S.view.s, rr = vp.getBoundingClientRect();
      ring.hidden = d2 < 4 || spaceDown; ring.style.width = ring.style.height = d2 + 'px';
      ring.style.left = (e.clientX - rr.left) + 'px'; ring.style.top = (e.clientY - rr.top) + 'px';
    } else { ring.hidden = true; }
    if (S.tool === 'text') drawGhost(docPos(e));
  }
}
function onUp(e) {
  pointers.delete(e.pointerId);
  if (cur && e.pointerId === cur.id) endStroke();
  if (panState && e.pointerId === panState.id) { panState = null; vp.style.cursor = S.tool === 'hand' ? 'grab' : (S.tool === 'text' ? 'text' : 'crosshair'); }
  if (pinch && touchList().length < 2) pinch = null;
}
function beginStroke(e) {
  var L = activeLayer();
  if (!L.visible) { toast('This layer is hidden. Show it to draw on it.'); return; }
  var isEr = S.tool === 'eraser', b = isEr ? S.eraser : S.brush;
  var snap = document.createElement('canvas'); snap.width = DOC_W; snap.height = DOC_H; snap.getContext('2d').drawImage(L.canvas, 0, 0);
  var target, color = isEr ? '#000000' : S.color;
  if (isEr) { target = L.ctx; L.ctx.globalCompositeOperation = 'destination-out'; }
  else {
    bctx.setTransform(1, 0, 0, 1, 0, 0); bctx.globalAlpha = 1; bctx.clearRect(0, 0, DOC_W, DOC_H);
    buffer.style.opacity = (b.opacity / 100) * L.opacity; buffer.style.mixBlendMode = L.blend;
    stage.insertBefore(buffer, L.canvas.nextSibling); target = bctx;
  }
  cur = { id: e.pointerId, L: L, snap: snap, eng: new Engine(target, b, color, 1, isEr ? b.opacity / 100 : 1), isEr: isEr, b: b, raw: null, type: e.pointerType, last: 0.5, lo: 1, hi: 0 };
  addPoints(e);
}
function addPoints(e) {
  var list = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
  if (!list.length) list = [e];
  for (var i = 0; i < list.length; i++) {
    var ev = list[i], pos = docPos(ev), pr = readPressure(cur.type, ev, e, cur.last);
    cur.last = pr; if (pr < cur.lo) cur.lo = pr; if (pr > cur.hi) cur.hi = pr;
    cur.raw = { x: pos.x, y: pos.y, p: pr };
    cur.eng.add(cur.raw.x, cur.raw.y, cur.raw.p);
  }
}
function endStroke() {
  if (!cur) return;
  var c = cur; cur = null;
  c.eng.finish(c.raw);
  if (!c.isEr) showPressure(c.type, c.lo, c.hi);
  if (c.isEr) { c.L.ctx.globalCompositeOperation = 'source-over'; c.L.ctx.globalAlpha = 1; }
  else { c.L.ctx.globalAlpha = c.b.opacity / 100; c.L.ctx.drawImage(buffer, 0, 0); c.L.ctx.globalAlpha = 1; buffer.remove(); }
  recordCrop(c.L, c.snap, c.eng.bb);
  if (!c.isEr) setColor(S.color, true);
}
function abortStroke() {
  if (!cur) return;
  var c = cur; cur = null;
  c.L.ctx.globalCompositeOperation = 'source-over'; c.L.ctx.globalAlpha = 1;
  if (c.isEr) { c.L.ctx.clearRect(0, 0, DOC_W, DOC_H); c.L.ctx.drawImage(c.snap, 0, 0); }
  buffer.remove();
}
function sampleAt(pos) {
  var x = Math.floor(pos.x), y = Math.floor(pos.y);
  if (x < 0 || y < 0 || x >= DOC_W || y >= DOC_H) return null;
  var c = document.createElement('canvas'); c.width = c.height = 1; var g = c.getContext('2d');
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, 1, 1);
  S.layers.forEach(function (L) {
    if (!L.visible) return;
    g.globalAlpha = L.opacity; g.globalCompositeOperation = L.blend === 'normal' ? 'source-over' : L.blend; g.drawImage(L.canvas, -x, -y);
  });
  var d = g.getImageData(0, 0, 1, 1).data; return rgbToHex(d[0], d[1], d[2]);
}
