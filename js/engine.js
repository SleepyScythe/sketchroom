/* Sketchroom: Brush tips and the stroke engine.
   Plain script. Shares globals with the other files in js/; load order is set in index.html. */
'use strict';

/* ---------- brush tips and stroke engine ---------- */
function makeTips(b, rgb, nominal) {
  var T = clamp(Math.ceil(nominal * 1.5), 8, 256), R = T / 2 - 1, rn = clamp(b.roundness, 8, 100) / 100;
  var many = b.shape === 'chalk' || b.shape === 'bristle' || b.shape === 'speckle';
  var n = many ? 6 : 1, out = [];
  function col(a) { return 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',' + a + ')'; }
  var h = clamp(b.hardness, 0, 100) / 100;
  for (var i = 0; i < n; i++) {
    var c = document.createElement('canvas'); c.width = c.height = T;
    var x = c.getContext('2d');
    x.translate(T / 2, T / 2); x.scale(1, rn);
    var soft = function () {
      if (h >= 0.99) { x.fillStyle = col(1); x.beginPath(); x.arc(0, 0, R, 0, 6.2832); x.fill(); return; }
      var g = x.createRadialGradient(0, 0, 0, 0, 0, R), hh = h * 0.96;
      g.addColorStop(0, col(1)); g.addColorStop(hh, col(1));
      g.addColorStop(hh + (1 - hh) * 0.5, col(0.35)); g.addColorStop(1, col(0));
      x.fillStyle = g; x.fillRect(-R, -R / rn, R * 2, (R * 2) / rn);
    };
    if (b.shape === 'square') {
      x.fillStyle = col(1); x.fillRect(-R * 0.9, -R * 0.9, R * 1.8, R * 1.8);
    } else if (b.shape === 'chalk') {
      soft(); x.setTransform(1, 0, 0, 1, 0, 0);
      var id = x.getImageData(0, 0, T, T), d = id.data;
      for (var j = 3; j < d.length; j += 4) { var r = Math.random(); d[j] = d[j] * (r < 0.5 ? 1 : (r < 0.8 ? 0.35 : 0.05)); }
      x.putImageData(id, 0, 0);
    } else if (b.shape === 'bristle') {
      var nb = Math.round(clamp(T / 3, 8, 60));
      for (var k = 0; k < nb; k++) {
        var y = (Math.random() * 2 - 1) * R, half = Math.sqrt(Math.max(0, R * R - y * y));
        x.lineWidth = Math.max(0.8, T / 48) * (0.6 + Math.random());
        x.strokeStyle = col(0.45 + Math.random() * 0.55);
        x.beginPath(); x.moveTo(-half, y); x.lineTo(half, y); x.stroke();
      }
    } else if (b.shape === 'speckle') {
      var cnt = Math.round(T * T * 0.05);
      for (var q = 0; q < cnt; q++) {
        var rr = R * Math.sqrt(Math.random()), th = Math.random() * 6.2832;
        x.fillStyle = col(0.3 + Math.random() * 0.7);
        x.beginPath(); x.arc(Math.cos(th) * rr, Math.sin(th) * rr, (0.5 + Math.random() * 1.2) * (T / 80 + 0.6), 0, 6.2832); x.fill();
      }
    } else { soft(); }
    out.push(c);
  }
  return out;
}

function Engine(ctx, b, color, sc, alphaMul) {
  this.ctx = ctx; this.b = b; this.sc = sc || 1; this.alphaMul = alphaMul == null ? 1 : alphaMul;
  this.nominal = Math.max(0.5, b.size * this.sc);
  this.tips = makeTips(b, hexToRgb(color), this.nominal);
  this.randRot = (b.shape === 'chalk' || b.shape === 'speckle') && !b.follow;
  this.norm = b.shape === 'round' || b.shape === 'square' || b.shape === 'chalk';
  this.s = null; this.l = null; this.carry = 0;
  this.bb = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
}
Engine.prototype.sizeMul = function (p) { return 1 - this.b.pressureSize / 100 * (1 - p); };
Engine.prototype.stepFor = function (p) { return Math.max(0.7, this.nominal * this.sizeMul(p) * this.b.spacing / 100); };
Engine.prototype.add = function (x, y, p) {
  var b = this.b;
  if (!this.s) {
    this.s = { x: x, y: y, p: p }; this.l = { x: x, y: y, p: p };
    this.stamp(x, y, p, 0); this.carry = this.stepFor(p); return;
  }
  var k = 1 - clamp(b.smoothing, 0, 100) / 100 * 0.9, s = this.s;
  s.x += (x - s.x) * k; s.y += (y - s.y) * k; s.p += (p - s.p) * Math.max(k, 0.35);
  var l = this.l, dx = s.x - l.x, dy = s.y - l.y, d = Math.hypot(dx, dy);
  if (d < 0.01) return;
  var ang = Math.atan2(dy, dx), pos = this.carry;
  while (pos <= d) {
    var t = pos / d, pp = l.p + (s.p - l.p) * t;
    this.stamp(l.x + dx * t, l.y + dy * t, pp, ang);
    pos += this.stepFor(pp);
  }
  this.carry = pos - d; this.l = { x: s.x, y: s.y, p: s.p };
};
Engine.prototype.finish = function (raw) {
  if (!this.s || !raw) return;
  for (var i = 0; i < 40; i++) {
    this.add(raw.x, raw.y, raw.p);
    if (Math.hypot(this.s.x - raw.x, this.s.y - raw.y) < 0.5) break;
  }
};
Engine.prototype.stamp = function (x, y, p, ang) {
  var b = this.b, ctx = this.ctx;
  var size = this.nominal * this.sizeMul(p);
  if (b.sizeJitter) size *= 1 - b.sizeJitter / 100 * Math.random() * 0.9;
  if (size < 0.3) return;
  var A = b.flow / 100 * (1 - b.pressureOpacity / 100 * (1 - p)) * this.alphaMul, a = A;
  if (A <= 0.002) return;
  if (this.norm && A < 0.995) {
    /* Spread the target opacity across the stamps that overlap each pixel, so pressure shows instead of piling up to solid. */
    var ratio = Math.min(1, Math.max(0.7 / size, b.spacing / 100));
    a = 1 - Math.pow(1 - A, ratio);
  }
  var px = x, py = y;
  if (b.scatter) { var rad = b.scatter / 100 * size * Math.random() * 1.2, th = Math.random() * 6.2832; px += Math.cos(th) * rad; py += Math.sin(th) * rad; }
  var rot = b.angle * Math.PI / 180;
  if (b.angleJitter) rot += (Math.random() - 0.5) * 2 * Math.PI * b.angleJitter / 100;
  if (b.follow) rot += ang; else if (this.randRot) rot += Math.random() * 6.2832;
  var tip = this.tips[(Math.random() * this.tips.length) | 0];
  var c = Math.cos(rot), s = Math.sin(rot);
  ctx.setTransform(c, s, -s, c, px, py);
  ctx.globalAlpha = a;
  ctx.drawImage(tip, -size / 2, -size / 2, size, size);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  var r = size * (0.6 + b.scatter / 100 * 1.2) + 2, bb = this.bb;
  if (px - r < bb.x0) bb.x0 = px - r; if (py - r < bb.y0) bb.y0 = py - r;
  if (px + r > bb.x1) bb.x1 = px + r; if (py + r > bb.y1) bb.y1 = py + r;
};

function drawPreview(canvas, b, color) {
  var w = canvas.width, h = canvas.height, g = canvas.getContext('2d');
  g.clearRect(0, 0, w, h);
  var sc = Math.min(w / 200, (h * 0.62) / Math.max(b.size, 1));
  g.globalAlpha = 1;
  var e = new Engine(g, b, color, sc, 1), N = 70;
  var raw = null;
  for (var i = 0; i <= N; i++) {
    var t = i / N, x = w * 0.08 + t * w * 0.84, y = h / 2 + Math.sin(t * Math.PI * 2) * h * 0.2;
    raw = { x: x, y: y, p: 0.2 + 0.8 * Math.pow(Math.sin(t * Math.PI), 0.8) };
    e.add(raw.x, raw.y, raw.p);
  }
  e.finish(raw);
  g.globalAlpha = 1;
}
