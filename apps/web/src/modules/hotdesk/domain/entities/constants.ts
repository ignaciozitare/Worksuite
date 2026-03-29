/** Value Object — desk assignment type */
export const DeskType = Object.freeze({ NONE: "none", HOTDESK: "hotdesk", FIXED: "fixed" } as const);

/** Value Object — seat availability (used by legacy WorkSuiteApp UI) */
export const SeatStatusEnum = Object.freeze({ FREE: "free", OCCUPIED: "occupied", FIXED: "fixed" } as const);
