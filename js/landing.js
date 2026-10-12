/* The sample sheet on the signed-out homepage. A small, separate drawing surface: it shares nothing with the editor
   (no layers, no saving) and has no globals, so it can be changed without touching the app. */
(function () {
  var cv = document.getElementById('sheetCanvas');
  if (!cv || !cv.getContext) return;
  var ctx = cv.getContext('2d', { willReadFrequently: true });
  var hint = document.getElementById('sheetHint');
  var pensBox = document.getElementById('sheetPens');
  var inksBox = document.getElementById('sheetInks');
  var INKS = [
    ['Graphite', '#1d2a33'], ['Teal', '#0f8f80'], ['Coral', '#e5604d'], ['Indigo', '#5b6ad0'], ['Gold', '#d9a21b']
  ];
  var pen = 'pencil', color = INKS[0][1];
  var drawing = false, pts = [], snap = null, lastT = 0, inkW = 8, id = null;

  INKS.forEach(function (c, i) {
    var b = document.createElement('button');
    b.type = 'button'; b.className = 'ink'; b.style.background = c[1];
    b.setAttribute('aria-label', c[0]); b.setAttribute('aria-pressed', i === 0 ? 'true' : 'false');
    b.addEventListener('click', function () {
      color = c[1];
      Array.prototype.forEach.call(inksBox.children, function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
    });
    inksBox.appendChild(b);
  });
  pensBox.addEventListener('click', function (e) {
    var b = e.target.closest('button[data-pen]'); if (!b) return;
    pen = b.getAttribute('data-pen');
    Array.prototype.forEach.call(pensBox.children, function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
  });
  document.getElementById('sheetClear').addEventListener('click', function () {
    ctx.clearRect(0, 0, cv.width, cv.height); hint.classList.remove('gone');
  });

  function pos(e) {
    var k = cv.width / (cv.clientWidth || cv.width);
    return { x: e.offsetX * k, y: e.offsetY * k, p: e.pointerType === 'pen' && e.pressure > 0 ? e.pressure : 0 };
  }
  function strokePath(width, alpha) {
    ctx.globalAlpha = alpha; ctx.lineWidth = width; ctx.strokeStyle = color; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
    for (var i = 1; i < pts.length - 1; i++) {
      var mx = (pts[i].x + pts[i + 1].x) / 2, my = (pts[i].y + pts[i + 1].y) / 2;
      ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
    }
    var l = pts[pts.length - 1]; ctx.lineTo(l.x, l.y);
    if (pts.length === 1) ctx.lineTo(l.x + 0.01, l.y);
    ctx.stroke(); ctx.globalAlpha = 1;
  }
  function dot(x, y, r, a) {
    ctx.globalAlpha = a; ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); ctx.fill(); ctx.globalAlpha = 1;
  }
  function redraw() {
    ctx.putImageData(snap, 0, 0);
    if (pen === 'pencil') { strokePath(7, 0.16); strokePath(3.2, 0.9); }
    else strokePath(26, 0.5);
  }
  function inkTo(a, b, now) {
    var d = Math.hypot(b.x - a.x, b.y - a.y), dt = Math.max(1, now - lastT);
    var target = b.p ? 3 + b.p * 13 : Math.max(3, Math.min(14, 14 - (d / dt) * 7));
    var from = inkW; inkW = inkW * 0.75 + target * 0.25;
    var n = Math.max(1, Math.ceil(d / 1.5));
    for (var i = 1; i <= n; i++) {
      var t = i / n; dot(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, (from + (inkW - from) * t) / 2, 1);
    }
  }
  function spray(p) {
    for (var i = 0; i < 22; i++) {
      var an = Math.random() * 6.2832, r = Math.sqrt(Math.random()) * 34;
      dot(p.x + Math.cos(an) * r, p.y + Math.sin(an) * r, 1.5, 0.55);
    }
  }

  cv.addEventListener('pointerdown', function (e) {
    if (e.button > 0) return;
    e.preventDefault(); drawing = true; id = e.pointerId; cv.setPointerCapture(id);
    hint.classList.add('gone');
    var p = pos(e); pts = [p]; lastT = e.timeStamp; inkW = 8;
    if (pen === 'pencil' || pen === 'marker') { snap = ctx.getImageData(0, 0, cv.width, cv.height); redraw(); }
    else if (pen === 'ink') dot(p.x, p.y, 4, 1);
    else spray(p);
  });
  cv.addEventListener('pointermove', function (e) {
    if (!drawing || e.pointerId !== id) return;
    var evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    if (!evs.length) evs = [e];
    evs.forEach(function (ev) {
      var p = pos(ev), prev = pts[pts.length - 1];
      if (Math.hypot(p.x - prev.x, p.y - prev.y) < 1.2) return;
      pts.push(p);
      if (pen === 'ink') inkTo(prev, p, ev.timeStamp || e.timeStamp);
      else if (pen === 'spray') spray(p);
      lastT = ev.timeStamp || e.timeStamp;
    });
    if (pen === 'pencil' || pen === 'marker') redraw();
  });
  function end(e) {
    if (!drawing || (e && e.pointerId !== id)) return;
    drawing = false; snap = null; pts = [];
  }
  cv.addEventListener('pointerup', end);
  cv.addEventListener('pointercancel', end);
  cv.addEventListener('lostpointercapture', end);
})();
