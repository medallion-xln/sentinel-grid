/* AZL binary weight codec ("AZLW").
 * Layout (little-endian):
 *   magic "AZLW" (4) | fmtVersion u16 | flags u16 | modelName len u8 + utf8
 *   | archVersion u32 | weightVersion u32 | tensorCount u16
 *   | per tensor: nameLen u8 + utf8, dtype u8 (0=f32,1=f16), ndim u8, dims u32*,
 *                 byteOffset u32, byteLen u32
 *   | payloadLen u32 | payload bytes | crc32(payload) u32
 * Atomic activation: parse -> shape+finite validation -> checksum -> swap. */
(function (g) {
  'use strict';
  var AZL = g.AZL, U = AZL.Util;
  var W = AZL.Weights = {};
  var CRC_T = (function () { var t = new Uint32Array(256); for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); t[n] = c >>> 0; } return t; })();
  W.crc32 = function (bytes) { var c = 0xFFFFFFFF; for (var i = 0; i < bytes.length; i++) c = CRC_T[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  // IEEE754 half helpers
  W.f32toF16 = function (val) {
    var f = new Float32Array(1), iv = new Uint32Array(f.buffer); f[0] = val;
    var x = iv[0], sign = (x >>> 16) & 0x8000, m = (x >>> 12) & 0x07FF, e = (x >>> 23) & 0xFF;
    if (e < 103) return sign;
    if (e > 142) return sign | 0x7C00 | ((e === 255 && (x & 0x7FFFFF)) ? 1 : 0);
    if (e < 113) { m |= 0x0800; return sign | ((m >> (114 - e)) + ((m >> (113 - e)) & 1)); }
    return sign | ((e - 112) << 10) | (m >> 1) | (m & 1);
  };
  W.f16toF32 = function (h) {
    var s = (h & 0x8000) >> 15, e = (h & 0x7C00) >> 10, f = h & 0x03FF;
    if (e === 0) return (s ? -1 : 1) * Math.pow(2, -14) * (f / 1024);
    if (e === 0x1F) return f ? NaN : ((s ? -1 : 1) * Infinity);
    return (s ? -1 : 1) * Math.pow(2, e - 15) * (1 + f / 1024);
  };
  function utf8(s) { var a = []; for (var i = 0; i < s.length; i++) a.push(s.charCodeAt(i) & 0x7F); return a; }
  /* bundle: net.exportWeights() output. dtype: 'f32'|'f16'. archVersion u32. */
  W.encode = function (bundle, dtype, archVersion) {
    var f16 = dtype === 'f16', tens = bundle.tensors;
    var headParts = [], payloads = [], off = 0, i, j;
    for (i = 0; i < tens.length; i++) {
      var t = tens[i], bytes;
      if (f16) { var u = new Uint16Array(t.data.length); for (j = 0; j < t.data.length; j++) u[j] = W.f32toF16(t.data[j]); bytes = new Uint8Array(u.buffer); }
      else bytes = new Uint8Array(new Float32Array(t.data).buffer);
      payloads.push({ t: t, bytes: bytes, off: off }); off += bytes.length;
    }
    var payload = new Uint8Array(off);
    for (i = 0; i < payloads.length; i++) payload.set(payloads[i].bytes, payloads[i].off);
    var crc = W.crc32(payload);
    // header
    var hb = [];
    push(hb, [0x41, 0x5A, 0x4C, 0x57]); u16(hb, 1); u16(hb, f16 ? 1 : 0);
    var nm = utf8(bundle.name); hb.push(nm.length); push(hb, nm);
    u32(hb, archVersion >>> 0); u32(hb, (bundle.version | 0) >>> 0); u16(hb, tens.length);
    for (i = 0; i < payloads.length; i++) {
      var p = payloads[i], tn = utf8(p.t.name);
      hb.push(tn.length); push(hb, tn); hb.push(f16 ? 1 : 0); hb.push(p.t.shape.length);
      for (j = 0; j < p.t.shape.length; j++) u32(hb, p.t.shape[j]);
      u32(hb, p.off); u32(hb, p.bytes.length);
    }
    u32(hb, payload.length);
    var out = new Uint8Array(hb.length + payload.length + 4);
    out.set(hb, 0); out.set(payload, hb.length);
    var dv = new DataView(out.buffer); dv.setUint32(hb.length + payload.length, crc, true);
    return out;
    function push(a, arr) { for (var k = 0; k < arr.length; k++) a.push(arr[k]); }
    function u16(a, v) { a.push(v & 0xFF, (v >> 8) & 0xFF); }
    function u32(a, v) { a.push(v & 0xFF, (v >> 8) & 0xFF, (v >> 16) & 0xFF, (v >> 24) & 0xFF); }
  };
  W.decode = function (bytes) {
    var dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), p = 0;
    function u8() { return bytes[p++]; }
    function u16() { var v = dv.getUint16(p, true); p += 2; return v; }
    function u32() { var v = dv.getUint32(p, true); p += 4; return v; }
    function str(n) { var s = ''; for (var i = 0; i < n; i++) s += String.fromCharCode(u8()); return s; }
    if (str(4) !== 'AZLW') throw new Error('AZLW: bad magic');
    var fmtV = u16(); void u16();
    if (fmtV !== 1) throw new Error('AZLW: unsupported format version ' + fmtV);
    var name = str(u8()), archVersion = u32(), weightVersion = u32(), tc = u16();
    var tens = [];
    for (var i = 0; i < tc; i++) {
      var tn = str(u8()), dt = u8(), nd = u8(), shape = [];
      for (var d = 0; d < nd; d++) shape.push(u32());
      var boff = u32(), blen = u32();
      tens.push({ name: tn, dtype: dt, shape: shape, boff: boff, blen: blen });
    }
    var plen = u32(), pstart = p;
    if (pstart + plen + 4 > bytes.length) throw new Error('AZLW: truncated payload');
    var payload = bytes.subarray(pstart, pstart + plen);
    var crc = dv.getUint32(pstart + plen, true);
    if (W.crc32(payload) !== crc) throw new Error('AZLW: checksum mismatch');
    var out = [];
    for (var k = 0; k < tens.length; k++) {
      var t = tens[k], sz = t.shape.reduce(function (a, b) { return a * b; }, 1);
      var data = new Float32Array(sz);
      if (t.dtype === 1) {
        if (t.blen !== sz * 2) throw new Error('AZLW: tensor byte length mismatch ' + t.name);
        var u = new Uint16Array(sz);
        for (var j = 0; j < sz; j++) u[j] = payload[t.boff + j * 2] | (payload[t.boff + j * 2 + 1] << 8);
        for (var j2 = 0; j2 < sz; j2++) data[j2] = W.f16toF32(u[j2]);
      } else {
        if (t.blen !== sz * 4) throw new Error('AZLW: tensor byte length mismatch ' + t.name);
        var dvp = new DataView(payload.buffer, payload.byteOffset + t.boff, t.blen);
        for (var j3 = 0; j3 < sz; j3++) data[j3] = dvp.getFloat32(j3 * 4, true);
      }
      if (!U.isFiniteArr(data)) throw new Error('AZLW: non-finite tensor ' + t.name);
      out.push({ name: t.name, shape: t.shape, data: data });
    }
    return { name: name, archVersion: archVersion, version: weightVersion, tensors: out };
  };
  W.toBase64 = function (bytes) {
    if (typeof btoa !== 'undefined') { var s = ''; for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]); return btoa(s); }
    return Buffer.from(bytes).toString('base64');
  };
  W.fromBase64 = function (b64) {
    if (typeof atob !== 'undefined') { var s = atob(b64), out = new Uint8Array(s.length); for (var i = 0; i < s.length; i++) out[i] = s.charCodeAt(i); return out; }
    return new Uint8Array(Buffer.from(b64, 'base64'));
  };
  /* Atomic activation into a live net. Returns {ok, error} - net untouched on failure. */
  W.activate = function (net, bytes, expectedArchVersion) {
    try {
      var b = W.decode(bytes);
      if (expectedArchVersion != null && b.archVersion !== expectedArchVersion) return { ok: false, error: 'arch-version-mismatch' };
      if (!net.validateWeights(b)) return { ok: false, error: 'shape-validation-failed' };
      net.importWeights(b);
      return { ok: true, version: b.version };
    } catch (e) { return { ok: false, error: String(e && e.message || e) }; }
  };
})(typeof self !== 'undefined' ? self : globalThis);
