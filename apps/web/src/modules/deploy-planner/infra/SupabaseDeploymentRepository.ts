import type { DeploymentRepository } from "../domain/ports/DeploymentRepository";
import type { Deployment, DeployPlan, DeployStep } from "../domain/entities/Deployment";
import { supabase } from "../../../shared/lib/supabaseClient";

// ─── Row mappers ──────────────────────────────────────────────────────────────

function rowToDeployment(r: Record<string, unknown>): Deployment {
  return {
    id:          r.id as string,
    name:        r.name as string,
    version:     r.version as string,
    environment: r.environment as Deployment["environment"],
    status:      r.status as Deployment["status"],
    jiraIssues:  (r.jira_issues as string[]) ?? [],
    plannedAt:   r.planned_at as string,
    deployedAt:  r.deployed_at as string | undefined,
    createdBy:   r.created_by as string,
    notes:       r.notes as string | undefined,
  };
}

function rowToStep(r: Record<string, unknown>): DeployStep {
  return {
    id:           r.id as string,
    order:        r.step_order as number,
    title:        r.title as string,
    description:  r.description as string,
    status:       r.status as DeployStep["status"],
    assignee:     r.assignee as string | undefined,
    durationMin:  r.duration_min as number | undefined,
  };
}

// ─── Repository ───────────────────────────────────────────────────────────────

export class SupabaseDeploymentRepository implements DeploymentRepository {

  async findAll(): Promise<Deployment[]> {
    const { data, error } = await supabase
      .from("deployments")
      .select("*")
      .order("planned_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map(rowToDeployment);
  }

  async findById(id: string): Promise<Deployment | null> {
    const { data, error } = await supabase
      .from("deployments")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    return data ? rowToDeployment(data) : null;
  }

  async save(d: Omit<Deployment, "id">): Promise<Deployment> {
    const { data, error } = await supabase
      .from("deployments")
      .insert({
        name:        d.name,
        version:     d.version,
        environment: d.environment,
        status:      d.status,
        jira_issues: d.jiraIssues,
        planned_at:  d.plannedAt,
        deployed_at: d.deployedAt ?? null,
        created_by:  d.createdBy,
        notes:       d.notes ?? null,
      })
      .select()
      .single();
    if (error) throw error;
    return rowToDeployment(data);
  }

  async update(id: string, patch: Partial<Deployment>): Promise<Deployment> {
    const fields: Record<string, unknown> = {};
    if (patch.name        !== undefined) fields.name        = patch.name;
    if (patch.version     !== undefined) fields.version     = patch.version;
    if (patch.environment !== undefined) fields.environment = patch.environment;
    if (patch.status      !== undefined) fields.status      = patch.status;
    if (patch.jiraIssues  !== undefined) fields.jira_issues = patch.jiraIssues;
    if (patch.plannedAt   !== undefined) fields.planned_at  = patch.plannedAt;
    if (patch.deployedAt  !== undefined) fields.deployed_at = patch.deployedAt;
    if (patch.notes       !== undefined) fields.notes       = patch.notes;

    const { data, error } = await supabase
      .from("deployments")
      .update(fields)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return rowToDeployment(data);
  }

  async getPlan(deploymentId: string): Promise<DeployPlan | null> {
    const { data, error } = await supabase
      .from("deploy_steps")
      .select("*")
      .eq("deployment_id", deploymentId)
      .order("step_order", { ascending: true });
    if (error) throw error;
    if (!data?.length) return null;
    return {
      id:           deploymentId,
      deploymentId,
      steps:        data.map(rowToStep),
      createdAt:    data[0].created_at as string,
    };
  }

  async savePlan(plan: Omit<DeployPlan, "id">): Promise<DeployPlan> {
    // Delete existing steps first, then insert new ones
    await supabase
      .from("deploy_steps")
      .delete()
      .eq("deployment_id", plan.deploymentId);

    const rows = plan.steps.map((s, i) => ({
      deployment_id: plan.deploymentId,
      step_order:    s.order ?? i,
      title:         s.title,
      description:   s.description ?? "",
      status:        s.status ?? "pending",
      assignee:      s.assignee ?? null,
      duration_min:  s.durationMin ?? null,
    }));

    const { data, error } = await supabase
      .from("deploy_steps")
      .insert(rows)
      .select();
    if (error) throw error;

    return {
      id:           plan.deploymentId,
      deploymentId: plan.deploymentId,
      steps:        (data ?? []).map(rowToStep),
      createdAt:    new Date().toISOString(),
    };
  }
}
