
import type { HotDeskConfig } from "../entities/HotDeskConfig";

export interface ConfigRepository {
  getConfig(): Promise<HotDeskConfig>;
  updateConfig(patch: Partial<Omit<HotDeskConfig, "id">>): Promise<void>;
}
