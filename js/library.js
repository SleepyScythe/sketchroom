/* Sketchroom: The homepage library (projects, folders and images), Create new, rename, move, duplicate, delete,
   and the page addresses.
   Plain script. Shares globals with the other files in js/; load order is set in index.html. */
'use strict';

/* ---------- library items ----------
   users/{uid}/items/{id}: { type: 'project' | 'folder' | 'image', name, parent ('' = top level), created, updated }
   Images also have w, h, px (pixel art settings or null), layers [{ id, name, visible, opacity, blend, locked }],
   active, count and thumb (a small data URL for the card). Projects hold folders and images, folders hold images,
   and anything can sit at the top level. */
function childrenOf(id) { return Object.keys(S.items).map(function (k) { return S.items[k]; }).filter(function (it) { return (it.parent || '') === id; }); }
function descendants(id) { var out = []; childrenOf(id).forEach(function (c) { out.push(c); out = out.concat(descendants(c.id)); }); return out; }
function pathTo(id) { var out = [], it = S.items[id], guard = 0; while (it && guard++ < 10) { out.unshift(it); it = it.parent ? S.items[it.parent] : null; } return out; }
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
  return store.createItem(Object.assign({ type: type, name: name, parent: S.homeAt || '', created: now, updated: now }, extra || {}));
}
function createImageItem(name, w, h, px) {
  return createItemHere('image', name, { w: w, h: h, px: px || null, layers: [], active: '', count: 0, thumb: '' });
}

/* ---------- page addresses ----------
   #/          the library's top level        #/c/<id>    inside a project or folder
   #/d/<id>    an image open in the editor    #/sketch    the quick sketch (kept in this browser) */
var routeToken = 0;
function parseRoute(h) {
  var m;
  if ((m = /^#\/d\/([A-Za-z0-9]+)$/.exec(h))) return { kind: 'image', id: m[1] };
  if (h === '#/sketch') return { kind: 'sketch' };
  if (h === '#/profile') return { kind: 'profile' };
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
  var same = !!S.doc && ((r.kind === 'image' && S.doc.id === r.id) || (r.kind === 'sketch' && S.doc.local));
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
  S.homeView = r.kind === 'profile' ? 'profile' : 'library';
  S.homeAt = r.kind === 'profile' ? '' : r.id; showView('home'); renderHome(); checkSketch();
}
// Signing in or out: an open library image can't stay open signed out.
function accountChanged() {
  if (S.doc && !S.doc.local && !S.myId) { S.doc = null; location.replace('#/'); route(); return; }
  renderHome(); if (!$('#home').hidden) checkSketch();
}

/* ---------- the homepage ---------- */
function renderHome() {
  if ($('#home').hidden) return;
  var online = store.online, signed = online && !!S.myId, ready = signed && S.itemsReady, prof = S.homeView === 'profile';
  $('#homeSignedOut').hidden = signed; $('#homeLibrary').hidden = !ready || prof; $('#homeLoading').hidden = !signed || ready;
  $('#homeProfile').hidden = !ready || !prof;
  if (ready && prof) { renderProfile(); return; }
  $('#homeSignIn').hidden = !online;
  $('#signedOutText').textContent = online
    ? 'Sign in with Google to keep your images, folders and projects in your account and open them on any device.'
    : 'The library needs the online version of Sketchroom. You can still make a quick sketch, saved in this browser.';
  if (!ready) return;
  if (S.homeAt && (!S.items[S.homeAt] || S.items[S.homeAt].type === 'image')) S.homeAt = '';
  renderCrumbs();
  var kids = sortItems(childrenOf(S.homeAt)), grid = $('#homeGrid'), at = S.items[S.homeAt];
  grid.innerHTML = ''; kids.forEach(function (it) { grid.appendChild(makeHomeCard(it)); });
  $('#homeEmpty').hidden = kids.length > 0;
  $('#homeEmpty').textContent = at ? 'Nothing in here yet. Press Create new, or use Move to… on another card.' : 'Your library is empty. Press Create new to make your first image.';
  // Folders hold images only, and projects sit at the top level.
  $('#newFolder').disabled = !!at && at.type === 'folder';
  $('#newProject').disabled = !!at;
}
function renderCrumbs() {
  var nav = $('#crumbs'), path = pathTo(S.homeAt); nav.innerHTML = '';
  var add = function (label, hash, current) {
    if (nav.childNodes.length) { var s = document.createElement('span'); s.className = 'crumbsep'; s.textContent = '›'; nav.appendChild(s); }
    var a = document.createElement(current ? 'span' : 'a'); a.textContent = label;
    if (current) a.setAttribute('aria-current', 'page'); else a.href = hash;
    nav.appendChild(a);
  };
  add('Library', '#/', !path.length);
  path.forEach(function (it, i) { add(it.name, '#/c/' + it.id, i === path.length - 1); });
}
function cardSub(it) {
  if (it.type === 'image') return it.px ? 'Pixel art, ' + it.px.cols + ' × ' + it.px.rows + ' tiles of ' + it.px.tile + ' px' : (it.w || '?') + ' × ' + (it.h || '?');
  var n = childrenOf(it.id).length;
  return (it.type === 'project' ? 'Project, ' : 'Folder, ') + n + (n === 1 ? ' item' : ' items');
}
function openItem(it) { location.hash = it.type === 'image' ? '#/d/' + it.id : '#/c/' + it.id; }
function makeHomeCard(it) {
  var d = document.createElement('div'); d.className = 'hcard ' + it.type; d.setAttribute('role', 'button'); d.tabIndex = 0;
  var th = document.createElement('div'); th.className = 'hthumb';
  if (it.type === 'image') {
    if (it.px) th.classList.add('checker');
    if (typeof it.thumb === 'string' && it.thumb.indexOf('data:image/') === 0) {
      var img = document.createElement('img'); img.src = it.thumb; img.alt = ''; if (it.px) img.className = 'pixelated'; th.appendChild(img);
    }
  } else th.innerHTML = icon(it.type, 44);
  var meta = document.createElement('div'); meta.className = 'hmeta';
  var nm = document.createElement('span'); nm.className = 'hname'; nm.textContent = it.name;
  var sub = document.createElement('span'); sub.className = 'hsub'; sub.textContent = cardSub(it);
  meta.append(nm, sub);
  var more = document.createElement('button'); more.className = 'ibtn sm hmore'; more.innerHTML = icon('more', 18);
  more.setAttribute('aria-label', 'Options for ' + it.name); more.title = 'Options';
  more.addEventListener('click', function (e) { e.stopPropagation(); openCardMenu(it, more); });
  d.append(th, meta, more);
  d.addEventListener('click', function () { openItem(it); });
  d.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openItem(it); } });
  return d;
}

/* ---------- card menu ---------- */
var menuItem = null, delTimer = 0;
function resetDelete() { clearTimeout(delTimer); var b = $('#cmDelete'); b.classList.remove('armed'); b.textContent = 'Delete'; }
function openCardMenu(it, btn) {
  menuItem = it; resetDelete();
  var m = $('#cardMenu'); $('#cmMove').hidden = it.type === 'project'; $('#cmDuplicate').hidden = it.type !== 'image';
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
    store.updateItem(it.id, { parent: sel.value, updated: Date.now() }).catch(function () { toast('Could not move it. Try again.'); });
  });
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
}
