export class SentinelGridError extends Error {
  constructor(message, details = undefined) {
    super(message);
    this.name = new.target.name;
    if (details !== undefined) this.details = details;
  }
}

export class ContractError extends SentinelGridError {}
export class AuthorityError extends SentinelGridError {}
export class ConformanceError extends SentinelGridError {}
export class ReplayError extends SentinelGridError {}
export class SnapshotIngestionError extends SentinelGridError {}
