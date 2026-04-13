/** Reads/writes the rich-text note shown in the Historial retention section. */
export interface IEnvHistoryNoteRepo {
  get(): Promise<string>;
  save(html: string): Promise<void>;
}
