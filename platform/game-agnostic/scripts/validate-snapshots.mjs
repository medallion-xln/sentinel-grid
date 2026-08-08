import { loadSnapshotCertification } from './snapshot-context.mjs';

const { lock, records } = await loadSnapshotCertification();
console.log(JSON.stringify({
  pass: true,
  snapshotCount: records.length,
  lockHash: lock.lockHash,
  snapshots: records.map((record) => ({
    handle: record.handle,
    identity: record.identity,
    snapshotId: record.snapshotId,
    formatId: record.formatId,
    formatVersion: record.formatVersion,
    envelopeHash: record.envelopeHash,
    importedStateHash: record.importedStateHash,
    terminal: record.terminal,
    observerCount: record.observers.length,
    authority: record.authority,
  })),
}, null, 2));
