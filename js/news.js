/* Sketchroom: "What's new", the patch notes that pop up over the library.
   It shows once per account: the version the person has seen is kept in users/{uid}/settings/news (and in this browser,
   in case saving fails). The footer's "What's new" link opens it again any time.
   For the next update: change NEWS (a new version string, then the notes) and it shows once more for everyone.
   Plain script. Shares globals with the other files in js/; load order is set in index.html. */
'use strict';

var NEWS = {
  version: '2026-10-12',
  title: 'What\'s new in Sketchroom',
  when: 'October 2026 update',
  items: [
    ['Draw together', 'Share an image with up to 5 friends: press the people button at the top of the editor, or choose Draw together in an image\'s ••• menu. You see each other\'s brush strokes as they\'re drawn.'],
    ['Friends', 'Add friends by their @username on the Friends page. Friends can look through each other\'s libraries. Choose Make private in the ••• menu for anything you want to keep to yourself.'],
    ['A roomier editor', 'Brush, eraser and color stay on the left with tall Size and Opacity sliders. The other tools are behind the … button, and Brushes and Layers open as floating panels that never move your zoom.'],
    ['Pen or finger', 'The switch at the bottom of the tool rail. In Pen mode, your finger moves the canvas and only the pen draws.'],
    ['Pressure for every pen', 'If your pen has no pressure sensor, Sketchroom makes pressure from your drawing speed: slow is heavier, fast is lighter. Fine-tune it in Brushes, then Pen.'],
    ['Profiles', 'Pick a username and add a picture, bio and links. Other people only ever see your username, never your email.'],
    ['More brushes and fonts', 'About 50 brushes (tattoo, markers, inking, painting and more) and 90 fonts. You can also import .brush, .brushset and .abr brush files and pictures that you own.'],
    ['A fresh look', 'New art behind your library, a new homepage, and fixes so library cards look right on iPad and the editor fits phone screens.']
  ]
};

var newsShownFor = null;
function newsKey() { return 'sketchroom.newsSeen.' + S.myId; }
function newsSeenHere() { try { return localStorage.getItem(newsKey()) === NEWS.version; } catch (e) { return false; } }
// Called whenever the library is drawn. Opens the notes if this account hasn't seen this version yet.
function maybeShowNews() {
  if (!store.online || !S.myId || !S.profile || S.newsSeen == null || newsShownFor === S.myId) return;
  if (S.newsSeen === NEWS.version || newsSeenHere()) return;
  if ($('#home').hidden || $('#homeLibrary').hidden || document.querySelector('dialog[open]')) return; // e.g. picking a username
  newsShownFor = S.myId; openNews();
}
function openNews() {
  $('#newsTitle').textContent = NEWS.title; $('#newsWhen').textContent = NEWS.when;
  var host = $('#newsList'); host.innerHTML = '';
  NEWS.items.forEach(function (it) {
    var li = document.createElement('li'), h = document.createElement('strong'), p = document.createElement('span');
    h.textContent = it[0]; p.textContent = it[1]; li.append(h, p); host.appendChild(li);
  });
  var d = $('#dlgNews'); d.showModal(); d.scrollTop = 0; // start at the top, not at the focused button
}
// However it closes (Got it, Esc, or a click outside), this account has now seen it.
function newsClosed() {
  if (!S.myId) return;
  S.newsSeen = NEWS.version;
  try { localStorage.setItem(newsKey(), NEWS.version); } catch (e) { /* storage unavailable */ }
  if (store.setNewsSeen) store.setNewsSeen(NEWS.version).catch(function () { /* this browser remembers it anyway */ });
}
function initNews() {
  var d = $('#dlgNews');
  d.addEventListener('close', newsClosed);
  d.addEventListener('click', function (e) {
    var r = d.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) d.close();
  });
  $('#newsLink').addEventListener('click', function (e) { e.preventDefault(); openNews(); });
}
