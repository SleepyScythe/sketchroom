/* Sketchroom: Test pad in the brush editor.
   Plain script. Shares globals with the other files in js/; load order is set in index.html. */
'use strict';

/* ---------- test pad in the brush editor ---------- */
function initPad() {
  var cv = $('#testPad'), g = cv.getContext('2d');
  var base = document.createElement('canvas'), buf = document.createElement('canvas');
  base.width = buf.width = cv.width; base.height = buf.height = cv.height;
  var bg = buf.getContext('2d'), bsg = base.getContext('2d'), st = null;
  function compose() {
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, cv.width, cv.height);
    g.globalAlpha = 1; g.drawImage(base, 0, 0);
    g.globalAlpha = S.brush.opacity / 100; g.drawImage(buf, 0, 0); g.globalAlpha = 1;
  }
  function add(e) {
    var r = cv.getBoundingClientRect(), k = cv.width / r.width;
    var list = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    if (!list.length) list = [e];
    for (var i = 0; i < list.length; i++) {
      var ev = list[i], pr = readPressure(st.type, ev, e, st.last);
      st.last = pr; if (pr < st.lo) st.lo = pr; if (pr > st.hi) st.hi = pr;
      st.raw = { x: (ev.clientX - r.left) * k, y: (ev.clientY - r.top) * k, p: pr };
      st.eng.add(st.raw.x, st.raw.y, st.raw.p);
    }
    compose();
  }
  cv.addEventListener('pointerdown', function (e) {
    e.preventDefault();
    try { cv.setPointerCapture(e.pointerId); } catch (x) { /* capture is best effort */ }
    var r = cv.getBoundingClientRect(), k = cv.width / r.width;
    bsg.setTransform(1, 0, 0, 1, 0, 0); bsg.clearRect(0, 0, base.width, base.height); bsg.drawImage(cv, 0, 0);
    bg.setTransform(1, 0, 0, 1, 0, 0); bg.globalAlpha = 1; bg.clearRect(0, 0, buf.width, buf.height);
    st = { id: e.pointerId, type: e.pointerType, last: 0.5, lo: 1, hi: 0, raw: null, eng: new Engine(bg, S.brush, cssVar('--fg'), Math.max(0.2, S.view.s * k), 1) };
    add(e);
  });
  cv.addEventListener('pointermove', function (e) { if (st && e.pointerId === st.id) add(e); });
  var end = function (e) {
    if (!st || e.pointerId !== st.id) return;
    st.eng.finish(st.raw); compose(); showPressure(st.type, st.lo, st.hi); st = null;
  };
  cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
  $('#padClear').addEventListener('click', function () {
    bsg.clearRect(0, 0, base.width, base.height); g.clearRect(0, 0, cv.width, cv.height);
    $('#pressureReadout').textContent = 'Draw on the pad above to try this brush and see the pressure your pen sends.';
  });
}
