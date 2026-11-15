#!/usr/bin/env node
// ASCII Worlds v33.1 game-health Observatory overlay. Same additive mechanism as stage3h1-development/observatory: the
// unchanged live Observatory is spawned on an upstream loopback port and proxied (SSE included); this overlay injects one
// section + one script into the served index page and serves the frozen v33.1 evidence files read-only under
// /api/ascii-v33-1/. No protected file is modified. R0; no dispatch; no simulation runs inside this server.
import { createServer, request as httpRequest } from 'node:http';
import { spawn } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
export const LANE = resolve(here, '..');
const GA = resolve(LANE, '..');
export const EVIDENCE = Object.freeze(['artifacts/ASCII_V33_1_INVENTORY_V1.json', 'artifacts/ASCII_V33_1_INVENTORY_MATRIX_V1.json', 'artifacts/ASCII_V33_1_REPAIR_MANIFEST_V1.json', 'evidence/platformer-forensics.json', 'evidence/platformer-acceptance.json', 'evidence/game-probes.json', 'evidence/shared-infrastructure.json', 'RESULT.json']);
export async function loadEvidence(lane = LANE) {
  const out = {};
  for (const rel of EVIDENCE) { try { const body = await readFile(resolve(lane, rel)); out[rel] = { hash: createHash('sha256').update(body).digest('hex'), bytes: body.length, json: JSON.parse(body) }; } catch { /* absent → NOT_ESTABLISHED */ } }
  const auditDir = resolve(lane, 'evidence/audit'); const audit = {};
  for (const n of (await readdir(auditDir).catch(() => [])).filter((n) => n.endsWith('.json')).sort()) { const body = await readFile(resolve(auditDir, n)); audit[n.replace(/\.json$/, '')] = { hash: createHash('sha256').update(body).digest('hex'), json: JSON.parse(body) }; }
  return { files: out, audit };
}
/** Game-health rows: every value traces to an evidence file hash; untested → NOT_ESTABLISHED. */
export function healthRows(ev) {
  const inv = ev.files['artifacts/ASCII_V33_1_INVENTORY_V1.json']?.json, matrix = ev.files['artifacts/ASCII_V33_1_INVENTORY_MATRIX_V1.json']?.json, repair = ev.files['artifacts/ASCII_V33_1_REPAIR_MANIFEST_V1.json']?.json;
  const levels = inv?.levels ?? [];
  return levels.map((L) => {
    const a = ev.audit[L.LEVEL], m = matrix?.rows?.find((r) => r.LEVEL === L.LEVEL), src = [];
    const ep = a?.json.episodes ?? [], strong = ep.filter((e) => e.kind === 'STRONG' && e.sensor === 'NORMAL'), pct = (n, d) => (d ? Math.round((1000 * n) / d) / 10 : null);
    if (a) src.push({ file: 'evidence/audit/' + L.LEVEL + '.json', sha256: a.hash }); if (matrix) src.push({ file: 'artifacts/ASCII_V33_1_INVENTORY_MATRIX_V1.json', sha256: ev.files['artifacts/ASCII_V33_1_INVENTORY_MATRIX_V1.json'].hash });
    const witnesses = Object.values(a?.json.reachability ?? {});
    return { GAME: L.GAME, LEVEL: L.LEVEL, VERSION: L.VERSION + ' / mechanics v32 unchanged / presentation ' + (['platformer', 'fighter'].includes(L.GAME) ? 'v33' : 'v32'),
      WORLD_HEALTH: a ? (Object.values(a.json.worlds).every((w) => w.loads) && Object.values(a.json.actionContract).every((c) => c.errors === 0 && c.effectViolations.length === 0) && ep.every((e) => e.kernelErrors === 0 && e.termination.resultAllowed && e.termination.terminalFlagConsistent) ? 'VALID' : 'DEFECT_RECORDED') : 'NOT_ESTABLISHED',
      REFERENCE_SOLVABILITY: a ? (witnesses.every((r) => r.status === 'WITNESS_FOUND') ? 'WITNESS_FOUND' : witnesses.some((r) => r.status === 'WITNESS_FOUND') ? 'PARTIAL_' + witnesses.filter((r) => r.status === 'WITNESS_FOUND').length + '/' + witnesses.length : 'REFERENCE_NOT_ESTABLISHED') : 'NOT_ESTABLISHED',
      STRONG_WIN_RATE: strong.length ? pct(strong.filter((e) => e.success).length, strong.length) + '% (' + strong.filter((e) => e.success).length + '/' + strong.length + ')' : 'NOT_ESTABLISHED',
      TIMEOUT_RATE: strong.length ? pct(strong.filter((e) => e.result === 'TIMEOUT').length, strong.length) + '%' : 'NOT_ESTABLISHED',
      ILLEGAL_ACTION_RATE: ep.length ? pct(ep.reduce((n, e) => n + e.illegalProposals, 0), ep.reduce((n, e) => n + e.ticks, 0)) + '% of ' + ep.reduce((n, e) => n + e.ticks, 0) + ' decisions' : 'NOT_ESTABLISHED',
      REPLAY_STATUS: ep.length ? (ep.every((e) => e.replayPass) ? 'EXACT_' + ep.length + '/' + ep.length : 'DIVERGED') : 'NOT_ESTABLISHED',
      KNOWN_DEFECTS: m?.KNOWN_FAILURE ?? L.KNOWN_REGRESSIONS.join('; '), ROOT_CAUSE: m?.ROOT_CAUSE ?? 'NOT_ESTABLISHED',
      REPAIR_STATUS: repair ? (repair.repairs.find((r) => r.affectedLevels.includes(L.LEVEL))?.status ?? 'NO_REPAIR') : 'NOT_ESTABLISHED',
      CANDIDATE_RESULT: m?.CANDIDATE_RESULT ?? 'NOT_APPLICABLE', sources: src };
  });
}
export function injectPanel(html) {
  if (!html.includes('<footer>') || !html.includes('</body>')) throw Error('UPSTREAM_INDEX_SHAPE_UNEXPECTED');
  return html.replace('<footer>', '<section id="asciiHealth" class="observatory-panel" aria-label="ASCII Worlds v33.1 game health" hidden></section>\n  <footer>').replace('</body>', '<script type="module" src="/ascii-health-panel.js"></script>\n</body>');
}
async function main() {
  const port = Number(process.env.SENTINEL_ASCII_HEALTH_PORT ?? 4193), upstreamPort = Number(process.env.SENTINEL_OBSERVATORY_PORT ?? 4194);
  if (port === upstreamPort) throw Error('PORTS_MUST_DIFFER');
  const ev = await loadEvidence(), rows = healthRows(ev), panelJs = await readFile(resolve(here, 'ascii-health-panel.js'));
  const index = { schema: 'ASCII_V33_1_HEALTH_INDEX_V1', authority: 'R0', canDispatch: false, source: 'ascii-quality-v33_1 evidence/artifacts (immutable, exclusive-create); no live simulation in this server', files: Object.fromEntries(Object.entries(ev.files).map(([k, v]) => [k, { hash: v.hash, bytes: v.bytes }])), auditLevels: Object.keys(ev.audit).length, missing: EVIDENCE.filter((e) => !ev.files[e]), rows };
  let child = null;
  if (process.env.SENTINEL_ASCII_HEALTH_UPSTREAM !== 'external') { child = spawn(process.execPath, [resolve(GA, 'scripts/sentinel-observatory-web.mjs')], { env: { ...process.env, SENTINEL_OBSERVATORY_PORT: String(upstreamPort) }, stdio: ['ignore', 'pipe', 'pipe'] }); child.stdout.on('data', (d) => process.stdout.write('[upstream] ' + d)); child.stderr.on('data', (d) => process.stderr.write('[upstream] ' + d)); child.on('exit', (code) => { process.stderr.write(`upstream exited (${code})\n`); server.close(); }); }
  const probe = () => new Promise((res) => { const q = httpRequest({ host: '127.0.0.1', port: upstreamPort, path: '/api/snapshot', method: 'HEAD' }, (r) => { r.resume(); res(r.statusCode === 200); }); q.on('error', () => res(false)); q.end(); });
  for (let i = 0; i < 100 && !(await probe()); i += 1) await new Promise((r) => setTimeout(r, 150));
  if (!(await probe())) throw Error('UPSTREAM_OBSERVATORY_NOT_REACHABLE:' + upstreamPort);
  const json = (response, status, value) => { response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); response.end(JSON.stringify(value)); };
  const server = createServer((request, response) => {
    if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405, { Allow: 'GET, HEAD' }); response.end(); return; }
    const pathname = new URL(request.url, 'http://localhost').pathname;
    if (pathname === '/api/ascii-v33-1/index') return json(response, 200, index);
    if (pathname.startsWith('/api/ascii-v33-1/file/')) { const name = decodeURIComponent(pathname.slice('/api/ascii-v33-1/file/'.length)); const f = ev.files[name] ?? (name.startsWith('evidence/audit/') ? ev.audit[name.slice(15).replace(/\.json$/, '')] : null); return f ? json(response, 200, f.json) : json(response, 404, { error: 'NOT_PRESENT', name, state: 'NOT_ESTABLISHED' }); }
    if (pathname === '/ascii-health-panel.js') { response.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store' }); response.end(request.method === 'HEAD' ? undefined : panelJs); return; }
    const upstream = httpRequest({ host: '127.0.0.1', port: upstreamPort, path: request.url, method: request.method, headers: { ...request.headers, host: `127.0.0.1:${upstreamPort}` } }, (res) => { const headers = { ...res.headers }; if (pathname === '/' && request.method === 'GET' && res.statusCode === 200) { delete headers['content-length']; const chunks = []; res.on('data', (c) => chunks.push(c)); res.on('end', () => { response.writeHead(200, headers); response.end(injectPanel(Buffer.concat(chunks).toString('utf8'))); }); return; } response.writeHead(res.statusCode, headers); res.pipe(response); });
    upstream.on('error', () => { if (!response.headersSent) response.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' }); response.end('Upstream observatory unavailable'); }); request.on('close', () => upstream.destroy()); upstream.end();
  });
  server.listen(port, '127.0.0.1', () => { process.stdout.write(`ASCII Worlds v33.1 game-health overlay: http://127.0.0.1:${port} (upstream live observatory on ${upstreamPort}, unchanged)\nrows=${rows.length} auditLevels=${index.auditLevels} missing=${index.missing.length} authority=R0 dispatch=false\n`); });
  const shutdown = () => { server.close(); if (child) child.kill('SIGTERM'); }; process.on('SIGINT', shutdown); process.on('SIGTERM', shutdown);
  server.on('error', (error) => { process.stderr.write(error.message + '\n'); shutdown(); process.exitCode = 1; });
}
if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch((e) => { process.stderr.write(e.message + '\n'); process.exit(1); });
