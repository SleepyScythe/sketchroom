/* Sketchroom: Autosave on this device and PNG export.
   Plain script. Shares globals with the other files in js/; load order is set in index.html. */
'use strict';

/* ---------- save on this device, export ---------- */
var saveTimer = 0;
function scheduleSave() { clearTimeout(saveTimer); saveTimer = setTimeout(saveDoc, 2500); }
function idb() {
  return new Promise(function (res, rej) {
    var r = indexedDB.open('sketchroom', 1);
    r.onupgradeneeded = function () { r.result.createObjectStore('doc'); };
    r.onsuccess = function () { res(r.result); }; r.onerror = function () { rej(r.error); };
  });
}
async function saveDoc() {
  try {
    var layers = await Promise.all(S.layers.map(function (L) {
      return new Promise(function (res) { L.canvas.toBlob(function (b) { res({ id: L.id, name: L.name, visible: L.visible, opacity: L.opacity, blend: L.blend, blob: b }); }); });
    }));
    var db = await idb();
    await new Promise(function (res, rej) {
      var tx = db.transaction('doc', 'readwrite'); tx.objectStore('doc').put({ layers: layers, active: S.active.id, count: layerCount }, 'current');
      tx.oncomplete = res; tx.onerror = function () { rej(tx.error); };
    });
    $('#saveState').textContent = 'Saved on this device';
  } catch (e) { $('#saveState').textContent = ''; }
}
async function loadDoc() {
  try {
    var db = await idb();
    var data = await new Promise(function (res, rej) { var rq = db.transaction('doc').objectStore('doc').get('current'); rq.onsuccess = function () { res(rq.result); }; rq.onerror = function () { rej(rq.error); }; });
    if (!data || !data.layers || !data.layers.length) return false;
    var out = [];
    for (var i = 0; i < data.layers.length; i++) {
      var d = data.layers[i], L = makeLayer(d.name);
      L.id = d.id; L.visible = d.visible; L.opacity = d.opacity; L.blend = d.blend;
      if (d.blob) { var bm = await createImageBitmap(d.blob); L.ctx.drawImage(bm, 0, 0); if (bm.close) bm.close(); }
      out.push(L);
    }
    S.layers.forEach(function (L) { L.canvas.remove(); });
    S.layers = out; S.active = out.filter(function (L) { return L.id === data.active; })[0] || out[out.length - 1];
    layerCount = data.count || out.length; renderStack(); renderLayers();
    $('#saveState').textContent = 'Restored from this device';
    return true;
  } catch (e) { return false; }
}
async function exportPng(transparent) {
  var c = document.createElement('canvas'); c.width = DOC_W; c.height = DOC_H; var g = c.getContext('2d');
  if (!transparent) { g.fillStyle = '#ffffff'; g.fillRect(0, 0, DOC_W, DOC_H); }
  S.layers.forEach(function (L) {
    if (!L.visible) return;
    g.globalAlpha = L.opacity; g.globalCompositeOperation = L.blend === 'normal' ? 'source-over' : L.blend; g.drawImage(L.canvas, 0, 0);
  });
  var blob = await new Promise(function (r) { c.toBlob(r, 'image/png'); });
  if (!blob) { toast('Could not save the file.'); return; }
  var url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = 'sketchroom-' + new Date().toISOString().slice(0, 10) + '.png';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(function () { URL.revokeObjectURL(url); }, 10000);
  toast('PNG saved to your downloads.');
}
function newDoc() {
  S.layers.forEach(function (L) { L.canvas.remove(); });
  S.layers = []; layerCount = 0; H.undo = []; H.redo = []; updateHist();
  var L = makeLayer('Layer ' + (++layerCount)); S.layers.push(L); S.active = L; renderStack(); renderLayers(); scheduleSave(); toast('Fresh canvas.');
}
