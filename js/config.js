/* Sketchroom: Brush presets and settings schema, app state, small helpers.
   Plain script. Shares globals with the other files in js/; load order is set in index.html. */
'use strict';

/* ---------- brush data ---------- */
var BASE = { size: 20, opacity: 100, flow: 100, hardness: 80, spacing: 8, roundness: 100, angle: 0, angleJitter: 0, scatter: 0, sizeJitter: 0, pressureSize: 0, pressureOpacity: 0, smoothing: 0, shape: 'round', follow: false };
function P(o) { var r = {}; for (var k in BASE) r[k] = BASE[k]; for (var j in o) r[j] = o[j]; return r; }
var PRESETS = [
  { id: 'pencil', name: 'Graphite Pencil', p: P({ size: 5, opacity: 90, flow: 60, hardness: 75, spacing: 7, shape: 'chalk', pressureSize: 35, pressureOpacity: 75, smoothing: 8 }) },
  { id: 'pen', name: 'Technical Pen', p: P({ size: 3, hardness: 100, spacing: 5, pressureSize: 25, smoothing: 45 }) },
  { id: 'ink', name: 'Ink Brush', p: P({ size: 16, hardness: 92, spacing: 4, pressureSize: 90, smoothing: 55 }) },
  { id: 'nib', name: 'Calligraphy Nib', p: P({ size: 18, hardness: 100, spacing: 3, roundness: 20, angle: 40, pressureSize: 20, smoothing: 35 }) },
  { id: 'marker', name: 'Chisel Marker', p: P({ size: 24, opacity: 70, hardness: 100, spacing: 4, shape: 'square', roundness: 55, angle: 30, smoothing: 30 }) },
  { id: 'airbrush', name: 'Airbrush', p: P({ size: 70, hardness: 0, flow: 45, spacing: 6, pressureOpacity: 80, pressureSize: 20, smoothing: 20 }) },
  { id: 'soft', name: 'Soft Round', p: P({ size: 44, opacity: 85, hardness: 30, spacing: 6, pressureSize: 55, smoothing: 25 }) },
  { id: 'charcoal', name: 'Charcoal', p: P({ size: 30, flow: 70, hardness: 60, spacing: 9, shape: 'chalk', scatter: 10, sizeJitter: 20, pressureSize: 50, pressureOpacity: 60, smoothing: 10 }) },
  { id: 'bristle', name: 'Dry Bristle', p: P({ size: 38, flow: 85, spacing: 6, shape: 'bristle', follow: true, pressureSize: 40, smoothing: 35, hardness: 100 }) },
  { id: 'spray', name: 'Spray Can', p: P({ size: 64, flow: 70, spacing: 3, shape: 'speckle', scatter: 20, sizeJitter: 30, smoothing: 5 }) },
  { id: 'wash', name: 'Watercolor Wash', p: P({ size: 56, opacity: 55, flow: 65, hardness: 12, spacing: 5, scatter: 4, sizeJitter: 10, pressureOpacity: 50, smoothing: 45 }) },
  { id: 'dots', name: 'Dot Stamp', p: P({ size: 30, hardness: 100, spacing: 100, sizeJitter: 40 }) }
];
var SCHEMA = [
  ['size', 'Size', 1, 300, 'px', true], ['opacity', 'Opacity', 1, 100, '%'], ['flow', 'Flow', 1, 100, '%'],
  ['hardness', 'Hardness', 0, 100, '%'], ['spacing', 'Spacing', 1, 100, '%'], ['roundness', 'Roundness', 8, 100, '%'],
  ['angle', 'Angle', 0, 180, '°'], ['angleJitter', 'Angle jitter', 0, 100, '%'], ['scatter', 'Scatter', 0, 100, '%'],
  ['sizeJitter', 'Size jitter', 0, 100, '%'], ['pressureSize', 'Pen pressure changes size', 0, 100, '%'],
  ['pressureOpacity', 'Pen pressure changes opacity', 0, 100, '%'], ['smoothing', 'Stroke smoothing', 0, 100, '%']
];
var SHAPES = [['round', 'Round'], ['square', 'Square'], ['chalk', 'Chalk'], ['bristle', 'Bristle'], ['speckle', 'Speckle']];
var SWATCHES = ['#111418', '#3a3f47', '#6d7580', '#a5acb5', '#dfe3e8', '#ffffff', '#7a1f2b', '#c4342d', '#ef6a4c', '#f4a259', '#f6d365', '#d9e36a', '#2f6f3e', '#4fae6a', '#9bd9a0', '#0e6e72', '#2fb3b3', '#8fe0dc', '#1d3f8f', '#3a78d8', '#8db9f2', '#4a2b8c', '#8a5fd6', '#c7a8f0', '#8b2f6b', '#e2569b', '#f4a6c6', '#5b3a29', '#a36a42', '#e0b98f'];
var BUILTIN_FONTS = ['Caveat', 'Permanent Marker', 'Pacifico', 'Bebas Neue', 'Playfair Display', 'Lobster', 'Press Start 2P', 'Special Elite', 'Abril Fatface', 'Cinzel', 'Shadows Into Light', 'Oswald', 'Indie Flower', 'Dancing Script', 'Righteous', 'Bangers', 'Amatic SC', 'Rock Salt', 'Satisfy', 'Anton', 'Archivo Black', 'Monoton', 'Cormorant Garamond', 'DM Serif Display', 'Syne', 'Space Mono'];

/* ---------- state ---------- */
var S = {
  tool: 'brush', color: '#222831', brush: P({}), base: P({}), brushId: 'pen', brushName: 'Technical Pen', dirty: false,
  eraser: P({ size: 26, hardness: 85, spacing: 6, smoothing: 20 }),
  layers: [], active: null, view: { x: 0, y: 0, s: 1 }, penSeen: false, fingerDraws: false, userZoomed: false,
  recent: [], library: [], mine: [], sharedFonts: [], myFonts: [], myId: null, myName: '', canEdit: false,
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
