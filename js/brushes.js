/* Sketchroom: Sliders, brush editor and brush library.
   Plain script. Shares globals with the other files in js/; load order is set in index.html. */
'use strict';

/* ---------- sliders ---------- */
function makeSlider(label, min, max, unit, get, set, log) {
  var wrap = document.createElement('div'); wrap.className = 'row';
  var id = 's' + uid();
  var l = document.createElement('label'); l.htmlFor = id; l.textContent = label;
  var o = document.createElement('output'); o.htmlFor = id;
  var i = document.createElement('input'); i.type = 'range'; i.id = id;
  if (log) { i.min = 0; i.max = 100; } else { i.min = min; i.max = max; }
  i.step = 1;
  var toPos = function (v) { return log ? Math.round(100 * Math.log(Math.max(v, 1)) / Math.log(max)) : v; };
  var fromPos = function (p) { return log ? clamp(Math.round(Math.pow(max, p / 100)), min, max) : p; };
  wrap.sync = function () { var v = get(); i.value = toPos(v); o.textContent = v + unit; };
  i.addEventListener('input', function () { var v = fromPos(Number(i.value)); set(v); o.textContent = v + unit; });
  wrap.append(l, o, i); wrap.sync(); return wrap;
}
var quickSliders = [], editSliders = [];
function curParams() { return S.tool === 'eraser' ? S.eraser : S.tool === 'smudge' ? S.smudge : S.brush; }
function buildSliders() {
  var q = $('#qPaint');
  [['size', 'Size', 1, 300, 'px', true], ['opacity', 'Opacity', 1, 100, '%']].forEach(function (d) {
    var s = makeSlider(d[1], d[2], d[3], d[4], function () { return curParams()[d[0]]; }, function (v) { curParams()[d[0]] = v; brushChanged(true); }, d[5]);
    quickSliders.push(s); q.appendChild(s);
  });
  var host = $('#editSliders');
  SCHEMA.forEach(function (d) {
    var s = makeSlider(d[1], d[2], d[3], d[4], function () { return S.brush[d[0]]; }, function (v) { S.brush[d[0]] = v; brushChanged(); }, d[5]);
    editSliders.push(s); host.appendChild(s);
  });
  layerOpacitySlider = makeSlider('Layer opacity', 0, 100, '%', function () { return Math.round(S.active.opacity * 100); }, function (v) { S.active.opacity = v / 100; S.active.canvas.style.opacity = S.active.opacity; scheduleSave(); });
  $('#layerSliderHost').appendChild(layerOpacitySlider);
  $('#textSliderHost').appendChild(makeSlider('Text size', 12, 600, 'px', function () { return S.text.size; }, function (v) { S.text.size = v; }, false));
  var sb = $('#shapeSeg');
  SHAPES.forEach(function (sh) {
    var b = document.createElement('button'); b.textContent = sh[1]; b.setAttribute('aria-pressed', 'false'); b.dataset.shape = sh[0];
    b.addEventListener('click', function () { S.brush.shape = sh[0]; brushChanged(); }); sb.appendChild(b);
  });
}
var previewRaf = 0;
function brushChanged(fromQuick) {
  if (curParams() === S.brush) S.dirty = true;
  syncSliders(fromQuick);
  cancelAnimationFrame(previewRaf); previewRaf = requestAnimationFrame(drawEdit);
  updateEditorButtons();
}
function syncSliders(skipQuick) {
  if (!skipQuick) quickSliders.forEach(function (s) { s.sync(); });
  editSliders.forEach(function (s) { s.sync(); });
  $$('#shapeSeg button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.shape === S.brush.shape)); });
  $('#followChk').checked = !!S.brush.follow;
  $('#quickWho').textContent = quickTitle();
}
function drawEdit() { if (!$('#pane-edit').hidden) drawPreview($('#editPreview'), S.brush, cssVar('--fg')); }

/* ---------- brush library ---------- */
function selectBrush(id, name, params) {
  S.base = P(params); S.brush = P(params); S.brushId = id; S.brushName = name; S.dirty = false;
  // Line and Shapes draw with the chosen brush, so they stay. Tools that don't use a brush switch to Brush.
  if (['eraser', 'hand', 'picker', 'fill', 'smudge', 'select'].indexOf(S.tool) >= 0) setTool('brush');
  $('#brushName').value = name;
  syncSliders(); markSelected(); updateEditorButtons(); drawEdit();
}
function markSelected() { $$('.bcard').forEach(function (c) { c.setAttribute('aria-pressed', String(c.dataset.id === S.brushId)); }); }
function canModify(c) { return !!c && (c.where === 'mine' || S.canEdit); }
function currentSaved() { return S.mine.concat(S.library).filter(function (c) { return c.id === S.brushId; })[0]; }
function updateEditorButtons() {
  var cur = currentSaved();
  $('#saveUpdate').disabled = !(cur && canModify(cur));
  $('#revertBrush').disabled = !S.dirty;
  $('#saveLibrary').hidden = !S.canEdit;
  var sug = $('#suggestBrush'), pending = !!cur && S.myRequests.indexOf(cur.id) >= 0;
  sug.hidden = !store.online || !S.myId || S.canEdit || !cur || cur.where !== 'mine';
  sug.disabled = pending; sug.textContent = pending ? 'Suggested, waiting for review' : 'Suggest for free library';
  var hint = $('#editHint');
  if (!store.online) hint.textContent = 'Saved brushes stay on this device in this browser.';
  else if (!S.myId) hint.textContent = 'Sign in with Google to save your own brushes. They follow you to any device.';
  else if (S.canEdit) hint.textContent = 'My brushes are private to you. Add to free library shares a brush with everyone.';
  else hint.textContent = 'My brushes are private to you and follow you to any device.';
}
function makeCard(id, name, params, c) {
  var d = document.createElement('div'); d.className = 'bcard'; d.dataset.id = id; d.setAttribute('role', 'button'); d.tabIndex = 0;
  d.setAttribute('aria-pressed', String(id === S.brushId));
  var nm = document.createElement('span'); nm.className = 'nm'; nm.textContent = name;
  var cv = document.createElement('canvas'); cv.width = 260; cv.height = 76;
  var by = document.createElement('span'); by.className = 'by';
  by.textContent = !c || c.where === 'library' ? 'Free' : !store.online ? 'On this device'
    : S.myRequests.indexOf(c.id) >= 0 ? 'Mine, suggested' : 'Mine';
  d.append(nm, cv, by);
  if (c) {
    if (canModify(c)) {
      var del = document.createElement('button'); del.className = 'ibtn del'; del.innerHTML = icon('x', 14);
      del.setAttribute('aria-label', 'Delete brush ' + name); del.title = 'Delete brush';
      del.addEventListener('click', function (ev) {
        ev.stopPropagation();
        if (!del.classList.contains('armed')) { del.classList.add('armed'); del.title = 'Click again to delete'; setTimeout(function () { del.classList.remove('armed'); del.title = 'Delete brush'; }, 3000); return; }
        store.remove(c).catch(function () { toast('Could not delete that brush.'); });
      });
      d.appendChild(del);
    }
  }
  var pick = function () { selectBrush(id, name, params); };
  d.addEventListener('click', pick);
  d.addEventListener('keydown', function (ev) { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); pick(); } });
  try { drawPreview(cv, P(params), cssVar('--fg')); } catch (e) { /* preview is cosmetic */ }
  return d;
}
function renderBrushes() {
  // Free brushes: the built-in presets, then any brushes an admin added to the free library.
  var fg = $('#freeGrid'); fg.innerHTML = '';
  PRESETS.forEach(function (p) { fg.appendChild(makeCard(p.id, p.name, p.p, null)); });
  S.library.forEach(function (c) { fg.appendChild(makeCard(c.id, c.name, c.params, c)); });
  fillGrid($('#mineGrid'), S.mine, store.online && !S.myId ? 'Sign in to save your own brushes.' : 'No saved brushes yet. Open the Edit tab, shape a brush and press Save to my brushes.');
  renderRequests();
  markSelected(); updateEditorButtons();
}
// Admins see brushes that testers suggested for the free library, with Add and Decline.
function renderRequests() {
  var show = S.canEdit && S.requests.length > 0, grid = $('#requestGrid');
  $('#requestSection').hidden = !show; grid.innerHTML = '';
  if (!show) return;
  S.requests.forEach(function (r) {
    var d = makeCard('req-' + r.id, r.name, r.params, null);
    $('.by', d).textContent = 'From ' + (r.byName || 'a tester');
    var row = document.createElement('div'); row.className = 'reqrow';
    var ok = document.createElement('button'); ok.className = 'btn sm primary'; ok.textContent = 'Add';
    var no = document.createElement('button'); no.className = 'btn sm'; no.textContent = 'Decline';
    ok.addEventListener('click', function (ev) {
      ev.stopPropagation(); ok.disabled = no.disabled = true;
      store.approveRequest(r).then(function () { toast(r.name + ' is now in the free library.'); }, function () { ok.disabled = no.disabled = false; toast('Could not add that brush. Try again.'); });
    });
    no.addEventListener('click', function (ev) {
      ev.stopPropagation(); ok.disabled = no.disabled = true;
      store.declineRequest(r).catch(function () { ok.disabled = no.disabled = false; toast('Could not decline that brush. Try again.'); });
    });
    row.append(ok, no); d.appendChild(row); grid.appendChild(d);
  });
}

/* ---------- brush files (import and export) ---------- */
// Only known settings, clamped to the slider ranges, so a hand-edited file can't break the engine.
function cleanParams(p) {
  var r = P({}); p = p || {};
  SCHEMA.forEach(function (d) { var v = Number(p[d[0]]); if (isFinite(v)) r[d[0]] = clamp(Math.round(v), d[2], d[3]); });
  r.shape = SHAPES.some(function (s) { return s[0] === p.shape; }) ? p.shape : 'round';
  r.follow = !!p.follow; return r;
}
function exportBrushes() {
  if (!S.mine.length) { toast('You have no saved brushes to export yet.'); return; }
  var data = { app: 'sketchroom-brushes', version: 1, brushes: S.mine.map(function (c) { return { name: c.name, params: c.params }; }) };
  downloadBlob(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), 'sketchroom-brushes.json');
  toast('Exported ' + S.mine.length + ' brush' + (S.mine.length === 1 ? '' : 'es') + '.');
}
async function importBrushes(file) {
  if (!file) return;
  var data = null;
  try { data = JSON.parse(await file.text()); } catch (e) { data = null; }
  var list = data && Array.isArray(data.brushes) ? data.brushes : null;
  if (!list || !list.length) { toast('That file has no Sketchroom brushes in it.'); return; }
  list = list.slice(0, 100); var n = 0;
  for (var i = 0; i < list.length; i++) {
    var b = list[i] || {}, name = String(b.name || 'Brush').trim().slice(0, 40) || 'Brush';
    try { await store.add(name, cleanParams(b.params), 'mine'); n++; } catch (e) { /* keep going with the rest */ }
  }
  toast(n ? 'Imported ' + n + ' brush' + (n === 1 ? '' : 'es') + ' into My brushes.' : 'Could not import those brushes. Try again.');
}
function fillGrid(grid, list, emptyText) {
  grid.innerHTML = '';
  if (!list.length) {
    var e = document.createElement('div'); e.className = 'empty'; e.textContent = emptyText;
    grid.style.display = 'block'; grid.appendChild(e);
  } else {
    grid.style.display = '';
    list.forEach(function (c) { grid.appendChild(makeCard(c.id, c.name, c.params, c)); });
  }
}
