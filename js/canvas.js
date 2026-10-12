/* Sketchroom: View (pan and zoom), tools and pointer handling.
   Plain script. Shares globals with the other files in js/; load order is set in index.html. */
'use strict';

/* ---------- view, pan and zoom ---------- */
function applyView() {
  var v = S.view; stage.style.transform = 'translate(' + v.x + 'px,' + v.y + 'px) scale(' + v.s + ')';
  $('#zoomVal').textContent = Math.round(v.s * 100) + '%';
  if (S.sel) drawSelOverlay(); // the outline width depends on the zoom
  drawGrid();
}
// Pixel art needs to zoom much further in than a regular image.
function maxZoom() { return isPixel() ? 64 : 8; }
function fit() {
  var r = vp.getBoundingClientRect(); if (!r.width) return;
  var s = clamp(Math.min((r.width - 32) / DOC_W, (r.height - 32) / DOC_H), 0.05, isPixel() ? 48 : 2);
  S.view.s = s; S.view.x = (r.width - DOC_W * s) / 2; S.view.y = (r.height - DOC_H * s) / 2; applyView();
}
function zoomAt(factor, cx, cy) {
  var r = vp.getBoundingClientRect(), v = S.view;
  var px = cx == null ? r.width / 2 : cx - r.left, py = cy == null ? r.height / 2 : cy - r.top;
  var ns = clamp(v.s * factor, 0.05, maxZoom()), k = ns / v.s;
  v.x = px - (px - v.x) * k; v.y = py - (py - v.y) * k; v.s = ns; S.userZoomed = true; applyView();
}
function docPos(e) { var r = vp.getBoundingClientRect(); return { x: (e.clientX - r.left - S.view.x) / S.view.s, y: (e.clientY - r.top - S.view.y) / S.view.s }; }

/* ---------- tools ---------- */
function setTool(t) {
  if (t !== 'select') dropSelection(true);
  S.tool = t;
  $$('[data-tool]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.tool === t)); });
  vp.style.cursor = t === 'hand' ? 'grab' : (t === 'text' ? 'text' : 'crosshair');
  ring.hidden = true; if (!S.sel) octx.clearRect(0, 0, DOC_W, DOC_H);
  syncSliders(); updateQuick();
}

/* ---------- pointer handling ---------- */
// cur is a brush or eraser stroke. drag is any other tool's press-and-drag ({ id, move(e), end(e), cancel() }), from tools.js and select.js.
var pointers = new Map(), cur = null, drag = null, panState = null, pinch = null, spaceDown = false;
/* ---------- pen pressure ----------
   Pens report pressure in pointer events, but some send the same value for a whole stroke: styluses with no pressure
   sensor (Apple Pencil USB-C, Logitech Crayon and others), and some iPad Safari versions, where the Pencil's force still
   arrives in touch events. The owner's iPad sent 0.12 for every point (2026-10-12), which also drew every pressure brush
   thin and faint. So each pen stroke records three sources, and after each stroke the best one is remembered for this
   browser (S.pen.src): 'pointer' (pointer event pressure), 'force' (the stylus touch's force) or 'speed' (made up from
   drawing speed: slow is heavy, fast is light). S.pen.mode, set in the Edit tab: 'auto' uses src, 'pen' always uses the
   pointer, 'speed' always simulates, 'off' is always full pressure. Fingers and the mouse always draw at full pressure. */
var PEN_KEY = 'sketchroom.pen', FLAT = 0.002;
S.pen = { mode: 'auto', src: 'pointer' };
try { var savedPen = JSON.parse(localStorage.getItem(PEN_KEY)); if (savedPen) Object.assign(S.pen, savedPen); } catch (e) { /* storage unavailable */ }
function savePen() { try { localStorage.setItem(PEN_KEY, JSON.stringify(S.pen)); } catch (e) { /* storage unavailable */ } }
// The latest force of a stylus touch (Safari only). Touch events arrive alongside pointer events, so this lags by a frame at most.
var stylusForce = { f: 0, t: 0 };
function trackStylus(e) {
  for (var i = 0; i < e.changedTouches.length; i++) {
    var t = e.changedTouches[i];
    if (t.touchType === 'stylus' && t.force > 0) { stylusForce.f = t.force > 1 ? Math.min(1, t.force / 4.17) : t.force; stylusForce.t = performance.now(); }
  }
}
document.addEventListener('touchstart', trackStylus, { passive: true, capture: true });
document.addEventListener('touchmove', trackStylus, { passive: true, capture: true });
// One per stroke. lo/hi: the pressure used; plo/phi and flo/fhi: what the pointer and the touch force sent.
function newPressure(type) {
  return { type: type, n: 0, fn: 0, lo: 1, hi: 0, plo: 1, phi: 0, flo: 1, fhi: 0, plast: 0.5, sp: 0.5, prev: null };
}
function samplePressure(st, ev, parent) {
  if (st.type !== 'pen') return 1;
  var p = ev.pressure;
  if (!(p > 0)) p = parent && parent.pressure;
  if (!(p > 0)) p = st.plast;
  st.plast = p; st.n++; if (p < st.plo) st.plo = p; if (p > st.phi) st.phi = p;
  var now = performance.now(), f = now - stylusForce.t < 120 ? stylusForce.f : 0;
  if (f > 0) { st.fn++; if (f < st.flo) st.flo = f; if (f > st.fhi) st.fhi = f; }
  // Speed in screen pixels per millisecond, eased so the line swells and thins smoothly. Strokes start light.
  var t = ev.timeStamp || now;
  if (st.prev) {
    var v = Math.hypot(ev.clientX - st.prev.x, ev.clientY - st.prev.y) / Math.max(1, t - st.prev.t);
    st.sp += (clamp(1.1 - v * 0.45, 0.15, 1) - st.sp) * 0.25;
  }
  st.prev = { x: ev.clientX, y: ev.clientY, t: t };
  var mode = S.pen.mode, src = mode === 'auto' ? S.pen.src : mode === 'pen' ? 'pointer' : mode;
  var used = src === 'off' ? 1 : src === 'speed' ? st.sp : src === 'force' && f > 0 ? f : p;
  if (used < st.lo) st.lo = used; if (used > st.hi) st.hi = used;
  return used;
}
// After a pen stroke: learn which source works. A real pressure sensor never sends exactly the same value for a whole stroke.
function finishPressure(st) {
  if (st.type !== 'pen' || st.n < 6) return;
  var src = st.phi - st.plo >= FLAT ? 'pointer' : st.fn >= 6 && st.fhi - st.flo >= 0.02 ? 'force' : 'speed';
  if (src !== S.pen.src) { S.pen.src = src; savePen(); }
}
function showPressure(st) {
  var el = $('#pressureReadout'); if (!el) return;
  if (st.type !== 'pen') { el.textContent = 'Fingers and the mouse draw at full pressure. Use your pen to test pressure.'; return; }
  var range = function (a, b) { return a.toFixed(2) + ' to ' + b.toFixed(2); }, mode = S.pen.mode;
  var sent = 'Your pen sent ' + range(st.plo, st.phi) + (st.fn ? ' (touch force ' + range(st.flo, st.fhi) + ')' : '') + '. ';
  if (mode === 'off') el.textContent = sent + 'Pressure is off, so every stroke is at full pressure.';
  else if (mode === 'speed') el.textContent = sent + 'Pressure comes from your drawing speed: ' + range(st.lo, st.hi) + '.';
  else if (mode === 'pen') el.textContent = sent + (st.phi - st.plo < FLAT ? 'That is flat, so this pen may not sense pressure. Try Automatic.' : 'Using it as is.');
  else if (S.pen.src === 'speed') el.textContent = sent + 'That never changes, so your pen probably has no pressure sensor. Sketchroom now makes pressure from your drawing speed: slow strokes are heavier, fast ones lighter.';
  else if (S.pen.src === 'force') el.textContent = sent + 'The pen\'s touch force changes, so Sketchroom uses that.';
  else el.textContent = 'Pen pressure that stroke: ' + range(st.plo, st.phi) + '.';
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
  if (S.doc && (S.doc.loading || S.doc.broken)) return; // the canvas is only a placeholder
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
  if (S.tool === 'fill') { fillAt(pos); return; }
  if (S.tool === 'line' || S.tool === 'shape') { beginShape(e, pos); return; }
  if (S.tool === 'smudge') { beginSmudge(e, pos); return; }
  if (S.tool === 'select') { selectDown(e, pos); return; }
  if (isPixel()) beginPixelStroke(e); else beginStroke(e);
}
function onMove(e) {
  var rec = pointers.get(e.pointerId);
  if (rec) { rec.x = e.clientX; rec.y = e.clientY; }
  if (pinch) {
    var t = touchList();
    if (t.length >= 2) {
      var mx = (t[0].x + t[1].x) / 2, my = (t[0].y + t[1].y) / 2, d = Math.hypot(t[0].x - t[1].x, t[0].y - t[1].y) || 1;
      var r = vp.getBoundingClientRect(), ns = clamp(pinch.s0 * d / pinch.d0, 0.05, maxZoom());
      S.view.s = ns; S.view.x = (mx - r.left) - pinch.doc.x * ns; S.view.y = (my - r.top) - pinch.doc.y * ns; S.userZoomed = true; applyView();
    }
    return;
  }
  if (panState && e.pointerId === panState.id) {
    S.view.x = panState.vx + (e.clientX - panState.sx); S.view.y = panState.vy + (e.clientY - panState.sy); S.userZoomed = true; applyView(); return;
  }
  if (cur && e.pointerId === cur.id) { addPoints(e); return; }
  if (drag && e.pointerId === drag.id) { drag.move(e); return; }
  if (e.pointerType !== 'touch') {
    if (S.tool === 'brush' || S.tool === 'eraser' || S.tool === 'smudge' || S.tool === 'line') {
      var d2 = curParams().size * S.view.s, rr = vp.getBoundingClientRect();
      ring.hidden = d2 < 4 || spaceDown; ring.style.width = ring.style.height = d2 + 'px';
      ring.style.left = (e.clientX - rr.left) + 'px'; ring.style.top = (e.clientY - rr.top) + 'px';
    } else { ring.hidden = true; }
    if (S.tool === 'text') drawGhost(docPos(e)); else if (S.tool === 'select') selHover(e);
  }
}
function onUp(e) {
  pointers.delete(e.pointerId);
  if (cur && e.pointerId === cur.id) endStroke();
  if (drag && e.pointerId === drag.id) { var d = drag; drag = null; if (e.type === 'pointercancel' && d.cancel) d.cancel(); else d.end(e); }
  if (panState && e.pointerId === panState.id) { panState = null; vp.style.cursor = S.tool === 'hand' ? 'grab' : (S.tool === 'text' ? 'text' : 'crosshair'); }
  if (pinch && touchList().length < 2) pinch = null;
}
function beginStroke(e) {
  var L = activeLayer();
  if (!canDraw(L)) return;
  var isEr = S.tool === 'eraser', b = isEr ? S.eraser : S.brush;
  var snap = document.createElement('canvas'); snap.width = DOC_W; snap.height = DOC_H; snap.getContext('2d').drawImage(L.canvas, 0, 0);
  var target, color = isEr ? '#000000' : S.color;
  if (isEr) { target = L.ctx; L.ctx.globalCompositeOperation = 'destination-out'; }
  else {
    bctx.setTransform(1, 0, 0, 1, 0, 0); bctx.globalAlpha = 1; bctx.clearRect(0, 0, DOC_W, DOC_H);
    buffer.style.opacity = (b.opacity / 100) * L.opacity; buffer.style.mixBlendMode = L.blend;
    stage.insertBefore(buffer, L.canvas.nextSibling); target = bctx;
  }
  cur = { id: e.pointerId, L: L, snap: snap, eng: new Engine(target, b, color, 1, isEr ? b.opacity / 100 : 1), isEr: isEr, b: b, raw: null, pr: newPressure(e.pointerType) };
  addPoints(e);
}
function addPoints(e) {
  var list = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
  if (!list.length) list = [e];
  for (var i = 0; i < list.length; i++) {
    var ev = list[i], pos = docPos(ev), pr = samplePressure(cur.pr, ev, e);
    cur.raw = { x: pos.x, y: pos.y, p: pr };
    cur.eng.add(cur.raw.x, cur.raw.y, cur.raw.p);
  }
}
function endStroke() {
  if (!cur) return;
  var c = cur; cur = null;
  c.eng.finish(c.raw);
  finishPressure(c.pr);
  if (!c.isEr) showPressure(c.pr);
  if (c.isEr) { c.L.ctx.globalCompositeOperation = 'source-over'; c.L.ctx.globalAlpha = 1; }
  else { c.L.ctx.globalAlpha = c.b.opacity / 100; c.L.ctx.drawImage(buffer, 0, 0); c.L.ctx.globalAlpha = 1; buffer.remove(); }
  recordCrop(c.L, c.snap, c.eng.bb);
  if (!c.isEr) setColor(S.color, true);
}
function abortStroke() {
  if (drag) { var d = drag; drag = null; if (d.cancel) d.cancel(); }
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
