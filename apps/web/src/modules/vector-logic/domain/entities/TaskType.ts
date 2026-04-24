export interface TaskType {
  id: string;
  name: string;
  icon: string | null;
  /**
   * CSS color value for the icon (hex or `var(--x)`). Null = default accent.
   * Picked from a small curated palette in the IconPicker; kept as an arbitrary
   * string so future customizations can persist any color.
   */
  iconColor: string | null;
  prefix: string | null;
  nextNumber: number;
  workflowId: string | null;
  schema: unknown[];
  createdAt: string;
  updatedAt: string;
}
