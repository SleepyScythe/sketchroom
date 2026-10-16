/* Sketchroom: Friends. Friend requests, the friends page (#/friends), and a friend's library (#/u/<uid>), where their
   images can be looked at but not changed.
   Plain script. Shares globals with the other files in js/; load order is set in index.html. */
'use strict';

/* ---------- friends ----------
   friendRequests/{from}_{to}: { from, to, at }. users/{uid}/friends/{friendUid}: { since }, written on both sides when a
   request is accepted (store.acceptFriendRequest). Friends see each other's profile and every library item whose
   private flag is false, including those images' layer files. The Firestore and Storage rules check all of this. */
function isFriend(id) { return S.friends.some(function (f) { return f.uid === id; }); }
function isBlocked(id) { return (S.blocked || []).indexOf(id) >= 0; }
// Incoming requests still waiting for an answer.
function pendingFriendRequests() { return S.friendIn.filter(function (r) { return !isFriend(r.from) && !isBlocked(r.from); }); }
// Profiles of friends and of people in requests. S.people[uid] is the profile, or null when the account has none.
var peopleLoading = {};
function loadPeople(ids) {
  ids.forEach(function (id) {
    if (!id || id in S.people || peopleLoading[id] || !store.getProfile) return;
    peopleLoading[id] = true;
    store.getProfile(id).then(function (p) { S.people[id] = p; }, function () { /* tried again on the next change */ })
      .then(function () { delete peopleLoading[id]; renderHome(); });
  });
}
function personName(id) { var p = S.people[id]; return p ? '@' + p.username : id in S.people ? 'A deleted account' : 'Someone'; }
function byPersonName(a, b) { return personName(a).localeCompare(personName(b)); }
var droppingRequests = {};
function friendsChanged() {
  // Two people who sent each other a request at the same time: once they are friends, the leftover request goes.
  S.friendIn.concat(S.friendOut).forEach(function (r) {
    var key = r.from + '_' + r.to;
    if (droppingRequests[key] || !isFriend(r.from === S.myId ? r.to : r.from)) return;
    droppingRequests[key] = true;
    store.dropFriendRequest(r).catch(function () { delete droppingRequests[key]; });
  });
  loadPeople(S.friends.map(function (f) { return f.uid; }).concat(S.friendIn.map(function (r) { return r.from; }), S.friendOut.map(function (r) { return r.to; }), S.blocked || []));
  renderAccount(); renderHome();
}

/* ---------- the friends page (#/friends) ---------- */
function smallBtn(label, primary, onClick) {
  var b = document.createElement('button'); b.type = 'button'; b.className = 'btn sm' + (primary ? ' primary' : ''); b.textContent = label;
  b.addEventListener('click', function () { onClick(b); }); return b;
}
// A button that needs a second tap within 3 seconds, for things that are hard to undo.
function confirmBtn(label, confirmLabel, onConfirm) {
  var timer = 0;
  return smallBtn(label, false, function (b) {
    if (!b.classList.contains('armed')) {
      b.classList.add('armed', 'warn'); b.textContent = confirmLabel;
      timer = setTimeout(function () { b.classList.remove('armed', 'warn'); b.textContent = label; }, 3000); return;
    }
    clearTimeout(timer); b.classList.remove('armed', 'warn'); b.textContent = label; onConfirm(b);
  });
}
/* ---------- blocking and reporting ----------
   Blocking (store.blockUser) ends the friendship, drops requests between you and their place in your shared images. The
   rules then stop them sending requests or seeing your profile. Reports go to the owner's inbox with the person's uid. */
function blockBtn(id, after) {
  return confirmBtn('Block', 'Tap again to block', function (b) {
    b.disabled = true;
    store.blockUser(id).then(function () {
      toast(personName(id) + ' is blocked. They can’t send you requests or see your profile.'); if (after) after();
    }, function () { b.disabled = false; toast('Could not block. Try again.'); });
  });
}
function unblockBtn(id) {
  return smallBtn('Unblock', false, function (b) {
    b.disabled = true;
    store.unblockUser(id).then(function () { toast(personName(id) + ' is unblocked.'); }, function () { b.disabled = false; toast('Could not unblock. Try again.'); });
  });
}
function reportBtn(id) { return smallBtn('Report', false, function () { openReport(id); }); }
// The owner can take down a profile that breaks the terms. The person keeps their library and picks a new username.
function removeProfileBtn(id, after) {
  return confirmBtn('Remove profile', 'Tap again to remove their profile', function (b) {
    var p = S.people[id]; b.disabled = true;
    store.removeProfile(id, p && p.username).then(function () {
      S.people[id] = null; toast('Profile removed. They’ll be asked for a new username.'); if (after) after(); renderHome();
    }, function () { b.disabled = false; toast('Could not remove the profile.'); });
  });
}
// link: the name opens that person's library.
function fillPeople(host, ids, actionsFor, link) {
  host.innerHTML = '';
  ids.forEach(function (id) {
    var p = S.people[id], row = document.createElement('div'); row.className = 'person';
    var who = document.createElement(link ? 'a' : 'div'); who.className = 'who'; if (link) who.href = '#/u/' + id;
    var main = document.createElement('strong'), sub = document.createElement('span');
    main.textContent = p ? p.displayName || '@' + p.username : id in S.people ? 'A deleted account' : 'Loading…';
    sub.textContent = p && p.displayName ? '@' + p.username : '';
    who.append(main, sub);
    var acts = document.createElement('div'); acts.className = 'tools-row';
    actionsFor(id).forEach(function (b) { acts.appendChild(b); });
    row.append(avatarEl(p, ''), who, acts); host.appendChild(row);
  });
}
function renderFriends() {
  if ($('#homeFriends').hidden) return;
  var ins = pendingFriendRequests().map(function (r) { return r.from; });
  var outs = S.friendOut.filter(function (r) { return !isFriend(r.to); }).map(function (r) { return r.to; });
  var ids = S.friends.map(function (f) { return f.uid; }).sort(byPersonName);
  $('#fInBox').hidden = !ins.length; $('#fOutBox').hidden = !outs.length;
  $('#fInTitle').textContent = 'Friend requests (' + ins.length + ')';
  fillPeople($('#fIn'), ins, function (id) {
    return [
      smallBtn('Accept', true, function (b) {
        b.disabled = true;
        store.acceptFriendRequest(id).then(function () { toast('You and ' + personName(id) + ' are now friends.'); }, function () { b.disabled = false; toast('Could not accept. Try again.'); });
      }),
      smallBtn('Decline', false, function (b) {
        b.disabled = true;
        store.dropFriendRequest({ from: id, to: S.myId }).catch(function () { b.disabled = false; toast('Could not decline. Try again.'); });
      }),
      blockBtn(id)
    ];
  });
  fillPeople($('#fOut'), outs, function (id) {
    return [smallBtn('Cancel request', false, function (b) {
      b.disabled = true;
      store.dropFriendRequest({ from: S.myId, to: id }).catch(function () { b.disabled = false; toast('Could not cancel. Try again.'); });
    })];
  });
  $('#fListTitle').textContent = 'Your friends' + (ids.length ? ' (' + ids.length + ')' : '');
  $('#fEmpty').hidden = ids.length > 0;
  fillPeople($('#fList'), ids, function (id) {
    return [
      smallBtn('Open library', true, function () { location.hash = '#/u/' + id; }),
      confirmBtn('Remove', 'Tap again to remove', function (b) {
        b.disabled = true;
        store.removeFriend(id).then(function () { toast(personName(id) + ' is no longer your friend.'); }, function () { b.disabled = false; toast('Could not remove. Try again.'); });
      })
    ];
  }, true);
  var blocked = (S.blocked || []).slice().sort(byPersonName);
  $('#fBlockedBox').hidden = !blocked.length;
  fillPeople($('#fBlocked'), blocked, function (id) { return [unblockBtn(id)]; });
}
async function addFriend(e) {
  e.preventDefault();
  var name = cleanUsername($('#addFriendInput').value), msg = $('#addFriendMsg'); msg.textContent = '';
  if (!USERNAME_RE.test(name)) { msg.textContent = 'Type their username: 3 to 20 lowercase letters, numbers, dots or underscores.'; return; }
  var btn = $('#addFriendBtn'); btn.disabled = true;
  try {
    var id = await store.usernameOwner(name);
    if (!id) msg.textContent = 'Nobody is called @' + name + '. Check the spelling.';
    else if (id === S.myId) msg.textContent = 'That is your own username.';
    else if (isFriend(id)) msg.textContent = 'You are already friends with @' + name + '.';
    else if (isBlocked(id)) msg.textContent = 'You blocked @' + name + '. Unblock them below first.';
    else if (S.friendOut.some(function (r) { return r.to === id; })) msg.textContent = 'You already sent @' + name + ' a request.';
    else if (S.friendIn.some(function (r) { return r.from === id; })) {
      // They already asked you, so this accepts their request.
      await store.acceptFriendRequest(id); $('#addFriendInput').value = ''; toast('You and @' + name + ' are now friends.');
    } else { await store.sendFriendRequest(id); $('#addFriendInput').value = ''; toast('Friend request sent to @' + name + '.'); }
  } catch (err) { msg.textContent = 'Could not send the request. Check your connection and try again.'; }
  btn.disabled = false;
}

/* ---------- a friend's library (#/u/<uid>) ---------- */
// The friend being looked at: their non-private items, kept up to date while their pages are open.
var fv = { uid: null, items: {}, ready: false, error: '', stop: null };
function closeFriend() {
  if (fv.stop) fv.stop();
  fv = { uid: null, items: {}, ready: false, error: '', stop: null };
  viewKey = ''; viewToken++;
}
function watchFriend() {
  var r = S.friendAt; if (!r || !store.online || !S.myId || !store.watchFriendItems) return;
  // Start again after an error once they are friends (the request was accepted while this page was open).
  if (fv.uid === r.uid && !(fv.error && isFriend(r.uid))) return;
  closeFriend(); fv.uid = r.uid; loadPeople([r.uid]);
  var me = fv;
  me.stop = store.watchFriendItems(r.uid, function (items) {
    if (fv !== me) return; me.items = items; me.ready = true; me.error = ''; renderFriend();
  }, function () {
    if (fv !== me) return; me.items = {}; me.ready = true; me.error = 'Only friends can see this library.'; renderFriend();
  });
}
function profileCard(p) {
  var card = document.createElement('div'); card.className = 'pcard';
  var banner = document.createElement('div'); banner.className = 'pbanner'; banner.style.background = safeColor(p && p.color);
  var head = document.createElement('div'); head.className = 'phead';
  var names = document.createElement('div'); names.className = 'pnames';
  var h = document.createElement('h1'); h.textContent = p ? p.displayName || '@' + p.username : 'Loading…';
  var u = document.createElement('span'); u.textContent = p && p.displayName ? '@' + p.username : '';
  names.append(h, u); head.append(avatarEl(p, 'big'), names); card.append(banner, head);
  if (!p) return card;
  var joined = p.joined ? 'Joined ' + new Date(p.joined).toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) : '';
  var meta = [p.pronouns, p.location, joined].filter(Boolean).join('  ·  ');
  if (meta) { var m = document.createElement('p'); m.className = 'pmeta'; m.textContent = meta; card.appendChild(m); }
  if (p.bio) { var b = document.createElement('p'); b.className = 'pbio'; b.textContent = p.bio; card.appendChild(b); }
  var links = document.createElement('div'); links.className = 'plinks';
  (Array.isArray(p.links) ? p.links : []).forEach(function (l) {
    var url = safeLink(l); if (!url) return;
    var a = document.createElement('a'); a.href = url; a.textContent = url.replace(/^https?:\/\//, '').replace(/\/$/, '');
    a.target = '_blank'; a.rel = 'noopener noreferrer nofollow'; links.appendChild(a);
  });
  card.appendChild(links);
  return card;
}
// Where the Back button goes: up one level, and from the top of their library to the friends page.
function friendUp() {
  var r = S.friendAt; if (!r || !r.sub) return '#/friends';
  var it = fv.items[r.id], parent = it && it.parent && fv.items[it.parent] ? it.parent : '';
  return '#/u/' + r.uid + (parent ? '/c/' + parent : '');
}
function renderFriend() {
  if ($('#homeFriend').hidden || !S.friendAt) return;
  watchFriend();
  var r = S.friendAt, items = fv.items, name = personName(r.uid), grid = $('#ufGrid'), empty = $('#ufEmpty'), viewer = $('#ufViewer');
  $('#ufBack').lastChild.textContent = r.sub ? 'Back' : 'Friends';
  var head = $('#ufHead'); head.innerHTML = '';
  if (!r.sub) {
    head.appendChild(profileCard(S.people[r.uid]));
    if (r.uid !== S.myId) {
      var acts = document.createElement('div'); acts.className = 'tools-row pacts';
      var away = function () { location.hash = '#/friends'; };
      acts.append(reportBtn(r.uid), isBlocked(r.uid) ? unblockBtn(r.uid) : blockBtn(r.uid, away));
      if (S.canEdit && S.people[r.uid]) acts.appendChild(removeProfileBtn(r.uid));
      head.appendChild(acts);
    }
  }
  grid.innerHTML = '';
  var at = r.sub ? items[r.id] : null, bad = !fv.ready || fv.error || (r.sub && (!at || (r.sub === 'd') !== (at.type === 'image')));
  if (bad) {
    viewer.hidden = true; viewKey = ''; $('#ufCrumbs').innerHTML = ''; empty.hidden = false;
    empty.textContent = !fv.ready ? 'Loading…' : fv.error || 'This is private or no longer there.';
    return;
  }
  fillCrumbs($('#ufCrumbs'), [{ label: name + (name[0] === '@' ? '’s library' : ''), hash: '#/u/' + r.uid }].concat(pathTo(r.id, items).map(function (it) {
    return { label: it.name, hash: '#/u/' + r.uid + (it.type === 'image' ? '/d/' : '/c/') + it.id };
  })));
  if (r.sub === 'd') { empty.hidden = true; viewer.hidden = false; showFriendImage(at); return; }
  viewer.hidden = true; viewKey = '';
  var kids = sortItems(childrenOf(r.id || '', items));
  kids.forEach(function (it) { grid.appendChild(makeHomeCard(it, { uid: r.uid, items: items })); });
  empty.hidden = kids.length > 0;
  empty.textContent = at ? 'Nothing to see in here yet.' : name + ' has nothing to show yet.';
}

/* ---------- looking at a friend's image ---------- */
// The visible layers are drawn onto one canvas, the same way the library thumbnails are made. Nothing is saved.
var viewKey = '', viewToken = 0, viewZoom = false;
async function showFriendImage(it) {
  var key = fv.uid + '/' + it.id + '/' + (it.updated || 0); if (key === viewKey) return;
  viewKey = key; var t = ++viewToken, owner = fv.uid;
  var cv = $('#ufCanvas'), w = clampInt(it.w || 1600, 1, MAX_SIDE), h = clampInt(it.h || 1200, 1, MAX_SIDE), px = !!it.px;
  cv.width = w; cv.height = h; cv.classList.toggle('pixelated', px); cv.classList.toggle('checker', px);
  var g = cv.getContext('2d'); g.clearRect(0, 0, w, h);
  if (!px) { g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h); }
  $('#ufViewName').textContent = it.name; $('#ufViewInfo').textContent = 'Loading…';
  viewZoom = false; sizeViewer();
  try {
    var metas = (Array.isArray(it.layers) ? it.layers : []).filter(function (m) { return m && m.id && m.visible !== false; });
    var blobs = await Promise.all(metas.map(function (m) { return store.downloadLayer(it.id, m.id, owner); }));
    for (var i = 0; i < metas.length; i++) {
      if (t !== viewToken) return;
      if (!blobs[i]) continue;
      var bm = await createImageBitmap(blobs[i]);
      if (t !== viewToken) { if (bm.close) bm.close(); return; }
      var m = metas[i], blend = BLENDS.indexOf(m.blend) > 0 ? m.blend : 'source-over';
      g.globalAlpha = m.opacity == null ? 1 : clamp(Number(m.opacity) || 0, 0, 1); g.globalCompositeOperation = blend;
      g.drawImage(bm, 0, 0); if (bm.close) bm.close();
    }
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    $('#ufViewInfo').textContent = cardSub(it) + '. View only.';
  } catch (e) {
    if (t !== viewToken) return;
    viewKey = ''; $('#ufViewInfo').textContent = 'This image could not be loaded. Check your connection and try again.';
  }
}
// Fit to the screen (whole pixels for pixel art), or zoomed in, scrolling inside the box.
function sizeViewer() {
  if ($('#ufViewer').hidden) return;
  var cv = $('#ufCanvas'), box = $('#ufViewBox'), px = cv.classList.contains('pixelated');
  var fit = Math.min(Math.max(100, box.clientWidth - 26) / cv.width, Math.max(160, window.innerHeight * 0.72) / cv.height);
  if (px && fit >= 1) fit = Math.floor(fit);
  var s = viewZoom ? Math.max(1, fit * 2.5) : fit;
  if (px && s >= 1) s = Math.round(s);
  cv.style.width = Math.max(1, Math.round(cv.width * s)) + 'px'; cv.style.height = Math.max(1, Math.round(cv.height * s)) + 'px';
  $('#ufZoom').textContent = viewZoom ? 'Fit to screen' : 'Zoom in';
}
function toggleViewZoom() { viewZoom = !viewZoom; sizeViewer(); }

function initFriends() {
  $('#formAddFriend').addEventListener('submit', addFriend);
  $('#fBack').addEventListener('click', function () { location.hash = S.lastLibrary || '#/'; });
  $('#ufBack').addEventListener('click', function () { location.hash = friendUp(); });
  $('#ufZoom').addEventListener('click', toggleViewZoom);
  $('#ufCanvas').addEventListener('click', toggleViewZoom);
  $('#myFriends').addEventListener('click', function () { location.hash = '#/friends'; });
  window.addEventListener('resize', sizeViewer);
}
