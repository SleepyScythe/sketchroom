/* Sketchroom: The open image. Its size and pixel art settings, opening it (quick sketch, library image or a
   pending import) and saving it to the cloud library.
   Plain script. Shares globals with the other files in js/; load order is set in index.html. */
'use strict';

/* ---------- the open image ----------
   S.doc = { id, local, name, px, saved, broken, clearSketch }
   local: the quick sketch, kept only in this browser. Otherwise an image in the signed-in user's library:
   its layer PNGs are in Cloud Storage (users/{uid}/images/{id}/{layerId}.png) and the rest is the Firestore item.
   px: pixel art settings { tile, cols, rows }, or null for a regular image.
   saved: the layer ids that are in Cloud Storage, so removed layers can be deleted there.
   broken: the image did not load completely, so it is never saved over the cloud copy. */
var MAX_SIDE = 4096, MAX_PIXEL_SIDE = 2048;
function docKey(doc) { return doc.local ? 'current' : 'img:' + doc.id; }
function cleanPx(px) {
  if (!px || typeof px !== 'object') return null;
  var tile = Math.round(Number(px.tile)), cols = Math.round(Number(px.cols)), rows = Math.round(Number(px.rows));
  if (!(tile >= 1 && tile <= 256 && cols >= 1 && cols <= 256 && rows >= 1 && rows <= 256)) return null;
  return { tile: tile, cols: cols, rows: rows };
}
// Sizes every canvas for the open image. Layers must be rebuilt afterwards (makeLayer uses DOC_W and DOC_H).
function setDocSize(w, h) {
  DOC_W = w; DOC_H = h;
  buffer.width = overlay.width = w; buffer.height = overlay.height = h;
  stage.style.width = w + 'px'; stage.style.height = h + 'px';
  S.userZoomed = false;
}
// Turns pixel art mode on or off to match S.doc.
function applyDocMode() {
  var px = isPixel();
  stage.classList.toggle('pixel', px); document.body.classList.toggle('pixeldoc', px);
  $('#exportPngBig').hidden = !px;
  $('#docTitle').textContent = S.doc ? S.doc.name : 'Sketchroom';
  if (px && S.tool === 'smudge') setTool('brush');
  syncSliders(); updateQuick(); drawGrid();
}
// Swaps in a new set of layers and starts a fresh undo history.
function useLayers(out, activeId, count) {
  dropSelection(true); abortStroke();
  S.layers.forEach(function (L) { L.canvas.remove(); });
  S.layers = out; S.active = out.filter(function (L) { return L.id === activeId; })[0] || out[out.length - 1];
  layerCount = Math.max(count || 0, out.length); H.undo = []; H.redo = []; updateHist();
  renderStack(); renderLayers();
}
function showDocLoading(on) { $('#docLoading').hidden = !on; }

async function openSketch() {
  var rec = await idbGet('current');
  S.doc = { id: 'sketch', local: true, name: 'Quick sketch', px: cleanPx(rec && rec.px) };
  renderLiveBadge();
  setDocSize(rec && rec.w || 1600, rec && rec.h || 1200); applyDocMode();
  var out = null;
  if (rec && rec.layers && rec.layers.length) { try { out = await layersFromRecord(rec); } catch (e) { out = null; } }
  var L = out ? null : makeLayer('Layer 1');
  useLayers(out || [L], out ? rec.active : L.id, out ? rec.count : 1);
  setSaveState(out ? 'Restored from this device' : ''); fit();
}

// src: { owner, item } for an image a friend shared with you. Otherwise it's yours, from S.items.
async function openImage(id, token, src) {
  var owner = (src && src.owner) || S.myId, it = (src && src.item) || S.items[id];
  // loading: the canvas holds a blank placeholder until the layers arrive, so nothing may be saved yet.
  S.doc = { id: id, owner: owner, local: false, loading: true, name: it.name, px: cleanPx(it.px), saved: (it.layers || []).map(function (m) { return m.id; }) };
  renderLiveBadge();
  clearTimeout(saveTimer); clearTimeout(cloudTimer);
  setDocSize(it.w || 1600, it.h || 1200); applyDocMode();
  var blank = makeLayer('Layer 1'); useLayers([blank], blank.id, 1); fit();
  // A new image has no saved layers yet. Its first layer's id comes from the image, so everyone drawing together on it
  // starts with the same layer.
  if (!(it.layers || []).length) blank.id = 'l' + id;
  showDocLoading(true); setSaveState('');
  var out = null, active = it.active, count = it.count, rec = await idbGet('img:' + id);
  if (token !== routeToken) return;
  // Changes that never reached the cloud (offline, or the tab closed) win over the cloud copy.
  if (rec && !rec.synced && rec.layers && rec.layers.length && rec.w === DOC_W && rec.h === DOC_H && (rec.updated || 0) >= (it.updated || 0)) {
    try { out = await layersFromRecord(rec); active = rec.active; count = rec.count; out.forEach(function (L) { L.dirty = true; }); } catch (e) { out = null; }
  }
  if (!out && it.layers && it.layers.length) {
    try { out = await layersFromCloud(id, it.layers, owner); }
    catch (e) {
      if (token !== routeToken) return;
      S.doc.broken = true; showDocLoading(false);
      toast('This image did not load completely, so it will not be saved. Check your connection and open it again.');
      return;
    }
  }
  if (token !== routeToken) return;
  if (out) useLayers(out, active, count);
  // Drawing together: catch up on changes made since the last save before anyone can draw.
  if (shareFor(S.doc)) {
    await liveStart(owner + '_' + id, (it.updated || Date.now()) - 60000);
    if (token !== routeToken) return;
  }
  S.doc.loading = false;
  showDocLoading(false); fit();
  if (S.pendingImport && S.pendingImport.id === id) await applyImport(S.pendingImport);
  if (S.layers.some(function (L) { return L.dirty; })) scheduleCloudSave(800);
}
async function layersFromCloud(id, metas, owner) {
  return Promise.all(metas.map(async function (m) {
    var L = makeLayer(String(m.name || 'Layer'));
    L.id = m.id; L.visible = m.visible !== false; L.opacity = m.opacity == null ? 1 : clamp(Number(m.opacity) || 0, 0, 1);
    L.blend = BLENDS.indexOf(m.blend) >= 0 ? m.blend : 'normal'; L.locked = !!m.locked;
    var blob = await store.downloadLayer(id, m.id, owner);
    if (blob) { var bm = await createImageBitmap(blob); L.ctx.drawImage(bm, 0, 0); if (bm.close) bm.close(); }
    L.dirty = !blob; return L;
  }));
}
// A new library image made from a file, a picture or the quick sketch: its content arrives once it opens.
async function applyImport(p) {
  S.pendingImport = null;
  var out = null;
  try {
    if (p.data) out = await layersFromFile(p.data);
    else if (p.record) out = await layersFromRecord(p.record);
    else if (p.img) {
      var L = makeLayer('Layer 1'), k = Math.min(1, DOC_W / p.img.naturalWidth, DOC_H / p.img.naturalHeight);
      L.ctx.imageSmoothingQuality = 'high'; L.ctx.drawImage(p.img, 0, 0, p.img.naturalWidth * k, p.img.naturalHeight * k); out = [L];
    }
  } catch (e) { out = null; }
  if (!out) { toast('Could not read that file.'); return; }
  out.forEach(function (L) { L.dirty = true; });
  useLayers(out, out[out.length - 1].id, out.length);
  if (p.record) S.doc.clearSketch = true;
  scheduleSave();
}

/* ---------- cloud saving ---------- */
var cloudTimer = 0, cloudBusy = false, cloudAgain = false;
function scheduleCloudSave(delay) {
  if (!S.doc || S.doc.local || S.doc.broken || S.doc.loading) return;
  clearTimeout(cloudTimer); cloudTimer = setTimeout(cloudSave, delay == null ? 4000 : delay);
}
// A small picture of the image for its library card, stored in the Firestore item.
function makeThumb() {
  var px = isPixel(), k = 240 / Math.max(DOC_W, DOC_H);
  if (!px) k = Math.min(1, k);
  var c = document.createElement('canvas'); c.width = Math.max(1, Math.round(DOC_W * k)); c.height = Math.max(1, Math.round(DOC_H * k));
  var g = c.getContext('2d'); g.imageSmoothingEnabled = !px;
  if (!px) { g.fillStyle = '#ffffff'; g.fillRect(0, 0, c.width, c.height); }
  S.layers.forEach(function (L) {
    if (!L.visible) return;
    g.globalAlpha = L.opacity; g.globalCompositeOperation = L.blend === 'normal' ? 'source-over' : L.blend; g.drawImage(L.canvas, 0, 0, c.width, c.height);
  });
  var url = px ? c.toDataURL('image/png') : c.toDataURL('image/jpeg', 0.72);
  return url.length < 110000 ? url : c.toDataURL('image/jpeg', 0.5);
}
async function cloudSave() {
  var doc = S.doc;
  if (!doc || doc.local || doc.broken || doc.loading || !S.myId) return;
  if (cloudBusy) { cloudAgain = true; return; }
  cloudBusy = true; setSaveState('Saving…');
  try {
    if (S.sel && S.sel.float && !drag) { commitFloat(); drawSelOverlay(); }
    var layers = S.layers.slice(), ids = layers.map(function (L) { return L.id; });
    for (var i = 0; i < layers.length; i++) {
      var L = layers[i]; if (!L.dirty) continue;
      L.dirty = false; // set first, so a stroke made during the upload marks it again
      try { await store.uploadLayer(doc.id, L.id, await canvasBlob(L.canvas), doc.owner); } catch (e) { L.dirty = true; throw e; }
    }
    var gone = (doc.saved || []).filter(function (x) { return ids.indexOf(x) < 0; });
    for (var j = 0; j < gone.length; j++) await store.deleteLayer(doc.id, gone[j], doc.owner);
    var patch = {
      layers: layers.map(function (L) { return { id: L.id, name: L.name, visible: L.visible, opacity: L.opacity, blend: L.blend, locked: L.locked }; }),
      updated: Date.now()
    };
    // Size, thumbnail and active layer come from the canvas, so only while this image is still the one open.
    // Friends drawing on a shared image may only change the layers, thumbnail and these (the rules check it).
    if (doc === S.doc) {
      patch.active = S.active.id; patch.count = layerCount; patch.thumb = makeThumb();
      if (doc.owner === S.myId) { patch.w = DOC_W; patch.h = DOC_H; patch.px = doc.px || null; }
    }
    await store.updateItem(doc.id, patch, doc.owner);
    doc.saved = ids;
    if (doc === S.doc) {
      var clean = !S.layers.some(function (x) { return x.dirty; }) && !cloudAgain;
      setSaveState('Saved to your library');
      // Once the cloud has everything, the browser copy is no longer needed.
      if (clean) { clearTimeout(saveTimer); await idbDel('img:' + doc.id); }
      if (clean && doc.clearSketch) { doc.clearSketch = false; await idbDel('current'); }
    }
  } catch (e) {
    if (doc === S.doc) setSaveState('Not saved to your library yet. Trying again…');
    setTimeout(function () { if (doc === S.doc) scheduleCloudSave(0); }, 15000);
  }
  cloudBusy = false;
  if (cloudAgain) { cloudAgain = false; cloudSave(); }
}
// Saves everything before leaving the image (back to the library, another image, signing out).
async function leaveDoc() {
  var doc = S.doc; if (!doc) return;
  if (doc.loading || doc.broken) { clearTimeout(saveTimer); clearTimeout(cloudTimer); liveStop(true); return; } // nothing real to save
  abortStroke(); dropSelection(true);
  await liveStop(); // send the last changes to anyone drawing along
  clearTimeout(saveTimer);
  if (H.undo.length || S.layers.some(function (L) { return L.dirty; })) await saveDoc();
  if (!doc.local && !doc.broken) {
    clearTimeout(cloudTimer);
    while (cloudBusy) await new Promise(function (r) { setTimeout(r, 100); });
    if (S.layers.some(function (L) { return L.dirty; }) || (doc.saved || []).join() !== S.layers.map(function (L) { return L.id; }).join() || H.undo.length) await cloudSave();
  }
}
