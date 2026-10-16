/* Sketchroom: Test pad in the brush editor, and the Pen tab.
   Plain script. Shares globals with the other files in js/; load order is set in index.html. */
'use strict';

// The speed slider only matters while speed makes the pressure (chosen, or picked by Automatic for a pen without pressure).
function updatePenUI() {
  var host = $('#penSpeedHost'); if (!host) return;
  host.hidden = !(S.pen.mode === 'speed' || (S.pen.mode === 'auto' && S.pen.src === 'speed'));
}

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
      var ev = list[i], pr = samplePressure(st.pr, ev, e);
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
    st = { id: e.pointerId, pr: newPressure(e.pointerType), raw: null, eng: new Engine(bg, S.brush, cssVar('--fg'), Math.max(0.2, S.view.s * k), 1) };
    add(e);
  });
  cv.addEventListener('pointermove', function (e) { if (st && e.pointerId === st.id) add(e); });
  var end = function (e) {
    if (!st || e.pointerId !== st.id) return;
    st.eng.finish(st.raw); compose(); finishPressure(st.pr); showPressure(st.pr); st = null;
  };
  cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
  $('#padClear').addEventListener('click', function () { bsg.clearRect(0, 0, base.width, base.height); g.clearRect(0, 0, cv.width, cv.height); });
  initPenTab();
}

/* ---------- the Pen tab ----------
   Every drawing pen setting lives here (the owner asked for this on 2026-10-16): what draws (also on the rail), where
   pressure comes from, the speed slider, and a pen test. The test draws a plain line whose width follows the pressure,
   whatever the brush, and says what the pen sent. Its canvas matches its size on screen, so the line stays under the pen. */
function initPenTab() {
  var mode = $('#penMode'); mode.value = S.pen.mode;
  mode.addEventListener('change', function () { S.pen.mode = mode.value; savePen(); updatePenUI(); });
  $('#penSpeedHost').prepend(makeSlider('How much speed changes the stroke', 0, 100, '%', function () { return S.pen.speed; }, function (v) { S.pen.speed = v; savePen(); }));
  updatePenUI();
  var cv = $('#penPad'), g = cv.getContext('2d'), st = null;
  function add(e) {
    var list = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    if (!list.length) list = [e];
    g.lineCap = 'round'; g.strokeStyle = cssVar('--fg');
    for (var i = 0; i < list.length; i++) {
      var ev = list[i], p = samplePressure(st.pr, ev, e);
      var x = (ev.clientX - st.r.left) * st.d, y = (ev.clientY - st.r.top) * st.d, last = st.last || { x: x, y: y, p: p };
      g.lineWidth = (1 + 15 * (last.p + p) / 2) * st.d;
      g.beginPath(); g.moveTo(last.x, last.y); g.lineTo(x, y); g.stroke();
      st.last = { x: x, y: y, p: p };
    }
    if (st.pr.type === 'pen') $('#pressureReadout').textContent = 'Pressure now: ' + st.last.p.toFixed(2);
  }
  cv.addEventListener('pointerdown', function (e) {
    e.preventDefault();
    try { cv.setPointerCapture(e.pointerId); } catch (x) { /* capture is best effort */ }
    // The bitmap fills the canvas inside its border, at the screen's pixel density.
    var b = cv.getBoundingClientRect(), d = window.devicePixelRatio || 1, w = Math.round(cv.clientWidth * d), h = Math.round(cv.clientHeight * d);
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; } // first use, or the panel changed size
    st = { id: e.pointerId, pr: newPressure(e.pointerType), r: { left: b.left + cv.clientLeft, top: b.top + cv.clientTop }, d: d, last: null };
    add(e);
  });
  cv.addEventListener('pointermove', function (e) { if (st && e.pointerId === st.id) add(e); });
  var end = function (e) { if (!st || e.pointerId !== st.id) return; finishPressure(st.pr); showPressure(st.pr); st = null; };
  cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
  $('#penPadClear').addEventListener('click', function () {
    g.clearRect(0, 0, cv.width, cv.height);
    $('#pressureReadout').textContent = 'Draw above with your pen. The line gets thicker with more pressure.';
  });
}
