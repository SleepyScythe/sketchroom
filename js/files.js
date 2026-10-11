/* Sketchroom: Saving the open image in this browser, PNG export, and drawing files.
   Plain script. Shares globals with the other files in js/; load order is set in index.html. */
'use strict';

/* ---------- save in this browser ----------
   Every change is saved to IndexedDB (database "sketchroom", store "doc") about 2.5 seconds later.
   The quick sketch lives under the key "current". A library image is kept under "img:<id>" until it has
   reached the cloud (see document.js), so nothing is lost if the connection drops or the tab closes. */
var saveTimer = 0, BLENDS = ['normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten'];
function scheduleSave() { clearTimeout(saveTimer); saveTimer = setTimeout(saveDoc, 2500); }
function setSaveState(t) { $('#saveState').textContent = t; }
function downloadBlob(blob, name) {
  var url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(function () { URL.revokeObjectURL(url); }, 10000);
}
function today() { return new Date().toISOString().slice(0, 10); }
function fileStem() { return (S.doc && !S.doc.local ? S.doc.name.replace(/[^\w -]+/g, '').trim().replace(/\s+/g, '-') : '') || 'sketchroom-' + today(); }
function idb() {
  return new Promise(function (res, rej) {
    var r = indexedDB.open('sketchroom', 1);
    r.onupgradeneeded = function () { r.result.createObjectStore('doc'); };
    r.onsuccess = function () { res(r.result); }; r.onerror = function () { rej(r.error); };
  });
}
async function idbDo(mode, fn) {
  var db = await idb();
  return new Promise(function (res, rej) {
    var tx = db.transaction('doc', mode), rq = fn(tx.objectStore('doc'));
    tx.oncomplete = function () { res(rq && rq.result); }; tx.onerror = function () { rej(tx.error); };
  });
}
function idbGet(key) { return idbDo('readonly', function (st) { return st.get(key); }).catch(function () { return null; }); }
function idbPut(key, val) { return idbDo('readwrite', function (st) { return st.put(val, key); }); }
function idbDel(key) { return idbDo('readwrite', function (st) { return st.delete(key); }).catch(function () {}); }
function canvasBlob(c, type, q) { return new Promise(function (res) { c.toBlob(res, type || 'image/png', q); }); }

async function saveDoc() {
  // Never save while an image is still loading or failed to load: the canvas only holds a blank placeholder then.
  var doc = S.doc; if (!doc || doc.loading || doc.broken) return;
  // Pixels being moved with the selection tool are off their layer until dropped, so land them before saving.
  if (S.sel && S.sel.float && !drag) { commitFloat(); drawSelOverlay(); }
  try {
    var layers = await Promise.all(S.layers.map(async function (L) {
      return { id: L.id, name: L.name, visible: L.visible, opacity: L.opacity, blend: L.blend, locked: L.locked, blob: await canvasBlob(L.canvas) };
    }));
    if (doc !== S.doc) return;
    await idbPut(docKey(doc), { layers: layers, active: S.active.id, count: layerCount, w: DOC_W, h: DOC_H, px: doc.px || null, updated: Date.now(), synced: false });
    if (doc.local) setSaveState('Saved on this device'); else scheduleCloudSave(1500);
  } catch (e) { if (doc.local) setSaveState(''); }
}
// Layers from a saved record ({ layers: [{ name, visible, opacity, blend, locked, blob }], ... }). The image size must already be set.
async function layersFromRecord(rec) {
  var out = [];
  for (var i = 0; i < rec.layers.length; i++) {
    var d = rec.layers[i], L = makeLayer(String(d.name || 'Layer'));
    if (d.id) L.id = d.id;
    L.visible = d.visible !== false; L.opacity = d.opacity == null ? 1 : clamp(Number(d.opacity) || 0, 0, 1);
    L.blend = BLENDS.indexOf(d.blend) >= 0 ? d.blend : 'normal'; L.locked = !!d.locked;
    if (d.blob) { var bm = await createImageBitmap(d.blob); L.ctx.drawImage(bm, 0, 0); if (bm.close) bm.close(); }
    out.push(L);
  }
  return out;
}

/* ---------- PNG export ---------- */
// scale > 1 enlarges with hard pixel edges (for pixel art).
async function exportPng(transparent, scale) {
  var k = scale || 1, c = document.createElement('canvas'); c.width = DOC_W * k; c.height = DOC_H * k;
  var g = c.getContext('2d'); g.imageSmoothingEnabled = k === 1;
  if (!transparent) { g.fillStyle = '#ffffff'; g.fillRect(0, 0, c.width, c.height); }
  S.layers.forEach(function (L) {
    if (!L.visible) return;
    g.globalAlpha = L.opacity; g.globalCompositeOperation = L.blend === 'normal' ? 'source-over' : L.blend; g.drawImage(L.canvas, 0, 0, c.width, c.height);
  });
  var blob = await canvasBlob(c);
  if (!blob) { toast('Could not save the file.'); return; }
  downloadBlob(blob, fileStem() + (k > 1 ? '-x' + k : '') + '.png');
  toast('PNG saved to your downloads.');
}

/* ---------- drawing files ----------
   A .sketchroom.json file keeps the size, pixel art settings and every layer (as a PNG) with its name, visibility,
   opacity, blend mode and lock, so a drawing can move between devices or be backed up. */
function saveDrawingFile() {
  dropSelection();
  var data = {
    app: 'sketchroom', version: 2, width: DOC_W, height: DOC_H, px: (S.doc && S.doc.px) || null, active: S.layers.indexOf(S.active),
    layers: S.layers.map(function (L) { return { name: L.name, visible: L.visible, opacity: L.opacity, blend: L.blend, locked: L.locked, png: L.canvas.toDataURL('image/png') }; })
  };
  downloadBlob(new Blob([JSON.stringify(data)], { type: 'application/json' }), fileStem() + '.sketchroom.json');
  toast('Drawing file saved to your downloads.');
}
function loadImage(src) {
  return new Promise(function (res, rej) { var img = new Image(); img.onload = function () { res(img); }; img.onerror = rej; img.src = src; });
}
// Reads and checks a drawing file. Returns null (after a toast) if it isn't one.
async function parseDrawingFile(file) {
  var data = null;
  try { data = JSON.parse(await file.text()); } catch (e) { data = null; }
  if (!data || data.app !== 'sketchroom' || !Array.isArray(data.layers) || !data.layers.length || data.layers.length > 100) {
    toast('That is not a Sketchroom drawing file.'); return null;
  }
  data.width = clamp(Math.round(Number(data.width) || 1600), 1, 4096); data.height = clamp(Math.round(Number(data.height) || 1200), 1, 4096);
  data.px = cleanPx(data.px);
  return data;
}
// Layers from a parsed drawing file. The image size must already match the file.
async function layersFromFile(data) {
  var out = [];
  for (var i = 0; i < data.layers.length; i++) {
    var d = data.layers[i] || {}, L = makeLayer(String(d.name || 'Layer ' + (i + 1)).slice(0, 30));
    L.visible = d.visible !== false; L.opacity = d.opacity == null ? 1 : clamp(Number(d.opacity) || 0, 0, 1);
    L.blend = BLENDS.indexOf(d.blend) >= 0 ? d.blend : 'normal'; L.locked = !!d.locked;
    if (typeof d.png === 'string' && d.png.indexOf('data:image/') === 0) L.ctx.drawImage(await loadImage(d.png), 0, 0);
    out.push(L);
  }
  return out;
}
// File > Open drawing file: replaces the open image (size and pixel settings included) with the file's.
async function openDrawingFile(file) {
  if (!file) return;
  var data = await parseDrawingFile(file); if (!data) return;
  var prev = { w: DOC_W, h: DOC_H, px: S.doc.px };
  S.doc.px = data.px; setDocSize(data.width, data.height); applyDocMode();
  var out;
  try { out = await layersFromFile(data); }
  catch (e) { S.doc.px = prev.px; setDocSize(prev.w, prev.h); applyDocMode(); toast('Could not read the layers in that file.'); return; }
  var act = out[clamp(Number(data.active) || 0, 0, out.length - 1)];
  useLayers(out, act && act.id, out.length); fit(); scheduleSave();
  toast('Opened ' + file.name + '.');
}
function newDoc() {
  var L = makeLayer('Layer 1');
  useLayers([L], L.id, 1); scheduleSave(); toast('Fresh canvas.');
}
