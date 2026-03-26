
import type { Deployment, DeployPlan } from "../entities/Deployment";

export interface DeploymentRepository {
  findAll(): Promise<Deployment[]>;
  findById(id: string): Promise<Deployment | null>;
  save(d: Omit<Deployment, "id">): Promise<Deployment>;
  update(id: string, patch: Partial<Deployment>): Promise<Deployment>;
  getPlan(deploymentId: string): Promise<DeployPlan | null>;
  savePlan(plan: Omit<DeployPlan, "id">): Promise<DeployPlan>;
}
