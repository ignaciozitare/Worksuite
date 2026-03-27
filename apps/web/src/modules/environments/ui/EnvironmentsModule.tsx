// @ts-nocheck
// apps/web/src/modules/environments/ui/EnvironmentsModule.tsx
// ─── UI layer ─── NO direct Supabase calls ─── uses domain use cases ─────────
import { useState, useEffect, useMemo } from "react";
import { SupabaseEnvironmentRepository }  from "../infra/supabase";
import { SupabaseRepositoryRepository }   from "../infra/supabase";
import { SupabaseReservationRepository }  from "../infra/supabase";
import { SupabasePolicyRepository }       from "../infra/supabase";
import { CreateReservation }              from "../domain/useCases/CreateReservation";
import { CheckIn, CheckOut, CancelReservation, AddBranch } from "../domain/useCases/ReservationLifecycle";
import { autoRelease, reservationFromRow } from "../domain/entities/Reservation";

// ── Sub-components (UI-only, no domain logic) imported from same ui/ folder
// These are the same heavy components from the original monolith, kept as-is
// and passed pure data + callbacks.
import { Timeline }   from "./Timeline";
import { ResList }    from "./ResList";
import { ResDetail }  from "./ResDetail";
import { ResForm }    from "./ResForm";

// ─────────────────────────────────────────────────────────────────────────────

export default function EnvironmentsModule({ supabase, currentUser, wsUsers }) {
  // ── Repos (infra instances, stable across renders) ─────────────────────────
  const envRepo  = useMemo(() => new SupabaseEnvironmentRepository(supabase),  [supabase]);
  const repoRepo = useMemo(() => new SupabaseRepositoryRepository(supabase),   [supabase]);
  const resRepo  = useMemo(() => new SupabaseReservationRepository(supabase),  [supabase]);
  const polRepo  = useMemo(() => new SupabasePolicyRepository(supabase),       [supabase]);

  // ── Use cases (pure domain, no side effects) ───────────────────────────────
  const createReservationUC  = useMemo(() => new CreateReservation(resRepo, envRepo), [resRepo, envRepo]);
  const checkInUC            = useMemo(() => new CheckIn(resRepo),            [resRepo]);
  const checkOutUC           = useMemo(() => new CheckOut(resRepo),           [resRepo]);
  const cancelUC             = useMemo(() => new CancelReservation(resRepo),  [resRepo]);
  const addBranchUC          = useMemo(() => new AddBranch(resRepo),          [resRepo]);

  // ── State ──────────────────────────────────────────────────────────────────
  const [envs,    setEnvs]    = useState([]);
  const [repos,   setRepos]   = useState([]);
  const [ress,    setRess]    = useState([]);
  const [policy,  setPolicy]  = useState(null);
  const [view,    setView]    = useState("timeline");
  const [selRes,  setSelRes]  = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editRes, setEditRes] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  const users = useMemo(() =>
    (wsUsers ?? []).map(u => ({ id: u.id, name: u.name ?? u.email, email: u.email, role: u.role })),
    [wsUsers],
  );

  // ── Load all data ──────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [envData, repoData, resData, polData] = await Promise.all([
          envRepo.findAll(),
          repoRepo.findAll(),
          resRepo.findAll(),
          polRepo.get(),
        ]);
        if (cancelled) return;
        setEnvs(envData);
        setRepos(repoData);
        setRess(autoRelease(resData));
        setPolicy(polData);
      } catch (e) {
        if (!cancelled) setError(e.message ?? "Error cargando datos");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    // Auto-release timer
    const iv = setInterval(() => setRess(r => autoRelease(r)), 30_000);
    return () => { cancelled = true; clearInterval(iv); };
  }, [envRepo, repoRepo, resRepo, polRepo]);

  // ── Actions — all go through use cases ────────────────────────────────────

  const handleCheckIn = async (id) => {
    const res = ress.find(r => r.id === id);
    if (!res) return;
    // Optimistic update
    const optimistic = { ...res, status: "InUse", usage_session: { actual_start: new Date().toISOString(), actual_end: null, branches: [] } };
    setRess(r => r.map(x => x.id === id ? optimistic : x));
    setSelRes(null);
    try {
      await checkInUC.execute(res);
    } catch (e) {
      // Rollback
      setRess(r => r.map(x => x.id === id ? res : x));
      alert(e.message);
    }
  };

  const handleCheckOut = async (id) => {
    const res = ress.find(r => r.id === id);
    if (!res) return;
    const now = new Date().toISOString();
    const optimistic = { ...res, status: "Completed", usage_session: { ...(res.usage_session ?? {}), actual_end: now } };
    setRess(r => r.map(x => x.id === id ? optimistic : x));
    setSelRes(null);
    try {
      await checkOutUC.execute(res);
    } catch (e) {
      setRess(r => r.map(x => x.id === id ? res : x));
      alert(e.message);
    }
  };

  const handleCancel = async (id) => {
    const res = ress.find(r => r.id === id);
    if (!res) return;
    setRess(r => r.map(x => x.id === id ? { ...x, status: "Cancelled" } : x));
    setSelRes(null);
    try {
      await cancelUC.execute(res, currentUser?.id ?? "");
    } catch (e) {
      setRess(r => r.map(x => x.id === id ? res : x));
      alert(e.message);
    }
  };

  const handleAddBranch = async (rid, branch) => {
    const res = ress.find(r => r.id === rid);
    if (!res) return;
    const updatedSession = { ...(res.usage_session ?? { actual_start: null, actual_end: null, branches: [] }), branches: [...(res.usage_session?.branches ?? []), branch] };
    setRess(r => r.map(x => x.id === rid ? { ...x, usage_session: updatedSession } : x));
    setSelRes(p => p ? { ...p, usage_session: updatedSession } : p);
    try {
      await addBranchUC.execute(res, branch);
    } catch (e) {
      setRess(r => r.map(x => x.id === rid ? res : x));
      alert(e.message);
    }
  };

  const handleSaveReservation = async (formData) => {
    try {
      if (formData.id) {
        // Edit existing
        const updated = await resRepo.update(formData.id, formData);
        setRess(p => p.map(r => r.id === formData.id ? updated : r));
      } else {
        // Create new — goes through CreateReservation use case (validates policy + overlaps)
        const created = await createReservationUC.execute(
          {
            environment_id:          formData.environment_id,
            reserved_by_user_id:     currentUser?.id ?? "",
            reserved_by_name:        currentUser?.name ?? currentUser?.email ?? "",
            jira_issue_keys:         formData.jira_issue_keys ?? [],
            planned_start:           formData.planned_start,
            planned_end:             formData.planned_end,
            selected_repository_ids: formData.selected_repository_ids ?? [],
            notes:                   formData.notes ?? "",
            policy_flags:            {},
          },
          ress,
          policy,
        );
        setRess(p => [...p, created]);
      }
      setShowCreate(false);
      setEditRes(null);
      setSelRes(null);
    } catch (e) {
      alert(e.message);
    }
  };

  const handleUpdateReservation = async (id, updates) => {
    const prev = ress.find(r => r.id === id);
    setRess(p => p.map(r => r.id === id ? { ...r, ...updates } : r));
    try {
      await resRepo.update(id, updates);
    } catch (e) {
      setRess(p => p.map(r => r.id === id ? prev : r));
      alert(e.message);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  const NAV = [
    { id: "timeline", label: "Timeline", icon: "📅" },
    { id: "list",     label: "Reservas", icon: "📋" },
  ];

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--tx3,#6a6a9a)", fontSize: 14 }}>
      Cargando reservas…
    </div>
  );
  if (error) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "#ef4444", fontSize: 13 }}>
      ⚠ {error}
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Sub-nav */}
      <div style={{ display: "flex", gap: 2, padding: "6px 16px", borderBottom: "1px solid var(--bd,#252535)", background: "var(--sf,#12121e)", flexShrink: 0 }}>
        {NAV.map(n => (
          <button key={n.id} onClick={() => setView(n.id)} style={{
            background: view === n.id ? "rgba(99,102,241,.15)" : "transparent",
            color:      view === n.id ? "var(--ac,#6366f1)" : "var(--tx3,#6a6a9a)",
            fontWeight: view === n.id ? 600 : 400,
            border: "none",
            borderBottom: view === n.id ? "2px solid var(--ac,#6366f1)" : "2px solid transparent",
            borderRadius: "6px 6px 0 0",
            cursor: "pointer",
            padding: "6px 14px",
            fontSize: 13,
            fontFamily: "inherit",
            transition: "all .15s",
          }}>
            {n.icon} {n.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {view === "timeline" && (
        <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
          <Timeline
            envs={envs} ress={ress} repos={repos} users={users}
            currentUser={currentUser}
            onResClick={setSelRes}
            onNew={() => setShowCreate(true)}
            onResUpdate={handleUpdateReservation}
            policy={policy}
          />
        </div>
      )}
      {view === "list" && (
        <div style={{ flex: 1, overflowY: "auto" }}>
          <ResList
            ress={ress} envs={envs} repos={repos} users={users}
            currentUser={currentUser}
            onResClick={setSelRes}
            onNew={() => setShowCreate(true)}
          />
        </div>
      )}

      {/* Modals */}
      {selRes && !editRes && (
        <ResDetail
          res={selRes} envs={envs} repos={repos} users={users}
          currentUser={currentUser}
          onClose={() => setSelRes(null)}
          onEdit={r => { setEditRes(r); setSelRes(null); }}
          onCancel={handleCancel}
          onCheckIn={handleCheckIn}
          onCheckOut={handleCheckOut}
          onAddBranch={handleAddBranch}
        />
      )}
      {(showCreate || editRes) && (
        <ResForm
          res={editRes} envs={envs} repos={repos} ress={ress}
          currentUser={currentUser} policy={policy}
          onSave={handleSaveReservation}
          onClose={() => { setShowCreate(false); setEditRes(null); }}
        />
      )}
    </div>
  );
}
