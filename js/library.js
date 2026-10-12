/* Sketchroom: The homepage library (projects, folders and images), Create new, rename, move, duplicate, delete,
   and the page addresses.
   Plain script. Shares globals with the other files in js/; load order is set in index.html. */
'use strict';

/* ---------- library items ----------
   users/{uid}/items/{id}: { type: 'project' | 'folder' | 'image', name, parent ('' = top level), created, updated }
   Images also have w, h, px (pixel art settings or null), layers [{ id, name, visible, opacity, blend, locked }],
   active, count and thumb (a small data URL for the card). Projects hold folders and images, folders hold images,
   and anything can sit at the top level.
   private: true hides an item from friends. Everything inside a private project or folder is private too. */
// items: a friend's library when given, otherwise your own.
function childrenOf(id, items) { var all = items || S.items; return Object.keys(all).map(function (k) { return all[k]; }).filter(function (it) { return (it.parent || '') === id; }); }
function descendants(id) { var out = []; childrenOf(id).forEach(function (c) { out.push(c); out = out.concat(descendants(c.id)); }); return out; }
function pathTo(id, items) { var all = items || S.items, out = [], it = all[id], guard = 0; while (it && guard++ < 10) { out.unshift(it); it = it.parent ? all[it.parent] : null; } return out; }
// Whether something placed in container id is private: the container or one of its parents is.
function privateAt(id) { return pathTo(id).some(function (x) { return x.private === true; }); }
var TYPE_ORDER = { project: 0, folder: 1, image: 2 };
function sortItems(list) {
  return list.sort(function (a, b) {
    if (a.type !== b.type) return TYPE_ORDER[a.type] - TYPE_ORDER[b.type];
    if (a.type === 'image') return (b.updated || 0) - (a.updated || 0);
    return String(a.name).localeCompare(String(b.name));
  });
}
function byName(a, b) { return String(a.name).localeCompare(String(b.name)); }
function clampInt(v, lo, hi) { var n = Math.round(Number(v)); return clamp(isFinite(n) ? n : lo, lo, hi); }
async function createItemHere(type, name, extra) {
  var now = Date.now();
  return store.createItem(Object.assign({ type: type, name: name, parent: S.homeAt || '', created: now, updated: now, private: privateAt(S.homeAt || '') }, extra || {}));
}
function createImageItem(name, w, h, px) {
  return createItemHere('image', name, { w: w, h: h, px: px || null, layers: [], active: '', count: 0, thumb: '' });
}

/* ---------- privacy ---------- */
// Friends only see items whose private flag is false, so items made before friends existed get the flag
// (inherited from a private project or folder). Runs after each server snapshot of the library; usually there's nothing to do.
var privacyFilling = {};
function fillPrivacy() {
  var todo = Object.keys(S.items).map(function (k) { return S.items[k]; }).filter(function (it) { return typeof it.private !== 'boolean' && !privacyFilling[it.id]; });
  if (!todo.length) return;
  todo.forEach(function (it) { privacyFilling[it.id] = true; });
  store.updateItems(todo.map(function (it) { return { id: it.id, patch: { private: privateAt(it.parent || '') } }; }))
    .catch(function () { todo.forEach(function (it) { delete privacyFilling[it.id]; }); });
}
async function setPrivate(it, on) {
  if (!on && privateAt(it.parent || '')) {
    var box = pathTo(it.parent).filter(function (x) { return x.private === true; })[0];
    toast('It is inside ' + (box ? box.name : 'a private folder') + ', which is private. Show that to friends first.'); return;
  }
  var all = [it].concat(descendants(it.id)), many = all.length > 1;
  try {
    await store.updateItems(all.map(function (x) { return { id: x.id, patch: { private: on } }; }));
    toast(on ? it.name + (many ? ' and everything in it are' : ' is') + ' now private. Only you can see ' + (many ? 'them.' : 'it.')
      : 'Your friends can now see ' + it.name + (many ? ' and everything in it.' : '.'));
  } catch (e) { toast('Could not change that. Try again.'); }
}

/* ---------- page addresses ----------
   #/          the library's top level        #/c/<id>    inside a project or folder
   #/d/<id>    an image open in the editor    #/sketch    the quick sketch (kept in this browser)
   #/profile   your profile                   #/friends   friends and friend requests
   #/u/<uid>   a friend's library (view only), with /c/<id> for inside a project or folder and /d/<id> to view an image
   #/s/<owner>/<id>   an image a friend shared with you, open in the editor to draw on together */
var routeToken = 0;
function parseRoute(h) {
  var m;
  if ((m = /^#\/d\/([A-Za-z0-9]+)$/.exec(h))) return { kind: 'image', id: m[1] };
  if ((m = /^#\/s\/([A-Za-z0-9]+)\/([A-Za-z0-9]+)$/.exec(h))) return { kind: 'shared', owner: m[1], id: m[2] };
  if (h === '#/sketch') return { kind: 'sketch' };
  if (h === '#/profile') return { kind: 'profile' };
  if (h === '#/friends') return { kind: 'friends' };
  if ((m = /^#\/u\/([A-Za-z0-9]+)(?:\/([cd])\/([A-Za-z0-9]+))?$/.exec(h))) return { kind: 'friend', uid: m[1], sub: m[2] || '', id: m[3] || '' };
  if ((m = /^#\/c\/([A-Za-z0-9]+)$/.exec(h))) return { kind: 'home', id: m[1] };
  return { kind: 'home', id: '' };
}
function showView(name) {
  var home = name === 'home';
  $('#home').hidden = !home; $('#editor').hidden = home;
  (home ? $('#homeActions') : $('#editorActions')).appendChild($('#accountWrap'));
  if (home) { closeColorPop(); $('#cardMenu').hidden = true; }
  else requestAnimationFrame(function () { if (!S.userZoomed) fit(); drawGrid(); });
}
async function waitForItems(t) {
  for (var i = 0; i < 150 && !S.itemsReady && t === routeToken; i++) await new Promise(function (r) { setTimeout(r, 100); });
}
async function route() {
  var t = ++routeToken, r = parseRoute(location.hash || '#/');
  if (r.kind === 'shared' && r.owner === S.myId) { location.replace('#/d/' + r.id); return; } // your own image
  var same = !!S.doc && ((r.kind === 'image' && S.doc.id === r.id && S.doc.owner === S.myId)
    || (r.kind === 'shared' && S.doc.id === r.id && S.doc.owner === r.owner) || (r.kind === 'sketch' && S.doc.local));
  // Leaving an image (or switching to another one): save it first.
  if (S.doc && !same) { var leaving = S.doc; await leaveDoc(); if (S.doc === leaving) S.doc = null; }
  if (t !== routeToken) return;
  if (r.kind === 'sketch') { showView('editor'); if (!S.doc) await openSketch(); return; }
  if (r.kind === 'image') {
    if (!store.online || !S.myId) { location.replace('#/'); return; }
    await waitForItems(t); if (t !== routeToken) return;
    var it = S.items[r.id];
    if (!it || it.type !== 'image') { toast('That image could not be found.'); location.replace('#/'); return; }
    showView('editor'); if (!same) await openImage(r.id, t);
    return;
  }
  if (r.kind === 'shared') {
    if (!store.online || !S.myId) { location.replace('#/'); return; }
    var shared = same ? null : await store.getItem(r.owner, r.id).catch(function () { return null; });
    if (t !== routeToken) return;
    if (!same && (!shared || shared.type !== 'image')) { toast('That image could not be opened. The owner may have stopped sharing it.'); location.replace('#/'); return; }
    showView('editor'); if (!same) await openImage(r.id, t, { owner: r.owner, item: shared });
    return;
  }
  S.homeView = r.kind === 'home' ? 'library' : r.kind;
  if (r.kind === 'home') S.lastLibrary = r.id ? '#/c/' + r.id : '#/'; // where the Back buttons on other pages return to
  if (r.kind === 'friend') S.friendAt = r; else { S.friendAt = null; closeFriend(); }
  S.homeAt = r.kind === 'home' ? r.id : ''; showView('home'); renderHome(); checkSketch();
}
// Signing in or out: an open library image can't stay open signed out.
function accountChanged() {
  if (S.doc && !S.doc.local && !S.myId) { S.doc = null; location.replace('#/'); route(); return; }
  renderHome(); if (!$('#home').hidden) checkSketch();
}

/* ---------- the background art (signed-in pages) ---------- */
// Painted only when shown and when the window size changed, since the same settings always give the same picture.
var bgPainted = '';
function showLibraryBg(on) {
  var cv = $('#libBg'), shade = $('#libShade'); cv.hidden = shade.hidden = !on;
  if (!on || typeof paintBackground !== 'function') return;
  var size = cv.clientWidth + 'x' + cv.clientHeight;
  if (size === bgPainted || !cv.clientWidth) return;
  bgPainted = size; paintBackground(cv, BG_LIBRARY); shade.style.opacity = String(BG_LIBRARY.shade / 100);
}

/* ---------- the homepage ---------- */
function renderHome() {
  if ($('#home').hidden) return;
  var online = store.online, signed = online && !!S.myId, ready = signed && S.itemsReady, view = S.homeView || 'library';
  showLibraryBg(signed);
  $('#homeSignedOut').hidden = signed; $('#homeLibrary').hidden = !ready || view !== 'library'; $('#homeLoading').hidden = !signed || ready;
  $('#homeProfile').hidden = !ready || view !== 'profile';
  $('#homeFriends').hidden = !ready || view !== 'friends';
  $('#homeFriend').hidden = !ready || view !== 'friend';
  if (ready && view === 'profile') { renderProfile(); return; }
  if (ready && view === 'friends') { renderFriends(); return; }
  if (ready && view === 'friend') { renderFriend(); return; }
  $('#homeSignIn').hidden = !online;
  $('#signedOutText').textContent = online
    ? 'Sign in with Google to keep your images, folders and projects in your account and open them on any device.'
    : 'The library needs the online version of Sketchroom. You can still make a quick sketch, saved in this browser.';
  if (!ready) return;
  if (S.homeAt && (!S.items[S.homeAt] || S.items[S.homeAt].type === 'image')) S.homeAt = '';
  renderCrumbs();
  // Images friends shared with you, at the top level.
  var shared = S.homeAt ? [] : (S.sharedIn || []).filter(function (s) { return S.sharedItems[s.id]; }), sg = $('#sharedGrid');
  $('#sharedSection').hidden = !shared.length; sg.innerHTML = '';
  shared.forEach(function (s) {
    sg.appendChild(makeHomeCard(S.sharedItems[s.id], null, { href: '#/s/' + s.owner + '/' + s.image, sub: 'Shared by ' + personName(s.owner) }));
  });
  var kids = sortItems(childrenOf(S.homeAt)), grid = $('#homeGrid'), at = S.items[S.homeAt];
  grid.innerHTML = ''; kids.forEach(function (it) { grid.appendChild(makeHomeCard(it)); });
  $('#homeEmpty').hidden = kids.length > 0;
  $('#homeEmpty').textContent = at ? 'Nothing in here yet. Press Create new, or use Move to… on another card.' : 'Your library is empty. Press Create new to make your first image.';
  // Folders hold images only, and projects sit at the top level.
  $('#newFolder').disabled = !!at && at.type === 'folder';
  $('#newProject').disabled = !!at;
  var asks = pendingFriendRequests().length, fb = $('#friendsCount');
  fb.textContent = asks; fb.hidden = !asks;
  maybeShowNews();
}
// list: [{ label, hash }], the last one being the current page.
function fillCrumbs(nav, list) {
  nav.innerHTML = '';
  list.forEach(function (c, i) {
    if (i) { var s = document.createElement('span'); s.className = 'crumbsep'; s.textContent = '›'; nav.appendChild(s); }
    var current = i === list.length - 1, a = document.createElement(current ? 'span' : 'a'); a.textContent = c.label;
    if (current) a.setAttribute('aria-current', 'page'); else a.href = c.hash;
    nav.appendChild(a);
  });
}
function renderCrumbs() {
  fillCrumbs($('#crumbs'), [{ label: 'Library', hash: '#/' }].concat(pathTo(S.homeAt).map(function (it) { return { label: it.name, hash: '#/c/' + it.id }; })));
}
function cardSub(it, items) {
  if (it.type === 'image') return it.px ? 'Pixel art, ' + it.px.cols + ' × ' + it.px.rows + ' tiles of ' + it.px.tile + ' px' : (it.w || '?') + ' × ' + (it.h || '?');
  var n = childrenOf(it.id, items).length;
  return (it.type === 'project' ? 'Project, ' : 'Folder, ') + n + (n === 1 ? ' item' : ' items');
}
function openItem(it) { location.hash = it.type === 'image' ? '#/d/' + it.id : '#/c/' + it.id; }
// friend: { uid, items } for a card in a friend's library. other: { href, sub } for an image shared with you.
// Those two only open (no options menu).
function makeHomeCard(it, friend, other) {
  var d = document.createElement('div'); d.className = 'hcard ' + it.type; d.setAttribute('role', 'button'); d.tabIndex = 0;
  var open = other ? function () { location.hash = other.href; }
    : friend ? function () { location.hash = '#/u/' + friend.uid + (it.type === 'image' ? '/d/' : '/c/') + it.id; } : function () { openItem(it); };
  var th = document.createElement('div'); th.className = 'hthumb';
  if (it.type === 'image') {
    if (it.px) th.classList.add('checker');
    if (typeof it.thumb === 'string' && it.thumb.indexOf('data:image/') === 0) {
      var img = document.createElement('img'); img.src = it.thumb; img.alt = ''; if (it.px) img.className = 'pixelated'; th.appendChild(img);
    }
  } else th.innerHTML = icon(it.type, 44);
  var meta = document.createElement('div'); meta.className = 'hmeta';
  var nm = document.createElement('span'); nm.className = 'hname'; nm.textContent = it.name;
  var sub = document.createElement('span'); sub.className = 'hsub'; sub.textContent = cardSub(it, friend && friend.items);
  meta.append(nm, sub); d.append(th, meta);
  if (other) sub.textContent = other.sub;
  if (!friend && !other) {
    if (it.private === true) {
      var lock = document.createElement('span'); lock.className = 'hlock'; lock.innerHTML = icon('lock', 14); lock.title = 'Private: only you can see this';
      d.appendChild(lock); sub.textContent += ' · Private';
    }
    var sh = S.myShares[it.id];
    if (sh && (sh.members || []).length) sub.textContent += ' · Drawing together';
    var more = document.createElement('button'); more.className = 'ibtn sm hmore'; more.innerHTML = icon('more', 18);
    more.setAttribute('aria-label', 'Options for ' + it.name); more.title = 'Options';
    more.addEventListener('click', function (e) { e.stopPropagation(); openCardMenu(it, more); });
    d.appendChild(more);
  }
  d.addEventListener('click', open);
  d.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
  return d;
}

/* ---------- card menu ---------- */
var menuItem = null, delTimer = 0;
function resetDelete() { clearTimeout(delTimer); var b = $('#cmDelete'); b.classList.remove('armed'); b.textContent = 'Delete'; }
function openCardMenu(it, btn) {
  menuItem = it; resetDelete();
  var m = $('#cardMenu'); $('#cmMove').hidden = it.type === 'project'; $('#cmDuplicate').hidden = $('#cmShare').hidden = it.type !== 'image';
  $('#cmPrivate').textContent = it.private === true ? 'Show to friends' : 'Make private';
  m.hidden = false;
  var r = btn.getBoundingClientRect(), w = m.offsetWidth, h = m.offsetHeight;
  m.style.left = clamp(r.right - w, 8, window.innerWidth - w - 8) + 'px';
  m.style.top = (r.bottom + 4 + h > window.innerHeight - 8 ? Math.max(8, r.top - h - 4) : r.bottom + 4) + 'px';
}
async function deleteDeep(it) {
  var all = [it].concat(descendants(it.id));
  try {
    for (var i = 0; i < all.length; i++) {
      var x = all[i]; if (x.type !== 'image') continue;
      var ls = x.layers || [];
      for (var j = 0; j < ls.length; j++) await store.deleteLayer(x.id, ls[j].id);
      await idbDel('img:' + x.id);
    }
    for (var k = all.length - 1; k >= 0; k--) await store.deleteItem(all[k].id);
    toast(it.name + (all.length > 1 ? ' and everything in it' : '') + ' deleted.');
  } catch (e) { toast('Could not delete everything. Try again.'); }
}
async function duplicateImage(it) {
  toast('Making a copy…');
  try {
    var now = Date.now(), src = it.layers || [], layers = src.map(function (m) { return Object.assign({}, m, { id: uid() + uid() }); });
    var id = await store.createItem({ type: 'image', name: (it.name + ' copy').slice(0, 60), parent: it.parent || '', created: now, updated: now,
      private: it.private === true || privateAt(it.parent || ''),
      w: it.w, h: it.h, px: it.px || null, layers: [], active: '', count: it.count || layers.length, thumb: it.thumb || '' });
    for (var i = 0; i < src.length; i++) {
      var blob = await store.downloadLayer(it.id, src[i].id);
      if (blob) await store.uploadLayer(id, layers[i].id, blob);
    }
    await store.updateItem(id, { layers: layers, active: layers.length ? layers[layers.length - 1].id : '', updated: Date.now() });
    toast('Copied ' + it.name + '.');
  } catch (e) { toast('Could not copy that image.'); }
}

/* ---------- dialogs ---------- */
function runDialog(d, onOk) {
  d.returnValue = '';
  var done = function () { d.removeEventListener('close', done); if (d.returnValue === 'ok') onOk(); };
  d.addEventListener('close', done); d.showModal();
}
function askName(title, value, okLabel, onOk) {
  $('#dlgNameTitle').textContent = title; $('#nameOk').textContent = okLabel;
  var inp = $('#nameInput'); inp.value = value;
  runDialog($('#dlgName'), function () { var v = inp.value.trim().slice(0, 60); if (v) onOk(v); });
  inp.select();
}
function imgSpec() {
  if ($('#imgPixel').checked) {
    var tile = clampInt($('#imgTile').value, 8, 64), most = Math.floor(MAX_PIXEL_SIDE / tile);
    var cols = clampInt($('#imgCols').value, 1, Math.min(64, most)), rows = clampInt($('#imgRows').value, 1, Math.min(64, most));
    return { w: tile * cols, h: tile * rows, px: { tile: tile, cols: cols, rows: rows } };
  }
  var v = $('#imgPreset').value, w, h;
  if (v === 'custom') { w = clampInt($('#imgW').value, 16, MAX_SIDE); h = clampInt($('#imgH').value, 16, MAX_SIDE); }
  else { var p = v.split('x'); w = Number(p[0]); h = Number(p[1]); }
  return { w: w, h: h, px: null };
}
function updateImgDialog() {
  var pixel = $('#imgPixel').checked, sp = imgSpec();
  $('#imgSizeBox').hidden = pixel; $('#imgPixelBox').hidden = !pixel; $('#imgCustom').hidden = pixel || $('#imgPreset').value !== 'custom';
  $('#imgSummary').textContent = 'Canvas: ' + sp.w + ' × ' + sp.h + ' pixels' + (sp.px ? ', ' + sp.px.cols + ' × ' + sp.px.rows + ' tiles of ' + sp.px.tile + ' px.' : '.')
    + (sp.w * sp.h > 9e6 ? ' Big canvases use a lot of memory, so keep the number of layers low on an iPad.' : '');
}
function openImageDialog() {
  $('#imgName').value = 'Untitled'; $('#imgPixel').checked = false; $('#imgPreset').value = '1600x1200';
  updateImgDialog();
  runDialog($('#dlgImage'), async function () {
    var sp = imgSpec(), name = $('#imgName').value.trim().slice(0, 60) || 'Untitled';
    try { var id = await createImageItem(name, sp.w, sp.h, sp.px); location.hash = '#/d/' + id; }
    catch (e) { toast('Could not create the image. Try again.'); }
  });
  $('#imgName').select();
}
function openMoveDialog(it) {
  var list = [{ id: '', label: 'Library (top level)' }], all = Object.keys(S.items).map(function (k) { return S.items[k]; });
  all.filter(function (x) { return x.type === 'project'; }).sort(byName).forEach(function (p) { list.push({ id: p.id, label: p.name + ' (project)' }); });
  if (it.type === 'image') {
    all.filter(function (x) { return x.type === 'folder'; }).sort(byName).forEach(function (f) {
      var p = f.parent && S.items[f.parent]; list.push({ id: f.id, label: (p ? p.name + ' › ' : '') + f.name + ' (folder)' });
    });
  }
  var host = $('#moveList'); host.innerHTML = '';
  list.forEach(function (o) {
    var lab = document.createElement('label'), r = document.createElement('input'), t = document.createElement('span');
    r.type = 'radio'; r.name = 'moveTo'; r.value = o.id; r.checked = (it.parent || '') === o.id; t.textContent = o.label;
    lab.append(r, t); host.appendChild(lab);
  });
  $('#dlgMoveTitle').textContent = 'Move ' + it.name + ' to';
  runDialog($('#dlgMove'), function () {
    var sel = $('#moveList input:checked'); if (!sel || sel.value === (it.parent || '')) return;
    var list = [{ id: it.id, patch: { parent: sel.value, updated: Date.now() } }];
    // Moving into a private project or folder makes it (and anything in it) private too.
    if (privateAt(sel.value)) {
      list[0].patch.private = true;
      descendants(it.id).forEach(function (x) { list.push({ id: x.id, patch: { private: true } }); });
    }
    store.updateItems(list).catch(function () { toast('Could not move it. Try again.'); });
  });
}

/* ---------- drawing together ---------- */
// Pick up to 5 friends who can open this image and draw on it with you (shares/{you}_{imageId}). No one picked stops sharing.
var SHARE_MAX = 5;
function openShareDialog(imageId, name) {
  var current = (S.myShares[imageId] || {}).members || [], host = $('#shareList'), ids = S.friends.map(function (f) { return f.uid; }).sort(byPersonName);
  host.innerHTML = ''; $('#shareEmpty').hidden = ids.length > 0; $('#shareOk').disabled = !ids.length && !current.length;
  ids.forEach(function (id) {
    var lab = document.createElement('label'), c = document.createElement('input'), t = document.createElement('span');
    c.type = 'checkbox'; c.value = id; c.checked = current.indexOf(id) >= 0; t.textContent = personName(id);
    c.addEventListener('change', function () {
      if (c.checked && $$('#shareList input:checked').length > SHARE_MAX) { c.checked = false; toast('Up to ' + SHARE_MAX + ' friends can draw on one image.'); }
    });
    lab.append(c, t); host.appendChild(lab);
  });
  $('#dlgShareTitle').textContent = 'Draw together on ' + name;
  runDialog($('#dlgShare'), async function () {
    var picked = $$('#shareList input:checked').map(function (c) { return c.value; }).slice(0, SHARE_MAX);
    if (!picked.length && !current.length) return;
    try {
      await store.saveShare(imageId, name, picked.length ? picked : null);
      toast(picked.length ? 'Shared. They can open it from their library and draw with you.' : 'This image is no longer shared.');
    } catch (e) { toast('Could not save that. Try again.'); }
  });
}
// Keeps each image shared with you up to date for its card (name and thumbnail live in the owner's item).
var sharedWatch = {};
function watchSharedItems() {
  var want = {}; (S.sharedIn || []).forEach(function (s) { want[s.id] = s; });
  Object.keys(sharedWatch).forEach(function (sid) { if (!want[sid]) { sharedWatch[sid](); delete sharedWatch[sid]; delete S.sharedItems[sid]; } });
  if (!store.watchItem) return;
  Object.keys(want).forEach(function (sid) {
    if (sharedWatch[sid]) return;
    var s = want[sid];
    sharedWatch[sid] = store.watchItem(s.owner, s.image, function (it) { if (it) S.sharedItems[sid] = it; else delete S.sharedItems[sid]; renderHome(); });
  });
  loadPeople(Object.keys(want).map(function (sid) { return want[sid].owner; }));
}

/* ---------- importing and the quick sketch ---------- */
async function importAsNewImage(file) {
  if (!file) return;
  var name = (file.name.replace(/(\.sketchroom)?\.[^.]+$/i, '').trim() || 'Imported').slice(0, 60), id;
  try {
    if (/\.json$/i.test(file.name) || file.type === 'application/json') {
      var data = await parseDrawingFile(file); if (!data) return;
      id = await createImageItem(name, data.width, data.height, data.px);
      S.pendingImport = { id: id, data: data };
    } else if (/^image\//.test(file.type)) {
      var url = URL.createObjectURL(file), img;
      try { img = await loadImage(url); } catch (e) { toast('That picture could not be opened.'); return; } finally { URL.revokeObjectURL(url); }
      var k = Math.min(1, MAX_SIDE / img.naturalWidth, MAX_SIDE / img.naturalHeight);
      id = await createImageItem(name, Math.max(16, Math.round(img.naturalWidth * k)), Math.max(16, Math.round(img.naturalHeight * k)), null);
      S.pendingImport = { id: id, img: img };
    } else { toast('Choose a Sketchroom drawing file or a picture.'); return; }
  } catch (e) { toast('Could not import that file. Try again.'); return; }
  location.hash = '#/d/' + id;
}
async function checkSketch() {
  var rec = store.online && S.myId ? await idbGet('current') : null;
  $('#sketchBanner').hidden = !(rec && rec.layers && rec.layers.length) || !!S.homeAt;
}
async function sketchToLibrary() {
  var rec = await idbGet('current'); if (!rec || !rec.layers || !rec.layers.length) return;
  try {
    var id = await createImageItem('Quick sketch', rec.w || 1600, rec.h || 1200, cleanPx(rec.px));
    S.pendingImport = { id: id, record: rec }; location.hash = '#/d/' + id;
  } catch (e) { toast('Could not add the sketch. Try again.'); }
}

function initLibrary() {
  $('#homeSignIn').addEventListener('click', function () { store.signIn(); });
  $('#homeSketch').addEventListener('click', function () { location.hash = '#/sketch'; });
  $('#sketchOpen').addEventListener('click', function () { location.hash = '#/sketch'; });
  $('#sketchToLibrary').addEventListener('click', sketchToLibrary);
  $('#createBtn').addEventListener('click', function (e) {
    e.stopPropagation(); var m = $('#createMenu'); m.hidden = !m.hidden; $('#createBtn').setAttribute('aria-expanded', String(!m.hidden));
  });
  $('#newImage').addEventListener('click', openImageDialog);
  $('#newFolder').addEventListener('click', function () {
    askName('New folder', 'New folder', 'Create', function (name) { createItemHere('folder', name).catch(function () { toast('Could not create the folder.'); }); });
  });
  $('#newProject').addEventListener('click', function () {
    askName('New project', 'New project', 'Create', function (name) { createItemHere('project', name).catch(function () { toast('Could not create the project.'); }); });
  });
  $('#newImport').addEventListener('click', function () { $('#importInput').click(); });
  $('#importInput').addEventListener('change', function (e) { importAsNewImage(e.target.files[0]); e.target.value = ''; });
  ['#imgPixel', '#imgPreset', '#imgW', '#imgH', '#imgTile', '#imgCols', '#imgRows'].forEach(function (s) {
    $(s).addEventListener('input', updateImgDialog); $(s).addEventListener('change', updateImgDialog);
  });
  $$('.dlg [data-close]').forEach(function (b) { b.addEventListener('click', function () { b.closest('dialog').close('cancel'); }); });

  $('#cmOpen').addEventListener('click', function () { if (menuItem) openItem(menuItem); });
  $('#cmRename').addEventListener('click', function () {
    var it = menuItem; if (!it) return;
    askName('Rename', it.name, 'Save', function (name) { store.updateItem(it.id, { name: name, updated: Date.now() }).catch(function () { toast('Could not rename it.'); }); });
  });
  $('#cmMove').addEventListener('click', function () { if (menuItem) openMoveDialog(menuItem); });
  $('#cmDuplicate').addEventListener('click', function () { if (menuItem) duplicateImage(menuItem); });
  $('#cmPrivate').addEventListener('click', function () { if (menuItem) setPrivate(menuItem, menuItem.private !== true); });
  $('#cmShare').addEventListener('click', function () { if (menuItem) openShareDialog(menuItem.id, menuItem.name); });
  $('#shareBtn').addEventListener('click', function () { if (S.doc && !S.doc.local) openShareDialog(S.doc.id, S.doc.name); });
  $('#friendsBtn').addEventListener('click', function () { location.hash = '#/friends'; });
  $('#cmDelete').addEventListener('click', function (e) {
    var b = $('#cmDelete'), it = menuItem; if (!it) return;
    if (!b.classList.contains('armed')) {
      e.stopPropagation(); b.classList.add('armed');
      b.textContent = it.type === 'image' ? 'Tap again to delete' : 'Tap again to delete it and everything in it';
      delTimer = setTimeout(resetDelete, 3000); return;
    }
    resetDelete(); deleteDeep(it);
  });
  document.addEventListener('click', function () {
    $('#cardMenu').hidden = true; $('#createMenu').hidden = true; $('#createBtn').setAttribute('aria-expanded', 'false');
  });
  window.addEventListener('hashchange', route);
  var bgTimer = 0;
  window.addEventListener('resize', function () {
    clearTimeout(bgTimer);
    bgTimer = setTimeout(function () { if (!$('#home').hidden && !$('#libBg').hidden) showLibraryBg(true); }, 200);
  });
}
