
// @ts-nocheck
// ── Scaffold — to be implemented when Deploy Planner table is created in Supabase
import type { DeploymentRepository } from "../domain/ports/DeploymentRepository";
import type { Deployment, DeployPlan } from "../domain/entities/Deployment";

export class SupabaseDeploymentRepository implements DeploymentRepository {
  async findAll(): Promise<Deployment[]> { return []; }
  async findById(_id: string): Promise<Deployment | null> { return null; }
  async save(d: Omit<Deployment, "id">): Promise<Deployment> {
    // TODO: insert into deployments table
    return { ...d, id: crypto.randomUUID() };
  }
  async update(_id: string, _patch: Partial<Deployment>): Promise<Deployment> {
    throw new Error("Not implemented");
  }
  async getPlan(_deploymentId: string): Promise<DeployPlan | null> { return null; }
  async savePlan(plan: Omit<DeployPlan, "id">): Promise<DeployPlan> {
    return { ...plan, id: crypto.randomUUID() };
  }
}
