export interface EmpleadoConfig {
  id: string;
  userId: string;
  horasJornadaMinutos: number | null; // null = global default
  diasVacaciones: number | null;      // null = global default
  jornadaDias: string[];              // ['L','M','X','J','V']
}
