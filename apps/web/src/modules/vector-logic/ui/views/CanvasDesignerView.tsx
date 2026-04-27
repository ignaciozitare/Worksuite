// @ts-nocheck
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  useReactFlow,
  MarkerType,
  type Connection,
  type Edge,
  type Node,
  BackgroundVariant,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useTranslation } from '@worksuite/i18n';
import { useDialog } from '@worksuite/ui';
import { StateNode } from '../components/StateNode';
import type { State, WorkflowState, StateCategory } from '../../domain/entities/State';
import type { Transition } from '../../domain/entities/Transition';
import type { Workflow } from '../../domain/entities/Workflow';
import { workflowRepo, stateRepo, transitionRepo } from '../../container';

const nodeTypes = { stateNode: StateNode };

const MINIMAP_HEX: Record<StateCategory, string> = {
  BACKLOG: '#8c909f',
  OPEN: '#f5a623',
  IN_PROGRESS: '#4f6ef7',
  DONE: '#3ecf8e',
};

/** Local, in-memory representation of a workflow_states row while the user
 *  edits the canvas. `dbId` is null for nodes added in this session; `deleted`
 *  is true when the user marks a node for removal. The original numeric
 *  fields are kept for the dirty-check. */
type DraftState = {
  dbId: string | null;
  tempId: string;
  stateId: string;
  positionX: number;
  positionY: number;
  isInitial: boolean;
  deleted: boolean;
  state: State;
  origPositionX: number;
  origPositionY: number;
  origIsInitial: boolean;
};

/** Local representation of a transition row. Edges reference DraftState
 *  by tempId (because new states have no dbId until save). The handle ids
 *  remember which side of each node the user actually clicked (so the line
 *  goes where they wanted it, not always bottom→top). They are not
 *  persisted in vl_transitions today, but we recompute reasonable
 *  defaults at load time based on relative node positions. */
type HandleSide = 't' | 'b' | 'l' | 'r';
type DraftEdge = {
  dbId: string | null;
  tempId: string;
  fromTempId: string;
  toTempId: string;
  sourceHandle: string;       // e.g. "r-source"
  targetHandle: string;       // e.g. "l-target"
  label: string | null;
  isGlobal: boolean;
  deleted: boolean;
  origLabel: string | null;
  origIsGlobal: boolean;
};

interface Props {
  currentUser: { id: string; [k: string]: unknown };
}

export function CanvasDesignerView(props: Props) {
  return (
    <ReactFlowProvider>
      <CanvasDesignerInner {...props} />
    </ReactFlowProvider>
  );
}

function CanvasDesignerInner({ currentUser }: Props) {
  const { t } = useTranslation();
  const dialog = useDialog();
  const { screenToFlowPosition } = useReactFlow();
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [selected, setSelected] = useState<Workflow | null>(null);
  const [allStates, setAllStates] = useState<State[]>([]);
  const [draftStates, setDraftStates] = useState<DraftState[]>([]);
  const [draftEdges, setDraftEdges] = useState<DraftEdge[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [draggingLibState, setDraggingLibState] = useState<State | null>(null);
  const [canvasDragOver, setCanvasDragOver] = useState(false);
  /** When set, an edge popover is open at the given screen coordinates. */
  const [edgePopover, setEdgePopover] = useState<{ edgeId: string; x: number; y: number } | null>(null);

  // Load
  useEffect(() => {
    (async () => {
      try {
        const [wfs, sts] = await Promise.all([workflowRepo.findAll(), stateRepo.findAll()]);
        setWorkflows(wfs);
        setAllStates(sts);
        if (wfs.length > 0) {
          setSelected(wfs[0]);
          await loadWorkflow(wfs[0].id);
        }
      } catch (err) { console.error('[CanvasDesigner]', err); }
      finally { setLoading(false); }
    })();
  }, []);

  /** Pull canvas state from the DB and rebuild the draft (clean slate). */
  const loadWorkflow = async (wfId: string) => {
    const [ws, tr] = await Promise.all([
      stateRepo.findByWorkflow(wfId),
      transitionRepo.findByWorkflow(wfId),
    ]);
    const dStates: DraftState[] = ws.map(w => ({
      dbId: w.id,
      tempId: w.id,                       // reuse dbId as tempId for stability
      stateId: w.stateId,
      positionX: w.positionX,
      positionY: w.positionY,
      isInitial: w.isInitial,
      deleted: false,
      state: w.state!,
      origPositionX: w.positionX,
      origPositionY: w.positionY,
      origIsInitial: w.isInitial,
    }));
    // Build a stateId → tempId map. If the same stateId is in two ws rows
    // (shouldn't happen given UNIQUE(workflow_id, state_id), but be safe),
    // pick the first.
    const stateToTemp = new Map<string, string>();
    dStates.forEach(s => { if (!stateToTemp.has(s.stateId)) stateToTemp.set(s.stateId, s.tempId); });

    const dEdges: DraftEdge[] = tr
      .map(e => {
        const fromTemp = stateToTemp.get(e.fromStateId);
        const toTemp   = stateToTemp.get(e.toStateId);
        if (!fromTemp || !toTemp) return null;
        const fromState = dStates.find(s => s.tempId === fromTemp)!;
        const toState   = dStates.find(s => s.tempId === toTemp)!;
        const { source, target } = pickDefaultHandles(fromState, toState);
        return {
          dbId: e.id,
          tempId: e.id,
          fromTempId: fromTemp,
          toTempId: toTemp,
          sourceHandle: source,
          targetHandle: target,
          label: e.label,
          isGlobal: e.isGlobal,
          deleted: false,
          origLabel: e.label,
          origIsGlobal: e.isGlobal,
        } as DraftEdge;
      })
      .filter(Boolean) as DraftEdge[];

    setDraftStates(dStates);
    setDraftEdges(dEdges);
  };

  const selectWorkflow = async (wf: Workflow) => {
    if (await guardLeave()) {
      setSelected(wf);
      await loadWorkflow(wf.id);
    }
  };

  /** Returns true if it's safe to discard or proceed (no changes, or user
   *  confirmed via dialog). */
  const guardLeave = async (): Promise<boolean> => {
    if (!isDirty) return true;
    return await dialog.confirm(
      t('vectorLogic.canvasUnsavedConfirm'),
      { title: t('vectorLogic.canvasUnsaved'), confirmLabel: t('common.confirm') },
    );
  };

  /** Render-friendly nodes & edges derived from the draft, filtered to drop
   *  rows the user marked as deleted. */
  const visibleStates = useMemo(() => draftStates.filter(s => !s.deleted), [draftStates]);
  const visibleEdges  = useMemo(() => draftEdges.filter(e => !e.deleted), [draftEdges]);

  const nodes: Node[] = useMemo(() => visibleStates.map(s => ({
    id: s.tempId,
    type: 'stateNode',
    position: { x: s.positionX, y: s.positionY },
    data: {
      label: s.state.name,
      category: s.state.category,
      color: s.state.color,
      isInitial: s.isInitial,
      onRename: (newName: string) => renameStateGlobally(s.stateId, newName),
      onDelete: () => requestDeleteState(s.tempId),
    },
  })), [visibleStates]);

  const edges: Edge[] = useMemo(() => visibleEdges.map(e => ({
    id: e.tempId,
    source: e.fromTempId,
    target: e.toTempId,
    sourceHandle: e.sourceHandle,
    targetHandle: e.targetHandle,
    type: 'smoothstep',
    pathOptions: { borderRadius: 12, offset: 16 },
    label: e.label ?? '',
    animated: e.isGlobal,
    markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18, color: '#4f6ef7' },
    style: { stroke: '#4f6ef7', strokeWidth: 2 },
    labelStyle: { fontSize: 'var(--fs-2xs)', fontWeight: 600, fill: '#8c909f' },
    labelBgStyle: { fill: '#1c1b1b', fillOpacity: 0.9 },
  })), [visibleEdges]);

  // ── Mutations on the draft only — no DB calls until Save ────────────────

  const onConnect = useCallback((connection: Connection) => {
    if (!connection.source || !connection.target) return;
    if (connection.source === connection.target) return;
    // Block duplicates already present (incl. dbId rows; deleted ones are OK).
    setDraftEdges(prev => {
      const exists = prev.some(e => !e.deleted && e.fromTempId === connection.source && e.toTempId === connection.target);
      if (exists) return prev;
      return [...prev, {
        dbId: null,
        tempId: genId(),
        fromTempId: connection.source!,
        toTempId: connection.target!,
        // Honour the side of the node the user actually clicked. Default to
        // bottom→top when the connection drop didn't carry a handle id.
        sourceHandle: connection.sourceHandle ?? 'b-source',
        targetHandle: connection.targetHandle ?? 't-target',
        label: null,
        isGlobal: false,
        deleted: false,
        origLabel: null,
        origIsGlobal: false,
      }];
    });
  }, []);

  const onNodeDragStop = useCallback((_: any, node: Node) => {
    setDraftStates(prev => prev.map(s => s.tempId === node.id
      ? { ...s, positionX: node.position.x, positionY: node.position.y }
      : s));
  }, []);

  /** Rename a state in the GLOBAL library (vl_states). This persists
   *  immediately because the row is shared across workflows — there is no
   *  per-canvas draft of vl_states. */
  const renameStateGlobally = async (stateId: string, newName: string) => {
    try {
      await stateRepo.update(stateId, { name: newName });
      setAllStates(prev => prev.map(s => s.id === stateId ? { ...s, name: newName } : s));
      setDraftStates(prev => prev.map(s => s.stateId === stateId
        ? { ...s, state: { ...s.state, name: newName } }
        : s));
    } catch (err: any) {
      const code = err?.code ?? '';
      if (code === '23505') {
        await dialog.alert(t('vectorLogic.stateNameTaken'), { title: t('vectorLogic.cannotRename') });
      } else {
        console.error('[CanvasDesigner] rename failed', err);
      }
    }
  };

  const requestDeleteState = async (tempId: string) => {
    const target = draftStates.find(s => s.tempId === tempId);
    if (!target) return;
    const connectedEdges = draftEdges.filter(e =>
      !e.deleted && (e.fromTempId === tempId || e.toTempId === tempId));
    // If the node has incoming/outgoing transitions, ask the user before
    // the cascade — deleting a state cascades all its connections.
    if (connectedEdges.length > 0) {
      const ok = await dialog.confirm(
        t('vectorLogic.canvasDeleteStateConfirm').replace('{count}', String(connectedEdges.length)),
        { title: t('vectorLogic.canvasDeleteState'), danger: true, confirmLabel: t('common.delete') },
      );
      if (!ok) return;
    }
    setDraftStates(prev => {
      // Mark state as deleted; if it was new (no dbId), drop it entirely.
      return prev.map(s => s.tempId === tempId
        ? { ...s, deleted: true } as DraftState
        : s).filter(s => !(s.deleted && !s.dbId));
    });
    // Cascade: drop edges referencing this state.
    setDraftEdges(prev => prev
      .map(e => (e.fromTempId === tempId || e.toTempId === tempId)
        ? { ...e, deleted: true }
        : e)
      .filter(e => !(e.deleted && !e.dbId)));
  };

  const requestDeleteEdge = (edgeTempId: string) => {
    setDraftEdges(prev => prev
      .map(e => e.tempId === edgeTempId ? { ...e, deleted: true } : e)
      .filter(e => !(e.deleted && !e.dbId)));
    setEdgePopover(null);
  };

  const updateEdge = (edgeTempId: string, patch: Partial<Pick<DraftEdge, 'label' | 'isGlobal'>>) => {
    setDraftEdges(prev => prev.map(e => e.tempId === edgeTempId ? { ...e, ...patch } : e));
  };

  /** React Flow's onEdgeClick: open the popover at the click position. */
  const onEdgeClick = useCallback((evt: React.MouseEvent, edge: Edge) => {
    setEdgePopover({ edgeId: edge.id, x: evt.clientX, y: evt.clientY });
  }, []);

  // Add state from library at a specific position
  const addStateToCanvas = (state: State, dropPosition?: { x: number; y: number }) => {
    if (!selected) return;
    // Block adding a state already on the canvas (UNIQUE(workflow_id, state_id) DB-side).
    if (draftStates.some(s => !s.deleted && s.stateId === state.id)) return;
    if (state.category === 'OPEN' && draftStates.some(s => !s.deleted && s.state.category === 'OPEN')) return;
    const x = dropPosition?.x ?? 100 + Math.random() * 400;
    const y = dropPosition?.y ?? 100 + Math.random() * 300;
    setDraftStates(prev => [...prev, {
      dbId: null,
      tempId: genId(),
      stateId: state.id,
      positionX: x,
      positionY: y,
      isInitial: state.category === 'OPEN',
      deleted: false,
      state,
      origPositionX: x,
      origPositionY: y,
      origIsInitial: state.category === 'OPEN',
    }]);
  };

  // ── Dirty check ─────────────────────────────────────────────────────────

  const isDirty = useMemo(() => {
    for (const s of draftStates) {
      if (!s.dbId) return true;       // new
      if (s.deleted) return true;     // pending delete
      if (s.positionX !== s.origPositionX || s.positionY !== s.origPositionY) return true;
      if (s.isInitial !== s.origIsInitial) return true;
    }
    for (const e of draftEdges) {
      if (!e.dbId) return true;
      if (e.deleted) return true;
      if (e.label !== e.origLabel) return true;
      if (e.isGlobal !== e.origIsGlobal) return true;
    }
    return false;
  }, [draftStates, draftEdges]);

  // ── Save / Discard ─────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!selected || !isDirty || saving) return;
    setSaving(true);
    try {
      // Phase 1: insert new states; capture new dbId per tempId.
      const tempToDb = new Map<string, string>();
      const newStates = draftStates.filter(s => !s.dbId && !s.deleted);
      for (const ds of newStates) {
        const ws = await stateRepo.addToWorkflow({
          workflowId: selected.id,
          stateId: ds.stateId,
          positionX: ds.positionX,
          positionY: ds.positionY,
          isInitial: ds.isInitial,
          sortOrder: 0,
        });
        tempToDb.set(ds.tempId, ws.id);
      }

      // Phase 2: update existing states with changed position / isInitial.
      for (const ds of draftStates) {
        if (!ds.dbId || ds.deleted) continue;
        const movedX = ds.positionX !== ds.origPositionX;
        const movedY = ds.positionY !== ds.origPositionY;
        if (movedX || movedY) {
          await stateRepo.updatePosition(ds.dbId, ds.positionX, ds.positionY);
        }
      }

      // Phase 3: delete edges first (avoid orphans referencing deleted states).
      for (const e of draftEdges) {
        if (e.deleted && e.dbId) {
          await transitionRepo.remove(e.dbId);
        }
      }

      // Phase 4: delete states from workflow.
      for (const ds of draftStates) {
        if (ds.deleted && ds.dbId) {
          await stateRepo.removeFromWorkflow(ds.dbId);
        }
      }

      // Phase 5: insert new edges. Resolve fromTempId/toTempId → vl_states.id
      //          via either an existing draft state's stateId or the freshly
      //          created tempToDb mapping (we need the STATE id, not the
      //          workflow_state id, since transitions reference vl_states).
      const tempIdToStateId = (tempId: string): string | null => {
        const ds = draftStates.find(s => s.tempId === tempId);
        return ds?.stateId ?? null;
      };
      for (const e of draftEdges) {
        if (!e.dbId && !e.deleted) {
          const fromState = tempIdToStateId(e.fromTempId);
          const toState   = tempIdToStateId(e.toTempId);
          if (!fromState || !toState) continue;
          try {
            await transitionRepo.create({
              workflowId: selected.id,
              fromStateId: fromState,
              toStateId: toState,
              isGlobal: e.isGlobal,
              label: e.label,
            });
          } catch (err: any) {
            // Tolerate unique violations (something already wrote this pair).
            if (err?.code !== '23505' && err?.code !== '23514') throw err;
          }
        }
      }

      // Phase 6: update edges with changed label / isGlobal.
      for (const e of draftEdges) {
        if (!e.deleted && e.dbId && (e.label !== e.origLabel || e.isGlobal !== e.origIsGlobal)) {
          await transitionRepo.update(e.dbId, { label: e.label, isGlobal: e.isGlobal });
        }
      }

      // Reload from DB to sync new dbIds and reset orig snapshots.
      await loadWorkflow(selected.id);
    } catch (err) {
      console.error('[CanvasDesigner] save failed', err);
      await dialog.alert(t('vectorLogic.canvasSaveFailed'), { title: t('common.error') });
    } finally {
      setSaving(false);
    }
  };

  const handleDiscard = async () => {
    if (!isDirty || !selected) return;
    const ok = await dialog.confirm(
      t('vectorLogic.canvasDiscardConfirm'),
      { title: t('vectorLogic.canvasDiscard'), danger: true, confirmLabel: t('vectorLogic.canvasDiscard') },
    );
    if (!ok) return;
    await loadWorkflow(selected.id);
    setEdgePopover(null);
  };

  // ── Library filter ─────────────────────────────────────────────────────

  const libraryStates = useMemo(() => {
    const inWorkflow = new Set(draftStates.filter(s => !s.deleted).map(s => s.stateId));
    return allStates
      .filter(s => !inWorkflow.has(s.id))
      .filter(s => !search || s.name.toLowerCase().includes(search.toLowerCase()));
  }, [allStates, draftStates, search]);

  if (loading) {
    return <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--tx3)' }}>{t('common.loading')}</div>;
  }

  return (
    <div style={{ display: 'flex', flex: 1, minHeight: 0, gap: 0 }}>
      {/* Canvas */}
      <div
        onDragOver={(e) => {
          if (draggingLibState) {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
            setCanvasDragOver(true);
          }
        }}
        onDragLeave={(e) => {
          if (e.currentTarget === e.target) setCanvasDragOver(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          if (!draggingLibState) return;
          const pos = screenToFlowPosition({ x: e.clientX, y: e.clientY });
          addStateToCanvas(draggingLibState, pos);
          setDraggingLibState(null);
          setCanvasDragOver(false);
        }}
        style={{
          flex: 1, minWidth: 0, position: 'relative',
          background: canvasDragOver ? 'rgba(79,110,247,.04)' : 'var(--bg)',
          overflow: 'hidden', borderRight: '1px solid var(--bd)',
          transition: 'background .2s',
        }}>
        {/* Workflow tabs */}
        {workflows.length > 0 && (
          <div style={{
            position: 'absolute', top: 12, left: 12, zIndex: 10,
            display: 'flex', gap: 4, background: 'var(--sf2)', border: '1px solid var(--bd)',
            borderRadius: 8, padding: 3, backdropFilter: 'blur(12px)',
          }}>
            {workflows.map(wf => (
              <button key={wf.id} onClick={() => selectWorkflow(wf)}
                style={{
                  background: selected?.id === wf.id ? 'var(--ac)' : 'transparent',
                  color: selected?.id === wf.id ? '#fff' : 'var(--tx3)',
                  border: 'none', borderRadius: 6, cursor: 'pointer',
                  fontWeight: selected?.id === wf.id ? 600 : 400,
                  fontSize: 'var(--fs-2xs)', padding: '5px 12px', fontFamily: 'inherit', transition: 'all .15s',
                }}>
                {wf.name}
              </button>
            ))}
          </div>
        )}

        {/* Save / Discard bar — top right */}
        <div style={{
          position: 'absolute', top: 12, right: 12, zIndex: 11,
          display: 'flex', gap: 8, alignItems: 'center',
        }}>
          {isDirty && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '6px 10px', borderRadius: 6,
              background: 'var(--amber-dim)', color: 'var(--amber)',
              fontSize: 'var(--fs-2xs)', fontWeight: 600, letterSpacing: '.04em',
              textTransform: 'uppercase',
            }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--amber)' }} />
              {t('vectorLogic.canvasUnsaved')}
            </span>
          )}
          <button
            type="button"
            onClick={handleDiscard}
            disabled={!isDirty || saving}
            style={{
              padding: '7px 14px', borderRadius: 8, fontSize: 'var(--fs-xs)', fontWeight: 600,
              fontFamily: 'inherit',
              background: 'var(--sf2)', border: '1px solid var(--bd)',
              color: isDirty ? 'var(--tx)' : 'var(--tx3)',
              cursor: isDirty ? 'pointer' : 'default', opacity: isDirty ? 1 : 0.5,
            }}
          >
            {t('vectorLogic.canvasDiscard')}
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!isDirty || saving}
            style={{
              padding: '7px 14px', borderRadius: 8, fontSize: 'var(--fs-xs)', fontWeight: 700,
              fontFamily: 'inherit', color: 'var(--ac-on)',
              background: isDirty
                ? 'linear-gradient(135deg, var(--ac), var(--ac-strong))'
                : 'var(--sf2)',
              border: 'none', cursor: isDirty ? 'pointer' : 'default',
              opacity: isDirty ? 1 : 0.5,
              boxShadow: isDirty ? '0 4px 12px var(--ac-dim)' : 'none',
            }}
          >
            {saving ? t('common.loading') : t('vectorLogic.canvasSave')}
          </button>
        </div>

        <ReactFlow
          nodes={nodes}
          edges={edges}
          // Local-only mutations on drag/connect. Save flow handles DB.
          onNodesChange={(changes) => {
            // Apply position & remove changes locally.
            changes.forEach(c => {
              if (c.type === 'position' && c.position) {
                setDraftStates(prev => prev.map(s => s.tempId === c.id
                  ? { ...s, positionX: c.position!.x, positionY: c.position!.y }
                  : s));
              }
            });
          }}
          onEdgesChange={() => {/* edges are derived from draft; no-op */}}
          onConnect={onConnect}
          onNodeDragStop={onNodeDragStop}
          onEdgeClick={onEdgeClick}
          nodeTypes={nodeTypes}
          fitView
          snapToGrid
          snapGrid={[16, 16]}
          deleteKeyCode={null}     // no keyboard delete — explicit UI only
          selectionKeyCode={null}
          multiSelectionKeyCode={null}
          style={{ background: 'var(--bg)' }}
        >
          <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="var(--bd)" />
          <Controls
            showInteractive={false}
            style={{ background: 'var(--sf2)', border: '1px solid var(--bd)', borderRadius: 8 }}
          />
          <MiniMap
            nodeColor={(n) => MINIMAP_HEX[n.data?.category] ?? '#8c909f'}
            style={{ background: 'var(--sf)', border: '1px solid var(--bd)', borderRadius: 8 }}
          />
        </ReactFlow>

        {/* Empty state */}
        {selected && nodes.length === 0 && (
          <div style={{
            position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
            textAlign: 'center', color: 'var(--tx3)', pointerEvents: 'none',
          }}>
            <span className="material-symbols-outlined" style={{ fontSize: 'var(--icon-lg)', opacity: .2, marginBottom: 8, display: 'block' }}>schema</span>
            <div style={{ fontSize: 'var(--fs-xs)', fontWeight: 500 }}>{t('vectorLogic.noStates')}</div>
            <div style={{ fontSize: 'var(--fs-2xs)', opacity: .6, marginTop: 4 }}>{t('vectorLogic.addState')}</div>
          </div>
        )}

        {/* Edge edit popover */}
        {edgePopover && (() => {
          const e = draftEdges.find(x => x.tempId === edgePopover.edgeId);
          if (!e) return null;
          return (
            <EdgePopover
              edge={e}
              x={edgePopover.x}
              y={edgePopover.y}
              onClose={() => setEdgePopover(null)}
              onPatch={(patch) => updateEdge(e.tempId, patch)}
              onDelete={() => requestDeleteEdge(e.tempId)}
              t={t}
            />
          );
        })()}
      </div>

      {/* Right sidebar — State Library */}
      <aside style={{
        width: 240, minWidth: 240, background: 'var(--sf)', borderLeft: '1px solid var(--bd)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        <div style={{ padding: '16px 14px 8px' }}>
          <h3 style={{
            fontSize: 'var(--fs-xs)', fontWeight: 700, color: 'var(--tx)', textTransform: 'uppercase',
            letterSpacing: '.08em', marginBottom: 10,
          }}>{t('vectorLogic.stateLibrary')}</h3>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder={t('vectorLogic.filterStates')}
            style={{
              width: '100%', padding: '6px 10px', fontSize: 'var(--fs-2xs)', fontFamily: 'inherit',
              background: 'var(--sf2)', border: '1px solid var(--bd)', borderRadius: 6,
              color: 'var(--tx)', outline: 'none',
            }} />
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 10px' }}>
          {libraryStates.length === 0 && (
            <div style={{ textAlign: 'center', padding: '12px 0', fontSize: 'var(--fs-2xs)', color: 'var(--tx3)', opacity: .6 }}>
              {t('vectorLogic.noItemsYet')}
            </div>
          )}
          {libraryStates.map(s => (
            <div key={s.id}
              draggable
              onDragStart={(e) => { setDraggingLibState(s); e.dataTransfer.effectAllowed = 'copy'; }}
              onDragEnd={() => setDraggingLibState(null)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '8px 10px', marginBottom: 4, borderRadius: 6,
                background: 'var(--sf2)', border: '1px solid var(--bd)',
                cursor: 'grab', userSelect: 'none',
              }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: s.color || 'var(--tx3)' }} />
              <span style={{ flex: 1, fontSize: 'var(--fs-xs)', color: 'var(--tx)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {s.name}
              </span>
              <span style={{ fontSize: 'var(--fs-2xs)', color: 'var(--tx3)', fontWeight: 700, letterSpacing: '.04em' }}>{s.category}</span>
            </div>
          ))}
        </div>
      </aside>
    </div>
  );
}

/** Small floating panel anchored at click coords. */
function EdgePopover({ edge, x, y, onClose, onPatch, onDelete, t }: {
  edge: DraftEdge;
  x: number;
  y: number;
  onClose: () => void;
  onPatch: (patch: Partial<Pick<DraftEdge, 'label' | 'isGlobal'>>) => void;
  onDelete: () => void;
  t: (k: string) => string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const handler = (ev: MouseEvent) => {
      if (ref.current && !ref.current.contains(ev.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  return (
    <div ref={ref}
      style={{
        position: 'fixed', left: x, top: y, transform: 'translate(-50%, 12px)', zIndex: 200,
        background: 'var(--sf)', border: '1px solid var(--bd)', borderRadius: 10,
        padding: 12, minWidth: 240,
        boxShadow: '0 16px 48px rgba(0,0,0,.5)',
        display: 'flex', flexDirection: 'column', gap: 10,
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <label style={{ fontSize: 'var(--fs-2xs)', fontWeight: 700, color: 'var(--tx3)', letterSpacing: '.05em', textTransform: 'uppercase' }}>
          {t('vectorLogic.transitionLabel')}
        </label>
        <input
          autoFocus
          value={edge.label ?? ''}
          onChange={(e) => onPatch({ label: e.target.value || null })}
          placeholder={t('vectorLogic.transitionLabelPlaceholder')}
          style={{
            background: 'var(--sf2)', border: '1px solid var(--bd)', borderRadius: 6,
            padding: '6px 10px', color: 'var(--tx)', fontSize: 'var(--fs-xs)', fontFamily: 'inherit',
            outline: 'none',
          }}
        />
      </div>

      <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
        <input
          type="checkbox"
          checked={edge.isGlobal}
          onChange={(e) => onPatch({ isGlobal: e.target.checked })}
          style={{ accentColor: 'var(--ac)' }}
        />
        <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--tx)' }}>
          {t('vectorLogic.transitionGlobal')}
        </span>
      </label>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--bd)', paddingTop: 8 }}>
        <button
          type="button"
          onClick={onDelete}
          style={{
            background: 'transparent', border: 'none', cursor: 'pointer',
            color: 'var(--red)', fontSize: 'var(--fs-xs)', fontWeight: 600, fontFamily: 'inherit',
            display: 'inline-flex', alignItems: 'center', gap: 4, padding: 0,
          }}>
          <span className="material-symbols-outlined" style={{ fontSize: 'var(--icon-xs)' }}>delete</span>
          {t('common.delete')}
        </button>
        <button
          type="button"
          onClick={onClose}
          style={{
            background: 'var(--sf2)', border: '1px solid var(--bd)', borderRadius: 6,
            padding: '4px 10px', color: 'var(--tx2)', fontSize: 'var(--fs-2xs)', fontWeight: 600,
            cursor: 'pointer', fontFamily: 'inherit',
          }}>
          {t('common.close')}
        </button>
      </div>
    </div>
  );
}

/** Stable id generator — uses crypto.randomUUID where available, falls back
 *  to a short random string otherwise. tempIds never leave the browser. */
function genId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return (crypto as any).randomUUID();
  }
  return 'tmp_' + Math.random().toString(36).slice(2);
}

/** Pick reasonable default source/target handles for an edge based on the
 *  relative position of the two nodes. Used when loading transitions from
 *  vl_transitions (which doesn't store handles). The user can still drag
 *  from a different handle; that choice persists in the draft as long as
 *  it's not saved + reloaded.
 *
 *  - Target above the source → source bottom-out, target top-in (default).
 *  - Target below           → source top-out, target bottom-in.
 *  - Target right           → source right-out, target left-in.
 *  - Target left            → source left-out, target right-in. */
function pickDefaultHandles(from: DraftState, to: DraftState): { source: string; target: string } {
  const dx = to.positionX - from.positionX;
  const dy = to.positionY - from.positionY;
  if (Math.abs(dx) > Math.abs(dy)) {
    return dx > 0
      ? { source: 'r-source', target: 'l-target' }
      : { source: 'l-source', target: 'r-target' };
  }
  return dy > 0
    ? { source: 'b-source', target: 't-target' }
    : { source: 't-source', target: 'b-target' };
}
