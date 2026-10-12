/* Sketchroom: Brush presets and settings schema, app state, small helpers.
   Plain script. Shares globals with the other files in js/; load order is set in index.html. */
'use strict';

/* ---------- brush data ---------- */
var BASE = { size: 20, opacity: 100, flow: 100, hardness: 80, spacing: 8, roundness: 100, angle: 0, angleJitter: 0, scatter: 0, sizeJitter: 0, pressureSize: 0, pressureOpacity: 0, smoothing: 0, shape: 'round', follow: false };
function P(o) { var r = {}; for (var k in BASE) r[k] = BASE[k]; for (var j in o) r[j] = o[j]; return r; }
// The built-in free brushes, grouped by art style. Keep the ids stable: they mark which brush is selected.
// Names are generic, descriptive terms for real-world tools, so they don't copy any other app's brush names.
var BRUSH_CATS = ['Sketching', 'Inking', 'Tattoo', 'Markers', 'Painting', 'Airbrush & spray', 'Lettering', 'Texture'];
var PRESETS = [
  { id: 'pencil', cat: 'Sketching', name: 'Graphite Pencil', p: P({ size: 5, opacity: 90, flow: 60, hardness: 75, spacing: 7, shape: 'chalk', pressureSize: 35, pressureOpacity: 75, smoothing: 8 }) },
  { id: 'pencil-soft', cat: 'Sketching', name: 'Soft Pencil', p: P({ size: 8, opacity: 95, flow: 70, hardness: 60, spacing: 6, shape: 'chalk', pressureSize: 45, pressureOpacity: 85, smoothing: 8 }) },
  { id: 'pencil-hard', cat: 'Sketching', name: 'Hard Pencil', p: P({ size: 3, opacity: 70, flow: 45, hardness: 85, spacing: 6, shape: 'chalk', pressureSize: 20, pressureOpacity: 70, smoothing: 10 }) },
  { id: 'pencil-mech', cat: 'Sketching', name: 'Mechanical Pencil', p: P({ size: 2, opacity: 80, flow: 75, hardness: 95, spacing: 5, pressureOpacity: 60, smoothing: 15 }) },
  { id: 'pencil-color', cat: 'Sketching', name: 'Colored Pencil', p: P({ size: 8, flow: 65, hardness: 70, spacing: 6, shape: 'chalk', scatter: 2, pressureSize: 25, pressureOpacity: 85, smoothing: 8 }) },
  { id: 'charcoal', cat: 'Sketching', name: 'Charcoal', p: P({ size: 30, flow: 70, hardness: 60, spacing: 9, shape: 'chalk', scatter: 10, sizeJitter: 20, pressureSize: 50, pressureOpacity: 60, smoothing: 10 }) },
  { id: 'pastel', cat: 'Sketching', name: 'Soft Pastel', p: P({ size: 26, flow: 75, hardness: 50, spacing: 7, shape: 'chalk', scatter: 12, sizeJitter: 20, pressureSize: 40, pressureOpacity: 50, smoothing: 10 }) },
  { id: 'crayon', cat: 'Sketching', name: 'Wax Crayon', p: P({ size: 16, flow: 85, hardness: 75, spacing: 6, shape: 'chalk', scatter: 5, sizeJitter: 15, pressureSize: 30, smoothing: 10 }) },

  { id: 'pen', cat: 'Inking', name: 'Drafting Pen', p: P({ size: 3, hardness: 100, spacing: 5, pressureSize: 25, smoothing: 45 }) },
  { id: 'ink', cat: 'Inking', name: 'Ink Brush', p: P({ size: 16, hardness: 92, spacing: 4, pressureSize: 90, smoothing: 55 }) },
  { id: 'gnib', cat: 'Inking', name: 'Comic Nib', p: P({ size: 8, hardness: 100, spacing: 3, pressureSize: 95, smoothing: 50 }) },
  { id: 'dryink', cat: 'Inking', name: 'Dry Brush Ink', p: P({ size: 16, flow: 90, hardness: 100, spacing: 5, shape: 'bristle', follow: true, pressureSize: 60, smoothing: 30 }) },
  { id: 'splatter', cat: 'Inking', name: 'Ink Splatter', p: P({ size: 80, flow: 90, hardness: 100, spacing: 35, shape: 'speckle', scatter: 60, sizeJitter: 60 }) },

  { id: 'tat-liner', cat: 'Tattoo', name: 'Tattoo Liner', p: P({ size: 6, hardness: 100, spacing: 3, pressureSize: 30, smoothing: 60 }) },
  { id: 'tat-bold', cat: 'Tattoo', name: 'Bold Traditional Liner', p: P({ size: 14, hardness: 100, spacing: 3, pressureSize: 15, smoothing: 60 }) },
  { id: 'tat-stencil', cat: 'Tattoo', name: 'Stencil Line', p: P({ size: 4, opacity: 85, flow: 85, hardness: 80, spacing: 5, shape: 'chalk', pressureSize: 15, smoothing: 50 }) },
  { id: 'tat-whip', cat: 'Tattoo', name: 'Whip Shader', p: P({ size: 26, opacity: 85, flow: 35, hardness: 25, spacing: 4, pressureSize: 45, pressureOpacity: 90, smoothing: 30 }) },
  { id: 'tat-smooth', cat: 'Tattoo', name: 'Smooth Black & Grey', p: P({ size: 50, opacity: 80, flow: 22, hardness: 0, spacing: 5, pressureSize: 20, pressureOpacity: 80, smoothing: 35 }) },
  { id: 'tat-pepper', cat: 'Tattoo', name: 'Pepper Shader', p: P({ size: 40, flow: 60, hardness: 100, spacing: 8, shape: 'speckle', scatter: 25, sizeJitter: 30, pressureOpacity: 60, smoothing: 10 }) },
  { id: 'tat-dots', cat: 'Tattoo', name: 'Dotwork', p: P({ size: 4, hardness: 100, spacing: 100, scatter: 70, sizeJitter: 45, pressureSize: 30, smoothing: 5 }) },
  { id: 'tat-pack', cat: 'Tattoo', name: 'Color Packer', p: P({ size: 40, hardness: 90, spacing: 4, pressureSize: 10, smoothing: 20 }) },

  { id: 'marker', cat: 'Markers', name: 'Chisel Marker', p: P({ size: 24, opacity: 70, hardness: 100, spacing: 4, shape: 'square', roundness: 55, angle: 30, smoothing: 30 }) },
  { id: 'mk-alcohol', cat: 'Markers', name: 'Alcohol Marker', p: P({ size: 26, opacity: 55, hardness: 85, spacing: 4, roundness: 60, angle: 45, smoothing: 30 }) },
  { id: 'mk-brushpen', cat: 'Markers', name: 'Brush Pen', p: P({ size: 14, hardness: 95, spacing: 3, pressureSize: 85, smoothing: 45 }) },
  { id: 'mk-fineliner', cat: 'Markers', name: 'Fine Liner', p: P({ size: 2, hardness: 100, spacing: 4, smoothing: 50 }) },
  { id: 'mk-felt', cat: 'Markers', name: 'Felt Tip', p: P({ size: 6, flow: 90, hardness: 90, spacing: 5, shape: 'chalk', smoothing: 25 }) },
  { id: 'mk-paint', cat: 'Markers', name: 'Paint Marker', p: P({ size: 12, hardness: 100, spacing: 3, smoothing: 30 }) },
  { id: 'mk-highlight', cat: 'Markers', name: 'Highlighter', p: P({ size: 30, opacity: 40, hardness: 100, spacing: 4, shape: 'square', roundness: 35, smoothing: 30 }) },
  { id: 'mk-dry', cat: 'Markers', name: 'Dried-Out Marker', p: P({ size: 20, flow: 70, hardness: 80, spacing: 6, shape: 'chalk', roundness: 50, angle: 30, smoothing: 20 }) },

  { id: 'soft', cat: 'Painting', name: 'Soft Round', p: P({ size: 44, opacity: 85, hardness: 30, spacing: 6, pressureSize: 55, smoothing: 25 }) },
  { id: 'pt-oil', cat: 'Painting', name: 'Oil Bristle', p: P({ size: 34, flow: 95, hardness: 100, spacing: 5, shape: 'bristle', follow: true, pressureSize: 50, smoothing: 30 }) },
  { id: 'bristle', cat: 'Painting', name: 'Dry Bristle', p: P({ size: 38, flow: 85, spacing: 6, shape: 'bristle', follow: true, pressureSize: 40, smoothing: 35, hardness: 100 }) },
  { id: 'pt-acrylic', cat: 'Painting', name: 'Acrylic Round', p: P({ size: 30, flow: 90, hardness: 80, spacing: 5, scatter: 3, sizeJitter: 10, pressureSize: 45, smoothing: 25 }) },
  { id: 'pt-gouache', cat: 'Painting', name: 'Gouache', p: P({ size: 28, opacity: 95, flow: 80, hardness: 70, spacing: 5, pressureSize: 35, pressureOpacity: 30, smoothing: 25 }) },
  { id: 'wash', cat: 'Painting', name: 'Watercolor Wash', p: P({ size: 56, opacity: 55, flow: 65, hardness: 12, spacing: 5, scatter: 4, sizeJitter: 10, pressureOpacity: 50, smoothing: 45 }) },
  { id: 'pt-wet', cat: 'Painting', name: 'Wet Watercolor', p: P({ size: 60, opacity: 40, flow: 40, hardness: 5, spacing: 5, scatter: 8, sizeJitter: 25, pressureOpacity: 60, smoothing: 40 }) },
  { id: 'pt-flat', cat: 'Painting', name: 'Flat Brush', p: P({ size: 30, flow: 90, hardness: 95, spacing: 4, shape: 'square', roundness: 22, follow: true, pressureSize: 35, smoothing: 30 }) },
  { id: 'pt-knife', cat: 'Painting', name: 'Palette Knife', p: P({ size: 40, hardness: 100, spacing: 3, shape: 'square', roundness: 14, follow: true, smoothing: 35 }) },

  { id: 'airbrush', cat: 'Airbrush & spray', name: 'Airbrush', p: P({ size: 70, hardness: 0, flow: 45, spacing: 6, pressureOpacity: 80, pressureSize: 20, smoothing: 20 }) },
  { id: 'ab-fine', cat: 'Airbrush & spray', name: 'Fine Airbrush', p: P({ size: 20, flow: 30, hardness: 0, spacing: 5, pressureOpacity: 85, pressureSize: 15, smoothing: 25 }) },
  { id: 'ab-hard', cat: 'Airbrush & spray', name: 'Hard Airbrush', p: P({ size: 50, flow: 50, hardness: 70, spacing: 5, pressureOpacity: 70, smoothing: 20 }) },
  { id: 'spray', cat: 'Airbrush & spray', name: 'Spray Can', p: P({ size: 64, flow: 70, spacing: 3, shape: 'speckle', scatter: 20, sizeJitter: 30, smoothing: 5 }) },
  { id: 'ab-graffiti', cat: 'Airbrush & spray', name: 'Graffiti Spray', p: P({ size: 50, flow: 85, hardness: 100, spacing: 3, shape: 'speckle', scatter: 10, sizeJitter: 10, pressureSize: 30, smoothing: 10 }) },

  { id: 'nib', cat: 'Lettering', name: 'Calligraphy Nib', p: P({ size: 18, hardness: 100, spacing: 3, roundness: 20, angle: 40, pressureSize: 20, smoothing: 35 }) },
  { id: 'lt-mono', cat: 'Lettering', name: 'Monoline', p: P({ size: 10, hardness: 100, spacing: 3, smoothing: 70 }) },
  { id: 'lt-script', cat: 'Lettering', name: 'Script Brush', p: P({ size: 16, hardness: 100, spacing: 3, pressureSize: 100, smoothing: 65 }) },
  { id: 'lt-chalk', cat: 'Lettering', name: 'Chalkboard', p: P({ size: 14, flow: 90, hardness: 80, spacing: 6, shape: 'chalk', smoothing: 60 }) },

  { id: 'dots', cat: 'Texture', name: 'Dot Stamp', p: P({ size: 30, hardness: 100, spacing: 100, sizeJitter: 40 }) },
  { id: 'tx-dotline', cat: 'Texture', name: 'Dot Line', p: P({ size: 10, hardness: 100, spacing: 100 }) },
  { id: 'tx-grain', cat: 'Texture', name: 'Grain', p: P({ size: 70, flow: 50, hardness: 100, spacing: 20, shape: 'speckle', scatter: 40, sizeJitter: 50 }) },
  { id: 'tx-fur', cat: 'Texture', name: 'Fur & Grass', p: P({ size: 22, flow: 85, hardness: 100, spacing: 8, shape: 'bristle', follow: true, angleJitter: 15, sizeJitter: 25, pressureSize: 50, smoothing: 15 }) },
  { id: 'tx-sponge', cat: 'Texture', name: 'Sponge', p: P({ size: 60, flow: 70, hardness: 100, spacing: 25, shape: 'speckle', scatter: 15, sizeJitter: 35, angleJitter: 100 }) }
];
function presetById(id) { return PRESETS.filter(function (p) { return p.id === id; })[0]; }
var SCHEMA = [
  ['size', 'Size', 1, 300, 'px', true], ['opacity', 'Opacity', 1, 100, '%'], ['flow', 'Flow', 1, 100, '%'],
  ['hardness', 'Hardness', 0, 100, '%'], ['spacing', 'Spacing', 1, 100, '%'], ['roundness', 'Roundness', 8, 100, '%'],
  ['angle', 'Angle', 0, 180, '°'], ['angleJitter', 'Angle jitter', 0, 100, '%'], ['scatter', 'Scatter', 0, 100, '%'],
  ['sizeJitter', 'Size jitter', 0, 100, '%'], ['pressureSize', 'Pen pressure changes size', 0, 100, '%'],
  ['pressureOpacity', 'Pen pressure changes opacity', 0, 100, '%'], ['smoothing', 'Stroke smoothing', 0, 100, '%']
];
var SHAPES = [['round', 'Round'], ['square', 'Square'], ['chalk', 'Chalk'], ['bristle', 'Bristle'], ['speckle', 'Speckle']];
var SWATCHES = ['#111418', '#3a3f47', '#6d7580', '#a5acb5', '#dfe3e8', '#ffffff', '#7a1f2b', '#c4342d', '#ef6a4c', '#f4a259', '#f6d365', '#d9e36a', '#2f6f3e', '#4fae6a', '#9bd9a0', '#0e6e72', '#2fb3b3', '#8fe0dc', '#1d3f8f', '#3a78d8', '#8db9f2', '#4a2b8c', '#8a5fd6', '#c7a8f0', '#8b2f6b', '#e2569b', '#f4a6c6', '#5b3a29', '#a36a42', '#e0b98f'];
// Built-in fonts, all free Google Fonts under the SIL Open Font License, so they can be used in any artwork.
// They load only when picked (loadFamily in text.js), so a long list costs nothing at startup.
var FONT_GROUPS = [
  ['Tattoo & blackletter', ['UnifrakturMaguntia', 'Pirata One', 'Grenze Gotisch', 'Germania One', 'Jacquard 24', 'New Rocker', 'Metal Mania']],
  ['Old school & western', ['Rye', 'Sancreek', 'Smokum', 'Ewert', 'Bowlby One SC', 'Shrikhand']],
  ['Script', ['Great Vibes', 'Alex Brush', 'Sacramento', 'Pinyon Script', 'Tangerine', 'Parisienne', 'Allura', 'Yellowtail', 'Kaushan Script', 'Mr Dafoe', 'Italianno', 'Monsieur La Doulaise', 'Herr Von Muellerhoff', 'Pacifico', 'Dancing Script', 'Satisfy', 'Lobster']],
  ['Stencil', ['Stardos Stencil', 'Allerta Stencil', 'Saira Stencil One', 'Big Shoulders Stencil Display', 'Black Ops One', 'Emblema One']],
  ['Graffiti & marker', ['Sedgwick Ave Display', 'Sedgwick Ave', 'Rubik Wet Paint', 'Permanent Marker', 'Rock Salt', 'Gochi Hand', 'Covered By Your Grace', 'Reenie Beanie', 'Gloria Hallelujah', 'Walter Turncoat', 'Finger Paint']],
  ['Handwriting', ['Caveat', 'Indie Flower', 'Shadows Into Light', 'Amatic SC']],
  ['Comic & display', ['Bangers', 'Luckiest Guy', 'Lilita One', 'Bungee', 'Bungee Shade', 'Creepster', 'Nosifer', 'Butcherman', 'Freckle Face', 'Fascinate', 'Rubik Glitch', 'Monoton', 'Righteous']],
  ['Classic & serif', ['Playfair Display', 'Cinzel', 'Cinzel Decorative', 'Abril Fatface', 'Cormorant Garamond', 'DM Serif Display', 'Uncial Antiqua', 'MedievalSharp', 'Almendra', 'IM Fell English']],
  ['Bold sans', ['Bebas Neue', 'Oswald', 'Anton', 'Archivo Black', 'Russo One', 'Teko', 'Syne']],
  ['Typewriter & mono', ['Special Elite', 'Space Mono', 'Courier Prime']],
  ['Pixel & retro', ['Press Start 2P', 'VT323', 'Silkscreen', 'Pixelify Sans', 'Tiny5', 'Orbitron', 'Audiowide']]
];
var BUILTIN_FONTS = [].concat.apply([], FONT_GROUPS.map(function (g) { return g[1]; }));

/* ---------- state ---------- */
var S = {
  tool: 'brush', color: '#222831', brush: P({}), base: P({}), brushId: 'pen', brushName: 'Drafting Pen', dirty: false,
  profile: null, messages: [],
  eraser: P({ size: 26, hardness: 85, spacing: 6, smoothing: 20 }),
  layers: [], active: null, view: { x: 0, y: 0, s: 1 }, penSeen: false, fingerDraws: false, userZoomed: false,
  doc: null, items: {}, itemsReady: false, homeAt: '', pxPen: { size: 1, opacity: 100 }, pxEraser: { size: 1, opacity: 100 },
  smudge: P({ size: 40, opacity: 60, hardness: 40 }), fill: { tolerance: 15, opacity: 100, allLayers: false },
  shape: { kind: 'rect', filled: false }, selKind: 'rect', sel: null,
  hsv: null, recent: [], saved: [], editColors: false, library: [], requests: [], myRequests: [], uploadedFonts: [], mine: [], sharedFonts: [], myFonts: [], myId: null, myName: '', canEdit: false,
  text: { str: 'Sketchroom', font: 'Caveat', size: 120, bold: false, italic: false }
};
var layerCount = 0;
var vp = $('#vp'), stage = $('#stage'), ring = $('#ring');
var overlay = document.createElement('canvas'); overlay.width = DOC_W; overlay.height = DOC_H;
var octx = overlay.getContext('2d');
var buffer = document.createElement('canvas'); buffer.width = DOC_W; buffer.height = DOC_H;
var bctx = buffer.getContext('2d');

/* ---------- helpers ---------- */
var toastTimer = 0;
function toast(msg) {
  var t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.classList.remove('show'); }, 2800);
}
function hexToRgb(h) {
  var m = /^#?([0-9a-f]{6})$/i.exec(h || '');
  if (!m) return [34, 40, 49];
  var n = parseInt(m[1], 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgbToHex(r, g, b) { return '#' + [r, g, b].map(function (v) { return ('0' + v.toString(16)).slice(-2); }).join(''); }
