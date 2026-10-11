/* Sketchroom: Fonts and the text tool.
   Plain script. Shares globals with the other files in js/; load order is set in index.html. */
'use strict';

/* ---------- fonts ---------- */
var loadedFamilies = {};
BUILTIN_FONTS.forEach(function (f) { loadedFamilies[f] = true; });
function loadFamily(family) {
  return new Promise(function (res, rej) {
    if (loadedFamilies[family]) { res(); return; }
    var l = document.createElement('link'); l.rel = 'stylesheet';
    l.href = 'https://fonts.googleapis.com/css2?family=' + encodeURIComponent(family).replace(/%20/g, '+') + '&display=swap';
    l.onload = function () { loadedFamilies[family] = true; res(); };
    l.onerror = function () { l.remove(); rej(new Error('not found')); };
    document.head.appendChild(l);
  });
}
function fontStr(size) { var t = S.text; return (t.italic ? 'italic ' : '') + (t.bold ? '700 ' : '400 ') + (size || t.size) + 'px "' + t.font + '", sans-serif'; }
async function ensureFont() {
  try { await loadFamily(S.text.font); await document.fonts.load(fontStr(40), 'Ag'); } catch (e) { /* fallback font used */ }
}
function rebuildFonts() {
  var sel = $('#fontSel'), cur = S.text.font; sel.innerHTML = '';
  var group = function (label, list) {
    if (!list.length) return;
    var g = document.createElement('optgroup'); g.label = label;
    list.forEach(function (f) { var o = document.createElement('option'); o.value = f; o.textContent = f; g.appendChild(o); });
    sel.appendChild(g);
  };
  group('Built in', BUILTIN_FONTS);
  var free = S.sharedFonts.filter(function (f) { return BUILTIN_FONTS.indexOf(f) < 0; });
  var mine = S.myFonts.filter(function (f) { return BUILTIN_FONTS.indexOf(f) < 0 && free.indexOf(f) < 0; });
  group('Free library', free);
  group(store.online ? 'Your fonts' : 'Added on this device', mine);
  free.concat(mine).forEach(function (f) { loadFamily(f).catch(function () {}); });
  sel.value = cur; if (sel.value !== cur) { sel.value = BUILTIN_FONTS[0]; S.text.font = sel.value; }
  updateFontPrev();
}
function updateFontPrev() {
  var p = $('#fontPrev'); p.style.fontFamily = '"' + S.text.font + '", sans-serif';
  p.style.fontWeight = S.text.bold ? '700' : '400'; p.style.fontStyle = S.text.italic ? 'italic' : 'normal';
}

/* ---------- text tool ---------- */
function textBlock() {
  var lines = S.text.str.split('\n'), lh = S.text.size * 1.2;
  return { lines: lines, lh: lh, h: lh * lines.length };
}
function drawText(ctx, pos, alpha) {
  var tb = textBlock(), maxW = 0;
  ctx.save(); ctx.globalAlpha = alpha; ctx.fillStyle = S.color; ctx.font = fontStr(); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  tb.lines.forEach(function (ln, i) {
    var y = pos.y - tb.h / 2 + tb.lh * (i + 0.5);
    ctx.fillText(ln, pos.x, y); maxW = Math.max(maxW, ctx.measureText(ln).width);
  });
  ctx.restore();
  return { x0: pos.x - maxW / 2 - S.text.size * 0.3, x1: pos.x + maxW / 2 + S.text.size * 0.3, y0: pos.y - tb.h / 2 - S.text.size * 0.3, y1: pos.y + tb.h / 2 + S.text.size * 0.3 };
}
function drawGhost(pos) {
  octx.clearRect(0, 0, DOC_W, DOC_H);
  if (S.text.str.trim()) drawText(octx, pos, 0.5);
}
async function placeText(pos) {
  if (!S.text.str.trim()) { toast('Type some text in the Text tab first.'); return; }
  var L = activeLayer(); if (!L.visible) { toast('This layer is hidden. Show it to draw on it.'); return; }
  await ensureFont();
  var snap = crop(L.canvas, 0, 0, DOC_W, DOC_H);
  var bb = drawText(L.ctx, pos, S.brush.opacity / 100);
  octx.clearRect(0, 0, DOC_W, DOC_H);
  recordCrop(L, snap, bb); setColor(S.color, true);
}
