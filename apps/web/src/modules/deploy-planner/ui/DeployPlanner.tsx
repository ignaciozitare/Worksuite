// @ts-nocheck
import { useState } from "react";
import { Btn, StatBox } from "@worksuite/ui";
import { DeployTimeline } from "./DeployTimeline";
import type { Deployment } from "../domain/entities/Deployment";
import type { WorksuiteUser } from "@worksuite/shared-types";

interface DeployPlannerProps {
  currentUser: WorksuiteUser;
}

const MOCK_DEPLOYMENTS: Deployment[] = [
  {
    id: "d1", name: "Sprint 42 — API refactor",
    version: "v2.4.0", environment: "staging",
    status: "planned",
    jiraIssues: ["WORK-101", "WORK-102"],
    plannedAt: new Date().toISOString(),
    createdBy: "ignaciozitare",
    notes: "Refactor endpoints + DB migrations",
  },
  {
    id: "d2", name: "Hotfix — Blueprint render",
    version: "v2.3.1", environment: "production",
    status: "deployed",
    jiraIssues: ["WORK-99"],
    plannedAt: new Date(Date.now() - 86400000 * 2).toISOString(),
    deployedAt: new Date(Date.now() - 86400000).toISOString(),
    createdBy: "ignaciozitare",
  },
];

export function DeployPlanner({ currentUser }: DeployPlannerProps) {
  const [deployments] = useState<Deployment[]>(MOCK_DEPLOYMENTS);
  const [selected, setSelected] = useState<Deployment | null>(null);

  const planned    = deployments.filter(d => d.status === "planned").length;
  const inProgress = deployments.filter(d => d.status === "in-progress").length;
  const deployed   = deployments.filter(d => d.status === "deployed").length;

  return (
    <div style={{ padding: "24px", maxWidth: 900 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
        <div>
          <h1 style={{ fontFamily: "var(--ws-font-heading)", fontSize: 20, color: "var(--ws-text)", marginBottom: 4 }}>
            🚀 Deploy Planner
          </h1>
          <p style={{ fontSize: 13, color: "var(--ws-text-3)" }}>
            Planifica y gestiona despliegues vinculados a issues de Jira
          </p>
        </div>
        <div style={{ marginLeft: "auto" }}>
          <Btn variant="primary">+ Nuevo despliegue</Btn>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px,1fr))", gap: 14, marginBottom: 28 }}>
        <StatBox label="Planificados"  value={planned}    color="var(--ws-text-3)" icon="📋" />
        <StatBox label="En progreso"   value={inProgress} color="var(--ws-deploy)"  icon="⚙️" />
        <StatBox label="Desplegados"   value={deployed}   color="var(--ws-green)"   icon="✓" />
        <StatBox label="Total"         value={deployments.length} color="var(--ws-accent)" icon="🔢" />
      </div>

      {/* Timeline */}
      <div style={{ background: "var(--ws-surface)", border: "1px solid var(--ws-border)", borderRadius: "var(--ws-radius-lg)", padding: "18px 20px" }}>
        <h2 style={{ fontFamily: "var(--ws-font-heading)", fontSize: 14, color: "var(--ws-text)", marginBottom: 16 }}>
          📅 Línea de tiempo
        </h2>
        <DeployTimeline deployments={deployments} onSelect={setSelected} />
      </div>

      {/* Coming soon */}
      <div style={{ marginTop: 20, padding: "16px 20px", background: "var(--ws-deploy-bg)", border: "1px solid rgba(245,158,11,.25)", borderRadius: "var(--ws-radius-lg)", fontSize: 13, color: "var(--ws-deploy)" }}>
        🔗 La integración con Jira (vincular issues, ver estado, crear releases) está en desarrollo.
        Usará el mismo token configurado en Jira Tracker — no necesitas configurar nada adicional.
      </div>
    </div>
  );
}
