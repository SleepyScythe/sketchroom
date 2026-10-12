/* Sketchroom: Drawing together, live.
   An image's owner can invite up to 5 friends (shares/{owner}_{imageId}, the Draw together dialog in library.js). They
   can open the image from their library any time, draw on it and save it, and anyone in it sees the others' changes live.

   While a shared image is open, S.live keeps a hidden copy (a "shadow") of each layer: what everyone else already has.
   After any change (liveTouch from recordCrop, restore and the layer actions; liveSoon from renderLayers and scheduleSave),
   liveFlush compares the changed area of each layer with its shadow and sends only the pixels that differ, in tiles of up
   to 256 × 256. A 'px' op is the new pixels (patch PNG) plus which pixels changed (mask PNG, left out when the whole tile
   changed). Layer changes (add, delete, order, name, visibility, opacity, blend, lock) go as one 'layers' op with the full
   list and the ids deleted this session. Incoming ops are applied in server order to both the layer and its shadow, so
   they are never sent back. Two people drawing at once only overwrite each other where the very same pixels changed.

   Saving works as before, into the owner's files (each person's cloudSave sends the layers they changed). An image opens
   from that saved copy and then replays the ops from a minute before it was last saved, so nothing unsaved is lost. */
'use strict';

var LIVE_TILE = 256;
// This tab. Ops are skipped by tab rather than by person, so the same person on two devices also stays in sync.
var LIVE_CID = uid() + uid();

function liveCanvas(w, h) { var c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
// A shadow: a copy of L (or blank), with a context that's quick to read back.
function liveShadow(L) {
  var c = liveCanvas(DOC_W, DOC_H), g = c.getContext('2d', { willReadFrequently: true });
  if (L) g.drawImage(L.canvas, 0, 0);
  return c;
}
function layerById(id) { for (var i = 0; i < S.layers.length; i++) if (S.layers[i].id === id) return S.layers[i]; return null; }
function liveSig() { return JSON.stringify(S.layers.map(function (L) { return [L.id, L.name, L.visible, Math.round(L.opacity * 1000), L.blend, L.locked]; })); }
// The share that makes the open image live, if any. Owners need at least one friend in it.
function shareFor(doc) {
  if (!doc || doc.local || !S.myId) return null;
  if (doc.owner === S.myId) { var s = S.myShares[doc.id]; return s && (s.members || []).length ? s : null; }
  return S.sharedIn.filter(function (x) { return x.owner === doc.owner && x.image === doc.id; })[0] || { owner: doc.owner, image: doc.id, members: [] };
}

/* ---------- sending ---------- */
// x == null: the whole layer changed.
function liveTouch(L, x, y, w, h) {
  var lv = S.live; if (!lv || !L) return;
  var t = lv.touched[L.id];
  if (x == null) lv.touched[L.id] = 'all';
  else if (t !== 'all') {
    lv.touched[L.id] = t ? { x0: Math.min(t.x0, x), y0: Math.min(t.y0, y), x1: Math.max(t.x1, x + w), y1: Math.max(t.y1, y + h) }
      : { x0: x, y0: y, x1: x + w, y1: y + h };
  }
  liveSoon();
}
function liveSoon() { var lv = S.live; if (!lv || !lv.ready) return; clearTimeout(lv.timer); lv.timer = setTimeout(liveFlush, 60); }
// Adds px ops for the pixels of L inside bb that differ from its shadow, and brings the shadow up to date.
function liveDiff(L, shadow, bb, ops) {
  var x0 = clamp(Math.floor(bb.x0), 0, DOC_W), y0 = clamp(Math.floor(bb.y0), 0, DOC_H);
  var x1 = clamp(Math.ceil(bb.x1), 0, DOC_W), y1 = clamp(Math.ceil(bb.y1), 0, DOC_H), sg = shadow.getContext('2d');
  for (var ty = Math.floor(y0 / LIVE_TILE) * LIVE_TILE; ty < y1; ty += LIVE_TILE) {
    for (var tx = Math.floor(x0 / LIVE_TILE) * LIVE_TILE; tx < x1; tx += LIVE_TILE) {
      var x = Math.max(tx, x0), y = Math.max(ty, y0), w = Math.min(tx + LIVE_TILE, x1) - x, h = Math.min(ty + LIVE_TILE, y1) - y;
      if (w <= 0 || h <= 0) continue;
      var a = L.ctx.getImageData(x, y, w, h).data, b = sg.getImageData(x, y, w, h).data;
      var mask = new ImageData(w, h), m = mask.data, n = 0;
      for (var i = 0; i < a.length; i += 4) {
        if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2] || a[i + 3] !== b[i + 3]) { m[i + 3] = 255; n++; }
      }
      if (!n) continue;
      var full = n === w * h, patch = liveCanvas(w, h), pg = patch.getContext('2d'), op = { kind: 'px', layer: L.id, x: x, y: y, w: w, h: h, full: full };
      pg.drawImage(L.canvas, x, y, w, h, 0, 0, w, h);
      if (!full) {
        var mc = liveCanvas(w, h); mc.getContext('2d').putImageData(mask, 0, 0);
        pg.globalCompositeOperation = 'destination-in'; pg.drawImage(mc, 0, 0);
        op.mask = mc.toDataURL('image/png');
      }
      op.patch = patch.toDataURL('image/png');
      ops.push(op);
      sg.clearRect(x, y, w, h); sg.drawImage(L.canvas, x, y, w, h, x, y, w, h);
    }
  }
}
async function liveFlush() {
  var lv = S.live; if (!lv || !lv.ready) return;
  if (lv.busy) { lv.again = true; return; }
  lv.busy = true; clearTimeout(lv.timer);
  try {
    var ops = [], sig = liveSig();
    if (sig !== lv.sig) {
      var ids = S.layers.map(function (L) { return L.id; });
      lv.known.forEach(function (id) { if (ids.indexOf(id) < 0) lv.deleted[id] = 1; });
      lv.known = ids; lv.sig = sig;
      ops.push({ kind: 'layers', deleted: Object.keys(lv.deleted).slice(-200), list: S.layers.map(function (L) {
        return { id: L.id, name: L.name, visible: L.visible, opacity: L.opacity, blend: L.blend, locked: L.locked };
      }) });
    }
    // A layer nobody else has yet (new, duplicated, imported) is sent whole.
    S.layers.forEach(function (L) { if (!lv.shadows[L.id]) { lv.shadows[L.id] = liveShadow(null); lv.touched[L.id] = 'all'; } });
    Object.keys(lv.touched).forEach(function (id) {
      var L = layerById(id), t = lv.touched[id]; delete lv.touched[id];
      if (L && lv.shadows[id]) liveDiff(L, lv.shadows[id], t === 'all' ? { x0: 0, y0: 0, x1: DOC_W, y1: DOC_H } : t, ops);
    });
    Object.keys(lv.shadows).forEach(function (id) { if (!layerById(id)) delete lv.shadows[id]; });
    ops.forEach(function (o) { o.cid = LIVE_CID; o.seq = ++lv.seq; lv.outbox.push(o); });
    await liveSendOutbox(lv);
  } catch (e) { /* the outbox keeps what didn't go out */ }
  lv.busy = false;
  if (lv.again) { lv.again = false; liveFlush(); }
}
// Sends queued ops in order. On a bad connection it keeps them and tries again every few seconds.
async function liveSendOutbox(lv) {
  if (lv.sending || !lv.outbox.length) return;
  lv.sending = true;
  try {
    while (lv.outbox.length) { var batch = lv.outbox.slice(0, 40); await store.liveSend(lv.sid, batch); lv.outbox.splice(0, batch.length); }
    if (lv.offline) { lv.offline = false; renderLiveBadge(); }
  } catch (e) {
    if (!lv.offline) { lv.offline = true; renderLiveBadge(); }
    clearTimeout(lv.retry); lv.retry = setTimeout(function () { if (S.live === lv) liveSendOutbox(lv); }, 5000);
  }
  lv.sending = false;
}

/* ---------- receiving ---------- */
function liveImage(url) {
  return new Promise(function (res, rej) { var i = new Image(); i.onload = function () { res(i); }; i.onerror = rej; i.src = url; });
}
async function livePx(lv, op) {
  if (typeof op.patch !== 'string' || op.patch.indexOf('data:image/png') !== 0) return;
  if (!layerById(op.layer)) { (lv.pending[op.layer] = lv.pending[op.layer] || []).push(op); return; } // its layer arrives later
  var patch = await liveImage(op.patch), mask = !op.full && typeof op.mask === 'string' ? await liveImage(op.mask) : null;
  var L = layerById(op.layer); if (S.live !== lv || !L) return;
  // A local layer that hasn't been sent yet: it goes out whole on the next flush, with this change in it.
  if (!lv.shadows[L.id]) { lv.shadows[L.id] = liveShadow(null); lv.touched[L.id] = 'all'; }
  [L.ctx, lv.shadows[L.id].getContext('2d')].forEach(function (g) {
    g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    if (mask) { g.globalCompositeOperation = 'destination-out'; g.drawImage(mask, op.x, op.y); g.globalCompositeOperation = 'source-over'; }
    else g.clearRect(op.x, op.y, op.w, op.h);
    g.drawImage(patch, op.x, op.y); g.restore();
  });
  // The finished stroke is here, so its preview can go once the rest of its tiles have landed.
  for (var k in lv.previews) {
    var pv = lv.previews[k];
    if (pv.done && pv.cid === op.cid) { clearTimeout(pv.timer); pv.timer = setTimeout(liveDropPreview.bind(null, lv, k), 150); }
  }
}
function liveLayers(lv, op) {
  (Array.isArray(op.deleted) ? op.deleted : []).forEach(function (id) {
    lv.deleted[id] = 1;
    var L = layerById(id);
    if (L && S.layers.length > 1) { if (cur && cur.L === L) abortStroke(); dropSelection(true); removeLayer(L); }
  });
  var list = (Array.isArray(op.list) ? op.list : []).filter(function (m) { return m && typeof m.id === 'string' && !lv.deleted[m.id]; });
  list.forEach(function (m) {
    var L = layerById(m.id);
    if (!L) { L = makeLayer('Layer'); L.id = m.id; L.dirty = false; S.layers.push(L); lv.shadows[L.id] = liveShadow(null); }
    var o = Number(m.opacity);
    L.name = String(m.name || 'Layer').slice(0, 30); L.visible = m.visible !== false; L.opacity = isFinite(o) ? clamp(o, 0, 1) : 1;
    L.blend = BLENDS.indexOf(m.blend) >= 0 ? m.blend : 'normal'; L.locked = !!m.locked;
  });
  // Their order, with any layer only this person has (added at the same moment) kept after the layer it followed.
  var order = list.map(function (m) { return layerById(m.id); }).filter(Boolean);
  S.layers.forEach(function (L, i) { if (order.indexOf(L) < 0) order.splice(i ? order.indexOf(S.layers[i - 1]) + 1 : 0, 0, L); });
  S.layers = order;
  if (S.layers.indexOf(S.active) < 0) S.active = S.layers[S.layers.length - 1];
  layerCount = Math.max(layerCount, S.layers.length);
  renderStack(); renderLayers();
  lv.known = S.layers.map(function (L) { return L.id; }); lv.sig = liveSig();
}
async function liveApply(lv, op) {
  if (S.live !== lv) return;
  if (op.cid !== LIVE_CID && op.by && op.by !== S.myId && lv.ready && !lv.seen[op.by]) {
    lv.seen[op.by] = 1; loadPeople([op.by]);
    toast((S.people[op.by] ? '@' + S.people[op.by].username : 'A friend') + ' is drawing with you.');
  }
  if (op.kind === 'stroke') liveStrokeOp(lv, op);
  else if (op.kind === 'px') await livePx(lv, op);
  else if (op.kind === 'layers') {
    liveLayers(lv, op);
    for (var id in lv.pending) {
      if (!layerById(id)) continue;
      var waiting = lv.pending[id]; delete lv.pending[id];
      for (var i = 0; i < waiting.length; i++) await livePx(lv, waiting[i]);
    }
  }
}

/* ---------- strokes while they're being drawn ----------
   The owner wanted strokes to show on both screens as they're drawn, not only once the pen lifts (2026-10-12). So a brush
   stroke is also streamed as 'stroke' ops about every 100 ms: its points (x, y, pressure), and in the first one the brush
   and color. The others draw it with the same brush into a preview canvas above that layer, and the finished pixels
   (the px ops sent when the pen lifts) replace the preview. Previews aren't replayed when an image opens. The eraser,
   smudge, pixel art and the other tools still show up once they're finished. */
var LIVE_STROKE_MS = 100;
function liveStrokeBegin(c) { if (S.live && S.live.ready) c.live = { sk: uid(), pts: [], first: true, timer: 0 }; }
function liveStrokePoint(c, x, y, p) {
  var s = c.live; if (!s) return;
  s.pts.push(Math.round(x * 10) / 10, Math.round(y * 10) / 10, Math.round(p * 100) / 100);
  if (!s.timer) s.timer = setTimeout(function () { liveStrokeSend(c, false, false); }, LIVE_STROKE_MS);
}
// done: the pen lifted. cancel: the stroke was thrown away (a pinch started, or undo during it).
function liveStrokeSend(c, done, cancel) {
  var s = c.live, lv = S.live; if (!s) return;
  clearTimeout(s.timer); s.timer = 0;
  if (done) c.live = null;
  if (!lv || !lv.ready || (s.first && (cancel || !s.pts.length)) || (!s.pts.length && !done)) return;
  var op = { kind: 'stroke', sk: s.sk, layer: c.L.id, pts: s.pts, cid: LIVE_CID, seq: ++lv.seq };
  if (s.first) { op.first = true; op.params = JSON.parse(JSON.stringify(c.b)); op.color = c.color; s.first = false; }
  if (done) op.done = true;
  if (cancel) op.cancel = true;
  s.pts = [];
  lv.outbox.push(op); liveSendOutbox(lv);
}
function liveStrokeOp(lv, op) {
  var key = op.cid + ':' + op.sk, pv = lv.previews[key];
  if (op.first && !pv) {
    var L = layerById(op.layer);
    if (!L || !op.params || typeof op.params !== 'object') return;
    var b = P(op.params), color = /^#[0-9a-f]{6}$/i.test(String(op.color)) ? op.color : '#000000', cv = liveCanvas(DOC_W, DOC_H);
    pv = lv.previews[key] = { canvas: cv, L: L, b: b, cid: op.cid, eng: new Engine(cv.getContext('2d'), b, color, 1, 1), last: null, done: false, timer: 0 };
    livePlacePreview(pv);
  }
  if (!pv) return;
  var a = Array.isArray(op.pts) ? op.pts : [];
  for (var i = 0; i + 2 < a.length; i += 3) {
    var x = Number(a[i]), y = Number(a[i + 1]), p = clamp(Number(a[i + 2]) || 0, 0, 1);
    if (isFinite(x) && isFinite(y)) { pv.last = { x: x, y: y, p: p }; pv.eng.add(x, y, p); }
  }
  if (op.cancel) { liveDropPreview(lv, key); return; }
  if (op.done) {
    if (pv.last) pv.eng.finish(pv.last);
    pv.done = true; clearTimeout(pv.timer);
    pv.timer = setTimeout(function () { liveDropPreview(lv, key); }, 5000); // in case the finished pixels never come
  }
}
// A preview sits right above its layer, at the brush's opacity, like the stroke buffer does on the drawer's screen.
function livePlacePreview(pv) {
  var L = pv.L, c = pv.canvas;
  c.style.opacity = String(pv.b.opacity / 100 * L.opacity); c.style.mixBlendMode = L.blend; c.style.display = L.visible ? '' : 'none';
  if (L.canvas.parentNode === stage) stage.insertBefore(c, L.canvas.nextSibling); else c.remove();
}
function livePlacePreviews() { var lv = S.live; if (!lv || !lv.previews) return; for (var k in lv.previews) livePlacePreview(lv.previews[k]); }
function liveDropPreview(lv, key) { var pv = lv.previews[key]; if (!pv) return; clearTimeout(pv.timer); pv.canvas.remove(); delete lv.previews[key]; }

/* ---------- starting and stopping ---------- */
// Joins the share's live ops, catching up on everything since fromMs first. Resolves once caught up (or after 8 s).
function liveStart(sid, fromMs) {
  liveStop(true);
  var lv = S.live = { sid: sid, doc: S.doc, shadows: {}, touched: {}, deleted: {}, pending: {}, seen: {}, outbox: [], previews: {},
    known: S.layers.map(function (L) { return L.id; }), sig: liveSig(), queue: Promise.resolve(), seq: Date.now() * 1000,
    ready: false, timer: 0, retry: 0, busy: false, again: false, sending: false, offline: false, unsub: null };
  S.layers.forEach(function (L) { lv.shadows[L.id] = liveShadow(L); });
  renderLiveBadge();
  // The owner deletes changes older than ten minutes that the saved copy already has (well before its last save).
  if (S.myId === (S.doc && S.doc.owner) && store.liveCleanup) store.liveCleanup(sid, Math.min(Date.now() - 600000, fromMs - 240000)).catch(function () { /* tidying is optional */ });
  return new Promise(function (resolve) {
    var done = function () { if (lv.ready) return; lv.ready = true; resolve(); liveSoon(); };
    setTimeout(done, 8000);
    lv.unsub = store.liveListen(sid, fromMs, function (ops, first) {
      ops.sort(function (a, b) { return a.atMs - b.atMs || (a.seq || 0) - (b.seq || 0); });
      ops.forEach(function (op) {
        if (!first && op.cid === LIVE_CID) return; // ours, already on the canvas
        if (first && op.kind === 'stroke') return; // old previews; their finished pixels are in the px ops
        lv.queue = lv.queue.then(function () { return liveApply(lv, op); }).catch(function () { /* skip a broken op */ });
      });
      if (first) lv.queue.then(done);
    }, function () { done(); if (S.live === lv) liveLost(lv); });
  });
}
// Sends anything waiting (unless skipFlush), then stops listening.
async function liveStop(skipFlush) {
  var lv = S.live; if (!lv) return;
  if (!skipFlush && lv.ready) { await liveFlush(); await liveSendOutbox(lv); }
  if (lv.unsub) lv.unsub();
  clearTimeout(lv.timer); clearTimeout(lv.retry);
  Object.keys(lv.previews).forEach(function (k) { liveDropPreview(lv, k); });
  if (S.live === lv) S.live = null;
  renderLiveBadge();
}
// The owner stopped sharing, or took this person off the list.
function liveLost(lv) {
  var doc = lv.doc; liveStop(true);
  if (!doc || doc !== S.doc || doc.owner === S.myId) return;
  doc.broken = true; // can't save into someone else's image any more
  toast('This image is no longer shared with you.');
  location.hash = '#/';
}
// The owner's shares changed (here or on another device): start or stop the live session of the open image.
function liveSharesChanged() {
  var doc = S.doc; renderLiveBadge();
  if (!doc || doc.local || doc.loading || doc.broken || doc.owner !== S.myId) return;
  var s = shareFor(doc);
  if (s && !S.live) liveStart(S.myId + '_' + doc.id, Date.now() - 60000);
  else if (!s && S.live) liveStop();
}
// The pill in the editor's top bar, and the Draw together button (owners only).
function renderLiveBadge() {
  var b = $('#liveBadge'), doc = S.doc, lv = S.live;
  $('#shareBtn').hidden = !doc || doc.local || !S.myId || doc.owner !== S.myId;
  b.hidden = !lv;
  if (!lv) return;
  var s = shareFor(doc) || {}, others = [s.owner].concat(s.members || []).filter(function (id) { return id && id !== S.myId; });
  loadPeople(others);
  b.textContent = lv.offline ? 'Reconnecting…' : 'Live';
  b.classList.toggle('offline', lv.offline);
  b.title = others.length ? 'Drawing together with ' + others.map(personName).join(', ') : 'Drawing together';
}
