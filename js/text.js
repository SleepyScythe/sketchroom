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
  group('Uploaded', S.uploadedFonts);
  free.concat(mine).forEach(function (f) { loadFamily(f).catch(function () {}); });
  sel.value = cur; if (sel.value !== cur) { sel.value = BUILTIN_FONTS[0]; S.text.font = sel.value; }
  updateFontPrev();
}
function updateFontPrev() {
  var p = $('#fontPrev'); p.style.fontFamily = '"' + S.text.font + '", sans-serif';
  p.style.fontWeight = S.text.bold ? '700' : '400'; p.style.fontStyle = S.text.italic ? 'italic' : 'normal';
}

/* ---------- uploaded font files ---------- */
var MAX_FONT_BYTES = 700 * 1024, uploadedFaces = {};
function bytesToBase64(buf) {
  var bytes = new Uint8Array(buf), s = '';
  for (var i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
function base64ToBytes(b64) { var s = atob(b64), out = new Uint8Array(s.length); for (var i = 0; i < s.length; i++) out[i] = s.charCodeAt(i); return out; }
// Registers a font file with the browser under its family name. Returns false if the browser can't use it.
async function registerUploadedFont(family, data) {
  if (uploadedFaces[family]) return true;
  try {
    var face = new FontFace(family, typeof data === 'string' ? base64ToBytes(data) : data);
    await face.load(); document.fonts.add(face);
    uploadedFaces[family] = face; loadedFamilies[family] = true; return true;
  } catch (e) { return false; }
}
function fontNameFromFile(name) {
  var n = name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').replace(/[^A-Za-z0-9 ]/g, '').replace(/\s+/g, ' ').trim().slice(0, 40);
  if (n.length < 2) n = 'My Font';
  // Don't shadow a built-in or Google font with the same name.
  if (BUILTIN_FONTS.indexOf(n) >= 0 || S.sharedFonts.indexOf(n) >= 0 || S.myFonts.indexOf(n) >= 0) n = (n.slice(0, 33) + ' Upload').trim();
  return n;
}
async function uploadFont(file) {
  if (!file) return;
  if (!/\.(ttf|otf|woff2?)$/i.test(file.name)) { toast('Choose a .ttf, .otf, .woff or .woff2 font file.'); return; }
  if (file.size > MAX_FONT_BYTES) { toast('That font file is over 700 KB. Try its .woff2 version, which is smaller.'); return; }
  var buf = await file.arrayBuffer(), family = fontNameFromFile(file.name), b64 = bytesToBase64(buf);
  if (!(await registerUploadedFont(family, buf))) { toast('That file is not a font this browser can use.'); return; }
  try { await store.addUploadedFont(family, b64); }
  catch (e) { toast('Could not save that font to your account. Try again.'); return; }
  if (S.uploadedFonts.indexOf(family) < 0) S.uploadedFonts = S.uploadedFonts.concat([family]);
  S.text.font = family; rebuildFonts(); $('#fontSel').value = family; updateFontPrev(); renderUploadedFonts();
  toast(family + (store.online ? ' uploaded to your account.' : ' added until you reload. Sign-in is not available here.'));
}
function renderUploadedFonts() {
  var host = $('#uploadedFonts'); host.innerHTML = '';
  S.uploadedFonts.forEach(function (f) {
    var row = document.createElement('div'); row.className = 'fontrow';
    var nm = document.createElement('span'); nm.textContent = f; nm.style.fontFamily = '"' + f + '", sans-serif';
    var del = document.createElement('button'); del.className = 'ibtn sm'; del.innerHTML = icon('x', 14);
    del.setAttribute('aria-label', 'Remove font ' + f); del.title = 'Remove font';
    del.addEventListener('click', function () {
      store.removeUploadedFont(f).then(function () {
        S.uploadedFonts = S.uploadedFonts.filter(function (x) { return x !== f; });
        if (uploadedFaces[f]) { document.fonts.delete(uploadedFaces[f]); delete uploadedFaces[f]; delete loadedFamilies[f]; }
        rebuildFonts(); renderUploadedFonts();
      }, function () { toast('Could not remove that font. Try again.'); });
    });
    row.append(nm, del); host.appendChild(row);
  });
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
  var L = activeLayer(); if (!canDraw(L)) return;
  await ensureFont();
  var snap = crop(L.canvas, 0, 0, DOC_W, DOC_H);
  var bb = drawText(L.ctx, pos, S.brush.opacity / 100);
  octx.clearRect(0, 0, DOC_W, DOC_H);
  recordCrop(L, snap, bb); setColor(S.color, true);
}
