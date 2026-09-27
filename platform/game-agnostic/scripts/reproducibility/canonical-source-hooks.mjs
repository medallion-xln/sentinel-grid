/* Module-load hooks used by canonical-runtime.mjs (async form for Node < 22.15, where only module.register exists). */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { guardSource } from './exponentiation-guard.mjs';

/* The platform/game-agnostic root whose modules and tracked files are governed. Defaults to this runtime's own
 * repository; SENTINEL_GA_ROOT names another checkout (used when one runtime verifies a separate clone). */
const GA_ROOT = path.resolve(process.env.SENTINEL_GA_ROOT ?? path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..'));

/** Repository-relative path of a module URL inside platform/game-agnostic, or null. */
export function repositoryModule(url) {
  if (!url.startsWith('file:')) return null;
  const file = fileURLToPath(url);
  if (!/\.m?js$/.test(file)) return null;
  const relative = path.relative(GA_ROOT, file);
  if (relative.startsWith('..') || path.isAbsolute(relative) || relative.startsWith(`scripts${path.sep}reproducibility${path.sep}`)) return null;
  return relative.split(path.sep).join('/');
}

export function transform(url, result) {
  const relative = repositoryModule(url);
  if (relative === null || result.format !== 'module' || result.source == null) return result;
  const text = typeof result.source === 'string' ? result.source : Buffer.from(result.source).toString('utf8');
  return { ...result, source: guardSource(relative, text) };
}

export async function load(url, context, nextLoad) {
  return transform(url, await nextLoad(url, context));
}
