// Module-load hook for source-closure.mjs: appends every file: URL Node actually loads to $SG_TRACE_OUT.
import { appendFileSync } from 'node:fs';
export async function load(url, context, next) {
  if (url.startsWith('file:') && process.env.SG_TRACE_OUT) appendFileSync(process.env.SG_TRACE_OUT, url + '\n');
  return next(url, context);
}
