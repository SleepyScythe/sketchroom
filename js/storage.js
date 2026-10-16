/* Sketchroom: Accounts and everything kept in them. Firebase (Google sign-in, Firestore, Cloud Storage) when configured,
   otherwise localStorage for brushes and fonts.
   Plain script. Shares globals with the other files in js/; load order is set in index.html. */
'use strict';

/* ---------- storage ----------
   Free library: brushes/{id}, fonts/{id}. Everyone reads, admins write.
   Private: users/{uid}/brushes/{id}, users/{uid}/fonts/{id}. Only that user.
   Saved colors: users/{uid}/settings/colors { colors: [...] } when signed in, otherwise localStorage.
   Drawing library: users/{uid}/items/{id} (projects, folders, images) and the layer PNGs in Cloud Storage.
   Friends: users/{uid}/friends/{friendUid} and friendRequests/{from}_{to}. Friends read each other's non-private items.
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
  // App Check: Firebase can then tell requests from this site (checked by invisible reCAPTCHA) from scripts calling it
  // directly. Localhost uses a debug token instead (the SDK prints it in the console; add it under App Check >
  // Manage debug tokens before enforcing). The reCAPTCHA badge is hidden, so the homepage footer carries its notice.
  if (window.APP_CHECK_KEY && fb.appCheck) {
    try {
      if (location.hostname === 'localhost') self.FIREBASE_APPCHECK_DEBUG_TOKEN = true;
      fb.appCheck().activate(new fb.appCheck.ReCaptchaEnterpriseProvider(window.APP_CHECK_KEY), true);
      document.body.classList.add('appcheck');
    } catch (e) { /* works without it until App Check is enforced */ }
  }
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
  // Which "What's new" notes this account has seen (news.js).
  store.setNewsSeen = async function (v) { await home().collection('settings').doc('news').set({ seen: v, at: Date.now() }); };
  // Uploaded font files, base64 in users/{uid}/uploadedFonts (under the 1 MB document limit).
  store.addUploadedFont = async function (family, data) { await home().collection('uploadedFonts').doc(fontDocId(family)).set({ family: family, data: data, at: Date.now() }); };
  store.removeUploadedFont = async function (family) { await home().collection('uploadedFonts').doc(fontDocId(family)).delete(); };
  // Suggestions for the free library: requests/{uid}_{brushId}. Admins add or decline them.
  store.requestShare = async function (item) {
    var u = auth.currentUser; if (!u) throw new Error('signed out');
    // byName is the username, never the Google name or email.
    await db.collection('requests').doc(u.uid + '_' + item.id).set({ name: item.name, params: item.params, at: Date.now(), by: u.uid, byName: S.profile ? '@' + S.profile.username : 'A tester', brushId: item.id });
  };
  // Profiles and usernames. usernames/{name} = { uid } reserves a name. Changing it moves the reservation in one batch,
  // and the rules check both documents together, so two people can never hold the same name.
  store.saveProfile = async function (p, oldName) {
    var me = auth.currentUser.uid, b = db.batch();
    b.set(db.collection('profiles').doc(me), p);
    if (p.username !== oldName) {
      b.set(db.collection('usernames').doc(p.username), { uid: me });
      if (oldName) b.delete(db.collection('usernames').doc(oldName));
    }
    await b.commit();
  };
  // Only ever shown to the signed-in person themselves.
  store.myEmail = function () { return (auth.currentUser && auth.currentUser.email) || ''; };
  store.usernameOwner = async function (name) { var d = await db.collection('usernames').doc(name).get(); return d.exists ? (d.data() || {}).uid : null; };
  // The contact form. Only admins can read messages.
  store.sendMessage = async function (m) { await db.collection('messages').doc(uid() + uid()).set(m); };
  store.markMessage = async function (id, read) { await db.collection('messages').doc(id).update({ read: read }); };
  store.deleteMessage = async function (id) { await db.collection('messages').doc(id).delete(); };
  // The drawing library. Items are kept in S.items by the listener below.
  store.createItem = async function (data) { var id = uid() + uid(); await home().collection('items').doc(id).set(data); return id; };
  // owner: whose library the item is in. Friends drawing on a shared image save into the owner's item and files.
  var itemRef = function (id, owner) { return db.collection('users').doc(owner || auth.currentUser.uid).collection('items').doc(id); };
  store.updateItem = async function (id, patch, owner) { await itemRef(id, owner).update(patch); };
  store.getItem = async function (owner, id) { var d = await itemRef(id, owner).get(); if (!d.exists) return null; var v = d.data() || {}; v.id = d.id; return v; };
  store.watchItem = function (owner, id, onItem) {
    return itemRef(id, owner).onSnapshot(function (d) { var v = d.exists ? d.data() || {} : null; if (v) v.id = d.id; onItem(v); }, function () { onItem(null); });
  };
  // Several items at once ([{ id, patch }]), e.g. making a folder and everything in it private.
  store.updateItems = async function (list) {
    for (var i = 0; i < list.length; i += 400) {
      var b = db.batch();
      list.slice(i, i + 400).forEach(function (x) { b.update(home().collection('items').doc(x.id), x.patch); });
      await b.commit();
    }
  };
  store.deleteItem = async function (id) { await home().collection('items').doc(id).delete(); };
  // owner: whose library the image is in (a friend's), or the signed-in user when left out.
  var layerRef = function (imgId, layerId, owner) {
    if (!files) throw new Error('Cloud Storage is not available');
    return files.ref('users/' + (owner || auth.currentUser.uid) + '/images/' + imgId + '/' + layerId + '.png');
  };
  // no-cache: the same file is overwritten on every save, so browsers must not reuse an old copy.
  store.uploadLayer = async function (imgId, layerId, blob, owner) { await layerRef(imgId, layerId, owner).put(blob, { contentType: 'image/png', cacheControl: 'no-cache' }); };
  store.downloadLayer = async function (imgId, layerId, owner) {
    var url;
    try { url = await layerRef(imgId, layerId, owner).getDownloadURL(); }
    catch (e) { if (e && e.code === 'storage/object-not-found') return null; throw e; }
    var r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) throw new Error('download failed ' + r.status);
    return r.blob();
  };
  store.deleteLayer = async function (imgId, layerId, owner) {
    try { await layerRef(imgId, layerId, owner).delete(); } catch (e) { if (!e || e.code !== 'storage/object-not-found') throw e; }
  };
  // Drawing together. shares/{owner}_{imageId} = { owner, image, members (up to 5 friends), name, at } lets those friends
  // open and draw on that image. shares/{sid}/ops/{opId} carries the changes live (see live.js).
  store.saveShare = async function (imageId, name, members) {
    var me = auth.currentUser.uid, ref = db.collection('shares').doc(me + '_' + imageId);
    if (members === null) await ref.delete();
    else await ref.set({ owner: me, image: imageId, members: members, name: String(name || 'Untitled').slice(0, 60), at: Date.now() });
  };
  store.liveSend = async function (sid, ops) {
    var col = db.collection('shares').doc(sid).collection('ops'), me = auth.currentUser.uid, ts = fb.firestore.FieldValue.serverTimestamp();
    // Batches stay well under Firestore's request size limit (pictures can be a few hundred KB each).
    for (var i = 0; i < ops.length;) {
      var b = db.batch(), size = 0, n = 0;
      while (i < ops.length && n < 400 && (n === 0 || size + JSON.stringify(ops[i]).length < 7000000)) {
        size += JSON.stringify(ops[i]).length; b.set(col.doc(), Object.assign({}, ops[i], { by: me, at: ts })); i++; n++;
      }
      await b.commit();
    }
  };
  // Calls onOps(ops, first) with ops newer than fromMs: first with everything already there, then with each new one.
  store.liveListen = function (sid, fromMs, onOps, onError) {
    var first = true;
    return db.collection('shares').doc(sid).collection('ops').where('at', '>=', fb.firestore.Timestamp.fromMillis(fromMs)).orderBy('at')
      .onSnapshot(function (snap) {
        var docs = first ? snap.docs : snap.docChanges().filter(function (c) { return c.type === 'added'; }).map(function (c) { return c.doc; });
        var ops = docs.map(function (d) { var v = d.data({ serverTimestamps: 'estimate' }) || {}; v.id = d.id; v.atMs = v.at && v.at.toMillis ? v.at.toMillis() : Date.now(); return v; });
        var f = first; first = false; onOps(ops, f);
      }, onError);
  };
  // The owner tidies up changes the saved copy no longer needs (older than beforeMs).
  store.liveCleanup = async function (sid, beforeMs) {
    var old = await db.collection('shares').doc(sid).collection('ops').where('at', '<', fb.firestore.Timestamp.fromMillis(beforeMs)).limit(400).get();
    if (!old.size) return;
    var b = db.batch(); old.docs.forEach(function (d) { b.delete(d.ref); }); await b.commit();
  };
  // Friends. friendRequests/{from}_{to} = { from, to, at }. Accepting writes users/{uid}/friends/{friendUid} = { since }
  // on both sides and deletes the request in one batch; the rules only allow that while the request exists.
  // Friends can read each other's library items whose private flag is false, and those images' layer files.
  store.sendFriendRequest = async function (to) {
    var me = auth.currentUser.uid;
    await db.collection('friendRequests').doc(me + '_' + to).set({ from: me, to: to, at: Date.now() });
  };
  store.dropFriendRequest = async function (r) { await db.collection('friendRequests').doc(r.from + '_' + r.to).delete(); };
  store.acceptFriendRequest = async function (from) {
    var me = auth.currentUser.uid, users = db.collection('users'), b = db.batch(), now = Date.now();
    b.set(users.doc(me).collection('friends').doc(from), { since: now });
    b.set(users.doc(from).collection('friends').doc(me), { since: now });
    b.delete(db.collection('friendRequests').doc(from + '_' + me));
    await b.commit();
  };
  // Ending a friendship also takes them out of the images you shared with them. The rules already stop their access
  // the moment the friendship ends, so this is tidying, done one share at a time after the main batch (each share check
  // makes up to 6 rule lookups, and a batch may only make 20).
  var dropFromShares = async function (other) {
    var list = Object.keys(S.myShares || {}).map(function (k) { return S.myShares[k]; })
      .filter(function (s) { return s && Array.isArray(s.members) && s.members.indexOf(other) >= 0; });
    for (var i = 0; i < list.length; i++) {
      var s = list[i], left = s.members.filter(function (m) { return m !== other; }), ref = db.collection('shares').doc(s.id);
      try { if (left.length) await ref.update({ members: left, at: Date.now() }); else await ref.delete(); } catch (e) { /* their access is gone anyway */ }
    }
  };
  store.removeFriend = async function (other) {
    var me = auth.currentUser.uid, users = db.collection('users'), b = db.batch();
    b.delete(users.doc(me).collection('friends').doc(other));
    b.delete(users.doc(other).collection('friends').doc(me));
    await b.commit();
    await dropFromShares(other);
  };
  // Blocking: users/{me}/blocked/{other} = { at }. It also ends the friendship, any requests between you, and their
  // place in your shared images. The rules then stop them sending requests or seeing your profile.
  store.blockUser = async function (other) {
    var me = auth.currentUser.uid, users = db.collection('users'), b = db.batch();
    b.set(users.doc(me).collection('blocked').doc(other), { at: Date.now() });
    b.delete(users.doc(me).collection('friends').doc(other));
    b.delete(users.doc(other).collection('friends').doc(me));
    S.friendIn.concat(S.friendOut).forEach(function (r) {
      if (r.from === other || r.to === other) b.delete(db.collection('friendRequests').doc(r.from + '_' + r.to));
    });
    await b.commit();
    await dropFromShares(other);
  };
  store.unblockUser = async function (other) { await db.collection('users').doc(auth.currentUser.uid).collection('blocked').doc(other).delete(); };
  // Admins only: take down a profile and free its username. The person picks a new username next time they come.
  store.removeProfile = async function (other, username) {
    var b = db.batch();
    b.delete(db.collection('profiles').doc(other));
    if (username) b.delete(db.collection('usernames').doc(username));
    await b.commit();
  };
  store.getProfile = async function (id) { var d = await db.collection('profiles').doc(id).get(); return d.exists ? d.data() : null; };
  // A friend's library, without their private items. Returns a function that stops listening.
  store.watchFriendItems = function (owner, onItems, onError) {
    return db.collection('users').doc(owner).collection('items').where('private', '==', false).limit(5000).onSnapshot(function (snap) {
      var items = {};
      snap.docs.forEach(function (d) { var v = d.data() || {}; v.id = d.id; items[d.id] = v; });
      onItems(items);
    }, onError);
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
        if (!snap.metadata.fromCache) fillPrivacy();
      }, function () { S.itemsReady = true; renderHome(); toast('Your library could not be loaded. Check your connection.'); }));
    }
    S.myId = user ? user.uid : null;
    S.myName = user ? (user.displayName || user.email || 'You') : '';
    S.canEdit = false; S.mine = []; S.myFonts = []; S.requests = []; S.myRequests = []; S.uploadedFonts = []; S.profile = null; S.messages = [];
    S.friends = []; S.friendIn = []; S.friendOut = []; S.blocked = []; S.people = {}; closeFriend();
    S.myShares = {}; S.sharedIn = []; watchSharedItems();
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
      S.newsSeen = null;
      mine.collection('settings').doc('news').get().then(function (d) {
        if (S.myId !== user.uid) return;
        S.newsSeen = d.exists ? String((d.data() || {}).seen || '') : ''; renderHome();
      }, function () { /* the notes wait until next time */ });
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
      unsub.push(db.collection('profiles').doc(user.uid).onSnapshot(function (snap) {
        S.profile = snap.exists ? snap.data() : null;
        // A new account picks a username first. Only when the server says there is no profile, never from an offline cache miss.
        if (!snap.exists && !snap.metadata.fromCache) needUsername();
        renderAccount(); renderProfile();
      }, function () { /* the profile is optional */ }));
      if (S.canEdit) {
        unsub.push(db.collection('messages').orderBy('at', 'desc').limit(200).onSnapshot(function (snap) {
          S.messages = snap.docs.map(function (d) { var v = d.data() || {}; v.id = d.id; return v; });
          renderAccount(); renderProfile();
        }, function () { /* the inbox is optional */ }));
      }
      unsub.push(mine.collection('friends').limit(500).onSnapshot(function (snap) {
        S.friends = snap.docs.map(function (d) { return { uid: d.id, since: (d.data() || {}).since || 0 }; });
        friendsChanged();
      }, function () { /* friends are optional */ }));
      unsub.push(mine.collection('blocked').limit(500).onSnapshot(function (snap) {
        S.blocked = snap.docs.map(function (d) { return d.id; });
        friendsChanged();
      }, function () { /* blocking is optional */ }));
      var fr = db.collection('friendRequests'), reqList = function (snap) { return snap.docs.map(function (d) { return d.data() || {}; }); };
      unsub.push(fr.where('to', '==', user.uid).limit(200).onSnapshot(function (snap) { S.friendIn = reqList(snap); friendsChanged(); }, function () { /* optional */ }));
      unsub.push(fr.where('from', '==', user.uid).limit(200).onSnapshot(function (snap) { S.friendOut = reqList(snap); friendsChanged(); }, function () { /* optional */ }));
      // Images you share (by image id) and images friends share with you.
      var shares = db.collection('shares'), shareList = function (snap) { return snap.docs.map(function (d) { var v = d.data() || {}; v.id = d.id; return v; }); };
      unsub.push(shares.where('owner', '==', user.uid).limit(500).onSnapshot(function (snap) {
        S.myShares = {}; shareList(snap).forEach(function (v) { S.myShares[v.image] = v; });
        renderHome(); liveSharesChanged();
      }, function () { /* sharing is optional */ }));
      unsub.push(shares.where('members', 'array-contains', user.uid).limit(200).onSnapshot(function (snap) {
        S.sharedIn = shareList(snap); watchSharedItems(); renderHome(); liveSharesChanged();
      }, function () { /* sharing is optional */ }));
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
// Shows the username, never the Google name, so it's the same name everyone else sees.
function renderAccount() {
  $('#accountWrap').hidden = !store.online;
  var btn = $('#accountBtn'), handle = S.profile ? '@' + S.profile.username : 'Account';
  var unread = S.canEdit ? S.messages.filter(function (m) { return !m.read; }).length : 0, asks = pendingFriendRequests().length;
  btn.textContent = S.myId ? handle + (unread || asks ? ' •' : '') : 'Sign in';
  btn.title = S.myId ? 'Signed in as ' + handle + (unread ? '. ' + unread + ' unread message' + (unread === 1 ? '' : 's') : '')
    + (asks ? '. ' + asks + ' friend request' + (asks === 1 ? '' : 's') : '') : 'Sign in with Google to save your own brushes';
  $('#myFriends').textContent = 'Friends' + (asks ? ' (' + asks + ' new)' : '');
  btn.classList.toggle('primary', !S.myId);
  $('#accountName').textContent = S.myId ? handle + (S.canEdit ? ' (owner)' : '') : '';
  if (!S.myId) $('#accountMenu').hidden = true;
}
