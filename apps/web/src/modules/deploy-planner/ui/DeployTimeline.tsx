// @ts-nocheck
import { Timeline, TimelineCard } from "@worksuite/ui";
import type { TimelineItem }      from "@worksuite/ui";
import type { Deployment }        from "../domain/entities/Deployment";

const STATUS_MAP: Record<string, TimelineItem["status"]> = {
  "planned":     "pending",
  "in-progress": "running",
  "deployed":    "done",
  "rolled-back": "failed",
  "cancelled":   "cancelled",
};

const ENV_LABELS: Record<string, string> = {
  development: "DEV",
  staging:     "STG",
  production:  "PROD",
};

interface DeployTimelineProps {
  deployments: Deployment[];
  onSelect?:   (d: Deployment) => void;
}

export function DeployTimeline({ deployments, onSelect }: DeployTimelineProps) {
  if (!deployments.length) {
    return (
      <div style={{ textAlign: "center", padding: "40px 20px", color: "var(--ws-text-3)", fontSize: 14 }}>
        No hay despliegues planificados aún.
      </div>
    );
  }

  const items: TimelineItem[] = deployments.map(d => ({
    id:          d.id,
    title:       d.name,
    description: d.notes,
    status:      STATUS_MAP[d.status] ?? "pending",
    date:        d.plannedAt,
    badge:       `${d.version} · ${ENV_LABELS[d.environment] ?? d.environment}`,
    meta:        d.jiraIssues.length
      ? `🔗 ${d.jiraIssues.join(", ")}`
      : undefined,
  }));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {deployments.map((d, i) => (
        <TimelineCard
          key={d.id}
          item={items[i]!}
          onClick={onSelect ? () => onSelect(d) : undefined}
        />
      ))}
    </div>
  );
}
