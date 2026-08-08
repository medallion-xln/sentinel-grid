import { loadZekNovaShadowFrameworkCertification } from './zeknova-shadow-context.mjs';
import { buildStage2FFrameworkCertification } from '../src/lab/zeknova-controlled-evaluation.js';

export async function loadStage2FFrameworkCertification() {
  const shadow = await loadZekNovaShadowFrameworkCertification();
  const replayRecords = shadow.evaluations.map((evaluation) => evaluation.record);
  const report = buildStage2FFrameworkCertification({
    manifest: shadow.registration.manifest,
    replayRecords,
  });
  return { ...shadow, replayRecords, report };
}
