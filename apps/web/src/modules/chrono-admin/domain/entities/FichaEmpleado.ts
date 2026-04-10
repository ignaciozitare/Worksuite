export interface FichaEmpleado {
  id: string;
  userId: string;
  clienteAsignado: string | null;
  valorHora: string | null;
  contactoTelefono: string | null;
  contactoEmailPersonal: string | null;
  seniority: string | null;
  notas: string | null;
  fechaIncorporacion: string | null; // ISO date
  fechaBaja: string | null;          // ISO date
  razonBaja: string | null;
  nss: string | null;                // número de seguridad social
}
