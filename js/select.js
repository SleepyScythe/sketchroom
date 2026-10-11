/* Sketchroom: Selection (rectangle or freehand) and moving the selected part of the active layer.
   Plain script. Shares globals with the other files in js/; load order is set in index.html. */
'use strict';

/* ---------- selection ----------
   S.sel = { pts: [[x, y], ...] outline in document pixels, dx, dy: how far it has been dragged,
             float: null, or the lifted pixels { canvas, x, y, L, snap, bb0 } while they are being moved }.
   The outline and the lifted pixels are drawn on the overlay canvas. Moved pixels land on the layer (one undo step)
   when the selection is dropped: Deselect, a new selection, another tool or layer, undo, or autosave. */
function selPath(s) {
  var p = new Path2D();
  s.pts.forEach(function (q, i) { if (i) p.lineTo(q[0] + s.dx, q[1] + s.dy); else p.moveTo(q[0] + s.dx, q[1] + s.dy); });
  p.closePath(); return p;
}
function selBounds(s) {
  var b = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  s.pts.forEach(function (q) { b.x0 = Math.min(b.x0, q[0]); b.y0 = Math.min(b.y0, q[1]); b.x1 = Math.max(b.x1, q[0]); b.y1 = Math.max(b.y1, q[1]); });
  return b;
}
function drawSelOverlay() {
  octx.setTransform(1, 0, 0, 1, 0, 0); octx.clearRect(0, 0, DOC_W, DOC_H);
  var s = S.sel; if (!s) return;
  if (s.float) { octx.globalAlpha = s.float.L.opacity; octx.drawImage(s.float.canvas, s.float.x + s.dx, s.float.y + s.dy); octx.globalAlpha = 1; }
  var p = selPath(s), w = 1.5 / S.view.s;
  octx.setLineDash([]); octx.lineWidth = w * 2.5; octx.strokeStyle = 'rgba(0,0,0,0.55)'; octx.stroke(p);
  octx.setLineDash([6 / S.view.s, 4 / S.view.s]); octx.lineWidth = w; octx.strokeStyle = '#ffffff'; octx.stroke(p);
  octx.setLineDash([]);
}
function inSelection(pos) { return !!S.sel && !S.sel.drawing && octx.isPointInPath(selPath(S.sel), pos.x, pos.y); }
function selHover(e) { if (S.sel) vp.style.cursor = inSelection(docPos(e)) ? 'move' : 'crosshair'; }

function selectDown(e, pos) {
  if (inSelection(pos)) { beginSelMove(e, pos); return; }
  dropSelection(true);
  // In pixel art the outline follows pixel edges.
  var snapPt = function (p) { return isPixel() ? { x: Math.round(p.x), y: Math.round(p.y) } : p; };
  var kind = S.selKind, a = snapPt(pos);
  S.sel = { pts: [[a.x, a.y]], dx: 0, dy: 0, float: null, drawing: true };
  drag = {
    id: e.pointerId,
    move: function (ev) {
      var q = snapPt(docPos(ev)), s = S.sel;
      if (kind === 'rect') s.pts = [[a.x, a.y], [q.x, a.y], [q.x, q.y], [a.x, q.y]];
      else { var l = s.pts[s.pts.length - 1]; if (Math.hypot(q.x - l[0], q.y - l[1]) > 2 / S.view.s) s.pts.push([q.x, q.y]); }
      drawSelOverlay();
    },
    end: function () {
      var s = S.sel, b = selBounds(s);
      if (s.pts.length < 3 || b.x1 - b.x0 < 2 || b.y1 - b.y0 < 2) S.sel = null; else s.drawing = false;
      drawSelOverlay(); updateQuick();
    },
    cancel: function () { S.sel = null; drawSelOverlay(); updateQuick(); }
  };
  updateQuick();
}
// Copies the selected pixels off the layer into a floating canvas, leaving a hole where they were.
function liftSelection(L) {
  var s = S.sel, b = selBounds(s), path = selPath(s);
  var x0 = Math.floor(b.x0), y0 = Math.floor(b.y0), w = Math.max(1, Math.ceil(b.x1) - x0), h = Math.max(1, Math.ceil(b.y1) - y0);
  var snap = crop(L.canvas, 0, 0, DOC_W, DOC_H), fc = document.createElement('canvas'); fc.width = w; fc.height = h;
  var fg = fc.getContext('2d');
  if (isPixel()) {
    var m = hardMask(path, x0, y0, w, h);
    fg.drawImage(L.canvas, -x0, -y0); fg.globalCompositeOperation = 'destination-in'; fg.drawImage(m, 0, 0); fg.globalCompositeOperation = 'source-over';
    L.ctx.globalCompositeOperation = 'destination-out'; L.ctx.drawImage(m, x0, y0); L.ctx.globalCompositeOperation = 'source-over';
  } else {
    fg.translate(-x0, -y0); fg.clip(path); fg.drawImage(L.canvas, 0, 0);
    L.ctx.save(); L.ctx.globalCompositeOperation = 'destination-out'; L.ctx.fill(path); L.ctx.restore();
  }
  s.float = { canvas: fc, x: x0, y: y0, L: L, snap: snap, bb0: { x0: x0, y0: y0, x1: x0 + w, y1: y0 + h } };
}
function beginSelMove(e, pos) {
  var s = S.sel;
  if (!s.float) { if (!canDraw(activeLayer())) return; liftSelection(activeLayer()); }
  var dx0 = s.dx, dy0 = s.dy;
  drag = {
    id: e.pointerId,
    move: function (ev) { var q = docPos(ev); s.dx = Math.round(dx0 + q.x - pos.x); s.dy = Math.round(dy0 + q.y - pos.y); drawSelOverlay(); },
    end: function () { /* stays lifted until the selection is dropped, so it can be nudged again */ },
    cancel: function () {}
  };
}
// Lands lifted pixels where they were dragged, as one undo step. The outline stays, now around the moved pixels.
function commitFloat() {
  var s = S.sel; if (!s || !s.float) return;
  var f = s.float, L = f.L, x = f.x + s.dx, y = f.y + s.dy;
  L.ctx.drawImage(f.canvas, x, y);
  recordCrop(L, f.snap, { x0: Math.min(f.bb0.x0, x), y0: Math.min(f.bb0.y0, y), x1: Math.max(f.bb0.x1, x + f.canvas.width), y1: Math.max(f.bb0.y1, y + f.canvas.height) });
  s.pts = s.pts.map(function (q) { return [q[0] + s.dx, q[1] + s.dy]; }); s.dx = s.dy = 0; s.float = null;
}
// Commits any moved pixels. With clear, the outline goes too.
function dropSelection(clear) {
  if (!S.sel) return;
  if (drag && S.sel.drawing) { drag = null; S.sel = null; }
  else { commitFloat(); if (clear) S.sel = null; }
  drawSelOverlay(); updateQuick();
}
function deleteSelection() {
  var s = S.sel; if (!s || s.drawing) return;
  if (s.float) {
    var f = s.float; recordCrop(f.L, f.snap, f.bb0);
    s.pts = s.pts.map(function (q) { return [q[0] + s.dx, q[1] + s.dy]; }); s.dx = s.dy = 0; s.float = null;
  } else {
    var L = activeLayer(); if (!canDraw(L)) return;
    var snap = crop(L.canvas, 0, 0, DOC_W, DOC_H), b = selBounds(s);
    if (isPixel()) {
      var x0 = Math.floor(b.x0), y0 = Math.floor(b.y0), m = hardMask(selPath(s), x0, y0, Math.max(1, Math.ceil(b.x1) - x0), Math.max(1, Math.ceil(b.y1) - y0));
      L.ctx.globalCompositeOperation = 'destination-out'; L.ctx.drawImage(m, x0, y0); L.ctx.globalCompositeOperation = 'source-over';
    } else { L.ctx.save(); L.ctx.globalCompositeOperation = 'destination-out'; L.ctx.fill(selPath(s)); L.ctx.restore(); }
    recordCrop(L, snap, { x0: b.x0 - 1, y0: b.y0 - 1, x1: b.x1 + 1, y1: b.y1 + 1 });
  }
  drawSelOverlay();
}
