/* Sketchroom: Usernames and profiles, the contact form, and the owner's inbox.
   Plain script. Shares globals with the other files in js/; load order is set in index.html. */
'use strict';

/* ---------- profiles ----------
   profiles/{uid}: { username, displayName, bio, pronouns, location, links [up to 3 https URLs], avatar (small data URL or ''),
   color, joined, updated }. Signed-in users can read profiles (for the friends list later). The Google name and email
   are never copied into a profile. usernames/{name}: { uid } reserves each name (see store.saveProfile). */
var USERNAME_RE = /^[a-z0-9_.]{3,20}$/;
var PROFILE_COLORS = ['#56c4b4', '#3a78d8', '#8a5fd6', '#e2569b', '#ef6a4c', '#f4a259', '#4fae6a', '#6d7580'];
var TOPICS = { report: 'Report content or copyright', privacy: 'Privacy or deleting my data', bug: 'Bug or feedback', other: 'Something else' };
function cleanUsername(v) { return String(v || '').trim().toLowerCase().replace(/^@/, ''); }
function suggestUsername() { return 'artist' + Math.floor(1000 + Math.random() * 9000); }
function blankProfile(name) {
  var now = Date.now();
  return { username: name, displayName: '', bio: '', pronouns: '', location: '', links: [], avatar: '',
    color: PROFILE_COLORS[Math.floor(Math.random() * PROFILE_COLORS.length)], joined: now, updated: now };
}
// Saves the profile under a (possibly new) username. Returns an error message, or '' when it worked.
async function claimUsername(name, base, oldName) {
  if (!USERNAME_RE.test(name)) return 'Use 3 to 20 lowercase letters, numbers, dots or underscores.';
  try {
    var owner = await store.usernameOwner(name);
    if (owner && owner !== S.myId) return '@' + name + ' is taken. Try another.';
    await store.saveProfile(Object.assign({}, base, { username: name, updated: Date.now() }), oldName);
    return '';
  } catch (e) {
    return e && e.code === 'permission-denied' ? '@' + name + ' is taken. Try another.' : 'Could not save. Check your connection and try again.';
  }
}
function avatarEl(p, cls) {
  var d = document.createElement('div'); d.className = 'avatar ' + (cls || ''); d.style.background = (p && p.color) || '#6d7580';
  if (p && typeof p.avatar === 'string' && p.avatar.indexOf('data:image/') === 0) {
    var img = document.createElement('img'); img.src = p.avatar; img.alt = ''; d.appendChild(img);
  } else d.textContent = p && p.username ? p.username[0].toUpperCase() : '?';
  return d;
}
function safeLink(v) {
  v = String(v || '').trim(); if (!v) return '';
  if (!/^https?:\/\//i.test(v)) v = 'https://' + v;
  try { var u = new URL(v); return /^https?:$/.test(u.protocol) && u.hostname.indexOf('.') > 0 ? u.href.slice(0, 120) : null; } catch (e) { return null; }
}

/* ---------- first sign-in: pick a username ---------- */
var askingName = false;
function needUsername() {
  if (askingName || !S.myId) return;
  askingName = true;
  $('#unameInput').value = suggestUsername(); $('#unameError').textContent = '';
  $('#dlgUsername').showModal(); $('#unameInput').select();
}
async function submitUsername(e) {
  e.preventDefault();
  var name = cleanUsername($('#unameInput').value), btn = $('#unameOk'); btn.disabled = true;
  var msg = await claimUsername(name, S.profile || blankProfile(name), S.profile ? S.profile.username : '');
  btn.disabled = false;
  if (msg) { $('#unameError').textContent = msg; return; }
  askingName = false; $('#dlgUsername').close('ok'); toast('Welcome, @' + name + '!');
}
// Closing the box without choosing still gives the account a username, which can be changed later on the profile page.
async function usernameClosed() {
  if (!askingName) return;
  askingName = false;
  for (var i = 0; i < 3 && S.myId && !S.profile; i++) {
    var name = suggestUsername();
    if (!(await claimUsername(name, blankProfile(name), ''))) { toast('You are @' + name + '. Change it any time on your profile page.'); return; }
  }
}

/* ---------- the profile page (#/profile) ---------- */
function renderProfile() {
  if ($('#homeProfile').hidden) return;
  var p = S.profile; if (!p) { $('#pUser').textContent = 'Setting up your profile…'; return; }
  $('#pBanner').style.background = p.color || '#56c4b4';
  var host = $('#pAvatarHost'); host.innerHTML = ''; host.appendChild(avatarEl(p, 'big'));
  $('#pDisplay').textContent = p.displayName || '@' + p.username;
  $('#pUser').textContent = '@' + p.username;
  var joined = new Date(p.joined || Date.now()).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  $('#pMeta').textContent = [p.pronouns, p.location, 'Joined ' + joined].filter(Boolean).join('  ·  ');
  $('#pBio').textContent = p.bio || ''; $('#pBio').hidden = !p.bio;
  var links = $('#pLinks'); links.innerHTML = '';
  (p.links || []).forEach(function (l) {
    var url = safeLink(l); if (!url) return;
    var a = document.createElement('a'); a.href = url; a.textContent = url.replace(/^https?:\/\//, '').replace(/\/$/, '');
    a.target = '_blank'; a.rel = 'noopener noreferrer nofollow'; links.appendChild(a);
  });
  var items = Object.keys(S.items).map(function (k) { return S.items[k]; });
  var count = function (t) { return items.filter(function (x) { return x.type === t; }).length; };
  var stats = [[count('image'), 'Images'], [count('folder'), 'Folders'], [count('project'), 'Projects'], [S.mine.length, 'Brushes'], [S.myFonts.length + S.uploadedFonts.length, 'Fonts'], [S.saved.length, 'Saved colors']];
  var st = $('#pStats'); st.innerHTML = '';
  stats.forEach(function (s) {
    var d = document.createElement('div'), n = document.createElement('strong'), l = document.createElement('span');
    n.textContent = s[0]; l.textContent = s[1]; d.append(n, l); st.appendChild(d);
  });
  $('#pAccount').textContent = 'Signed in with Google as ' + (store.myEmail ? store.myEmail() : '') + '. Only you can see this email. Other people only see your username and the profile details above.';
  renderInbox();
}

/* ---------- editing the profile ---------- */
var editAvatar = '', editColor = '';
function openProfileEditor() {
  var p = S.profile; if (!p) return;
  editAvatar = p.avatar || ''; editColor = p.color || PROFILE_COLORS[0];
  $('#peUser').value = p.username; $('#peName').value = p.displayName || ''; $('#pePronouns').value = p.pronouns || '';
  $('#peLocation').value = p.location || ''; $('#peBio').value = p.bio || '';
  for (var i = 0; i < 3; i++) $('#peLink' + i).value = (p.links || [])[i] || '';
  $('#peError').textContent = ''; drawEditorAvatar(); updateBioCount();
  $('#dlgProfile').showModal();
}
function drawEditorAvatar() {
  var host = $('#peAvatar'); host.innerHTML = '';
  host.appendChild(avatarEl({ username: cleanUsername($('#peUser').value) || '?', avatar: editAvatar, color: editColor }, 'mid'));
  $('#peRemovePic').hidden = !editAvatar;
  $$('#peColors button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.c === editColor)); });
}
function updateBioCount() { $('#peBioCount').textContent = $('#peBio').value.length + ' / 200'; }
// Profile pictures are cropped to a square and shrunk to 160 px, small enough to keep in the profile itself.
async function pickAvatar(file) {
  if (!file || !/^image\//.test(file.type)) { toast('Choose a picture.'); return; }
  var url = URL.createObjectURL(file);
  try {
    var img = await loadImage(url), s = Math.min(img.naturalWidth, img.naturalHeight), c = document.createElement('canvas'); c.width = c.height = 160;
    var g = c.getContext('2d'); g.imageSmoothingQuality = 'high';
    g.drawImage(img, (img.naturalWidth - s) / 2, (img.naturalHeight - s) / 2, s, s, 0, 0, 160, 160);
    editAvatar = c.toDataURL('image/jpeg', 0.85); drawEditorAvatar();
  } catch (e) { toast('That picture could not be opened.'); } finally { URL.revokeObjectURL(url); }
}
async function saveProfileEdits(e) {
  e.preventDefault();
  var p = S.profile; if (!p) return;
  var links = [], bad = false;
  for (var i = 0; i < 3; i++) { var v = $('#peLink' + i).value; if (!v.trim()) continue; var u = safeLink(v); if (u) links.push(u); else bad = true; }
  if (bad) { $('#peError').textContent = 'One of the links is not a web address. Use something like instagram.com/yourname.'; return; }
  var base = Object.assign({}, p, {
    displayName: $('#peName').value.trim().slice(0, 40), pronouns: $('#pePronouns').value.trim().slice(0, 24),
    location: $('#peLocation').value.trim().slice(0, 40), bio: $('#peBio').value.trim().slice(0, 200),
    links: links, avatar: editAvatar, color: editColor
  });
  var btn = $('#peSave'); btn.disabled = true;
  var msg = await claimUsername(cleanUsername($('#peUser').value), base, p.username);
  btn.disabled = false;
  if (msg) { $('#peError').textContent = msg; return; }
  $('#dlgProfile').close('ok'); toast('Profile saved.');
}

/* ---------- contact form and the owner's inbox ---------- */
function openContact(topic) {
  if (!store.online) { toast('The contact form needs the online version of Sketchroom.'); return; }
  if (!S.myId) { store.signIn(); return; }
  $('#ctTopic').value = topic || 'bug'; $('#ctText').value = ''; $('#ctReply').value = ''; $('#ctError').textContent = '';
  $('#dlgContact').showModal(); $('#ctText').focus();
}
async function sendContact(e) {
  e.preventDefault();
  var text = $('#ctText').value.trim();
  if (!text) { $('#ctError').textContent = 'Write a message first.'; return; }
  var btn = $('#ctSend'); btn.disabled = true;
  try {
    await store.sendMessage({ uid: S.myId, username: S.profile ? S.profile.username : '', topic: $('#ctTopic').value, text: text.slice(0, 2000),
      contact: $('#ctReply').value.trim().slice(0, 120), at: Date.now(), read: false });
    $('#dlgContact').close('ok'); toast('Message sent. Thank you!');
  } catch (err) { $('#ctError').textContent = 'Could not send. Check your connection and try again.'; }
  btn.disabled = false;
}
function renderInbox() {
  var box = $('#pInboxBox'); box.hidden = !S.canEdit; if (!S.canEdit) return;
  var unread = S.messages.filter(function (m) { return !m.read; }).length;
  $('#pInboxTitle').textContent = 'Inbox' + (unread ? ' (' + unread + ' new)' : '');
  var host = $('#pInbox'); host.innerHTML = '';
  if (!S.messages.length) { var e = document.createElement('p'); e.className = 'hint'; e.textContent = 'No messages yet. Messages from the contact form show up here, and only you can see them.'; host.appendChild(e); return; }
  S.messages.forEach(function (m) {
    var card = document.createElement('div'); card.className = 'msg' + (m.read ? '' : ' unread');
    var head = document.createElement('div'); head.className = 'msghead';
    head.textContent = (TOPICS[m.topic] || 'Message') + '  ·  from ' + (m.username ? '@' + m.username : 'a user') + '  ·  ' + new Date(m.at).toLocaleString();
    var body = document.createElement('p'); body.className = 'msgbody'; body.textContent = m.text;
    card.append(head, body);
    if (m.contact) { var c = document.createElement('p'); c.className = 'hint'; c.textContent = 'Reply to: ' + m.contact; card.appendChild(c); }
    var row = document.createElement('div'); row.className = 'tools-row';
    var rd = document.createElement('button'); rd.className = 'btn sm'; rd.textContent = m.read ? 'Mark unread' : 'Mark read';
    rd.addEventListener('click', function () { store.markMessage(m.id, !m.read).catch(function () { toast('Could not update it.'); }); });
    var del = document.createElement('button'); del.className = 'btn sm'; del.textContent = 'Delete';
    del.addEventListener('click', function () {
      if (!del.classList.contains('armed')) { del.classList.add('armed', 'warn'); del.textContent = 'Tap again to delete'; setTimeout(function () { del.classList.remove('armed', 'warn'); del.textContent = 'Delete'; }, 3000); return; }
      store.deleteMessage(m.id).catch(function () { toast('Could not delete it.'); });
    });
    row.append(rd, del); card.appendChild(row); host.appendChild(card);
  });
}

function initProfile() {
  $('#formUsername').addEventListener('submit', submitUsername);
  $('#dlgUsername').addEventListener('close', usernameClosed);
  $('#pEdit').addEventListener('click', openProfileEditor);
  $('#formProfile').addEventListener('submit', saveProfileEdits);
  $('#peUser').addEventListener('input', drawEditorAvatar);
  $('#peBio').addEventListener('input', updateBioCount);
  $('#pePic').addEventListener('click', function () { $('#pePicFile').click(); });
  $('#pePicFile').addEventListener('change', function (e) { pickAvatar(e.target.files[0]); e.target.value = ''; });
  $('#peRemovePic').addEventListener('click', function () { editAvatar = ''; drawEditorAvatar(); });
  var colors = $('#peColors');
  PROFILE_COLORS.forEach(function (c) {
    var b = document.createElement('button'); b.type = 'button'; b.className = 'sw'; b.style.background = c; b.dataset.c = c; b.setAttribute('aria-label', 'Color ' + c);
    b.addEventListener('click', function () { editColor = c; drawEditorAvatar(); }); colors.appendChild(b);
  });
  $('#formContact').addEventListener('submit', sendContact);
  $$('[data-contact]').forEach(function (b) { b.addEventListener('click', function (e) { e.preventDefault(); openContact(b.dataset.contact); }); });
  $('#pSignOut').addEventListener('click', function () { store.signOut(); location.hash = '#/'; });
  // Back returns to the library folder or project you came from (the top level if you came straight to the profile).
  $('#pBack').addEventListener('click', function () { location.hash = S.lastLibrary || '#/'; });
  $('#myProfile').addEventListener('click', function () { location.hash = '#/profile'; });
}
