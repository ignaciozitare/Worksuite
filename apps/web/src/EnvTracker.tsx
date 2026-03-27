// @ts-nocheck
// EnvTracker — WorkSuite Environment Tracker Module

import { useState, useEffect } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// DEFAULT EXPORT: Vista principal del módulo
// ─────────────────────────────────────────────────────────────────────────────
export default function EnvTracker({ supabase, currentUser, wsUsers }) {
  const [envs,    setEnvs]    = useState([]);
  const [repos,   setRepos]   = useState([]);
  const [deploys, setDeploys] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      const [eRes, rRes, dRes] = await Promise.all([
        supabase.from("env_environments").select("*").eq("active", true).order("name"),
        supabase.from("env_repositories").select("*").eq("active", true).order("name"),
        supabase.from("env_deployments").select("*").order("deployed_at", { ascending: false }),
      ]);
      setEnvs(eRes.data   || []);
      setRepos(rRes.data  || []);
      setDeploys(dRes.data || []);
    } catch (e) { /* tables may not exist yet */ }
    finally { setLoading(false); }
  }

  if (loading) return (
    <div style={{ padding: 40, textAlign: "center", color: "var(--tx3)", fontSize: 13 }}>
      Cargando entornos…
    </div>
  );

  if (!envs.length && !repos.length) return (
    <div style={{ padding: 40, textAlign: "center" }}>
      <div style={{ fontSize: 32, marginBottom: 12 }}>🖥️</div>
      <div style={{ fontSize: 14, color: "var(--tx3)", marginBottom: 6 }}>No hay entornos configurados</div>
      <div style={{ fontSize: 12, color: "var(--tx3)" }}>Un admin puede configurarlos en Admin → Environments</div>
    </div>
  );

  function getDeployment(repoId, envId) {
    return deploys.find(d => d.repository_id === repoId && d.environment_id === envId);
  }

  return (
    <div style={{ padding: 20, overflow: "auto", height: "100%" }}>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: "var(--tx)", marginBottom: 4 }}>🖥️ Environments</h2>
        <p style={{ fontSize: 12, color: "var(--tx3)" }}>Estado de despliegue por entorno y repositorio</p>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", width: "100%" }}>
          <thead>
            <tr>
              <th style={{ padding: "10px 14px", textAlign: "left", fontSize: 11, color: "var(--tx3)", fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", borderBottom: "1px solid var(--bd)", background: "var(--sf)" }}>
                Repositorio
              </th>
              {envs.map(env => (
                <th key={env.id} style={{ padding: "10px 14px", textAlign: "center", fontSize: 11, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", borderBottom: "1px solid var(--bd)", background: "var(--sf)", whiteSpace: "nowrap" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "center" }}>
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: env.color || "var(--ac)" }} />
                    <span style={{ color: env.color || "var(--ac2)" }}>{env.name}</span>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {repos.map(repo => (
              <tr key={repo.id}>
                <td style={{ padding: "10px 14px", fontSize: 12, fontWeight: 600, color: "var(--tx)", borderBottom: "1px solid var(--bd)", background: "var(--sf)", whiteSpace: "nowrap" }}>
                  ⬡ {repo.name}
                </td>
                {envs.map(env => {
                  const dep = getDeployment(repo.id, env.id);
                  return (
                    <td key={env.id} style={{ padding: "8px 14px", textAlign: "center", borderBottom: "1px solid var(--bd)", background: "var(--sf)" }}>
                      {dep ? (
                        <div style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                          <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--green)", fontWeight: 700 }}>{dep.version}</span>
                          <span style={{ fontSize: 9, color: "var(--tx3)" }}>{new Date(dep.deployed_at).toLocaleDateString("es-ES")}</span>
                        </div>
                      ) : (
                        <span style={{ fontSize: 11, color: "var(--tx3)" }}>—</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN: Entornos
// ─────────────────────────────────────────────────────────────────────────────
export function AdminEnvEnvironments({ supabase }) {
  const [envs,    setEnvs]    = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [editId,  setEditId]  = useState(null);
  const [form, setForm] = useState({ name: "", color: "#4f6ef7", url: "", description: "" });

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const { data } = await supabase.from("env_environments").select("*").order("name");
    setEnvs(data || []);
    setLoading(false);
  }

  async function save() {
    if (!form.name.trim()) return;
    setSaving(true);
    if (editId) {
      await supabase.from("env_environments").update({ ...form, updated_at: new Date().toISOString() }).eq("id", editId);
    } else {
      await supabase.from("env_environments").insert({ ...form, active: true });
    }
    setForm({ name: "", color: "#4f6ef7", url: "", description: "" });
    setEditId(null);
    await load();
    setSaving(false);
  }

  async function del(id) {
    await supabase.from("env_environments").update({ active: false }).eq("id", id);
    setEnvs(e => e.filter(x => x.id !== id));
  }

  function startEdit(env) {
    setEditId(env.id);
    setForm({ name: env.name, color: env.color || "#4f6ef7", url: env.url || "", description: env.description || "" });
  }

  if (loading) return <div style={{ color: "var(--tx3)", fontSize: 12 }}>Cargando…</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ fontSize: 12, color: "var(--tx3)" }}>
        Define los entornos de despliegue (dev, staging, production, etc.)
      </div>

      {/* Lista */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {envs.map(env => (
          <div key={env.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: "var(--sf2)", border: "1px solid var(--bd)", borderRadius: 8 }}>
            <div style={{ width: 12, height: 12, borderRadius: "50%", background: env.color, flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--tx)" }}>{env.name}</div>
              {env.url && <div style={{ fontSize: 11, color: "var(--tx3)" }}>{env.url}</div>}
            </div>
            <button onClick={() => startEdit(env)} style={{ background: "none", border: "none", color: "var(--tx3)", cursor: "pointer", fontSize: 13 }}>✎</button>
            <button onClick={() => del(env.id)} style={{ background: "none", border: "none", color: "var(--red)", cursor: "pointer", fontSize: 14 }}>×</button>
          </div>
        ))}
        {envs.length === 0 && (
          <div style={{ fontSize: 12, color: "var(--tx3)", textAlign: "center", padding: "16px 0" }}>Sin entornos configurados</div>
        )}
      </div>

      {/* Formulario */}
      <div style={{ background: "var(--sf2)", border: "1px solid var(--bd)", borderRadius: 10, padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "var(--tx3)", textTransform: "uppercase", letterSpacing: ".08em" }}>
          {editId ? "Editar entorno" : "Nuevo entorno"}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8 }}>
          <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            placeholder="Nombre (ej: Production)"
            style={{ background: "var(--sf)", border: "1px solid var(--bd)", borderRadius: 6, padding: "7px 10px", color: "var(--tx)", fontSize: 12, fontFamily: "inherit", outline: "none" }} />
          <input type="color" value={form.color} onChange={e => setForm(f => ({ ...f, color: e.target.value }))}
            style={{ width: 40, height: 34, border: "none", background: "none", cursor: "pointer", padding: 0 }} />
        </div>
        <input value={form.url} onChange={e => setForm(f => ({ ...f, url: e.target.value }))}
          placeholder="URL (opcional)"
          style={{ background: "var(--sf)", border: "1px solid var(--bd)", borderRadius: 6, padding: "7px 10px", color: "var(--tx)", fontSize: 12, fontFamily: "inherit", outline: "none" }} />
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          {editId && (
            <button onClick={() => { setEditId(null); setForm({ name: "", color: "#4f6ef7", url: "", description: "" }); }}
              style={{ padding: "6px 14px", borderRadius: 6, border: "1px solid var(--bd)", background: "var(--sf)", color: "var(--tx2)", cursor: "pointer", fontSize: 12, fontFamily: "inherit" }}>
              Cancelar
            </button>
          )}
          <button onClick={save} disabled={saving || !form.name.trim()}
            style={{ padding: "6px 16px", borderRadius: 6, border: "none", background: "var(--ac)", color: "#fff", cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: "inherit", opacity: saving || !form.name.trim() ? 0.5 : 1 }}>
            {saving ? "Guardando…" : editId ? "Guardar" : "+ Añadir"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN: Repositorios
// ─────────────────────────────────────────────────────────────────────────────
export function AdminEnvRepositories({ supabase }) {
  const [repos,   setRepos]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [editId,  setEditId]  = useState(null);
  const [form, setForm] = useState({ name: "", url: "", description: "" });

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const { data } = await supabase.from("env_repositories").select("*").order("name");
    setRepos(data || []);
    setLoading(false);
  }

  async function save() {
    if (!form.name.trim()) return;
    setSaving(true);
    if (editId) {
      await supabase.from("env_repositories").update({ ...form }).eq("id", editId);
    } else {
      await supabase.from("env_repositories").insert({ ...form, active: true });
    }
    setForm({ name: "", url: "", description: "" });
    setEditId(null);
    await load();
    setSaving(false);
  }

  async function del(id) {
    await supabase.from("env_repositories").update({ active: false }).eq("id", id);
    setRepos(r => r.filter(x => x.id !== id));
  }

  function startEdit(r) {
    setEditId(r.id);
    setForm({ name: r.name, url: r.url || "", description: r.description || "" });
  }

  if (loading) return <div style={{ color: "var(--tx3)", fontSize: 12 }}>Cargando…</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ fontSize: 12, color: "var(--tx3)" }}>
        Repositorios cuyo despliegue quieres rastrear por entorno.
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {repos.map(repo => (
          <div key={repo.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: "var(--sf2)", border: "1px solid var(--bd)", borderRadius: 8 }}>
            <span style={{ fontSize: 16 }}>⬡</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--tx)" }}>{repo.name}</div>
              {repo.url && <div style={{ fontSize: 11, color: "var(--ac2)", fontFamily: "var(--mono)" }}>{repo.url}</div>}
            </div>
            <button onClick={() => startEdit(repo)} style={{ background: "none", border: "none", color: "var(--tx3)", cursor: "pointer", fontSize: 13 }}>✎</button>
            <button onClick={() => del(repo.id)} style={{ background: "none", border: "none", color: "var(--red)", cursor: "pointer", fontSize: 14 }}>×</button>
          </div>
        ))}
        {repos.length === 0 && (
          <div style={{ fontSize: 12, color: "var(--tx3)", textAlign: "center", padding: "16px 0" }}>Sin repositorios</div>
        )}
      </div>

      <div style={{ background: "var(--sf2)", border: "1px solid var(--bd)", borderRadius: 10, padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "var(--tx3)", textTransform: "uppercase", letterSpacing: ".08em" }}>
          {editId ? "Editar repositorio" : "Nuevo repositorio"}
        </div>
        <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
          placeholder="Nombre (ej: backend-api)"
          style={{ background: "var(--sf)", border: "1px solid var(--bd)", borderRadius: 6, padding: "7px 10px", color: "var(--tx)", fontSize: 12, fontFamily: "inherit", outline: "none" }} />
        <input value={form.url} onChange={e => setForm(f => ({ ...f, url: e.target.value }))}
          placeholder="URL del repositorio (opcional)"
          style={{ background: "var(--sf)", border: "1px solid var(--bd)", borderRadius: 6, padding: "7px 10px", color: "var(--tx)", fontSize: 12, fontFamily: "inherit", outline: "none" }} />
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          {editId && (
            <button onClick={() => { setEditId(null); setForm({ name: "", url: "", description: "" }); }}
              style={{ padding: "6px 14px", borderRadius: 6, border: "1px solid var(--bd)", background: "var(--sf)", color: "var(--tx2)", cursor: "pointer", fontSize: 12, fontFamily: "inherit" }}>
              Cancelar
            </button>
          )}
          <button onClick={save} disabled={saving || !form.name.trim()}
            style={{ padding: "6px 16px", borderRadius: 6, border: "none", background: "var(--ac)", color: "#fff", cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: "inherit", opacity: saving || !form.name.trim() ? 0.5 : 1 }}>
            {saving ? "Guardando…" : editId ? "Guardar" : "+ Añadir"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN: Política
// ─────────────────────────────────────────────────────────────────────────────
export function AdminEnvPolicy({ supabase }) {
  const [policy, setPolicy] = useState({
    require_approval: false,
    freeze_production: false,
    notify_on_deploy: true,
    max_concurrent_deploys: 2,
  });
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [saved,   setSaved]   = useState(false);

  useEffect(() => {
    supabase.from("env_deploy_policy").select("*").limit(1).single()
      .then(({ data }) => { if (data?.value) setPolicy(v => ({ ...v, ...data.value })); })
      .finally(() => setLoading(false));
  }, []);

  async function save() {
    setSaving(true);
    const { data: existing } = await supabase.from("env_deploy_policy").select("id").limit(1).single();
    if (existing?.id) {
      await supabase.from("env_deploy_policy").update({ value: policy, updated_at: new Date().toISOString() }).eq("id", existing.id);
    } else {
      await supabase.from("env_deploy_policy").insert({ value: policy });
    }
    setSaving(false); setSaved(true); setTimeout(() => setSaved(false), 2500);
  }

  if (loading) return <div style={{ color: "var(--tx3)", fontSize: 12 }}>Cargando…</div>;

  const toggles = [
    { key: "require_approval",   label: "Requerir aprobación antes de desplegar", desc: "Un admin debe aprobar cada despliegue" },
    { key: "freeze_production",  label: "Congelar producción",                    desc: "Bloquea todos los despliegues a producción" },
    { key: "notify_on_deploy",   label: "Notificar al desplegar",                 desc: "Envía notificación cuando se registra un despliegue" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ fontSize: 12, color: "var(--tx3)" }}>Política global de despliegues.</div>

      {toggles.map(({ key, label, desc }) => (
        <div key={key} onClick={() => setPolicy(p => ({ ...p, [key]: !p[key] }))}
          style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", background: "var(--sf2)", border: `1px solid ${policy[key] ? "rgba(62,207,142,.3)" : "var(--bd)"}`, borderRadius: 8, cursor: "pointer" }}>
          <div style={{ width: 18, height: 18, borderRadius: 4, background: policy[key] ? "var(--green)" : "transparent", border: `2px solid ${policy[key] ? "var(--green)" : "var(--bd2)"}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            {policy[key] && <span style={{ color: "#fff", fontSize: 11, fontWeight: 700 }}>✓</span>}
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: "var(--tx)" }}>{label}</div>
            <div style={{ fontSize: 11, color: "var(--tx3)" }}>{desc}</div>
          </div>
        </div>
      ))}

      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", background: "var(--sf2)", border: "1px solid var(--bd)", borderRadius: 8 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--tx)" }}>Máx. despliegues simultáneos</div>
          <div style={{ fontSize: 11, color: "var(--tx3)" }}>Por entorno</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button onClick={() => setPolicy(p => ({ ...p, max_concurrent_deploys: Math.max(1, p.max_concurrent_deploys - 1) }))}
            style={{ width: 28, height: 28, borderRadius: 6, border: "1px solid var(--bd)", background: "transparent", color: "var(--tx2)", cursor: "pointer", fontSize: 15, fontFamily: "inherit" }}>−</button>
          <span style={{ fontSize: 18, fontWeight: 700, color: "var(--tx)", minWidth: 28, textAlign: "center" }}>{policy.max_concurrent_deploys}</span>
          <button onClick={() => setPolicy(p => ({ ...p, max_concurrent_deploys: Math.min(10, p.max_concurrent_deploys + 1) }))}
            style={{ width: 28, height: 28, borderRadius: 6, border: "1px solid var(--bd)", background: "transparent", color: "var(--tx2)", cursor: "pointer", fontSize: 15, fontFamily: "inherit" }}>+</button>
        </div>
      </div>

      <button onClick={save} disabled={saving}
        style={{ padding: "8px 20px", borderRadius: 8, border: "none", background: saved ? "var(--green)" : "var(--ac)", color: "#fff", cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: "inherit", alignSelf: "flex-start" }}>
        {saving ? "Guardando…" : saved ? "✓ Guardado" : "Guardar política"}
      </button>
    </div>
  );
}
