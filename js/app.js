/* Sketchroom: Event wiring and startup (must load last).
   Plain script. Shares globals with the other files in js/; load order is set in index.html. */
'use strict';

/* ---------- wiring ---------- */
// Saving needs an account when Firebase is on. The popup opens from the click, so iPad Safari allows it.
async function signedIn() { return !store.online || !!S.myId || await store.signIn(); }
/* ---------- popouts ----------
   The panel (Brushes, Edit, Color, Text), Layers and the "…" tools menu float over the canvas, so opening or closing one
   never changes the canvas size, zoom or position (the owner asked for this). The panel and Layers stay open while
   drawing, like the color pop-up. The tools menu closes once a tool is picked or anything else is tapped. */
var panelTab = 'brushes';
function showTab(name) {
  if (name === 'layers') { openLayers(); return; }
  panelTab = name;
  $$('.tab').forEach(function (t) { t.setAttribute('aria-selected', String(t.dataset.tab === name)); });
  ['brushes', 'edit', 'color', 'text'].forEach(function (n) { $('#pane-' + n).hidden = n !== name; });
  if (name === 'text') { setTool('text'); ensureFont(); }
  if (name === 'edit') { requestAnimationFrame(drawEdit); }
}
function openPanel(tab) {
  $('#panelPop').hidden = false; $('#panelBtn').setAttribute('aria-expanded', 'true'); $('#work').classList.add('panelopen');
  showTab(tab || panelTab);
}
function closePanel() { $('#panelPop').hidden = true; $('#panelBtn').setAttribute('aria-expanded', 'false'); $('#work').classList.remove('panelopen'); }
// Lines a popout up with its rail button, kept inside the work area.
function placeBeside(pop, btn, alignBottom) {
  var w = $('#work').getBoundingClientRect(), b = btn.getBoundingClientRect(), h = pop.offsetHeight, m = 8;
  pop.style.top = clamp((alignBottom ? b.bottom - h : b.top) - w.top, m, Math.max(m, w.height - h - m)) + 'px';
}
function openLayers() { $('#layersPop').hidden = false; $('#layersBtn').setAttribute('aria-expanded', 'true'); placeBeside($('#layersPop'), $('#layersBtn'), true); }
function closeLayers() { $('#layersPop').hidden = true; $('#layersBtn').setAttribute('aria-expanded', 'false'); }
function openTools() { $('#toolsPop').hidden = false; $('#moreTools').setAttribute('aria-expanded', 'true'); placeBeside($('#toolsPop'), $('#moreTools'), false); }
function closeTools() { $('#toolsPop').hidden = true; $('#moreTools').setAttribute('aria-expanded', 'false'); }
function wirePopouts() {
  $('#panelBtn').addEventListener('click', function () { if ($('#panelPop').hidden) openPanel(); else closePanel(); });
  $('#panelClose').addEventListener('click', closePanel);
  $('#layersBtn').addEventListener('click', function () { if ($('#layersPop').hidden) openLayers(); else closeLayers(); });
  $('#layersClose').addEventListener('click', closeLayers);
  $('#inputMode').addEventListener('click', function () { setInputMode(S.inputMode === 'pen' ? 'touch' : 'pen'); });
  renderInputMode();
  $('#moreTools').addEventListener('click', function (e) { e.stopPropagation(); if ($('#toolsPop').hidden) openTools(); else closeTools(); });
  $('#toolsPop').addEventListener('click', function (e) { if (e.target.closest('[data-tool]')) closeTools(); });
  document.addEventListener('pointerdown', function (e) {
    if (!$('#toolsPop').hidden && !$('#toolsPop').contains(e.target) && !$('#moreTools').contains(e.target)) closeTools();
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { closeTools(); closeLayers(); closePanel(); } });
  window.addEventListener('resize', function () {
    if (!$('#layersPop').hidden) placeBeside($('#layersPop'), $('#layersBtn'), true);
    if (!$('#toolsPop').hidden) placeBeside($('#toolsPop'), $('#moreTools'), false);
  });
}
function wire() {
  $$('.tab').forEach(function (t) { t.addEventListener('click', function () { showTab(t.dataset.tab); }); });
  $$('[data-tool]').forEach(function (b) { b.addEventListener('click', function () { setTool(b.dataset.tool); }); });
  wirePopouts();
  $('#undoBtn').addEventListener('click', undo); $('#redoBtn').addEventListener('click', redo);
  $('#zoomIn').addEventListener('click', function () { zoomAt(1.25); }); $('#zoomOut').addEventListener('click', function () { zoomAt(0.8); });
  $('#zoomVal').addEventListener('click', function () { var r = vp.getBoundingClientRect(); zoomAt(1 / S.view.s, r.left + r.width / 2, r.top + r.height / 2); });

  vp.addEventListener('pointerdown', onDown); vp.addEventListener('pointermove', onMove);
  vp.addEventListener('pointerup', onUp); vp.addEventListener('pointercancel', onUp);
  vp.addEventListener('pointerleave', function (e) { if (e.pointerType !== 'touch') { ring.hidden = true; if (!cur && S.tool === 'text') octx.clearRect(0, 0, DOC_W, DOC_H); } });
  vp.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  vp.addEventListener('wheel', function (e) {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) zoomAt(Math.exp(-e.deltaY * 0.01), e.clientX, e.clientY);
    else { S.view.x -= e.deltaX; S.view.y -= e.deltaY; S.userZoomed = true; applyView(); }
  }, { passive: false });
  window.addEventListener('resize', function () { if (!S.userZoomed) fit(); drawGrid(); });
  $('#homeBtn').addEventListener('click', function () {
    var it = S.doc && !S.doc.local ? S.items[S.doc.id] : null;
    location.hash = it && it.parent && S.items[it.parent] ? '#/c/' + it.parent : '#/';
  });

  $('#fileBtn').addEventListener('click', function (e) { e.stopPropagation(); var m = $('#fileMenu'); m.hidden = !m.hidden; $('#fileBtn').setAttribute('aria-expanded', String(!m.hidden)); });
  document.addEventListener('click', function () {
    $('#fileMenu').hidden = true; $('#fileBtn').setAttribute('aria-expanded', 'false');
    $('#accountMenu').hidden = true; $('#accountBtn').setAttribute('aria-expanded', 'false');
  });
  $('#exportPng').addEventListener('click', function () { exportPng(false); });
  $('#exportPngT').addEventListener('click', function () { exportPng(true); });
  $('#exportPngBig').addEventListener('click', function () { exportPng(true, 8); });
  // Buttons that throw away the current drawing ask for a second click first.
  var armed = function (btn, label, warning, action) {
    var timer = 0;
    btn.addEventListener('click', function (e) {
      if (!btn.classList.contains('armed')) {
        e.stopPropagation(); btn.classList.add('armed'); btn.textContent = warning;
        timer = setTimeout(function () { btn.classList.remove('armed'); btn.textContent = label; }, 3000); return;
      }
      clearTimeout(timer); btn.classList.remove('armed'); btn.textContent = label; action();
    });
  };
  armed($('#newDoc'), 'Clear drawing', 'Click again to erase everything', newDoc);
  armed($('#openFile'), 'Open drawing file', 'Click again to replace this drawing', function () { $('#openFileInput').click(); });
  $('#openFileInput').addEventListener('change', function (e) { openDrawingFile(e.target.files[0]); e.target.value = ''; });
  $('#saveFile').addEventListener('click', saveDrawingFile);

  $('#followChk').addEventListener('change', function (e) { S.brush.follow = e.target.checked; brushChanged(); });
  $('#brushName').addEventListener('input', function (e) { S.brushName = e.target.value; });
  var saveAs = async function (where) {
    var name = (($('#brushName').value || '').trim() || (S.brushName + ' copy')).slice(0, 40);
    var params = P(S.brush);
    if (!(await signedIn())) return;
    try {
      var id = await store.add(name, params, where);
      S.brushId = id; S.brushName = name; S.base = P(params); S.dirty = false; syncSliders(); markSelected(); updateEditorButtons();
      toast(where === 'library' ? 'Added to the free library. Everyone can use it.' : store.online ? 'Saved to My brushes.' : 'Saved on this device.');
    } catch (e) { toast('Could not save the brush. Try again.'); }
  };
  $('#saveNew').addEventListener('click', function () { saveAs('mine'); });
  $('#saveLibrary').addEventListener('click', function () { saveAs('library'); });
  $('#saveUpdate').addEventListener('click', async function () {
    var name = ($('#brushName').value || '').trim() || S.brushName, cur = currentSaved();
    if (!cur) return;
    try { await store.update(cur, name, P(S.brush)); S.brushName = name; S.base = P(S.brush); S.dirty = false; syncSliders(); updateEditorButtons(); toast('Brush updated.'); }
    catch (e) { toast('Could not update the brush.'); }
  });
  $('#revertBrush').addEventListener('click', function () { S.brush = P(S.base); S.dirty = false; syncSliders(); updateEditorButtons(); drawEdit(); });
  $('#suggestBrush').addEventListener('click', async function () {
    var c = currentSaved(); if (!c || c.where !== 'mine' || !store.requestShare) return;
    try { await store.requestShare(c); toast('Sent to the owner. If they like it, it joins the free brushes.'); }
    catch (e) { toast('Could not send that brush. Try again.'); }
  });
  $('#exportBrushes').addEventListener('click', exportBrushes);
  // Signing in has to happen straight from a click, so when signed out the first press signs in and the second picks the file.
  var pickAfterSignIn = function (input) {
    return async function () {
      if (store.online && !S.myId) { if (await store.signIn()) toast('Signed in. Press the button again to choose a file.'); return; }
      $(input).click();
    };
  };
  $('#importBrushes').addEventListener('click', pickAfterSignIn('#importBrushesFile'));
  $('#importBrushesFile').addEventListener('change', function (e) { importBrushes(e.target.files[0]); e.target.value = ''; });

  // Layer actions land any pixels that are being moved with the selection tool first.
  var settled = function (fn) { return function () { dropSelection(); fn(); }; };
  $('#lAdd').addEventListener('click', settled(addLayer)); $('#lDup').addEventListener('click', settled(dupLayer));
  $('#lUp').addEventListener('click', settled(function () { moveLayer(1); })); $('#lDown').addEventListener('click', settled(function () { moveLayer(-1); }));
  $('#lDel').addEventListener('click', settled(delLayer)); $('#lMerge').addEventListener('click', settled(mergeDown));
  $('#lImport').addEventListener('click', function () { $('#lImportFile').click(); });
  $('#lImportFile').addEventListener('change', function (e) { dropSelection(); importImage(e.target.files[0]); e.target.value = ''; });
  var lc = $('#lClear'), lcTimer = 0;
  lc.addEventListener('click', function () {
    if (!lc.classList.contains('armed')) { lc.classList.add('armed', 'warn'); lc.textContent = 'Sure?'; lcTimer = setTimeout(function () { lc.classList.remove('armed', 'warn'); lc.textContent = 'Clear'; }, 3000); return; }
    clearTimeout(lcTimer); lc.classList.remove('armed', 'warn'); lc.textContent = 'Clear'; dropSelection(); clearLayer();
  });
  $('#layerName').addEventListener('input', function (e) { S.active.name = e.target.value || 'Layer'; var rows = $$('#layerList .lrow'); var idx = S.layers.length - 1 - S.layers.indexOf(S.active); if (rows[idx]) $('.ln', rows[idx]).textContent = S.active.name; scheduleSave(); });
  $('#blendSel').addEventListener('change', function (e) { S.active.blend = e.target.value; S.active.canvas.style.mixBlendMode = S.active.blend; scheduleSave(); });

  $('#textStr').addEventListener('input', function (e) { S.text.str = e.target.value; });
  $('#fontSel').addEventListener('change', function (e) { S.text.font = e.target.value; updateFontPrev(); ensureFont(); });
  var tgl = function (id, key) { $(id).addEventListener('click', function () { S.text[key] = !S.text[key]; $(id).setAttribute('aria-pressed', String(S.text[key])); updateFontPrev(); ensureFont(); }); };
  tgl('#boldBtn', 'bold'); tgl('#italicBtn', 'italic');
  $('#fontAddBtn').addEventListener('click', async function () {
    var name = $('#fontAdd').value.trim().replace(/\s+/g, ' ');
    if (!/^[A-Za-z0-9 ]{2,40}$/.test(name)) { toast('Use the font name as written on fonts.google.com.'); return; }
    if (!(await signedIn())) return;
    var btn = $('#fontAddBtn'); btn.disabled = true;
    try { await loadFamily(name); } catch (e) { toast('Google Fonts has no family called ' + name + '.'); btn.disabled = false; return; }
    try {
      await store.addFont(name); S.text.font = name; $('#fontAdd').value = '';
      rebuildFonts(); $('#fontSel').value = name; updateFontPrev();
      toast(name + ' added.');
    } catch (e) { toast('Could not save that font. Try again.'); }
    btn.disabled = false;
  });
  $('#fontUploadBtn').addEventListener('click', pickAfterSignIn('#fontUploadFile'));
  $('#fontUploadFile').addEventListener('change', function (e) { uploadFont(e.target.files[0]); e.target.value = ''; });

  $('#accountBtn').addEventListener('click', function (e) {
    e.stopPropagation();
    if (!S.myId) { store.signIn(); return; }
    var m = $('#accountMenu'); m.hidden = !m.hidden; $('#accountBtn').setAttribute('aria-expanded', String(!m.hidden));
  });
  $('#signOut').addEventListener('click', function () { store.signOut(); });

  document.addEventListener('keydown', function (e) {
    var tag = (e.target.tagName || '').toLowerCase();
    var typing = tag === 'input' || tag === 'textarea' || tag === 'select';
    var mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 'z' && !typing) { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
    if (mod && e.key.toLowerCase() === 'y' && !typing) { e.preventDefault(); redo(); return; }
    if (typing || mod) return;
    var k = e.key.toLowerCase();
    if (k === ' ') { e.preventDefault(); spaceDown = true; vp.style.cursor = 'grab'; ring.hidden = true; return; }
    if (S.sel && (k === 'escape' || k === 'enter')) { dropSelection(true); return; }
    if (S.sel && (k === 'delete' || k === 'backspace')) { e.preventDefault(); deleteSelection(); return; }
    var keys = { b: 'brush', e: 'eraser', s: 'smudge', g: 'fill', l: 'line', u: 'shape', m: 'select', i: 'picker', h: 'hand' };
    if (keys[k]) setTool(keys[k]); else if (k === 't') { openPanel('text'); }
    else if (k === '[' || k === ']') {
      var p = curParams(), f = k === ']' ? 1.15 : 1 / 1.15;
      p.size = clamp(Math.round(p.size * f) + (k === ']' ? 1 : -1) * (p.size < 10 ? 0 : 0), 1, 300); if (Math.round(p.size * f) === p.size) p.size = clamp(p.size + (k === ']' ? 1 : -1), 1, 300);
      brushChanged(false);
    }
  });
  document.addEventListener('keyup', function (e) { if (e.key === ' ') { spaceDown = false; setTool(S.tool); } });
  // Leaving the tab or closing it: save now rather than in a few seconds.
  var flush = function () { if (!S.doc) return; clearTimeout(saveTimer); saveDoc(); if (!S.doc.local) cloudSave(); };
  document.addEventListener('visibilitychange', function () { if (document.hidden) flush(); });
  window.addEventListener('pagehide', flush);

  var re = function () { renderBrushes(); drawEdit(); };
  try { window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', re); } catch (e) { /* older browsers */ }
  new MutationObserver(re).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
}

/* ---------- start ---------- */
async function init() {
  var L = makeLayer('Layer ' + (++layerCount)); S.layers.push(L); S.active = L; renderStack();
  buildSliders(); wire(); initPad(); initColor(); initTools(); initLibrary(); initProfile(); initFriends(); initNews();
  setTool('brush');
  // Installable app: the service worker lets the app open offline. It always tries the network first, so updates show up.
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) navigator.serviceWorker.register('sw.js').catch(function () { /* optional */ });
  var first = presetById('pen'); selectBrush(first.id, first.name, first.p);
  renderBrushes(); renderLayers(); rebuildFonts(); updateHist();
  initStore();
  // The first page depends on whether someone is signed in. Don't wait forever if Firebase is slow.
  await Promise.race([store.ready, new Promise(function (r) { setTimeout(r, 6000); })]);
  route();
}
init();
