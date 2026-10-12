/* Sketchroom: Generated art behind the library, in the site's theme colors. paintBackground(canvas, settings) fills the
   canvas. The seed drives every random choice, so the same settings always give the same picture (laid out for the
   canvas's size). tools/background-preview.html edits the settings live; library.js shows BG_LIBRARY (showLibraryBg).
   Self-contained on purpose (no other app files needed), so the preview page can load it on its own. */
'use strict';

var BG_COLORS = [
  ['Teal', '#56c4b4'], ['Deep teal', '#0f8f80'], ['Blue', '#3a78d8'], ['Indigo', '#5b6ad0'], ['Violet', '#8a5fd6'],
  ['Pink', '#e2569b'], ['Coral', '#e5604d'], ['Orange', '#f4a259'], ['Gold', '#d9a21b'], ['Green', '#4fae6a']
];
var BG_STYLES = [['flow', 'Flow strokes'], ['ribbons', 'Ribbons'], ['dabs', 'Marker dabs'], ['splatter', 'Ink splatter'], ['scribbles', 'Scribbles'], ['pixels', 'Pixel clusters']];
var BG_PLACES = [['all', 'Everywhere'], ['edges', 'Around the edges'], ['corners', 'Two corners'], ['top', 'Along the top'], ['bottom', 'Along the bottom'], ['sides', 'Left and right']];
// amount, size, strength, softness and shade are 0 to 100. shade is the page color laid over the art (used by the page, not here).
var BG_DEFAULT = { style: 'flow', colors: ['#56c4b4', '#5b6ad0', '#e5604d', '#d9a21b'], amount: 50, size: 50, strength: 45, softness: 0, place: 'edges', shade: 20, seed: 7 };
// The one on the site, behind the signed-in pages. The owner picked it in the preview on 2026-10-12.
var BG_LIBRARY = { style: 'flow', colors: ['#56c4b4', '#5b6ad0', '#e5604d', '#d9a21b', '#f4a259', '#e2569b', '#8a5fd6', '#3a78d8', '#4fae6a', '#0f8f80'],
  amount: 100, size: 100, strength: 100, softness: 0, place: 'edges', shade: 35, seed: 68199 };

function bgClamp(v, a, b) { v = Number(v); return Math.min(b, Math.max(a, isFinite(v) ? v : a)); }
// mulberry32: a small seeded random number generator.
function bgRandom(seed) {
  var a = (seed >>> 0) || 1;
  return function () {
    a = (a + 0x6D2B79F5) | 0;
    var t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// 2D gradient noise, about -0.7 to 0.7, smooth across space. Used for flowing directions and wobbly edges.
function bgNoise(R) {
  var p = new Uint8Array(512), i, j, t;
  for (i = 0; i < 256; i++) p[i] = i;
  for (i = 255; i > 0; i--) { j = Math.floor(R() * (i + 1)); t = p[i]; p[i] = p[j]; p[j] = t; }
  for (i = 0; i < 256; i++) p[i + 256] = p[i];
  var fade = function (v) { return v * v * v * (v * (v * 6 - 15) + 10); };
  var grad = function (hash, x, y) {
    switch (hash & 7) { case 0: return x + y; case 1: return y - x; case 2: return x - y; case 3: return -x - y; case 4: return x; case 5: return -x; case 6: return y; default: return -y; }
  };
  return function (x, y) {
    var X = Math.floor(x), Y = Math.floor(y); x -= X; y -= Y; X &= 255; Y &= 255;
    var u = fade(x), v = fade(y), a = p[X] + Y, b = p[X + 1] + Y;
    var top = grad(p[a], x, y) + u * (grad(p[b], x - 1, y) - grad(p[a], x, y));
    var bottom = grad(p[a + 1], x, y - 1) + u * (grad(p[b + 1], x - 1, y - 1) - grad(p[a + 1], x, y - 1));
    return top + v * (bottom - top);
  };
}
// A brush stroke along pts: a quick start, then thinning towards the end, filled as one shape so it has no seams.
function bgStroke(g, pts, width) {
  var n = pts.length, left = [], right = [], i;
  if (n < 2) return;
  for (i = 0; i < n; i++) {
    var a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    var dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1, t = i / (n - 1);
    var r = width / 2 * Math.min(1, t * 6 + 0.08) * (1 - t * 0.88);
    left.push([pts[i][0] - dy / len * r, pts[i][1] + dx / len * r]); right.push([pts[i][0] + dy / len * r, pts[i][1] - dx / len * r]);
  }
  g.beginPath(); g.moveTo(left[0][0], left[0][1]);
  for (i = 1; i < n; i++) g.lineTo(left[i][0], left[i][1]);
  for (i = n - 1; i >= 0; i--) g.lineTo(right[i][0], right[i][1]);
  g.closePath(); g.fill();
}
function bgBlob(g, cx, cy, r, R, N) {
  var n = 56, off = R() * 200;
  g.beginPath();
  for (var i = 0; i < n; i++) {
    var a = i / n * Math.PI * 2, rr = r * (1 + 0.45 * N(Math.cos(a) * 1.3 + off, Math.sin(a) * 1.3 + off));
    if (i) g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); else g.moveTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
  }
  g.closePath(); g.fill();
}

// Each style draws onto g (in CSS pixels, w × h). k: n (amount, 0 to 2), sz (size, 0.35 to 1.75), a (strength, 0 to 1),
// area (screen area compared with a 1280 × 800 laptop, so phones and big screens look about as busy).
var BG_PAINTERS = {
  flow: function (g, w, h, R, N, pick, k) {
    var count = Math.round(150 * k.n * k.area), sc = 0.0024 / k.sz, turn = R() * Math.PI * 2;
    for (var i = 0; i < count; i++) {
      var x = R() * w, y = R() * h, steps = 24 + Math.floor(R() * 60), step = 4 * k.sz, pts = [];
      for (var j = 0; j < steps; j++) {
        pts.push([x, y]);
        var an = N(x * sc, y * sc) * Math.PI * 2.2 + turn;
        x += Math.cos(an) * step; y += Math.sin(an) * step;
      }
      g.globalAlpha = k.a * (0.45 + R() * 0.55); g.fillStyle = pick();
      bgStroke(g, pts, (3 + R() * 10) * k.sz);
    }
  },
  ribbons: function (g, w, h, R, N, pick, k) {
    var count = Math.max(1, Math.round((1.5 + 4 * k.n) * Math.sqrt(k.area)));
    g.lineCap = 'round'; g.lineJoin = 'round';
    for (var i = 0; i < count; i++) {
      var across = R() < 0.6, x = across ? -60 : R() * w, y = across ? R() * h : -60;
      var an = (across ? 0 : Math.PI / 2) + (R() - 0.5) * 1.1, off = R() * 100, pts = [];
      for (var s = 0; s < 900; s++) {
        pts.push([x, y]);
        an += N(x * 0.0016 + off, y * 0.0016) * 0.09;
        x += Math.cos(an) * 6; y += Math.sin(an) * 6;
        if (s > 20 && (x < -80 || x > w + 80 || y < -80 || y > h + 80)) break;
      }
      var width = (36 + R() * 70) * k.sz, bristles = Math.round(8 + width / 4), twist = R() * 10, rate = 0.006 + R() * 0.012;
      g.strokeStyle = pick(); g.lineWidth = Math.max(0.8, width / bristles * 0.8);
      for (var b = 0; b < bristles; b++) {
        var o = b / (bristles - 1) - 0.5 + (R() - 0.5) * 0.06;
        g.globalAlpha = k.a * (0.3 + R() * 0.45);
        g.beginPath();
        for (var j = 0; j < pts.length; j++) {
          var p = pts[j], q = pts[Math.min(pts.length - 1, j + 1)], pp = pts[Math.max(0, j - 1)];
          var dx = q[0] - pp[0], dy = q[1] - pp[1], L = Math.hypot(dx, dy) || 1;
          var ww = width * (0.25 + 0.75 * Math.abs(Math.sin(j * rate + twist))); // the ribbon twists as it travels
          var X = p[0] - dy / L * o * ww, Y = p[1] + dx / L * o * ww;
          if (j) g.lineTo(X, Y); else g.moveTo(X, Y);
        }
        g.stroke();
      }
    }
  },
  dabs: function (g, w, h, R, N, pick, k) {
    var count = Math.round(280 * k.n * k.area);
    g.lineCap = 'round';
    for (var i = 0; i < count; i++) {
      var x = R() * w, y = R() * h, an = N(x * 0.002, y * 0.002) * 3 + R() * 0.7, len = (6 + R() * 28) * k.sz;
      g.globalAlpha = k.a * (0.35 + R() * 0.65); g.strokeStyle = pick(); g.lineWidth = (5 + R() * 10) * k.sz;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(an) * len, y + Math.sin(an) * len); g.stroke();
    }
  },
  splatter: function (g, w, h, R, N, pick, k) {
    var count = Math.max(1, Math.round(14 * k.n * k.area));
    for (var i = 0; i < count; i++) {
      var cx = R() * w, cy = R() * h, r = (12 + R() * 38) * k.sz;
      g.fillStyle = pick(); g.globalAlpha = k.a * (0.55 + R() * 0.45);
      bgBlob(g, cx, cy, r, R, N);
      var drops = 8 + Math.floor(R() * 28);
      for (var d = 0; d < drops; d++) {
        var an = R() * Math.PI * 2, f = Math.pow(R(), 1.6), dist = r * (1.15 + f * 3.4), rr = r * (0.04 + R() * 0.14) * (1.3 - f);
        g.beginPath(); g.arc(cx + Math.cos(an) * dist, cy + Math.sin(an) * dist, Math.max(0.7, rr), 0, Math.PI * 2); g.fill();
      }
      // A streak or two flicked out of the blot.
      for (var s = Math.floor(R() * 3); s > 0; s--) {
        var sa = R() * Math.PI * 2, sl = r * (2 + R() * 3), pts = [];
        for (var t = 0; t <= 12; t++) pts.push([cx + Math.cos(sa) * (r * 0.6 + sl * t / 12), cy + Math.sin(sa) * (r * 0.6 + sl * t / 12)]);
        bgStroke(g, pts, r * 0.35);
      }
    }
  },
  scribbles: function (g, w, h, R, N, pick, k) {
    var count = Math.max(1, Math.round(18 * k.n * k.area));
    g.lineCap = 'round'; g.lineJoin = 'round';
    for (var i = 0; i < count; i++) {
      var x = R() * w, y = R() * h, an = R() * Math.PI * 2, steps = 120 + Math.floor(R() * 260), sp = 2.6 * k.sz, off = R() * 100, base = 0.12 + R() * 0.12;
      g.strokeStyle = pick(); g.lineWidth = (1 + R() * 1.8) * Math.sqrt(k.sz); g.globalAlpha = k.a * (0.5 + R() * 0.5);
      g.beginPath(); g.moveTo(x, y);
      for (var j = 0; j < steps; j++) {
        an += base + 0.3 * Math.sin(j * 0.07 + off) + 0.25 * N(j * 0.04, off); // loops that unwind and wind again
        x += Math.cos(an) * sp; y += Math.sin(an) * sp;
        g.lineTo(x, y);
      }
      g.stroke();
    }
  },
  pixels: function (g, w, h, R, N, pick, k) {
    var cell = Math.max(4, Math.round(10 * k.sz)), gap = Math.max(1, Math.round(cell * 0.12));
    var cols = Math.ceil(w / cell), rows = Math.ceil(h / cell), clusters = Math.round(46 * k.n * k.area);
    for (var i = 0; i < clusters; i++) {
      var cx = Math.floor(R() * cols), cy = Math.floor(R() * rows), n = 5 + Math.floor(R() * 40);
      g.fillStyle = pick();
      for (var j = 0; j < n; j++) {
        g.globalAlpha = k.a * (0.3 + R() * 0.7);
        g.fillRect(cx * cell, cy * cell, cell - gap, cell - gap);
        var d = Math.floor(R() * 4);
        if (d === 0) cx++; else if (d === 1) cx--; else if (d === 2) cy++; else cy--;
      }
    }
  }
};

// Keeps the art where it was asked for by fading it out elsewhere (a mask drawn with destination-in).
function bgPlacement(g, w, h, dpr, place) {
  if (place === 'all' || !BG_PLACES.some(function (p) { return p[0] === place; })) return;
  var m = document.createElement('canvas'); m.width = g.canvas.width; m.height = g.canvas.height;
  var c = m.getContext('2d'), rad = Math.hypot(w, h) / 2, gr;
  c.scale(dpr, dpr);
  var radial = function (x, y, r0, r1, inner, outer) {
    var q = c.createRadialGradient(x, y, r0, x, y, r1); q.addColorStop(0, inner); q.addColorStop(1, outer); c.fillStyle = q; c.fillRect(0, 0, w, h);
  };
  if (place === 'edges') radial(w / 2, h / 2, rad * 0.2, rad, 'rgba(0,0,0,0.06)', '#000');
  else if (place === 'corners') {
    c.globalCompositeOperation = 'lighter';
    radial(0, 0, 0, rad * 1.05, '#000', 'rgba(0,0,0,0)'); radial(w, h, 0, rad * 1.05, '#000', 'rgba(0,0,0,0)');
  } else {
    var vertical = place === 'top' || place === 'bottom';
    gr = vertical ? c.createLinearGradient(0, 0, 0, h) : c.createLinearGradient(0, 0, w, 0);
    if (place === 'top') { gr.addColorStop(0, '#000'); gr.addColorStop(0.7, 'rgba(0,0,0,0)'); }
    else if (place === 'bottom') { gr.addColorStop(0.3, 'rgba(0,0,0,0)'); gr.addColorStop(1, '#000'); }
    else { gr.addColorStop(0, '#000'); gr.addColorStop(0.38, 'rgba(0,0,0,0.04)'); gr.addColorStop(0.62, 'rgba(0,0,0,0.04)'); gr.addColorStop(1, '#000'); }
    c.fillStyle = gr; c.fillRect(0, 0, w, h);
  }
  g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = 'destination-in'; g.drawImage(m, 0, 0); g.restore();
}

// Draws the art at the canvas's displayed size. The page lays the shade over it (its own background color at shade %).
function paintBackground(cv, settings) {
  var s = Object.assign({}, BG_DEFAULT, settings || {});
  var dpr = Math.min(2, window.devicePixelRatio || 1), w = Math.max(1, cv.clientWidth), h = Math.max(1, cv.clientHeight);
  cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
  var g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
  var R = bgRandom(Math.round(bgClamp(s.seed, 1, 999999)) * 9973 + 17), N = bgNoise(R);
  var colors = (Array.isArray(s.colors) ? s.colors : []).filter(function (c) { return /^#[0-9a-f]{6}$/i.test(c); });
  if (!colors.length) colors = [BG_DEFAULT.colors[0]];
  var pick = function () { return colors[Math.floor(R() * colors.length)]; };
  var k = { n: bgClamp(s.amount, 0, 100) / 50, sz: 0.35 + bgClamp(s.size, 0, 100) / 100 * 1.4, a: bgClamp(s.strength, 0, 100) / 100, area: Math.max(0.3, w * h / (1280 * 800)) };
  (BG_PAINTERS[s.style] || BG_PAINTERS.flow)(g, w, h, R, N, pick, k);
  g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  bgPlacement(g, w, h, dpr, s.place);
  cv.style.filter = s.softness > 0 ? 'blur(' + (bgClamp(s.softness, 0, 100) / 100 * 12).toFixed(1) + 'px)' : '';
}
