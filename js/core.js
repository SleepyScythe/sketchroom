/* Sketchroom: Constants, DOM helpers and icons.
   Plain script. Shares globals with the other files in js/; load order is set in index.html. */
'use strict';

var DOC_W = 1600, DOC_H = 1200;
var $ = function (s, r) { return (r || document).querySelector(s); };
var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
var clamp = function (v, a, b) { return Math.min(b, Math.max(a, v)); };
var uid = function () { return Math.random().toString(36).slice(2, 10); };
var cssVar = function (n) { return getComputedStyle(document.documentElement).getPropertyValue(n).trim(); };
// Gives a canvas a bitmap the size it shows at (inside any border), at the screen's pixel density, so what's drawn isn't
// stretched and lands under the pen. Resizing clears the canvas, so it only resizes when the size changed (returns true).
function fitCanvas(cv) {
  var d = window.devicePixelRatio || 1, w = Math.round(cv.clientWidth * d), h = Math.round(cv.clientHeight * d);
  if (!w || !h || (cv.width === w && cv.height === h)) return false;
  cv.width = w; cv.height = h; return true;
}


/* ---------- icons ---------- */
var ICONS = {
  pen: ['M12 20h9', 'M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z'],
  eraser: ['m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21', 'M22 21H7', 'm5 11 9 9'],
  type: ['M4 7V4h16v3', 'M9 20h6', 'M12 4v16'],
  pipette: ['m2 22 1-1h3l9-9', 'M3 21v-3l9-9', 'm15 6 3.4-3.4a2.1 2.1 0 1 1 3 3L18 9l.4.4a2.1 2.1 0 1 1-3 3l-3.8-3.8a2.1 2.1 0 1 1 3-3l.4.4Z'],
  hand: ['M18 11V6a2 2 0 0 0-4 0', 'M14 10V4a2 2 0 0 0-4 0v2', 'M10 10.5V6a2 2 0 0 0-4 0v8', 'M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15'],
  undo: ['M3 7v6h6', 'M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13'],
  redo: ['M21 7v6h-6', 'M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3L21 13'],
  eye: ['M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z', 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z'],
  eyeoff: ['M9.9 4.24A9.1 9.1 0 0 1 12 4c7 0 10 8 10 8a13.2 13.2 0 0 1-1.67 2.68', 'M6.61 6.61A13.5 13.5 0 0 0 2 12s3 8 10 8a9.7 9.7 0 0 0 5.39-1.61', 'M2 2l20 20'],
  plus: ['M12 5v14', 'M5 12h14'],
  minus: ['M5 12h14'],
  copy: ['M8 8h12v12H8z', 'M4 16V4h12'],
  trash: ['M3 6h18', 'M8 6V4h8v2', 'M6 6l1 14h10l1-14'],
  up: ['m6 15 6-6 6 6'],
  down: ['m6 9 6 6 6-6'],
  x: ['M6 6l12 12', 'M18 6 6 18'],
  edit: ['M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z'],
  smudge: ['M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7Z', 'M9 15c0 1.7 1.3 3 3 3'],
  fill: ['m19 11-8-8-8.6 8.6a2 2 0 0 0 0 2.8l5.2 5.2c.8.8 2 .8 2.8 0L19 11Z', 'm5 2 5 5', 'M2 13h15', 'M22 20a2 2 0 1 1-4 0c0-1.6 1.7-2.4 2-4 .3 1.6 2 2.4 2 4Z'],
  line: ['M4 20 20 4'],
  shapes: ['M3 13h8v8H3z', 'M17 3l4.5 8h-9z', 'M13.5 17.5a3.5 3.5 0 1 0 7 0 3.5 3.5 0 1 0-7 0'],
  select: ['M5 3a2 2 0 0 0-2 2', 'M19 3a2 2 0 0 1 2 2', 'M21 19a2 2 0 0 1-2 2', 'M5 21a2 2 0 0 1-2-2', 'M9 3h1', 'M9 21h1', 'M14 3h1', 'M14 21h1', 'M3 9v1', 'M21 9v1', 'M3 14v1', 'M21 14v1'],
  lock: ['M5 11h14v10H5z', 'M8 11V7a4 4 0 0 1 8 0v4'],
  unlock: ['M5 11h14v10H5z', 'M8 11V7a4 4 0 0 1 7.7-1.5'],
  merge: ['M12 3v11', 'm7 9 5 5 5-5', 'M5 20h14'],
  back: ['M19 12H5', 'm12 19-7-7 7-7'],
  layers: ['m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z', 'm22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65', 'm22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65'],
  brush: ['m9.06 11.9 8.07-8.06a2.85 2.85 0 1 1 4.03 4.03l-8.06 8.08', 'M7.07 14.94c-1.66 0-3 1.35-3 3.02 0 1.33-2.5 1.52-2 2.02 1.08 1.1 2.49 2.02 4 2.02 2.2 0 4-1.8 4-4.04a3.01 3.01 0 0 0-3-3.02z'],
  share: ['M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2', 'M9 3a4 4 0 1 0 0 8 4 4 0 1 0 0-8Z', 'M19 8v6', 'M22 11h-6'],
  finger: ['M22 14a8 8 0 0 1-8 8', 'M18 11v-1a2 2 0 0 0-2-2a2 2 0 0 0-2 2', 'M14 10V9a2 2 0 0 0-2-2a2 2 0 0 0-2 2v1', 'M10 9.5V4a2 2 0 0 0-2-2a2 2 0 0 0-2 2v10', 'M18 11a2 2 0 1 1 4 0v3a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15'],
  library: ['M3 3h7v7H3z', 'M14 3h7v7h-7z', 'M14 14h7v7h-7z', 'M3 14h7v7H3z'],
  folder: ['M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z'],
  project: ['M3 8h18v12H3z', 'M8 8V5h8v3', 'M3 13h18'],
  more: ['M5 11.2a.8.8 0 1 0 0 1.6.8.8 0 1 0 0-1.6Z', 'M12 11.2a.8.8 0 1 0 0 1.6.8.8 0 1 0 0-1.6Z', 'M19 11.2a.8.8 0 1 0 0 1.6.8.8 0 1 0 0-1.6Z']
};
function icon(n, size) {
  var s = size || 20;
  return '<svg viewBox="0 0 24 24" width="' + s + '" height="' + s + '" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    ICONS[n].map(function (d) { return '<path d="' + d + '"/>'; }).join('') + '</svg>';
}
$$('[data-icon]').forEach(function (b) { b.innerHTML = icon(b.getAttribute('data-icon')); });
