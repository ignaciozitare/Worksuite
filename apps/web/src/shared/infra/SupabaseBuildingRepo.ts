import type { SupabaseClient } from '@supabase/supabase-js';
import type { BlueprintData, BuildingData, BuildingPort } from '../domain/ports/BuildingPort';

export class SupabaseBuildingRepo implements BuildingPort {
  constructor(private readonly db: SupabaseClient) {}

  async findAllBuildings(): Promise<BuildingData[]> {
    const { data, error } = await this.db
      .from('buildings')
      .select('*')
      .order('name');
    if (error) throw error;
    return data || [];
  }

  async createBuilding(name: string, address?: string, city?: string): Promise<BuildingData> {
    const { data, error } = await this.db
      .from('buildings')
      .insert({ name, address, city, active: true })
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async updateBuilding(id: string, patch: { name?: string; address?: string; city?: string }): Promise<void> {
    const { error } = await this.db.from('buildings').update(patch).eq('id', id);
    if (error) throw error;
  }

  async deleteBuilding(id: string): Promise<void> {
    const { error } = await this.db.from('buildings').delete().eq('id', id);
    if (error) throw error;
  }

  async renameBuilding(id: string, name: string): Promise<void> {
    const { error } = await this.db
      .from('buildings')
      .update({ name })
      .eq('id', id);
    if (error) throw error;
  }

  async findBlueprints(buildingId: string): Promise<BlueprintData[]> {
    const { data, error } = await this.db
      .from('blueprints')
      .select('*')
      .eq('building_id', buildingId)
      .order('floor_order');
    if (error) throw error;
    return data || [];
  }

  async createBlueprint(buildingId: string, floorName: string, order: number): Promise<BlueprintData> {
    const { data, error } = await this.db
      .from('blueprints')
      .insert({ building_id: buildingId, floor_name: floorName, floor_order: order, layout: [] })
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async deleteBlueprint(id: string): Promise<void> {
    const { error } = await this.db.from('blueprints').delete().eq('id', id);
    if (error) throw error;
  }

  async renameBlueprint(id: string, name: string): Promise<void> {
    const { error } = await this.db
      .from('blueprints')
      .update({ floor_name: name })
      .eq('id', id);
    if (error) throw error;
  }

  async reorderBlueprints(items: { id: string; floor_order: number }[]): Promise<void> {
    const updates = items.map((item) =>
      this.db
        .from('blueprints')
        .update({ floor_order: item.floor_order })
        .eq('id', item.id)
    );
    const results = await Promise.all(updates);
    const failed = results.find((r) => r.error);
    if (failed?.error) throw failed.error;
  }

  async saveLayout(id: string, layout: any[]): Promise<void> {
    const { error } = await this.db
      .from('blueprints')
      .update({ layout })
      .eq('id', id);
    if (error) throw error;
  }
}
