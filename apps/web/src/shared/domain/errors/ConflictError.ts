/**
 * Thrown when a reservation/booking conflicts with an existing one.
 * The database constraint rejected the operation (Postgres 23505).
 */
export class ConflictError extends Error {
  constructor(
    public readonly resource: string,
    public readonly detail: string,
  ) {
    super(`Conflict: ${resource} — ${detail}`);
    this.name = 'ConflictError';
  }
}
