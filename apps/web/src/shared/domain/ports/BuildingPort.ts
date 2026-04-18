export interface BuildingData {
  id: string;
  name: string;
  address?: string;
  city?: string;
  active: boolean;
}

export interface BlueprintData {
  id: string;
  building_id: string;
  floor_name: string;
  floor_order: number;
  layout: any[];
  updated_at?: string;
}

export interface BuildingPort {
  findAllBuildings(): Promise<BuildingData[]>;
  createBuilding(name: string, address?: string, city?: string): Promise<BuildingData>;
  deleteBuilding(id: string): Promise<void>;
  renameBuilding(id: string, name: string): Promise<void>;
  findBlueprints(buildingId: string): Promise<BlueprintData[]>;
  createBlueprint(buildingId: string, floorName: string, order: number): Promise<BlueprintData>;
  deleteBlueprint(id: string): Promise<void>;
  renameBlueprint(id: string, name: string): Promise<void>;
  reorderBlueprints(items: { id: string; floor_order: number }[]): Promise<void>;
  saveLayout(id: string, layout: any[]): Promise<void>;
}
