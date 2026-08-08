/* AZL Federated client module.
 * Lifecycle (client side): download production manifest+weights -> train locally ->
 * delta vs exact base version -> validate dims + finite -> clip update norm ->
 * upload with idempotency key -> server stores as pending.
 * Wire format for server-stored weights and deltas: RAW little-endian Float32 param
 * vector in Net layout order (metadata travels in JSON/headers). The AZLW container
 * (azl-weights.js) is used for local IndexedDB caching and file export.
 * Identity: pseudonymous client UUID persisted locally; never derived from account
 * identity (privacy separation - server may link for abuse control only). */
(function (g) {
  'use strict';
  var AZL = g.AZL, C = AZL.CONFIG, U = AZL.Util;
  var F = AZL.Fed = {};

  F.getClientId = function (store) {
    return store.get('meta', 'clientId').then(function (row) {
      if (row && row.v) return row.v;
      var id = U.uuid();
      return store.put('meta', { k: 'clientId', v: id }).then(function () { return id; });
    });
  };
  F.api = function (action) { return C.API_BASE + '/index.php?action=' + action; };

  F.fetchManifest = function (clientId) {
    return fetch(F.api('manifest') + '&clientId=' + encodeURIComponent(clientId), { credentials: 'same-origin' })
      .then(function (r) { return r.json(); })
      .then(function (j) { if (!j.ok) throw new Error((j.error && j.error.code) || 'manifest-failed'); return j.data; });
  };
  /* Raw param-vector activation: length + finite validation, atomic (net untouched on failure). */
  F.activateRaw = function (net, arrayBuffer, meta) {
    var f32 = new Float32Array(arrayBuffer);
    if (f32.length !== net.paramCount) return { ok: false, error: 'param-count-mismatch' };
    if (meta && meta.archVersion != null && (meta.archVersion | 0) !== archOf(net)) return { ok: false, error: 'arch-version-mismatch' };
    if (!U.isFiniteArr(f32)) return { ok: false, error: 'non-finite' };
    if (meta && meta.crc32 != null) {
      var crc = AZL.Weights.crc32(new Uint8Array(arrayBuffer));
      if ((crc >>> 0) !== (meta.crc32 >>> 0)) return { ok: false, error: 'checksum-mismatch' };
    }
    net.params.set(f32);
    net.version = meta && meta.version != null ? (meta.version | 0) : net.version;
    net._m = null; net._v = null; net._adamT = 0;
    return { ok: true, version: net.version };
  };
  function archOf(net) { // stable arch version from spec shape
    var s = net.spec, f = new U.Fnv();
    f.u32(s.input); f.u32(s.width); f.u32(s.blocks); f.u32(s.headStem | 0); f.u32(s.policy);
    f.u32((s.values || []).length); f.u32(s.confidence ? 1 : 0);
    return f.done();
  }
  F.archVersion = archOf;

  F.fetchWeights = function (model, version, clientId) {
    var url = F.api('weights') + '&model=' + encodeURIComponent(model) + '&version=' + (version | 0) + '&clientId=' + encodeURIComponent(clientId);
    return fetch(url, { credentials: 'same-origin' }).then(function (r) {
      if (!r.ok) throw new Error('weights-http-' + r.status);
      var meta = {
        version: parseInt(r.headers.get('X-AZL-Version') || '0', 10),
        archVersion: parseInt(r.headers.get('X-AZL-Arch') || '0', 10) >>> 0,
        crc32: parseInt(r.headers.get('X-AZL-CRC32') || '0', 10) >>> 0,
        status: r.headers.get('X-AZL-Status') || 'production'
      };
      return r.arrayBuffer().then(function (buf) { return { bytes: buf, meta: meta }; });
    });
  };
  /* Load best available weights: IDB cache first, then server (updates cache). */
  F.loadModel = function (store, model, clientId, manifest) {
    var m = manifest && manifest.models && manifest.models[model];
    var want = m && m.serving && m.serving.version ? m.serving.version : 0;
    return store.get('weightsCache', model).then(function (row) {
      if (row && want && row.version === want) return { bytes: row.bytes, meta: row.meta, fromCache: true };
      if (!want) return row ? { bytes: row.bytes, meta: row.meta, fromCache: true } : null;
      return F.fetchWeights(model, want, clientId).then(function (res) {
        return store.put('weightsCache', { k: model, bytes: res.bytes, meta: res.meta, version: res.meta.version })
          .then(function () { return { bytes: res.bytes, meta: res.meta, fromCache: false }; });
      }).catch(function () { return row ? { bytes: row.bytes, meta: row.meta, fromCache: true } : null; });
    });
  };

  /* delta = current - base, clipped to FEDERATED.deltaClipNorm. Returns null if invalid. */
  F.buildDelta = function (net, baseParams) {
    if (!baseParams || baseParams.length !== net.paramCount) return null;
    var d = new Float32Array(net.paramCount);
    for (var i = 0; i < d.length; i++) d[i] = net.params[i] - baseParams[i];
    if (!U.isFiniteArr(d)) return null;
    var n = U.l2norm(d), cap = C.FEDERATED.deltaClipNorm;
    if (n > cap) { var s = cap / (n + 1e-12); for (var j = 0; j < d.length; j++) d[j] *= s; n = cap; }
    return { delta: d, norm: n };
  };
  F.uploadUpdate = function (store, opts) {
    // opts: {clientId, model, baseVersion, delta Float32Array, norm, sampleCount, completeness, metrics, csrf, bootstrap}
    var bytes = new Uint8Array(opts.delta.buffer.slice(opts.delta.byteOffset, opts.delta.byteOffset + opts.delta.byteLength));
    if (bytes.length > C.FEDERATED.maxUploadBytes) return Promise.resolve({ ok: false, error: 'too-large' });
    var key = 'lastUpload:' + opts.model;
    return store.get('meta', key).then(function (row) {
      var nowMs = Date.now();
      if (row && (nowMs - row.v) < C.FEDERATED.uploadCooldownMs && !opts.force) return { ok: false, error: 'cooldown' };
      var body = {
        clientId: opts.clientId, model: opts.model, baseVersion: opts.baseVersion | 0,
        sampleCount: opts.sampleCount | 0, completeness: opts.completeness != null ? opts.completeness : 1,
        norm: opts.norm, bootstrap: !!opts.bootstrap, archVersion: opts.archVersion || 0,
        idempotencyKey: U.uuid(), deltaB64: AZL.Weights.toBase64(bytes), metrics: opts.metrics || null
      };
      var hdr = { 'Content-Type': 'application/json' };
      if (opts.csrf) hdr['X-CSRF-Token'] = opts.csrf;
      return fetch(F.api('updates'), { method: 'POST', credentials: 'same-origin', headers: hdr, body: JSON.stringify(body) })
        .then(function (r) { return r.json(); })
        .then(function (j) {
          if (j.ok) return store.put('meta', { k: key, v: nowMs }).then(function () { return { ok: true, data: j.data }; });
          return { ok: false, error: (j.error && j.error.code) || 'upload-failed' };
        });
    });
  };
  F.heartbeat = function (clientId, payload, csrf) {
    var hdr = { 'Content-Type': 'application/json' };
    if (csrf) hdr['X-CSRF-Token'] = csrf;
    return fetch(F.api('heartbeat'), { method: 'POST', credentials: 'same-origin', headers: hdr, body: JSON.stringify(Object.assign({ clientId: clientId }, payload || {})) })
      .then(function (r) { return r.json(); }).catch(function () { return { ok: false }; });
  };
  F.reportEvaluation = function (body, csrf) {
    var hdr = { 'Content-Type': 'application/json' };
    if (csrf) hdr['X-CSRF-Token'] = csrf;
    return fetch(F.api('evaluations'), { method: 'POST', credentials: 'same-origin', headers: hdr, body: JSON.stringify(body) })
      .then(function (r) { return r.json(); }).catch(function () { return { ok: false }; });
  };
})(typeof self !== 'undefined' ? self : globalThis);
