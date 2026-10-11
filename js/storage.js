/* Sketchroom: Accounts and everything kept in them. Firebase (Google sign-in, Firestore, Cloud Storage) when configured,
   otherwise localStorage for brushes and fonts.
   Plain script. Shares globals with the other files in js/; load order is set in index.html. */
'use strict';

/* ---------- storage ----------
   Free library: brushes/{id}, fonts/{id}. Everyone reads, admins write.
   Private: users/{uid}/brushes/{id}, users/{uid}/fonts/{id}. Only that user.
   Saved colors: users/{uid}/settings/colors { colors: [...] } when signed in, otherwise localStorage.
   Drawing library: users/{uid}/items/{id} (projects, folders, images) and the layer PNGs in Cloud Storage.
   Admins: admins/{uid} exists. Created by hand in the Firebase console. */
var storeReady = null;
var store = { online: false, add: null, update: null, remove: null, addFont: null, signIn: null, signOut: null,
  saveColors: async function (list) { saveLocalColors(list); },
  // Without Firebase, uploaded fonts last until the page reloads, and suggestions are not available.
  addUploadedFont: async function () {}, removeUploadedFont: async function () {}, requestShare: null,
  // Resolves once the first sign-in state is known, so the first page shown is the right one.
  ready: new Promise(function (r) { storeReady = r; }) };
function fontDocId(family) { return family.replace(/[^A-Za-z0-9]/g, '-').toLowerCase(); }
// Saved colors in this browser. They start as the default swatches.
function localColors() {
  try { var v = JSON.parse(localStorage.getItem('sketchroom.colors')); return Array.isArray(v) ? cleanColors(v) : SWATCHES.slice(); }
  catch (e) { return SWATCHES.slice(); }
}
function saveLocalColors(list) { try { localStorage.setItem('sketchroom.colors', JSON.stringify(list)); } catch (e) { /* storage unavailable */ } }
function localStore() {
  var read = function (k) { try { return JSON.parse(localStorage.getItem(k) || '[]'); } catch (e) { return []; } };
  var write = function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } };
  var save = function () { write('sketchroom.brushes', S.mine.map(function (c) { return { id: c.id, name: c.name, params: c.params, at: c.at }; })); };
  S.mine = read('sketchroom.brushes').map(function (c) { return { id: c.id, name: String(c.name || 'Brush'), params: P(c.params || {}), at: c.at, where: 'mine' }; });
  S.myFonts = read('sketchroom.fonts');
  store.add = async function (name, params) { var id = uid() + uid(); S.mine.push({ id: id, name: name, params: params, at: Date.now(), where: 'mine' }); save(); renderBrushes(); return id; };
  store.update = async function (item, name, params) { S.mine.forEach(function (c) { if (c.id === item.id) { c.name = name; c.params = params; } }); save(); renderBrushes(); };
  store.remove = async function (item) { S.mine = S.mine.filter(function (c) { return c.id !== item.id; }); save(); renderBrushes(); };
  store.addFont = async function (family) { if (S.myFonts.indexOf(family) < 0) S.myFonts.push(family); write('sketchroom.fonts', S.myFonts); rebuildFonts(); };
}
function brushList(snap, where) {
  return snap.docs.map(function (d) { var v = d.data() || {}; return { id: d.id, name: String(v.name || 'Brush'), params: P(v.params || {}), at: v.at, where: where }; });
}
function fontList(snap) {
  return snap.docs.map(function (d) { return String((d.data() || {}).family || ''); }).filter(Boolean);
}
async function initStore() {
  var fb = window.firebase, cfg = window.FIREBASE_CONFIG;
  var web = location.protocol === 'http:' || location.protocol === 'https:';
  if (!fb || !cfg || !web) { localStore(); renderBrushes(); rebuildFonts(); renderAccount(); storeReady(); return; }
  try { fb.initializeApp(cfg); } catch (e) { localStore(); renderBrushes(); rebuildFonts(); renderAccount(); storeReady(); return; }
  var db = fb.firestore(), auth = fb.auth(), files = fb.storage ? fb.storage() : null;
  store.online = true;
  var lib = { brushes: db.collection('brushes'), fonts: db.collection('fonts') };
  var unsub = [];
  // Read the signed-in user from auth directly: right after signInWithPopup, onAuthStateChanged may not have run yet.
  var home = function () { if (!auth.currentUser) throw new Error('signed out'); return db.collection('users').doc(auth.currentUser.uid); };
  var col = function (where) { return where === 'library' ? lib.brushes : home().collection('brushes'); };

  store.add = async function (name, params, where) {
    var id = uid() + uid(), data = { name: name, params: params, at: Date.now() };
    if (where === 'library') data.by = auth.currentUser.uid;
    await col(where).doc(id).set(data); return id;
  };
  store.update = async function (item, name, params) { await col(item.where).doc(item.id).update({ name: name, params: params }); };
  store.remove = async function (item) { await col(item.where).doc(item.id).delete(); };
  store.addFont = async function (family) {
    var data = { family: family, at: Date.now() };
    if (S.canEdit) { data.by = auth.currentUser.uid; await lib.fonts.doc(fontDocId(family)).set(data); }
    else await home().collection('fonts').doc(fontDocId(family)).set(data);
  };
  store.signIn = async function () {
    try { await auth.signInWithPopup(new fb.auth.GoogleAuthProvider()); return true; }
    catch (e) {
      var quiet = e && (e.code === 'auth/popup-closed-by-user' || e.code === 'auth/cancelled-popup-request');
      if (e && e.code === 'auth/popup-blocked') toast('Your browser blocked the sign-in window. Allow pop-ups for this site and try again.');
      else if (e && e.code === 'auth/unauthorized-domain') toast('Sign-in is not set up for this address yet.');
      else if (!quiet) toast('Could not sign in. Try again.');
      return false;
    }
  };
  store.signOut = async function () { await auth.signOut(); toast('Signed out.'); };
  store.saveColors = async function (list) {
    if (auth.currentUser) await home().collection('settings').doc('colors').set({ colors: list, at: Date.now() });
    else saveLocalColors(list);
  };
  // Uploaded font files, base64 in users/{uid}/uploadedFonts (under the 1 MB document limit).
  store.addUploadedFont = async function (family, data) { await home().collection('uploadedFonts').doc(fontDocId(family)).set({ family: family, data: data, at: Date.now() }); };
  store.removeUploadedFont = async function (family) { await home().collection('uploadedFonts').doc(fontDocId(family)).delete(); };
  // Suggestions for the free library: requests/{uid}_{brushId}. Admins add or decline them.
  store.requestShare = async function (item) {
    var u = auth.currentUser; if (!u) throw new Error('signed out');
    await db.collection('requests').doc(u.uid + '_' + item.id).set({ name: item.name, params: item.params, at: Date.now(), by: u.uid, byName: (S.myName || '').slice(0, 80), brushId: item.id });
  };
  // The drawing library. Items are kept in S.items by the listener below.
  store.createItem = async function (data) { var id = uid() + uid(); await home().collection('items').doc(id).set(data); return id; };
  store.updateItem = async function (id, patch) { await home().collection('items').doc(id).update(patch); };
  store.deleteItem = async function (id) { await home().collection('items').doc(id).delete(); };
  var layerRef = function (imgId, layerId) {
    if (!files) throw new Error('Cloud Storage is not available');
    return files.ref('users/' + auth.currentUser.uid + '/images/' + imgId + '/' + layerId + '.png');
  };
  // no-cache: the same file is overwritten on every save, so browsers must not reuse an old copy.
  store.uploadLayer = async function (imgId, layerId, blob) { await layerRef(imgId, layerId).put(blob, { contentType: 'image/png', cacheControl: 'no-cache' }); };
  store.downloadLayer = async function (imgId, layerId) {
    var url;
    try { url = await layerRef(imgId, layerId).getDownloadURL(); }
    catch (e) { if (e && e.code === 'storage/object-not-found') return null; throw e; }
    var r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) throw new Error('download failed ' + r.status);
    return r.blob();
  };
  store.deleteLayer = async function (imgId, layerId) {
    try { await layerRef(imgId, layerId).delete(); } catch (e) { if (!e || e.code !== 'storage/object-not-found') throw e; }
  };
  store.approveRequest = async function (r) { await store.add(r.name, cleanParams(r.params), 'library'); await db.collection('requests').doc(r.id).delete(); };
  store.declineRequest = async function (r) { await db.collection('requests').doc(r.id).delete(); };

  lib.brushes.orderBy('at', 'asc').limit(500).onSnapshot(function (snap) {
    S.library = brushList(snap, 'library'); renderBrushes();
  }, function () { toast('Free brushes are not available right now.'); });
  lib.fonts.orderBy('at', 'asc').limit(200).onSnapshot(function (snap) {
    S.sharedFonts = fontList(snap); rebuildFonts();
  }, function () { /* fonts fall back to the built-in list */ });

  auth.onAuthStateChanged(async function (user) {
    unsub.forEach(function (u) { u(); }); unsub = [];
    var was = S.myId;
    S.items = {}; S.itemsReady = false;
    if (user) {
      unsub.push(db.collection('users').doc(user.uid).collection('items').limit(5000).onSnapshot(function (snap) {
        var items = {};
        snap.docs.forEach(function (d) { var v = d.data() || {}; v.id = d.id; items[d.id] = v; });
        S.items = items; S.itemsReady = true; renderHome();
      }, function () { S.itemsReady = true; renderHome(); toast('Your library could not be loaded. Check your connection.'); }));
    }
    S.myId = user ? user.uid : null;
    S.myName = user ? (user.displayName || user.email || 'You') : '';
    S.canEdit = false; S.mine = []; S.myFonts = []; S.requests = []; S.myRequests = []; S.uploadedFonts = [];
    if (user) {
      var mine = db.collection('users').doc(user.uid);
      try { S.canEdit = (await db.collection('admins').doc(user.uid).get()).exists; } catch (e) { S.canEdit = false; }
      if (S.myId !== user.uid) return; // signed out again while checking
      unsub.push(mine.collection('brushes').orderBy('at', 'asc').limit(500).onSnapshot(function (snap) {
        S.mine = brushList(snap, 'mine'); renderBrushes();
      }, function () { toast('Your brushes could not be loaded.'); }));
      unsub.push(mine.collection('fonts').orderBy('at', 'asc').limit(200).onSnapshot(function (snap) {
        S.myFonts = fontList(snap); rebuildFonts();
      }, function () { /* fonts fall back to the built-in list */ }));
      var colors = mine.collection('settings').doc('colors');
      unsub.push(colors.onSnapshot(function (snap) {
        if (snap.exists) { S.saved = cleanColors((snap.data() || {}).colors); renderSaved(); }
        // First sign-in: start the account's colors from this browser's. Only when the server says the doc is missing,
        // so an offline cache miss never overwrites real saved colors.
        else if (!snap.metadata.fromCache) colors.set({ colors: S.saved, at: Date.now() }).catch(function () { /* keep the device colors */ });
      }, function () { /* keep the device colors */ }));
      unsub.push(mine.collection('uploadedFonts').limit(50).onSnapshot(async function (snap) {
        var fams = [];
        for (var i = 0; i < snap.docs.length; i++) {
          var v = snap.docs[i].data() || {};
          if (typeof v.family === 'string' && typeof v.data === 'string' && await registerUploadedFont(v.family, v.data)) fams.push(v.family);
        }
        S.uploadedFonts = fams; rebuildFonts(); renderUploadedFonts();
      }, function () { /* uploaded fonts are optional */ }));
      var reqs = db.collection('requests');
      if (S.canEdit) {
        unsub.push(reqs.orderBy('at', 'asc').limit(100).onSnapshot(function (snap) {
          S.requests = snap.docs.map(function (d) { var v = d.data() || {}; return { id: d.id, name: String(v.name || 'Brush'), params: P(v.params || {}), byName: String(v.byName || ''), by: v.by }; });
          renderBrushes();
        }, function () { /* suggestions are optional */ }));
      } else {
        unsub.push(reqs.where('by', '==', user.uid).onSnapshot(function (snap) {
          S.myRequests = snap.docs.map(function (d) { return String((d.data() || {}).brushId || ''); });
          renderBrushes();
        }, function () { /* suggestions are optional */ }));
      }
    } else S.saved = localColors();
    renderAccount(); renderBrushes(); rebuildFonts(); renderSaved(); renderUploadedFonts();
    storeReady();
    if (was !== S.myId) accountChanged();
  });
}

/* ---------- account button ---------- */
function renderAccount() {
  $('#accountWrap').hidden = !store.online;
  var btn = $('#accountBtn');
  btn.textContent = S.myId ? S.myName.split(' ')[0] : 'Sign in';
  btn.title = S.myId ? 'Signed in as ' + S.myName : 'Sign in with Google to save your own brushes';
  btn.classList.toggle('primary', !S.myId);
  $('#accountName').textContent = S.myId ? S.myName + (S.canEdit ? ' (owner)' : '') : '';
  if (!S.myId) $('#accountMenu').hidden = true;
}
