/* Load-time source guard for the `**` operator under SENTINEL_CANONICAL_NUMERICS_V1.
 *
 * `**` compiles straight to the engine's pow (fdlibm in V8 <= 13, the C library's std::pow from V8 14), so it
 * cannot be redirected by replacing Math.pow. Every repository module is therefore scanned at load time:
 *   - `x ** 2` and integer-literal ** integer-literal are exact in every engine and are left alone;
 *   - pinned sites listed in PINNED_REWRITES are rewritten, in memory only, to the canonical pow;
 *   - any other `**` makes the load fail closed.
 * File bytes on disk are never changed, so sealed source hashes are unaffected.
 */

export const CANONICAL_POW_GLOBAL = '__SENTINEL_CANONICAL_POW__';

/** Exact, in-memory rewrites. `sha256` is the committed file the rewrite was reviewed against. */
export const PINNED_REWRITES = Object.freeze({
  'src/stage3f/decision-rule-v1.js': Object.freeze({
    sha256: '96ec25f0c4217435e23d3341e1181e50f3e0291c1879e2602cd661708fce86e5',
    from: 'probabilities[p] ** (1 / temperature)',
    to: `globalThis.${CANONICAL_POW_GLOBAL}(probabilities[p], (1 / temperature))`,
    occurrences: 1,
  }),
});

const REGEX_PRECEDERS = new Set(['(', ',', '=', ':', '[', '!', '&', '|', '?', '{', '}', ';', '+', '-', '*', '%', '<', '>', '~', '^']);
const REGEX_KEYWORDS = new Set(['return', 'typeof', 'case', 'do', 'else', 'in', 'of', 'new', 'delete', 'void', 'throw', 'yield', 'await']);

/** Replace comments, string/template text and regex literals by spaces (newlines kept) so only code remains. */
export function codeOnly(source) {
  const out = source.split('');
  const blank = (from, to) => { for (let k = from; k < to; k += 1) if (out[k] !== '\n') out[k] = ' '; };
  let i = 0; let lastSignificant = ''; let lastWord = '';
  const templateDepth = [];
  const n = source.length;
  while (i < n) {
    const c = source[i]; const d = source[i + 1];
    if (c === '/' && d === '/') { const j = source.indexOf('\n', i); const e = j === -1 ? n : j; blank(i, e); i = e; continue; }
    if (c === '/' && d === '*') { const j = source.indexOf('*/', i + 2); const e = j === -1 ? n : j + 2; blank(i, e); i = e; continue; }
    if (c === '\'' || c === '"') {
      let j = i + 1; while (j < n && source[j] !== c) { if (source[j] === '\\') j += 1; j += 1; }
      blank(i, j + 1); i = j + 1; lastSignificant = 'x'; lastWord = ''; continue;
    }
    if (c === '`' || (c === '}' && templateDepth.length && templateDepth[templateDepth.length - 1] === 0)) {
      if (c === '}') templateDepth.pop();
      let j = i + 1;
      while (j < n && source[j] !== '`') {
        if (source[j] === '\\') { j += 2; continue; }
        if (source[j] === '$' && source[j + 1] === '{') break;
        j += 1;
      }
      if (source[j] === '$') { blank(i, j + 2); templateDepth.push(0); i = j + 2; lastSignificant = '{'; continue; }
      blank(i, j + 1); i = j + 1; lastSignificant = 'x'; lastWord = ''; continue;
    }
    if (c === '{' && templateDepth.length) templateDepth[templateDepth.length - 1] += 1;
    if (c === '}' && templateDepth.length) templateDepth[templateDepth.length - 1] -= 1;
    if (c === '/' && (lastSignificant === '' || REGEX_PRECEDERS.has(lastSignificant) || REGEX_KEYWORDS.has(lastWord))) {
      let j = i + 1; let inClass = false;
      while (j < n && source[j] !== '\n') {
        if (source[j] === '\\') { j += 2; continue; }
        if (source[j] === '[') inClass = true; else if (source[j] === ']') inClass = false;
        else if (source[j] === '/' && !inClass) break;
        j += 1;
      }
      while (j + 1 < n && /[a-z]/i.test(source[j + 1])) j += 1;
      blank(i, j + 1); i = j + 1; lastSignificant = 'x'; lastWord = ''; continue;
    }
    if (/\s/.test(c)) { i += 1; continue; }
    if (/[A-Za-z_$0-9]/.test(c)) { let j = i; while (j < n && /[A-Za-z_$0-9]/.test(source[j])) j += 1; lastWord = source.slice(i, j); lastSignificant = 'x'; i = j; continue; }
    lastSignificant = c; lastWord = ''; i += 1;
  }
  return out.join('');
}

/** Non-exact `**` sites remaining in `source`: [{ line, text }]. */
export function nonCanonicalExponentiation(source) {
  const code = codeOnly(source);
  const found = [];
  const re = /\*\*/g; let m;
  while ((m = re.exec(code))) {
    const after = code.slice(m.index + 2).match(/^\s*([^\s;,)\]}]*)/)[1];
    const before = code.slice(0, m.index).match(/([^\s(=,[{;:+\-*/]*)\s*$/)[1];
    if (/^2(?![\d.eE_xXoObBn])/.test(after)) continue;
    if (/^\d+$/.test(before) && /^\d+(?![\d.eE])/.test(after)) continue;
    found.push({ line: code.slice(0, m.index).split('\n').length, text: source.split('\n')[code.slice(0, m.index).split('\n').length - 1].trim().slice(0, 160) });
  }
  return found;
}

/** Apply the pinned rewrite for `relativePath` (if any), then fail closed on any remaining non-exact `**`. */
export function guardSource(relativePath, source) {
  let text = source;
  const pin = PINNED_REWRITES[relativePath];
  if (pin) {
    const count = text.split(pin.from).length - 1;
    if (count !== pin.occurrences) {
      throw new Error(`SENTINEL_CANONICAL_NUMERICS: pinned rewrite for ${relativePath} expected ${pin.occurrences} occurrence(s), found ${count}`);
    }
    text = text.split(pin.from).join(pin.to);
  }
  const remaining = nonCanonicalExponentiation(text);
  if (remaining.length) {
    throw new Error(`SENTINEL_CANONICAL_NUMERICS: non-canonical exponentiation in ${relativePath}: `
      + remaining.map((r) => `line ${r.line}: ${r.text}`).join(' | '));
  }
  return text;
}
