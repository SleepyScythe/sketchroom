/* Sketchroom: Color wheel, saved and recent colors, and the quick color pop-up on the tool rail.
   Plain script. Shares globals with the other files in js/; load order is set in index.html. */
'use strict';

var MAX_SAVED = 60;
var wheels = [];

/* ---------- color math ---------- */
function hsvToHex(h, s, v) {
  var f = function (n) { var k = (n + h / 60) % 6; return Math.round((v - v * s * Math.max(0, Math.min(k, 4 - k, 1))) * 255); };
  return rgbToHex(f(5), f(3), f(1));
}
function hexToHsv(hex) {
  var c = hexToRgb(hex), r = c[0] / 255, g = c[1] / 255, b = c[2] / 255;
  var max = Math.max(r, g, b), d = max - Math.min(r, g, b), h = 0;
  if (d) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: (h * 60 + 360) % 360, s: max ? d / max : 0, v: max };
}
function cleanColors(list) {
  return (Array.isArray(list) ? list : []).filter(function (c) { return typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c); })
    .map(function (c) { return c.toLowerCase(); }).slice(0, MAX_SAVED);
}

/* ---------- current color ---------- */
// hsv is passed by the wheel so hue and saturation survive at black, white and greys (where hex alone loses them).
function setColor(hex, remember, hsv) {
  hex = hex.toLowerCase();
  if (hsv) S.hsv = hsv;
  else if (hex !== S.color || !S.hsv) {
    var n = hexToHsv(hex), prev = S.hsv || { h: 0, s: 0 };
    if (!n.v) { n.h = prev.h; n.s = prev.s; } else if (!n.s) n.h = prev.h;
    S.hsv = n;
  }
  S.color = hex;
  $('#colorChip').style.background = hex; $('#colorNow').style.background = hex; $('#popNow').style.background = hex;
  $('#popHex').textContent = hex;
  if (document.activeElement !== $('#hexInput')) $('#hexInput').value = hex;
  $$('.sw[aria-pressed]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.c === hex)); });
  wheels.forEach(function (w) { w.draw(); });
  if (remember && S.recent[0] !== hex) {
    S.recent = [hex].concat(S.recent.filter(function (c) { return c !== hex; })).slice(0, 12);
    try { localStorage.setItem('sketchroom.recent', JSON.stringify(S.recent)); } catch (e) { /* storage unavailable */ }
    renderRecent();
  }
}

/* ---------- swatches: saved and recent ---------- */
function swatch(c, removing) {
  var b = document.createElement('button'); b.className = 'sw'; b.style.background = c; b.dataset.c = c;
  if (removing) {
    b.classList.add('rm'); b.setAttribute('aria-label', 'Remove color ' + c); b.title = 'Remove';
    b.addEventListener('click', function () { saveColors(S.saved.filter(function (x) { return x !== c; })); });
  } else {
    b.setAttribute('aria-label', 'Color ' + c); b.setAttribute('aria-pressed', String(c === S.color));
    b.addEventListener('click', function () { setColor(c, true); });
  }
  return b;
}
function fillSwatches(host, list, emptyText, removing) {
  host.innerHTML = ''; host.classList.toggle('editing', !!removing);
  if (!list.length) { var e = document.createElement('div'); e.className = 'empty'; e.textContent = emptyText; host.appendChild(e); return; }
  list.forEach(function (c) { host.appendChild(swatch(c, removing)); });
}
function renderRecent() {
  fillSwatches($('#recent'), S.recent, 'Colors you use show up here.', false);
  fillSwatches($('#popRecent'), S.recent.slice(0, 8), 'Colors you use show up here.', false);
}
function renderSaved() {
  var empty = 'No saved colors. Press + to save the current color.';
  fillSwatches($('#palette'), S.saved, empty, S.editColors);
  fillSwatches($('#popSaved'), S.saved, empty, S.editColors);
  $$('#editColors, #popEdit').forEach(function (b) { b.setAttribute('aria-pressed', String(!!S.editColors)); });
  $('#savedHint').textContent = S.editColors ? 'Tap a color to remove it. Press the pencil again when you are done.'
    : !store.online ? 'Saved colors stay in this browser.'
    : S.myId ? 'Saved to your account, so they follow you to any device.'
    : 'Saved in this browser. Sign in to keep them on all your devices.';
}
function saveColors(list) {
  S.saved = list; renderSaved();
  store.saveColors(list).catch(function () { toast('Could not save your colors. Try again.'); });
}
function addSavedColor() {
  if (S.saved.indexOf(S.color) >= 0) { toast('That color is already saved.'); return; }
  if (S.saved.length >= MAX_SAVED) { toast('You can save up to ' + MAX_SAVED + ' colors. Remove one first.'); return; }
  if (S.editColors) S.editColors = false;
  saveColors(S.saved.concat([S.color])); toast('Color saved.');
}
function toggleEditColors() { S.editColors = !S.editColors; renderSaved(); }

/* ---------- wheel: hue ring around a saturation/brightness square ---------- */
function makeWheel(cv) {
  var ring = null, mode = null;
  var geo = function () {
    var n = cv.clientWidth, R = n / 2, t = Math.max(14, n * 0.12), rin = R - t;
    return { n: n, c: R, R: R, t: t, rin: rin, half: (rin - 6) / Math.SQRT2 };
  };
  var renderRing = function (G, dpr) {
    var c = document.createElement('canvas'); c.width = c.height = Math.round(G.n * dpr);
    var g = c.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
    for (var d = 0; d < 360; d++) {
      // Hue 0 (red) at the top, going clockwise. Wedges overlap a little so no seams show.
      var a0 = (d - 90.5) * Math.PI / 180, a1 = (d - 89.2) * Math.PI / 180;
      g.beginPath(); g.arc(G.c, G.c, G.R, a0, a1); g.arc(G.c, G.c, G.rin, a1, a0, true); g.closePath();
      g.fillStyle = 'hsl(' + d + ',100%,50%)'; g.fill();
    }
    return c;
  };
  var marker = function (ctx, x, y, r, fill) {
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.stroke();
    ctx.lineWidth = 2; ctx.strokeStyle = '#ffffff'; ctx.stroke();
  };
  var draw = function () {
    var n = cv.clientWidth; if (!n || !S.hsv) return;
    var dpr = window.devicePixelRatio || 1, px = Math.round(n * dpr);
    if (cv.width !== px) { cv.width = cv.height = px; ring = null; }
    var G = geo(), ctx = cv.getContext('2d'), hsv = S.hsv;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, n, n);
    if (!ring) ring = renderRing(G, dpr);
    ctx.drawImage(ring, 0, 0, n, n);
    var x0 = G.c - G.half, sz = G.half * 2;
    ctx.fillStyle = hsvToHex(hsv.h, 1, 1); ctx.fillRect(x0, x0, sz, sz);
    var gw = ctx.createLinearGradient(x0, 0, x0 + sz, 0); gw.addColorStop(0, '#ffffff'); gw.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gw; ctx.fillRect(x0, x0, sz, sz);
    var gb = ctx.createLinearGradient(0, x0, 0, x0 + sz); gb.addColorStop(0, 'rgba(0,0,0,0)'); gb.addColorStop(1, '#000000');
    ctx.fillStyle = gb; ctx.fillRect(x0, x0, sz, sz);
    var a = (hsv.h - 90) * Math.PI / 180, rm = G.R - G.t / 2;
    marker(ctx, G.c + Math.cos(a) * rm, G.c + Math.sin(a) * rm, G.t / 2 - 2, hsvToHex(hsv.h, 1, 1));
    marker(ctx, x0 + hsv.s * sz, x0 + (1 - hsv.v) * sz, 7, S.color);
  };
  var pick = function (e, start) {
    var r = cv.getBoundingClientRect(), G = geo(), x = e.clientX - r.left - G.c, y = e.clientY - r.top - G.c;
    if (start) {
      var d = Math.hypot(x, y);
      mode = d >= G.rin - 4 && d <= G.R + 4 ? 'ring' : (Math.abs(x) <= G.half + 8 && Math.abs(y) <= G.half + 8 ? 'square' : null);
    }
    if (!mode) return false;
    var h = S.hsv.h, s = S.hsv.s, v = S.hsv.v;
    if (mode === 'ring') h = (Math.atan2(y, x) * 180 / Math.PI + 90 + 360) % 360;
    else { s = clamp((x + G.half) / (2 * G.half), 0, 1); v = clamp(1 - (y + G.half) / (2 * G.half), 0, 1); }
    setColor(hsvToHex(h, s, v), false, { h: h, s: s, v: v });
    return true;
  };
  cv.addEventListener('pointerdown', function (e) {
    if (e.button > 0 || !pick(e, true)) return;
    e.preventDefault(); try { cv.setPointerCapture(e.pointerId); } catch (x) { /* capture is best effort */ }
  });
  cv.addEventListener('pointermove', function (e) { if (mode) pick(e, false); });
  var end = function () { if (!mode) return; mode = null; setColor(S.color, true, S.hsv); };
  cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
  if (window.ResizeObserver) new ResizeObserver(draw).observe(cv);
  var w = { draw: draw }; wheels.push(w); return w;
}

/* ---------- quick color pop-up (opens from the color circle on the tool rail) ---------- */
function placeColorPop() {
  var pop = $('#colorPop'), r = $('#colorChip').getBoundingClientRect(), m = 8;
  var w = pop.offsetWidth, h = pop.offsetHeight, vw = window.innerWidth, vh = window.innerHeight, x, y;
  if (!window.matchMedia('(max-width: 860px)').matches) { x = r.right + m; y = r.bottom - h; } // beside the rail chip
  else { x = r.right - w; y = r.bottom + m; } // phone layout: the rail is a top bar
  pop.style.left = clamp(x, m, Math.max(m, vw - w - m)) + 'px';
  pop.style.top = clamp(y, m, Math.max(m, vh - h - m)) + 'px';
}
function openColorPop() {
  $('#colorPop').hidden = false; $('#colorChip').setAttribute('aria-expanded', 'true');
  placeColorPop(); wheels.forEach(function (w) { w.draw(); });
}
function closeColorPop() {
  if ($('#colorPop').hidden) return;
  $('#colorPop').hidden = true; $('#colorChip').setAttribute('aria-expanded', 'false');
  if (S.editColors) { S.editColors = false; renderSaved(); }
}

function initColor() {
  try { S.recent = cleanColors(JSON.parse(localStorage.getItem('sketchroom.recent') || '[]')).slice(0, 12); } catch (e) { S.recent = []; }
  S.saved = localColors();
  makeWheel($('#wheelBig')); makeWheel($('#wheelMini'));
  setColor(S.color, false); renderRecent(); renderSaved();

  $('#colorChip').addEventListener('click', function () { if ($('#colorPop').hidden) openColorPop(); else closeColorPop(); });
  // A tap outside closes the pop-up. On the canvas that tap only closes it, so it never leaves a stray mark.
  document.addEventListener('pointerdown', function (e) {
    var pop = $('#colorPop');
    if (pop.hidden || pop.contains(e.target) || $('#colorChip').contains(e.target)) return;
    closeColorPop();
    if (vp.contains(e.target)) { e.stopPropagation(); e.preventDefault(); }
  }, true);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeColorPop(); });
  window.addEventListener('resize', function () { if (!$('#colorPop').hidden) placeColorPop(); });

  $$('#addColor, #popAdd').forEach(function (b) { b.addEventListener('click', addSavedColor); });
  $$('#editColors, #popEdit').forEach(function (b) { b.addEventListener('click', toggleEditColors); });
  $('#hexInput').addEventListener('change', function (e) {
    var v = e.target.value.trim(); if (v[0] !== '#') v = '#' + v;
    if (/^#[0-9a-f]{6}$/i.test(v)) setColor(v, true); else { toast('Use a six digit hex color, like #3a78d8.'); e.target.value = S.color; }
  });
}
