
import type { DeploymentRepository } from "../ports/DeploymentRepository";
import type { Deployment }            from "../entities/Deployment";

type Input = Omit<Deployment, "id" | "status" | "deployedAt"> & { createdBy: string };

export class CreateDeployment {
  constructor(private repo: DeploymentRepository) {}

  async execute(input: Input): Promise<Deployment> {
    if (!input.name.trim())    throw new Error("Deployment name required");
    if (!input.version.trim()) throw new Error("Version required");
    return this.repo.save({ ...input, status: "planned" });
  }
}
