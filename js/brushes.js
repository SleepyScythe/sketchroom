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
function curParams() { return S.tool === 'eraser' ? S.eraser : S.brush; }
function buildSliders() {
  var q = $('#quick');
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
  if (S.tool !== 'eraser') S.dirty = true;
  syncSliders(fromQuick);
  cancelAnimationFrame(previewRaf); previewRaf = requestAnimationFrame(drawEdit);
  updateEditorButtons();
}
function syncSliders(skipQuick) {
  if (!skipQuick) quickSliders.forEach(function (s) { s.sync(); });
  editSliders.forEach(function (s) { s.sync(); });
  $$('#shapeSeg button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.shape === S.brush.shape)); });
  $('#followChk').checked = !!S.brush.follow;
  $('#quickWho').textContent = S.tool === 'eraser' ? 'Eraser' : S.brushName + (S.dirty ? ' (edited)' : '');
}
function drawEdit() { if (!$('#pane-edit').hidden) drawPreview($('#editPreview'), S.brush, cssVar('--fg')); }

/* ---------- brush library ---------- */
function selectBrush(id, name, params) {
  S.base = P(params); S.brush = P(params); S.brushId = id; S.brushName = name; S.dirty = false;
  if (S.tool === 'eraser' || S.tool === 'hand' || S.tool === 'picker') setTool('brush');
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
  by.textContent = !c ? 'Preset' : c.where === 'library' ? 'Free' : store.online ? 'Mine' : 'On this device';
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
  var pg = $('#presetGrid'); pg.innerHTML = '';
  PRESETS.forEach(function (p) { pg.appendChild(makeCard(p.id, p.name, p.p, null)); });
  $('#librarySection').hidden = !store.online;
  fillGrid($('#libraryGrid'), S.library, 'No free brushes yet.');
  fillGrid($('#mineGrid'), S.mine, store.online && !S.myId ? 'Sign in to save your own brushes.' : 'No saved brushes yet. Open the Edit tab, shape a brush and press Save to my brushes.');
  markSelected(); updateEditorButtons();
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
