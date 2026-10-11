/* Sketchroom: Layers and undo history.
   Plain script. Shares globals with the other files in js/; load order is set in index.html. */
'use strict';

/* ---------- layers ---------- */
function makeLayer(name) {
  var c = document.createElement('canvas'); c.width = DOC_W; c.height = DOC_H;
  return { id: uid(), name: name, canvas: c, ctx: c.getContext('2d'), visible: true, opacity: 1, blend: 'normal' };
}
function activeLayer() { return S.active; }
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
function undo() { var e = H.undo.pop(); if (!e) return; abortStroke(); e.undo(); H.redo.push(e); updateHist(); scheduleSave(); }
function redo() { var e = H.redo.pop(); if (!e) return; e.redo(); H.undo.push(e); updateHist(); scheduleSave(); }
function crop(src, x, y, w, h) { var c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d').drawImage(src, x, y, w, h, 0, 0, w, h); return c; }
function restore(L, img, x, y) { L.ctx.globalCompositeOperation = 'source-over'; L.ctx.globalAlpha = 1; L.ctx.clearRect(x, y, img.width, img.height); L.ctx.drawImage(img, x, y); }
function recordCrop(L, snap, bb) {
  var x = clamp(Math.floor(bb.x0), 0, DOC_W), y = clamp(Math.floor(bb.y0), 0, DOC_H);
  var w = clamp(Math.ceil(bb.x1), 0, DOC_W) - x, h = clamp(Math.ceil(bb.y1), 0, DOC_H) - y;
  if (w <= 0 || h <= 0) return;
  var before = crop(snap, x, y, w, h), after = crop(L.canvas, x, y, w, h);
  pushHist({ undo: function () { restore(L, before, x, y); }, redo: function () { restore(L, after, x, y); } });
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
  var L = S.active, before = crop(L.canvas, 0, 0, DOC_W, DOC_H);
  L.ctx.clearRect(0, 0, DOC_W, DOC_H);
  pushHist({ undo: function () { restore(L, before, 0, 0); }, redo: function () { L.ctx.clearRect(0, 0, DOC_W, DOC_H); } });
}
function moveLayer(dir) {
  var L = S.active, i = S.layers.indexOf(L), j = i + dir;
  if (j < 0 || j >= S.layers.length) return;
  var swap = function (a, b2) { var t = S.layers[a]; S.layers[a] = S.layers[b2]; S.layers[b2] = t; renderStack(); renderLayers(); };
  swap(i, j);
  pushHist({ undo: function () { swap(j, i); }, redo: function () { swap(i, j); } });
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
    row.append(eye, nm);
    var pick = function () { S.active = L; renderLayers(); };
    row.addEventListener('click', pick);
    row.addEventListener('keydown', function (ev) { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); pick(); } });
    host.appendChild(row);
  });
  var A = S.active;
  $('#layerName').value = A.name; $('#blendSel').value = A.blend;
  if (layerOpacitySlider) layerOpacitySlider.sync();
}
