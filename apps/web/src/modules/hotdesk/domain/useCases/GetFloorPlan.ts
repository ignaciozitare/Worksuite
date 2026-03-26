
import type { Blueprint } from "../entities/Blueprint";

export interface BlueprintRepository {
  getByFloor(floorId: string): Promise<Blueprint | null>;
  save(blueprint: Blueprint): Promise<void>;
}

export class GetFloorPlan {
  constructor(private repo: BlueprintRepository) {}
  async execute(floorId: string): Promise<Blueprint | null> {
    return this.repo.getByFloor(floorId);
  }
}
