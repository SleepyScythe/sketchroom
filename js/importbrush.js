/* Sketchroom: Reading brush files: Sketchroom's own .json, .brush / .brushset files from iPad painting apps, Photoshop .abr
   brushes, and plain pictures (which become a stamp brush). Brushes from other apps arrive as an approximation:
   the tip shape comes across, but grain textures and advanced settings don't.
   Plain script. Shares globals with the other files in js/; load order is set in index.html. */
'use strict';

var MAX_IMPORT = 100, TIP_MAX = 256;

/* ---------- unzip (fflate, loaded only when a zipped brush file is imported) ---------- */
var FFLATE_URL = 'https://cdn.jsdelivr.net/npm/fflate@0.8.2/umd/index.js';
var FFLATE_SRI = 'sha384-DT0Ls0mO7JmjTnT+oBuMhEJzYJO1zUqzuuMXNdnOmOQRIpN2BgSjvBV/j50NngIT';
var fflateLoading = null;
function loadFflate() {
  if (window.fflate) return Promise.resolve(window.fflate);
  if (!fflateLoading) {
    fflateLoading = new Promise(function (res, rej) {
      var s = document.createElement('script'); s.src = FFLATE_URL; s.integrity = FFLATE_SRI; s.crossOrigin = 'anonymous';
      s.onload = function () { if (window.fflate) res(window.fflate); else rej(new Error('unzip missing')); };
      s.onerror = function () { fflateLoading = null; rej(new Error('unzip failed to load')); };
      document.head.appendChild(s);
    });
  }
  return fflateLoading;
}

/* ---------- binary property lists (Apple's bplist00, used inside .brush files) ---------- */
function parseBplist(buf) {
  if (String.fromCharCode.apply(null, buf.subarray(0, 8)) !== 'bplist00') throw new Error('not a binary plist');
  var dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength), t = buf.length - 32;
  var readUInt = function (pos, n) { var v = 0; for (var i = 0; i < n; i++) v = v * 256 + buf[pos + i]; return v; };
  var offSize = buf[t + 6], refSize = buf[t + 7], num = readUInt(t + 8, 8), top = readUInt(t + 16, 8), table = readUInt(t + 24, 8);
  if (num > 200000) throw new Error('plist too large');
  var offsets = []; for (var i = 0; i < num; i++) offsets.push(readUInt(table + i * offSize, offSize));
  var lenAt = function (pos, info) {
    if (info !== 0xF) return { len: info, start: pos + 1 };
    var n = 1 << (buf[pos + 1] & 0xF); return { len: readUInt(pos + 2, n), start: pos + 2 + n };
  };
  var text = function (start, len, wide) {
    var s = ''; for (var j = 0; j < len; j++) s += String.fromCharCode(wide ? (buf[start + 2 * j] << 8) | buf[start + 2 * j + 1] : buf[start + j]);
    return s;
  };
  var obj = function (ref, depth) {
    if (depth > 64) throw new Error('plist too deep');
    var pos = offsets[ref], marker = buf[pos], type = marker >> 4, info = marker & 0xF, L, out, k;
    switch (type) {
      case 0x0: return info === 9 ? true : info === 8 ? false : null;
      case 0x1: { var n = 1 << info; return n === 8 ? dv.getInt32(pos + 1) * 4294967296 + dv.getUint32(pos + 5) : readUInt(pos + 1, n); }
      case 0x2: return info === 2 ? dv.getFloat32(pos + 1) : dv.getFloat64(pos + 1);
      case 0x3: return dv.getFloat64(pos + 1);
      case 0x4: L = lenAt(pos, info); return buf.subarray(L.start, L.start + L.len);
      case 0x5: L = lenAt(pos, info); return text(L.start, L.len, false);
      case 0x6: L = lenAt(pos, info); return text(L.start, L.len, true);
      case 0x8: return { $uid: readUInt(pos + 1, info + 1) };
      case 0xA: case 0xC:
        L = lenAt(pos, info); out = [];
        for (k = 0; k < L.len; k++) out.push(obj(readUInt(L.start + k * refSize, refSize), depth + 1));
        return out;
      case 0xD:
        L = lenAt(pos, info); out = {};
        for (k = 0; k < L.len; k++) out[obj(readUInt(L.start + k * refSize, refSize), depth + 1)] = obj(readUInt(L.start + (L.len + k) * refSize, refSize), depth + 1);
        return out;
    }
    return null;
  };
  return obj(top, 0);
}
// NSKeyedArchiver files keep their values in $objects and point at them with UIDs. Returns the root object's fields, resolved.
function unarchive(plist) {
  var objs = plist && plist.$objects, top = plist && plist.$top;
  if (!objs || !top) return plist || {};
  var res = function (v) { if (v && typeof v === 'object' && '$uid' in v) v = objs[v.$uid]; return v === '$null' ? null : v; };
  var root = res(top.root || top[Object.keys(top)[0]]) || {}, out = {};
  Object.keys(root).forEach(function (k) { out[k] = res(root[k]); });
  return out;
}

/* ---------- tip images ---------- */
// Turns any picture into a tip: white, with the shape in the alpha channel, at most 256 px.
// Pictures with transparency use their alpha. Otherwise brightness is the shape, flipped when the background is light,
// because a brush tip should be empty around its edges.
function tipFromCanvas(src, invert) {
  var sw = src.width, sh = src.height, k = Math.min(1, TIP_MAX / Math.max(sw, sh));
  var c = document.createElement('canvas'); c.width = Math.max(1, Math.round(sw * k)); c.height = Math.max(1, Math.round(sh * k));
  var g = c.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(src, 0, 0, c.width, c.height);
  var img = g.getImageData(0, 0, c.width, c.height), d = img.data, n = d.length / 4, seeThrough = 0;
  for (var i = 0; i < n; i++) if (d[i * 4 + 3] < 250) seeThrough++;
  var useAlpha = seeThrough > n * 0.02, lum = function (j) { return (d[j] * 0.299 + d[j + 1] * 0.587 + d[j + 2] * 0.114) * d[j + 3] / 255; };
  if (!useAlpha && invert == null) {
    var edge = 0, cnt = 0, W = c.width, H = c.height;
    for (var x = 0; x < W; x++) { edge += lum(x * 4) + lum(((H - 1) * W + x) * 4); cnt += 2; }
    for (var y = 0; y < H; y++) { edge += lum(y * W * 4) + lum((y * W + W - 1) * 4); cnt += 2; }
    invert = edge / cnt > 127;
  }
  var sum = 0;
  for (var p = 0; p < n; p++) {
    var j = p * 4, a = useAlpha ? d[j + 3] : lum(j);
    if (!useAlpha && invert) a = 255 - a;
    d[j] = d[j + 1] = d[j + 2] = 255; d[j + 3] = a; sum += a;
  }
  if (sum < 255) return null; // nothing there
  g.putImageData(img, 0, 0);
  return c.toDataURL('image/png');
}
async function tipFromBlob(blob, invert) {
  var bm = await createImageBitmap(blob), c = document.createElement('canvas'); c.width = bm.width; c.height = bm.height;
  c.getContext('2d').drawImage(bm, 0, 0); if (bm.close) bm.close();
  return tipFromCanvas(c, invert);
}
// 8-bit grayscale where 255 is paint (Photoshop sampled brushes).
function tipFromGray(w, h, data) {
  var c = document.createElement('canvas'); c.width = w; c.height = h;
  var g = c.getContext('2d'), img = g.createImageData(w, h);
  for (var i = 0; i < w * h; i++) { img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = 255; img.data[i * 4 + 3] = data[i]; }
  g.putImageData(img, 0, 0);
  return tipFromCanvas(c, false);
}
function imageBrush(name, tip, extra, src) {
  return { name: String(name || 'Imported brush').trim().slice(0, 40) || 'Imported brush',
    params: P(Object.assign({ size: 40, hardness: 100, spacing: 15, smoothing: 20, shape: 'image', tip: tip, src: src }, extra || {})) };
}

/* ---------- iPad painting app brushes (.brush = one brush, .brushset = several, both zip files) ---------- */
// The settings live in Brush.archive. Names and ranges are best guesses (most are 0..1), so they are clamped.
function mapPainterSettings(o) {
  var num = function (k, d) { var v = o[k]; return typeof v === 'number' && isFinite(v) ? v : d; };
  var pct = function (k, d) { return clamp(Math.round(num(k, d) * 100), 0, 100); };
  var maxSize = num('maxSize', 0), paintSize = num('paintSize', 0.3);
  var size = maxSize > 1 ? maxSize * clamp(paintSize, 0.05, 1) : 10 + clamp(paintSize, 0, 1) * 120;
  var rot = num('shapeRotation', 0); if (Math.abs(rot) <= 1) rot *= 360;
  return {
    size: clamp(Math.round(size), 2, 300),
    spacing: clamp(Math.round(num('plotSpacing', 0.15) * 100), 1, 100),
    scatter: pct('plotJitter', 0), smoothing: pct('plotSmoothing', 0.2), angleJitter: pct('shapeScatter', 0),
    angle: clamp(Math.round(((rot % 180) + 180) % 180), 0, 180),
    opacity: clamp(Math.round(num('maxOpacity', num('paintOpacity', 1)) * 100), 1, 100),
    pressureSize: pct('dynamicsPressureSize', 0.3), pressureOpacity: pct('dynamicsPressureOpacity', 0),
    sizeJitter: pct('dynamicsJitterSize', 0)
  };
}
async function readPainterZip(bytes, fileName) {
  var fflate = await loadFflate(), files = fflate.unzipSync(bytes), names = Object.keys(files), out = [];
  var archives = names.filter(function (n) { return /(^|\/)Brush\.archive$/.test(n); }).slice(0, MAX_IMPORT);
  for (var i = 0; i < archives.length; i++) {
    var dir = archives[i].replace(/Brush\.archive$/, ''), settings = {};
    try { settings = unarchive(parseBplist(files[archives[i]])); } catch (e) { settings = {}; }
    var shape = files[dir + 'Shape.png'], tip = null;
    if (shape) { try { tip = await tipFromBlob(new Blob([shape], { type: 'image/png' }), settings.shapeInverted === true ? true : null); } catch (e) { tip = null; } }
    var name = typeof settings.name === 'string' && settings.name.trim() ? settings.name : fileName.replace(/\.[^.]+$/, '') + (archives.length > 1 ? ' ' + (i + 1) : '');
    var mapped = mapPainterSettings(settings);
    if (tip) out.push(imageBrush(name, tip, mapped, 'painter'));
    else out.push({ name: name.slice(0, 40), params: P(Object.assign({ hardness: 90, src: 'painter' }, mapped)) });
  }
  return out;
}

/* ---------- Photoshop .abr (sampled brushes; versions 1, 2 and 6) ---------- */
function rleDecode(buf, pos, height, rowBytes) {
  var out = new Uint8Array(height * rowBytes), lens = [], o = 0;
  for (var i = 0; i < height; i++) { lens.push((buf[pos] << 8) | buf[pos + 1]); pos += 2; }
  for (var r = 0; r < height; r++) {
    var j = 0;
    while (j < lens[r]) {
      var n = buf[pos++]; j++;
      if (n >= 128) n -= 256;
      if (n < 0) {
        if (n === -128) continue;
        var ch = buf[pos++]; j++;
        for (var c = 0; c < 1 - n && o < out.length; c++) out[o++] = ch;
      } else {
        for (var c2 = 0; c2 < n + 1; c2++, j++) { if (o < out.length) out[o++] = buf[pos]; pos++; }
      }
    }
  }
  return out;
}
// Reads one sampled tip at pos: bounds, depth, compression, pixels.
function abrSample(buf, dv, pos) {
  var top = dv.getInt32(pos), left = dv.getInt32(pos + 4), bottom = dv.getInt32(pos + 8), right = dv.getInt32(pos + 12);
  var depth = dv.getUint16(pos + 16), comp = buf[pos + 18], w = right - left, h = bottom - top, bpp = depth >> 3;
  if (w <= 0 || h <= 0 || w > 5000 || h > 5000 || (bpp !== 1 && bpp !== 2)) return null;
  var data = comp ? rleDecode(buf, pos + 19, h, w * bpp) : buf.subarray(pos + 19, pos + 19 + w * h * bpp);
  if (bpp === 2) { var g = new Uint8Array(w * h); for (var i = 0; i < w * h; i++) g[i] = data[i * 2]; data = g; }
  return { w: w, h: h, data: data };
}
function readAbr(buf, fileName) {
  var dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength), version = dv.getUint16(0), sub = dv.getUint16(2), tips = [];
  var base = fileName.replace(/\.[^.]+$/, '');
  if (version === 1 || version === 2) {
    var p = 4;
    for (var i = 0; i < sub && p + 6 <= buf.length && tips.length < MAX_IMPORT; i++) {
      var type = dv.getUint16(p), size = dv.getUint32(p + 2), next = p + 6 + size, q = p + 6;
      if (type === 2) {
        q += 4; var spacing = dv.getUint16(q); q += 2; var name = '';
        if (version === 2) { var len = dv.getUint32(q); q += 4; for (var k = 0; k < len; k++) { var cc = dv.getUint16(q + k * 2); if (cc) name += String.fromCharCode(cc); } q += len * 2; }
        q += 1 + 8; // antialiasing, short bounds
        var s = abrSample(buf, dv, q); if (s) { s.name = name; s.spacing = spacing; tips.push(s); }
      }
      p = next;
    }
  } else if (version >= 6) {
    var p6 = 4, sampEnd = -1;
    while (p6 + 12 <= buf.length) {
      var sig = String.fromCharCode(buf[p6], buf[p6 + 1], buf[p6 + 2], buf[p6 + 3]), key = String.fromCharCode(buf[p6 + 4], buf[p6 + 5], buf[p6 + 6], buf[p6 + 7]);
      var len6 = dv.getUint32(p6 + 8); p6 += 12;
      if (sig !== '8BIM') break;
      if (key === 'samp') { sampEnd = p6 + len6; break; }
      p6 += len6;
    }
    if (sampEnd < 0) throw new Error('no sampled brushes');
    while (p6 + 4 <= sampEnd && tips.length < MAX_IMPORT) {
      var blen = dv.getUint32(p6); p6 += 4;
      var padded = blen; while (padded % 4) padded++;
      var next6 = p6 + padded, s6 = abrSample(buf, dv, p6 + (sub === 1 ? 47 : 301));
      if (s6) tips.push(s6);
      p6 = next6;
    }
  } else throw new Error('unknown .abr version');
  return tips.map(function (t, i) {
    var tip = tipFromGray(t.w, t.h, t.data);
    return tip ? imageBrush(t.name || base + (tips.length > 1 ? ' ' + (i + 1) : ''), tip, { spacing: clamp(t.spacing || 15, 1, 100), size: clamp(Math.max(t.w, t.h), 4, 300) }, 'abr') : null;
  }).filter(Boolean);
}

/* ---------- any brush file ---------- */
// Returns [{ name, params }]. Throws with a readable message if the file can't be used.
async function readBrushFile(file) {
  if (file.size > 60 * 1024 * 1024) throw new Error('That file is over 60 MB, too big to import.');
  var bytes = new Uint8Array(await file.arrayBuffer()), lower = file.name.toLowerCase();
  var is = function (sig) { for (var i = 0; i < sig.length; i++) if (bytes[i] !== sig[i]) return false; return true; };
  if (is([0x50, 0x4B, 0x03, 0x04])) {
    var list = await readPainterZip(bytes, file.name);
    if (!list.length) throw new Error('That zip file has no brushes in it.');
    return list;
  }
  if (/\.abr$/.test(lower)) {
    var abr = readAbr(bytes, file.name);
    if (!abr.length) throw new Error('No usable brush tips were found in that .abr file. Only sampled (picture) brushes can be imported.');
    return abr;
  }
  if (/^image\//.test(file.type) || is([0x89, 0x50, 0x4E, 0x47]) || is([0xFF, 0xD8, 0xFF])) {
    var tip = await tipFromBlob(new Blob([bytes], { type: file.type || 'image/png' }));
    if (!tip) throw new Error('That picture is empty, so it can\'t be a brush tip.');
    return [imageBrush(file.name.replace(/\.[^.]+$/, ''), tip, {}, 'image')];
  }
  var data = null;
  try { data = JSON.parse(new TextDecoder().decode(bytes)); } catch (e) { data = null; }
  if (data && Array.isArray(data.brushes)) {
    return data.brushes.slice(0, MAX_IMPORT).map(function (b) { b = b || {}; return { name: String(b.name || 'Brush').trim().slice(0, 40) || 'Brush', params: cleanParams(b.params) }; });
  }
  throw new Error('Sketchroom can read its own brush files, .brush and .brushset files, Photoshop .abr files, and PNG or JPG pictures.');
}
