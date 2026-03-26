
import type { DeploymentRepository } from "../ports/DeploymentRepository";

export class LinkJiraIssues {
  constructor(private repo: DeploymentRepository) {}

  async execute(deploymentId: string, issueKeys: string[]): Promise<void> {
    const deployment = await this.repo.findById(deploymentId);
    if (!deployment) throw new Error(`Deployment ${deploymentId} not found`);
    const merged = [...new Set([...deployment.jiraIssues, ...issueKeys])];
    await this.repo.update(deploymentId, { jiraIssues: merged });
  }
}
