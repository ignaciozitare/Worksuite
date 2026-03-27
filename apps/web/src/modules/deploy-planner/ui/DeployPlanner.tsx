// @ts-nocheck
// DeployPlanner — WorkSuite Module (full version with ReleaseDetail)

import { useState, useEffect } from "react";
import { supabase } from "../../../shared/lib/supabaseClient";

const API_BASE = (import.meta.env.VITE_API_URL || "http://localhost:3001").replace(/\/$/, "");

async function getAuthHeader() {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
}

// ── Ticket statuses ────────────────────────────────────────────
const TICKET_STATUSES = {
  in_progress: { label: "In Progress", color: "#64748b", bg: "rgba(100,116,139,.12)", icon: "○" },
  in_review:   { label: "In Review",   color: "#f59e0b", bg: "rgba(245,158,11,.12)",  icon: "◑" },
  done:        { label: "Done",        color: "#38bdf8", bg: "rgba(56,189,248,.12)",   icon: "◉" },
  merged:      { label: "Merged",      color: "#34d399", bg: "rgba(52,211,153,.12)",   icon: "✓" },
};
const MERGE_READY = ["merged", "done"];
const PRI_COLOR = { Highest: "#ef4444", High: "#f97316", Medium: "#3b82f6", Low: "#6b7280" };

function normalizeStatus(jiraStatus) {
  const s = (jiraStatus || "").toLowerCase();
  if (s.includes("review") || s.includes("testing") || s.includes("qa")) return "in_review";
  if (s.includes("done") || s.includes("closed") || s.includes("resuelto")) return "done";
  if (s.includes("merged") || s.includes("deployed")) return "merged";
  return "in_progress";
}

// ── Status badge ───────────────────────────────────────────────
function StatusBadge({ status, statuses }) {
  const st = statuses.find(s => s.name === status) || { name: status, color: "#64748b", bg_color: "rgba(100,116,139,.12)", border: "rgba(100,116,139,.3)" };
  return (
    <span style={{ display: "inline-block", padding: "2px 10px", borderRadius: 20, fontSize: 10, fontWeight: 700, color: st.color, background: st.bg_color, border: `1px solid ${st.border}`, whiteSpace: "nowrap" }}>
      {st.name}
    </span>
  );
}

// ── Version picker ─────────────────────────────────────────────
function VersionPicker({ lastVersion, verCfg, onSelect }) {
  const segments = verCfg?.segments || [{ name: "major", value: 1 }, { name: "minor", value: 0 }, { name: "patch", value: 0 }];
  const prefix   = verCfg?.prefix    || "v";
  const sep      = verCfg?.separator || ".";
  const base     = lastVersion || (prefix + segments.map(s => s.value ?? 0).join(sep));

  function bump(version, segmentName) {
    const raw    = version.replace(/^[^\d]*/, "");
    const parts  = raw.split(/[.\-_]/);
    const idx    = segments.findIndex(s => s.name === segmentName);
    if (idx < 0) return version;
    const bumped = parts.map((p, i) => {
      if (i < idx)  return p;
      if (i === idx) return String(parseInt(p || "0") + 1);
      return "0";
    });
    const pfx = version.match(/^[^\d]*/)?.[0] || "";
    const s2  = version.match(/[\.\-_]/)?.[0] || ".";
    return pfx + bumped.join(s2);
  }

  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
      <span style={{ fontSize: 10, color: "var(--tx3)", alignSelf: "center" }}>Sugerir:</span>
      {segments.map(seg => {
        const next = bump(base, seg.name);
        return (
          <button key={seg.name} onClick={() => onSelect(next)}
            style={{ padding: "4px 10px", borderRadius: 20, border: "1px solid var(--bd)", background: "var(--sf2)", color: "var(--tx2)", cursor: "pointer", fontSize: 11, fontFamily: "inherit" }}>
            {next} <span style={{ fontSize: 9, opacity: 0.6 }}>↑{seg.name}</span>
          </button>
        );
      })}
    </div>
  );
}

// ── Repo card (inside ReleaseDetail) ──────────────────────────
function RepoCard({ repoName, tickets, onStatusChange }) {
  const allReady   = tickets.every(t => MERGE_READY.includes(t.status));
  const someReady  = tickets.some(t  => MERGE_READY.includes(t.status));
  const readyCount = tickets.filter(t => MERGE_READY.includes(t.status)).length;
  const borderColor = allReady ? "#34d399" : someReady ? "#f59e0b" : "var(--bd)";
  const topColor    = allReady ? "#34d399" : someReady ? "#f59e0b" : "var(--tx3)";

  return (
    <div style={{ background: "var(--sf)", border: `1px solid ${borderColor}`, borderTop: `2px solid ${topColor}`, borderRadius: 8, width: 300, flexShrink: 0, transition: "border-color .3s" }}>
      <div style={{ padding: "12px 14px", borderBottom: "1px solid var(--bd)", display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ fontSize: 14 }}>{allReady ? "✓" : "⬡"}</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--tx)" }}>{repoName}</div>
          <div style={{ fontSize: 9, color: "var(--tx3)", marginTop: 1 }}>{readyCount}/{tickets.length} listos</div>
        </div>
        <div style={{ width: 48, height: 4, background: "var(--bd)", borderRadius: 2, overflow: "hidden" }}>
          <div style={{ width: `${tickets.length > 0 ? (readyCount / tickets.length) * 100 : 0}%`, height: "100%", background: allReady ? "#34d399" : someReady ? "#f59e0b" : "var(--tx3)", borderRadius: 2, transition: "width .4s" }} />
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column" }}>
        {tickets.length === 0 && (
          <div style={{ padding: "16px 14px", fontSize: 11, color: "var(--tx3)", textAlign: "center" }}>Sin tickets</div>
        )}
        {tickets.map((ticket, i) => {
          const isReady = MERGE_READY.includes(ticket.status);
          const cfg     = TICKET_STATUSES[ticket.status] || TICKET_STATUSES.in_progress;
          return (
            <div key={ticket.key} style={{ padding: "10px 14px", borderBottom: i < tickets.length - 1 ? "1px solid var(--bd)" : "none", opacity: isReady ? 0.7 : 1 }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 6 }}>
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: PRI_COLOR[ticket.priority] || "#64748b", marginTop: 4, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: "var(--ac2)", flexShrink: 0 }}>{ticket.key}</span>
                    <span style={{ fontSize: 9, color: "var(--tx3)", background: "var(--sf2)", border: "1px solid var(--bd)", borderRadius: 3, padding: "1px 5px" }}>{ticket.type}</span>
                  </div>
                  <div style={{ fontSize: 10, color: isReady ? "var(--tx3)" : "var(--tx2)", textDecoration: isReady ? "line-through" : "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginBottom: 4 }}>
                    {ticket.summary}
                  </div>
                  {ticket.assignee && <div style={{ fontSize: 9, color: "var(--tx3)" }}>👤 {ticket.assignee}</div>}
                </div>
              </div>
              <select value={ticket.status} onChange={e => onStatusChange(ticket.key, e.target.value)}
                style={{ width: "100%", background: cfg.bg, border: `1px solid ${cfg.color}40`, borderRadius: 4, padding: "4px 8px", fontSize: 10, color: cfg.color, cursor: "pointer", outline: "none", fontWeight: 700, fontFamily: "inherit" }}>
                {Object.entries(TICKET_STATUSES).map(([val, c]) => (
                  <option key={val} value={val}>{c.icon} {c.label}</option>
                ))}
              </select>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Merge button ───────────────────────────────────────────────
function MergeButton({ repos, ticketsByRepo }) {
  const [merging, setMerging] = useState(false);
  const [merged,  setMerged]  = useState(false);
  const allReady = repos.every(r => (ticketsByRepo[r] || []).every(t => MERGE_READY.includes(t.status)));
  const blocking = repos.filter(r => !(ticketsByRepo[r] || []).every(t => MERGE_READY.includes(t.status)));

  if (merged) return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 20px", background: "rgba(52,211,153,.08)", border: "1px solid rgba(52,211,153,.3)", borderRadius: 8 }}>
      <span style={{ fontSize: 20 }}>🎉</span>
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#34d399" }}>Merge completado a master</div>
        <div style={{ fontSize: 10, color: "var(--tx3)", marginTop: 2 }}>Todos los repositorios fueron mergeados</div>
      </div>
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {!allReady && blocking.length > 0 && (
        <div style={{ padding: "10px 14px", background: "rgba(239,68,68,.06)", border: "1px solid rgba(127,29,29,.4)", borderRadius: 6, fontSize: 10, color: "#f87171" }}>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>⚠ Bloqueado — repos pendientes:</div>
          {blocking.map(r => (
            <div key={r} style={{ marginTop: 3 }}>
              · <span style={{ color: "#ef4444" }}>{r}</span>
              <span style={{ color: "var(--tx3)" }}> — {(ticketsByRepo[r] || []).filter(t => !MERGE_READY.includes(t.status)).length} pendiente(s)</span>
            </div>
          ))}
        </div>
      )}
      <button onClick={() => { if (!allReady || merging) return; setMerging(true); setTimeout(() => { setMerging(false); setMerged(true); }, 1800); }}
        disabled={!allReady || merging}
        style={{ background: allReady ? "linear-gradient(135deg,#1d4ed8,#0ea5e9)" : "var(--sf2)", border: `1px solid ${allReady ? "#3b82f6" : "var(--bd)"}`, borderRadius: 7, padding: "12px 24px", fontSize: 12, fontWeight: 700, color: allReady ? "#fff" : "var(--tx3)", cursor: allReady && !merging ? "pointer" : "not-allowed", display: "flex", alignItems: "center", gap: 8, opacity: merging ? 0.7 : 1, fontFamily: "inherit" }}>
        {merging ? "⟳ Mergeando…" : allReady ? "🚀 Merge to master" : "🔒 Merge to master"}
      </button>
    </div>
  );
}

// ── Release Detail ─────────────────────────────────────────────
function ReleaseDetail({ release, statuses, onBack }) {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadTickets(); }, [release.id]);

  async function loadTickets() {
    setLoading(true);
    try {
      const headers = { ...await getAuthHeader(), "Content-Type": "application/json" };
      const project = release.project_key || "";
      if (project) {
        const res  = await fetch(`${API_BASE}/jira/issues?project=${project}`, { headers });
        const json = await res.json();
        if (json.ok && json.data?.length) {
          setTickets(json.data.map(i => ({
            key:      i.key,
            summary:  i.summary,
            type:     i.type,
            status:   normalizeStatus(i.status),
            priority: i.priority || "Medium",
            assignee: i.assignee || "",
            repos:    i.components?.map(c => c.name) || [],
          })));
        }
      }
    } catch (e) { console.error("loadTickets:", e); }
    finally { setLoading(false); }
  }

  const onStatusChange = (key, newStatus) => {
    setTickets(ts => ts.map(t => t.key === key ? { ...t, status: newStatus } : t));
  };

  const allRepos = [...new Set(tickets.flatMap(t => t.repos.length ? t.repos : ["general"]))].sort();
  const ticketsByRepo = {};
  allRepos.forEach(repo => {
    ticketsByRepo[repo] = tickets.filter(t => (t.repos.length ? t.repos : ["general"]).includes(repo));
  });

  const readyTickets = tickets.filter(t => MERGE_READY.includes(t.status)).length;
  const allReady = tickets.length > 0 && readyTickets === tickets.length;

  return (
    <div style={{ padding: 24, minHeight: "100%", background: "var(--bg)", color: "var(--tx)" }}>
      {/* Back */}
      <button onClick={onBack} style={{ background: "none", border: "none", color: "var(--tx3)", cursor: "pointer", fontSize: 12, marginBottom: 16, display: "flex", alignItems: "center", gap: 5, fontFamily: "inherit", padding: 0 }}>
        ← Volver a releases
      </button>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 16, marginBottom: 20 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
            <span style={{ fontSize: 9, color: "var(--tx3)", letterSpacing: ".1em", textTransform: "uppercase" }}>Release</span>
            {release.start_date && <span style={{ fontSize: 9, color: "var(--tx3)" }}>· {release.start_date}{release.end_date ? ` → ${release.end_date}` : ""}</span>}
            <StatusBadge status={release.status} statuses={statuses} />
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "var(--tx)", marginBottom: 4, fontFamily: "var(--mono)" }}>
            {release.release_number}
          </h1>
          {release.description && <p style={{ fontSize: 11, color: "var(--tx3)", margin: 0 }}>{release.description}</p>}
        </div>

        {/* Progress widget */}
        <div style={{ background: "var(--sf)", border: "1px solid var(--bd)", borderRadius: 8, padding: "12px 16px", minWidth: 160, textAlign: "center", flexShrink: 0 }}>
          <div style={{ fontSize: 28, fontWeight: 700, color: allReady ? "#34d399" : "var(--tx)", lineHeight: 1 }}>
            {readyTickets}<span style={{ fontSize: 14, color: "var(--tx3)" }}>/{tickets.length}</span>
          </div>
          <div style={{ fontSize: 9, color: "var(--tx3)", marginTop: 4, textTransform: "uppercase", letterSpacing: ".08em" }}>Tickets listos</div>
          <div style={{ height: 3, background: "var(--bd)", borderRadius: 2, overflow: "hidden", marginTop: 8 }}>
            <div style={{ width: tickets.length > 0 ? `${(readyTickets / tickets.length) * 100}%` : "0%", height: "100%", background: allReady ? "#34d399" : "var(--ac)", transition: "width .4s" }} />
          </div>
        </div>
      </div>

      {/* Repo pills */}
      {allRepos.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
          {allRepos.map(repo => {
            const rt    = ticketsByRepo[repo] || [];
            const ready = rt.filter(t => MERGE_READY.includes(t.status)).length;
            const ok    = ready === rt.length && rt.length > 0;
            return (
              <div key={repo} style={{ display: "flex", alignItems: "center", gap: 5, padding: "3px 10px", borderRadius: 20, background: ok ? "rgba(52,211,153,.08)" : "var(--sf2)", border: `1px solid ${ok ? "rgba(52,211,153,.3)" : "var(--bd)"}`, fontSize: 10, color: ok ? "#34d399" : "var(--tx3)" }}>
                {ok ? "✓" : "○"} {repo} <span style={{ opacity: .5 }}>{ready}/{rt.length}</span>
              </div>
            );
          })}
        </div>
      )}

      <div style={{ height: 1, background: "var(--bd)", marginBottom: 20 }} />

      {/* Content */}
      {loading ? (
        <div style={{ textAlign: "center", padding: "40px 0", color: "var(--tx3)", fontSize: 12 }}>
          Cargando tickets de Jira…
        </div>
      ) : tickets.length === 0 ? (
        <div style={{ textAlign: "center", padding: "40px 0", color: "var(--tx3)" }}>
          <div style={{ fontSize: 24, marginBottom: 8 }}>🔍</div>
          <div style={{ fontSize: 13 }}>No se encontraron tickets para esta release</div>
          <div style={{ fontSize: 11, marginTop: 4 }}>
            {release.project_key ? `Proyecto Jira: ${release.project_key}` : "Edita la release y añade un proyecto Jira para cargar tickets"}
          </div>
        </div>
      ) : (
        <>
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "flex-start", marginBottom: 24 }}>
            {allRepos.map(repo => (
              <RepoCard key={repo} repoName={repo} tickets={ticketsByRepo[repo] || []} onStatusChange={onStatusChange} />
            ))}
          </div>
          <MergeButton repos={allRepos} ticketsByRepo={ticketsByRepo} />
        </>
      )}
    </div>
  );
}

// ── New Release Modal ──────────────────────────────────────────
function NewReleaseModal({ statuses, verCfg, lastVersion, onClose, onSave }) {
  const [form, setForm] = useState({
    release_number: "",
    description:    "",
    status:         statuses[0]?.name || "planning",
    start_date:     new Date().toISOString().slice(0, 10),
    end_date:       "",
    project_key:    "",
  });
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!form.release_number.trim()) return;
    setSaving(true);
    const { data, error } = await supabase.from("dp_releases").insert(form).select().single();
    if (!error && data) { onSave(data); onClose(); }
    else setSaving(false);
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16, backdropFilter: "blur(4px)" }}>
      <div style={{ background: "var(--sf)", border: "1px solid var(--bd2)", borderRadius: 12, width: "100%", maxWidth: 480, boxShadow: "var(--shadow)", maxHeight: "90vh", overflowY: "auto" }}>
        <div style={{ padding: "16px 18px", borderBottom: "1px solid var(--bd)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "var(--tx)" }}>🚀 Nueva Release</div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--tx3)", fontSize: 18 }}>×</button>
        </div>
        <div style={{ padding: 18, display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: "var(--tx3)", marginBottom: 6, textTransform: "uppercase", letterSpacing: ".08em" }}>Versión *</div>
            <input value={form.release_number} onChange={e => setForm(f => ({ ...f, release_number: e.target.value }))}
              placeholder="ej: v2.6.0"
              style={{ width: "100%", background: "var(--sf2)", border: "1px solid var(--bd)", borderRadius: 6, padding: "8px 10px", color: "var(--tx)", fontSize: 13, fontFamily: "var(--mono)", outline: "none" }} />
            {verCfg && <VersionPicker lastVersion={lastVersion} verCfg={verCfg} onSelect={v => setForm(f => ({ ...f, release_number: v }))} />}
          </div>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: "var(--tx3)", marginBottom: 6, textTransform: "uppercase", letterSpacing: ".08em" }}>Descripción</div>
            <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Qué incluye esta release…" rows={2}
              style={{ width: "100%", background: "var(--sf2)", border: "1px solid var(--bd)", borderRadius: 6, padding: "8px 10px", color: "var(--tx)", fontSize: 12, fontFamily: "inherit", outline: "none", resize: "none" }} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: "var(--tx3)", marginBottom: 6, textTransform: "uppercase", letterSpacing: ".08em" }}>Fecha inicio</div>
              <input type="date" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))}
                style={{ width: "100%", background: "var(--sf2)", border: "1px solid var(--bd)", borderRadius: 6, padding: "8px 10px", color: "var(--tx)", fontSize: 12, fontFamily: "inherit", outline: "none" }} />
            </div>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: "var(--tx3)", marginBottom: 6, textTransform: "uppercase", letterSpacing: ".08em" }}>Fecha fin</div>
              <input type="date" value={form.end_date} onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))}
                style={{ width: "100%", background: "var(--sf2)", border: "1px solid var(--bd)", borderRadius: 6, padding: "8px 10px", color: "var(--tx)", fontSize: 12, fontFamily: "inherit", outline: "none" }} />
            </div>
          </div>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: "var(--tx3)", marginBottom: 6, textTransform: "uppercase", letterSpacing: ".08em" }}>Estado inicial</div>
            <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
              style={{ width: "100%", background: "var(--sf2)", border: "1px solid var(--bd)", borderRadius: 6, padding: "8px 10px", color: "var(--tx)", fontSize: 12, fontFamily: "inherit", outline: "none" }}>
              {statuses.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: "var(--tx3)", marginBottom: 6, textTransform: "uppercase", letterSpacing: ".08em" }}>Proyecto Jira (para cargar tickets)</div>
            <input value={form.project_key} onChange={e => setForm(f => ({ ...f, project_key: e.target.value.toUpperCase() }))}
              placeholder="ej: ANDURIL"
              style={{ width: "100%", background: "var(--sf2)", border: "1px solid var(--bd)", borderRadius: 6, padding: "8px 10px", color: "var(--tx)", fontSize: 12, fontFamily: "var(--mono)", outline: "none" }} />
          </div>
        </div>
        <div style={{ padding: "12px 18px", borderTop: "1px solid var(--bd)", display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{ padding: "8px 16px", borderRadius: 6, border: "1px solid var(--bd)", background: "var(--sf2)", color: "var(--tx2)", cursor: "pointer", fontSize: 12, fontFamily: "inherit" }}>Cancelar</button>
          <button onClick={save} disabled={saving || !form.release_number.trim()}
            style={{ padding: "8px 18px", borderRadius: 6, border: "none", background: "var(--ac)", color: "#fff", cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: "inherit", opacity: saving || !form.release_number.trim() ? 0.5 : 1 }}>
            {saving ? "Guardando…" : "Crear release"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main DeployPlanner component ───────────────────────────────
export function DeployPlanner({ currentUser }) {
  const [releases,  setReleases]  = useState([]);
  const [statuses,  setStatuses]  = useState([]);
  const [verCfg,    setVerCfg]    = useState(null);
  const [loading,   setLoading]   = useState(true);
  const [selected,  setSelected]  = useState(null); // release → show detail
  const [showNew,   setShowNew]   = useState(false);
  const [viewMode,  setViewMode]  = useState("kanban");

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const [relRes, stRes, vcRes] = await Promise.all([
      supabase.from("dp_releases").select("*").order("created_at", { ascending: false }),
      supabase.from("dp_release_statuses").select("*").order("ord"),
      supabase.from("dp_version_config").select("*").limit(1).single(),
    ]);
    setReleases(relRes.data || []);
    setStatuses(stRes.data  || []);
    if (vcRes.data) setVerCfg(vcRes.data);
    setLoading(false);
  }

  async function updateStatus(releaseId, newStatus) {
    setReleases(rs => rs.map(r => r.id === releaseId ? { ...r, status: newStatus } : r));
    await supabase.from("dp_releases").update({ status: newStatus }).eq("id", releaseId);
  }

  const lastVersion    = releases[0]?.release_number || null;
  const nonFinal       = statuses.filter(s => !s.is_final);
  const finalStatuses  = statuses.filter(s => s.is_final);

  if (selected) {
    return <ReleaseDetail release={selected} statuses={statuses} onBack={() => setSelected(null)} />;
  }

  return (
    <div style={{ padding: 24, minHeight: "100%", background: "var(--bg)" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--tx)", marginBottom: 4 }}>🚀 Deploy Planner</h1>
          <p style={{ fontSize: 12, color: "var(--tx3)" }}>Gestiona releases y su estado de despliegue</p>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <div style={{ display: "flex", background: "var(--sf2)", border: "1px solid var(--bd)", borderRadius: 8, overflow: "hidden" }}>
            {[["kanban","⊞ Kanban"],["list","≡ Lista"]].map(([v,l]) => (
              <button key={v} onClick={() => setViewMode(v)}
                style={{ padding: "6px 12px", fontSize: 11, fontWeight: 600, border: "none", background: viewMode === v ? "var(--ac)" : "transparent", color: viewMode === v ? "#fff" : "var(--tx3)", cursor: "pointer", fontFamily: "inherit" }}>
                {l}
              </button>
            ))}
          </div>
          <button onClick={() => setShowNew(true)}
            style={{ background: "var(--ac)", color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
            + Nueva release
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: "60px 0", color: "var(--tx3)" }}>Cargando…</div>
      ) : (
        <>
          {/* Stats */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(110px,1fr))", gap: 10, marginBottom: 24 }}>
            {statuses.map(st => (
              <div key={st.id} style={{ background: "var(--sf)", border: `1px solid ${st.border}`, borderRadius: 10, padding: "12px 14px", textAlign: "center" }}>
                <div style={{ fontSize: 22, fontWeight: 700, color: st.color }}>{releases.filter(r => r.status === st.name).length}</div>
                <div style={{ fontSize: 10, color: "var(--tx3)", marginTop: 2 }}>{st.name}</div>
              </div>
            ))}
          </div>

          {releases.length === 0 ? (
            <div style={{ textAlign: "center", padding: "60px 0", color: "var(--tx3)" }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>📭</div>
              <div style={{ fontSize: 14 }}>No hay releases aún</div>
              <div style={{ fontSize: 12, marginTop: 4 }}>Crea la primera release con el botón de arriba</div>
            </div>
          ) : viewMode === "kanban" ? (
            /* Kanban view */
            <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.max(nonFinal.length,1)}, minmax(250px,1fr))`, gap: 14, overflowX: "auto" }}>
              {nonFinal.map(st => {
                const cols = releases.filter(r => r.status === st.name);
                return (
                  <div key={st.id} style={{ background: "var(--sf)", border: "1px solid var(--bd)", borderRadius: 10, overflow: "hidden" }}>
                    <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--bd)", display: "flex", alignItems: "center", gap: 8, background: st.bg_color }}>
                      <div style={{ width: 8, height: 8, borderRadius: "50%", background: st.color }} />
                      <span style={{ fontSize: 12, fontWeight: 700, color: st.color }}>{st.name}</span>
                      <span style={{ marginLeft: "auto", fontSize: 11, color: st.color, background: st.bg_color, borderRadius: 20, padding: "1px 8px", border: `1px solid ${st.border}` }}>{cols.length}</span>
                    </div>
                    <div style={{ padding: 10, display: "flex", flexDirection: "column", gap: 8, minHeight: 100 }}>
                      {cols.map(rel => (
                        <div key={rel.id}
                          style={{ background: "var(--sf2)", border: "1px solid var(--bd)", borderRadius: 8, padding: "12px 14px", cursor: "pointer", transition: "border-color .15s" }}
                          onMouseEnter={e => e.currentTarget.style.borderColor = "var(--ac)"}
                          onMouseLeave={e => e.currentTarget.style.borderColor = "var(--bd)"}
                          onClick={() => setSelected(rel)}>
                          <div style={{ fontFamily: "var(--mono)", fontSize: 13, fontWeight: 700, color: "var(--tx)", marginBottom: 4 }}>{rel.release_number}</div>
                          {rel.description && <p style={{ fontSize: 11, color: "var(--tx3)", margin: "0 0 8px", lineHeight: 1.4 }}>{rel.description}</p>}
                          {rel.start_date && <div style={{ fontSize: 10, color: "var(--tx3)", marginBottom: 8 }}>{rel.start_date}{rel.end_date ? ` → ${rel.end_date}` : ""}</div>}
                          {/* Status change buttons */}
                          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }} onClick={e => e.stopPropagation()}>
                            {nonFinal.filter(s => s.name !== st.name).map(ns => (
                              <button key={ns.id} onClick={() => updateStatus(rel.id, ns.name)}
                                style={{ padding: "2px 8px", borderRadius: 20, border: `1px solid ${ns.border}`, background: ns.bg_color, color: ns.color, cursor: "pointer", fontSize: 9, fontWeight: 700, fontFamily: "inherit" }}>
                                → {ns.name}
                              </button>
                            ))}
                            {finalStatuses.map(fs => (
                              <button key={fs.id} onClick={() => updateStatus(rel.id, fs.name)}
                                style={{ padding: "2px 8px", borderRadius: 20, border: `1px solid ${fs.border}`, background: fs.bg_color, color: fs.color, cursor: "pointer", fontSize: 9, fontWeight: 700, fontFamily: "inherit" }}>
                                ✓ {fs.name}
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                      {cols.length === 0 && <div style={{ fontSize: 11, color: "var(--tx3)", textAlign: "center", padding: "16px 0" }}>Sin releases</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* List view */
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {releases.filter(r => !finalStatuses.some(fs => fs.name === r.status)).map(rel => (
                <div key={rel.id} onClick={() => setSelected(rel)}
                  style={{ background: "var(--sf)", border: "1px solid var(--bd)", borderRadius: 10, padding: "14px 18px", cursor: "pointer", display: "flex", alignItems: "center", gap: 14, transition: "border-color .15s" }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = "var(--ac)"}
                  onMouseLeave={e => e.currentTarget.style.borderColor = "var(--bd)"}>
                  <span style={{ fontFamily: "var(--mono)", fontSize: 15, fontWeight: 700, color: "var(--tx)", minWidth: 90 }}>{rel.release_number}</span>
                  <StatusBadge status={rel.status} statuses={statuses} />
                  <span style={{ fontSize: 12, color: "var(--tx3)", flex: 1 }}>{rel.description}</span>
                  {rel.start_date && <span style={{ fontSize: 11, color: "var(--tx3)", fontFamily: "var(--mono)" }}>{rel.start_date}</span>}
                  <span style={{ color: "var(--tx3)" }}>›</span>
                </div>
              ))}
            </div>
          )}

          {/* History */}
          {releases.some(r => finalStatuses.some(fs => fs.name === r.status)) && (
            <div style={{ marginTop: 28 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--tx3)", textTransform: "uppercase", letterSpacing: ".1em", marginBottom: 10 }}>Historial</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {releases.filter(r => finalStatuses.some(fs => fs.name === r.status)).map(rel => (
                  <div key={rel.id} onClick={() => setSelected(rel)}
                    style={{ background: "var(--sf)", border: "1px solid var(--bd)", borderRadius: 8, padding: "10px 14px", cursor: "pointer", display: "flex", alignItems: "center", gap: 12, opacity: 0.6 }}>
                    <span style={{ fontFamily: "var(--mono)", fontSize: 13, fontWeight: 700, color: "var(--tx3)" }}>{rel.release_number}</span>
                    <StatusBadge status={rel.status} statuses={statuses} />
                    <span style={{ fontSize: 11, color: "var(--tx3)", flex: 1 }}>{rel.description}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {showNew && (
        <NewReleaseModal
          statuses={statuses}
          verCfg={verCfg}
          lastVersion={lastVersion}
          onClose={() => setShowNew(false)}
          onSave={newRel => setReleases(rs => [newRel, ...rs])}
        />
      )}
    </div>
  );
}
