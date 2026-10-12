/* Sketchroom: Layers and undo history.
   Plain script. Shares globals with the other files in js/; load order is set in index.html. */
'use strict';

/* ---------- layers ---------- */
function makeLayer(name) {
  var c = document.createElement('canvas'); c.width = DOC_W; c.height = DOC_H;
  // dirty: the pixels changed since the last upload to the library, so the next cloud save sends this layer.
  return { id: uid(), name: name, canvas: c, ctx: c.getContext('2d'), visible: true, opacity: 1, blend: 'normal', locked: false, dirty: true };
}
function activeLayer() { return S.active; }
// Every tool that changes pixels asks this first.
function canDraw(L) {
  if (!L.visible) { toast('This layer is hidden. Show it to draw on it.'); return false; }
  if (L.locked) { toast('This layer is locked. Unlock it in the Layers tab to change it.'); return false; }
  return true;
}
function renderStack() {
  S.layers.forEach(function (L) {
    stage.appendChild(L.canvas);
    L.canvas.style.opacity = L.opacity;
    L.canvas.style.mixBlendMode = L.blend;
    L.canvas.style.display = L.visible ? '' : 'none';
  });
  stage.appendChild(overlay);
}
function insertLayer(L, idx) { S.layers.splice(idx, 0, L); S.active = L; renderStack(); renderLayers(); }
function removeLayer(L) {
  var i = S.layers.indexOf(L); if (i < 0) return;
  S.layers.splice(i, 1); L.canvas.remove();
  if (S.active === L) S.active = S.layers[Math.min(i, S.layers.length - 1)];
  renderStack(); renderLayers();
}
var H = { undo: [], redo: [] };
function pushHist(e) { H.undo.push(e); if (H.undo.length > 80) H.undo.shift(); H.redo.length = 0; updateHist(); scheduleSave(); }
function updateHist() { $('#undoBtn').disabled = !H.undo.length; $('#redoBtn').disabled = !H.redo.length; }
function undo() { abortStroke(); dropSelection(); var e = H.undo.pop(); if (!e) return; e.undo(); H.redo.push(e); updateHist(); scheduleSave(); }
function redo() { abortStroke(); dropSelection(); var e = H.redo.pop(); if (!e) return; e.redo(); H.undo.push(e); updateHist(); scheduleSave(); }
function crop(src, x, y, w, h) { var c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d').drawImage(src, x, y, w, h, 0, 0, w, h); return c; }
function restore(L, img, x, y) {
  L.dirty = true; L.ctx.globalCompositeOperation = 'source-over'; L.ctx.globalAlpha = 1; L.ctx.clearRect(x, y, img.width, img.height); L.ctx.drawImage(img, x, y);
  liveTouch(L, x, y, img.width, img.height);
}
// Undo and redo of a stroke put back only the pixels that stroke changed (where from and to differ), so changes a friend
// made nearby while drawing together survive. On your own it's the same as putting the whole area back.
function restoreChanged(L, from, to, x, y) {
  var w = from.width, h = from.height, a = from.getContext('2d').getImageData(0, 0, w, h).data, b = to.getContext('2d').getImageData(0, 0, w, h).data;
  var mask = new ImageData(w, h), m = mask.data, n = 0;
  for (var i = 0; i < a.length; i += 4) if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2] || a[i + 3] !== b[i + 3]) { m[i + 3] = 255; n++; }
  if (!n) return;
  var mc = document.createElement('canvas'); mc.width = w; mc.height = h; mc.getContext('2d').putImageData(mask, 0, 0);
  var tc = crop(to, 0, 0, w, h), tg = tc.getContext('2d'); tg.globalCompositeOperation = 'destination-in'; tg.drawImage(mc, 0, 0);
  var g = L.ctx; L.dirty = true;
  g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1;
  g.globalCompositeOperation = 'destination-out'; g.drawImage(mc, x, y);
  g.globalCompositeOperation = 'source-over'; g.drawImage(tc, x, y); g.restore();
  liveTouch(L, x, y, w, h);
}
function recordCrop(L, snap, bb) {
  L.dirty = true;
  var x = clamp(Math.floor(bb.x0), 0, DOC_W), y = clamp(Math.floor(bb.y0), 0, DOC_H);
  var w = clamp(Math.ceil(bb.x1), 0, DOC_W) - x, h = clamp(Math.ceil(bb.y1), 0, DOC_H) - y;
  if (w <= 0 || h <= 0) return;
  var before = crop(snap, x, y, w, h), after = crop(L.canvas, x, y, w, h);
  pushHist({ undo: function () { restoreChanged(L, after, before, x, y); }, redo: function () { restoreChanged(L, before, after, x, y); } });
  liveTouch(L, x, y, w, h);
}
function addLayer() {
  var L = makeLayer('Layer ' + (++layerCount)), idx = S.layers.indexOf(S.active) + 1;
  insertLayer(L, idx);
  pushHist({ undo: function () { removeLayer(L); }, redo: function () { insertLayer(L, idx); } });
}
function dupLayer() {
  var src = S.active, L = makeLayer(src.name + ' copy'), idx = S.layers.indexOf(src) + 1;
  L.ctx.drawImage(src.canvas, 0, 0); L.opacity = src.opacity; L.blend = src.blend;
  insertLayer(L, idx);
  pushHist({ undo: function () { removeLayer(L); }, redo: function () { insertLayer(L, idx); } });
}
function delLayer() {
  if (S.layers.length < 2) { toast('Keep at least one layer.'); return; }
  var L = S.active, idx = S.layers.indexOf(L);
  removeLayer(L);
  pushHist({ undo: function () { insertLayer(L, idx); }, redo: function () { removeLayer(L); } });
}
function clearLayer() {
  if (S.active.locked) { toast('This layer is locked. Unlock it to clear it.'); return; }
  var L = S.active, before = crop(L.canvas, 0, 0, DOC_W, DOC_H);
  L.ctx.clearRect(0, 0, DOC_W, DOC_H); L.dirty = true; liveTouch(L);
  pushHist({ undo: function () { restore(L, before, 0, 0); }, redo: function () { L.ctx.clearRect(0, 0, DOC_W, DOC_H); L.dirty = true; liveTouch(L); } });
}
function moveLayer(dir) {
  var L = S.active, i = S.layers.indexOf(L), j = i + dir;
  if (j < 0 || j >= S.layers.length) return;
  var swap = function (a, b2) { var t = S.layers[a]; S.layers[a] = S.layers[b2]; S.layers[b2] = t; renderStack(); renderLayers(); };
  swap(i, j);
  pushHist({ undo: function () { swap(j, i); }, redo: function () { swap(i, j); } });
}
function mergeDown() {
  var L = S.active, i = S.layers.indexOf(L), B = S.layers[i - 1];
  if (!B) { toast('There is no layer below to merge into.'); return; }
  if (!L.visible) { toast('Show this layer before merging it.'); return; }
  if (L.locked || B.locked) { toast('Unlock both layers to merge them.'); return; }
  var before = crop(B.canvas, 0, 0, DOC_W, DOC_H);
  B.ctx.globalAlpha = L.opacity; B.ctx.globalCompositeOperation = L.blend === 'normal' ? 'source-over' : L.blend;
  B.ctx.drawImage(L.canvas, 0, 0); B.dirty = true; liveTouch(B);
  B.ctx.globalAlpha = 1; B.ctx.globalCompositeOperation = 'source-over';
  var after = crop(B.canvas, 0, 0, DOC_W, DOC_H);
  var apply = function () { restore(B, after, 0, 0); removeLayer(L); S.active = B; renderLayers(); };
  removeLayer(L); S.active = B; renderLayers();
  pushHist({ undo: function () { restore(B, before, 0, 0); insertLayer(L, i); }, redo: apply });
}
function toggleLock(L) { L.locked = !L.locked; renderLayers(); scheduleSave(); }
// Import a picture to trace: it goes under the current layer, locked, at 40% opacity.
function importImage(file) {
  if (!file) return;
  if (!/^image\//.test(file.type)) { toast('Choose an image file.'); return; }
  var url = URL.createObjectURL(file), img = new Image();
  img.onload = function () {
    URL.revokeObjectURL(url);
    var name = file.name.replace(/\.[^.]+$/, '').trim().slice(0, 30) || 'Reference';
    var L = makeLayer(name), k = Math.min(DOC_W / img.naturalWidth, DOC_H / img.naturalHeight);
    var w = img.naturalWidth * k, h = img.naturalHeight * k;
    L.ctx.imageSmoothingQuality = 'high'; L.ctx.drawImage(img, (DOC_W - w) / 2, (DOC_H - h) / 2, w, h);
    L.opacity = 0.4; L.locked = true;
    var keep = S.active, idx = S.layers.indexOf(keep);
    var add = function () { insertLayer(L, idx); S.active = keep; renderLayers(); };
    add();
    pushHist({ undo: function () { removeLayer(L); S.active = keep; renderLayers(); }, redo: add });
    toast('Image added under your layer, locked at 40% opacity. Draw on top to trace it.');
  };
  img.onerror = function () { URL.revokeObjectURL(url); toast('That image could not be opened.'); };
  img.src = url;
}
var layerOpacitySlider;
function renderLayers() {
  var host = $('#layerList'); host.innerHTML = '';
  S.layers.slice().reverse().forEach(function (L) {
    var row = document.createElement('div'); row.className = 'lrow' + (L.visible ? '' : ' hidden-layer');
    row.setAttribute('role', 'button'); row.tabIndex = 0;
    if (L === S.active) row.setAttribute('aria-current', 'true');
    var eye = document.createElement('button'); eye.className = 'ibtn'; eye.innerHTML = icon(L.visible ? 'eye' : 'eyeoff', 18);
    eye.setAttribute('aria-label', (L.visible ? 'Hide ' : 'Show ') + L.name);
    eye.addEventListener('click', function (ev) { ev.stopPropagation(); L.visible = !L.visible; renderStack(); renderLayers(); scheduleSave(); });
    var nm = document.createElement('span'); nm.className = 'ln'; nm.textContent = L.name;
    var lock = document.createElement('button'); lock.className = 'ibtn lockbtn'; lock.innerHTML = icon(L.locked ? 'lock' : 'unlock', 16);
    lock.setAttribute('aria-label', (L.locked ? 'Unlock ' : 'Lock ') + L.name); lock.title = L.locked ? 'Locked. Click to unlock' : 'Lock this layer';
    lock.setAttribute('aria-pressed', String(L.locked));
    lock.addEventListener('click', function (ev) { ev.stopPropagation(); toggleLock(L); });
    row.append(eye, nm, lock);
    var pick = function () { if (L !== S.active) dropSelection(); S.active = L; renderLayers(); };
    row.addEventListener('click', pick);
    row.addEventListener('keydown', function (ev) { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); pick(); } });
    host.appendChild(row);
  });
  var A = S.active;
  $('#layerName').value = A.name; $('#blendSel').value = A.blend;
  if (layerOpacitySlider) layerOpacitySlider.sync();
  liveSoon(); // drawing together: send any change to the layer list
}
