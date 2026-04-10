/**
 * Read-only access to the company-wide chrono config.
 * The chrono module only needs to read the daily work hours; CRUD lives
 * in chrono-admin.
 */
export interface IConfigEmpresaRepository {
  getHorasJornadaMinutos(): Promise<number | null>;
}
