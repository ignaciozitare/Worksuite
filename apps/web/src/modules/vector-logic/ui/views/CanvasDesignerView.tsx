// @ts-nocheck
import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  type Connection,
  type Edge,
  type Node,
  BackgroundVariant,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useTranslation } from '@worksuite/i18n';
import { StateNode } from '../components/StateNode';
import type { State, WorkflowState, StateCategory } from '../../domain/entities/State';
import type { Transition } from '../../domain/entities/Transition';
import type { Workflow } from '../../domain/entities/Workflow';
import { workflowRepo, stateRepo, transitionRepo } from '../../container';

const nodeTypes = { stateNode: StateNode };

// React Flow MiniMap renders SVG and cannot resolve CSS variables at runtime.
// These hex values mirror the CSS vars (--tx3, --amber, --ac, --green) and are
// used ONLY by the MiniMap. For regular DOM elements, use CAT_VARS below.
const MINIMAP_HEX: Record<StateCategory, string> = {
  BACKLOG: '#8c909f',
  OPEN: '#f5a623',
  IN_PROGRESS: '#4f6ef7',
  DONE: '#3ecf8e',
};

const CAT_VARS: Record<StateCategory, string> = {
  BACKLOG: 'var(--tx3)',
  OPEN: 'var(--amber)',
  IN_PROGRESS: 'var(--ac)',
  DONE: 'var(--green)',
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
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [selected, setSelected] = useState<Workflow | null>(null);
  const [allStates, setAllStates] = useState<State[]>([]);
  const [wfStates, setWfStates] = useState<WorkflowState[]>([]);
  const [transitions, setTransitions] = useState<Transition[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  // Load data
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

  const loadWorkflow = async (wfId: string) => {
    const [ws, tr] = await Promise.all([
      stateRepo.findByWorkflow(wfId),
      transitionRepo.findByWorkflow(wfId),
    ]);
    setWfStates(ws);
    setTransitions(tr);
    buildGraph(ws, tr);
  };

  const buildGraph = (ws: WorkflowState[], tr: Transition[]) => {
    const newNodes: Node[] = ws.map(s => ({
      id: s.id,
      type: 'stateNode',
      position: { x: s.positionX, y: s.positionY },
      data: {
        label: s.state?.name ?? '—',
        category: s.state?.category ?? 'BACKLOG',
        color: s.state?.color ?? null,
        isInitial: s.isInitial,
        onConfigure: () => {},
        onDelete: () => removeNode(s.id),
      },
    }));

    const newEdges: Edge[] = tr.map(t => ({
      id: t.id,
      source: ws.find(s => s.stateId === t.fromStateId)?.id ?? '',
      target: ws.find(s => s.stateId === t.toStateId)?.id ?? '',
      label: t.label ?? '',
      animated: t.isGlobal,
      style: { stroke: 'var(--ac)', strokeWidth: 2 },
      labelStyle: { fontSize: 10, fontWeight: 600, fill: 'var(--tx3)' },
    }));

    setNodes(newNodes);
    setEdges(newEdges);
  };

  const selectWorkflow = async (wf: Workflow) => {
    setSelected(wf);
    await loadWorkflow(wf.id);
  };

  // Handle new connection (transition)
  const onConnect = useCallback(async (connection: Connection) => {
    if (!selected || !connection.source || !connection.target) return;
    const fromWs = wfStates.find(ws => ws.id === connection.source);
    const toWs = wfStates.find(ws => ws.id === connection.target);
    if (!fromWs || !toWs) return;

    const tr = await transitionRepo.create({
      workflowId: selected.id,
      fromStateId: fromWs.stateId,
      toStateId: toWs.stateId,
      isGlobal: false,
      label: null,
    });
    setTransitions(prev => [...prev, tr]);
    setEdges(eds => addEdge({
      ...connection,
      id: tr.id,
      animated: false,
      style: { stroke: 'var(--ac)', strokeWidth: 2 },
    }, eds));
  }, [selected, wfStates]);

  // Handle node drag end — save position
  const onNodeDragStop = useCallback(async (_: any, node: Node) => {
    await stateRepo.updatePosition(node.id, node.position.x, node.position.y);
  }, []);

  // Remove a node from workflow
  const removeNode = async (wsId: string) => {
    await stateRepo.removeFromWorkflow(wsId);
    setWfStates(prev => prev.filter(ws => ws.id !== wsId));
    setNodes(nds => nds.filter(n => n.id !== wsId));
    // Remove transitions involving this node
    const related = transitions.filter(t => {
      const ws = wfStates.find(s => s.id === wsId);
      return ws && (t.fromStateId === ws.stateId || t.toStateId === ws.stateId);
    });
    for (const tr of related) {
      await transitionRepo.remove(tr.id);
    }
    setTransitions(prev => prev.filter(t => !related.some(r => r.id === t.id)));
    setEdges(eds => eds.filter(e => e.source !== wsId && e.target !== wsId));
  };

  // Delete edge (transition)
  const onEdgesDelete = useCallback(async (deletedEdges: Edge[]) => {
    for (const edge of deletedEdges) {
      await transitionRepo.remove(edge.id);
      setTransitions(prev => prev.filter(t => t.id !== edge.id));
    }
  }, []);

  // Add state from library
  const addStateToCanvas = async (state: State) => {
    if (!selected) return;
    if (wfStates.some(ws => ws.stateId === state.id)) return;

    // One-OPEN rule
    const hasOpen = wfStates.some(ws => ws.state?.category === 'OPEN');
    if (state.category === 'OPEN' && hasOpen) return;

    const x = 100 + Math.random() * 400;
    const y = 100 + Math.random() * 300;
    const ws = await stateRepo.addToWorkflow({
      workflowId: selected.id,
      stateId: state.id,
      positionX: x,
      positionY: y,
      isInitial: state.category === 'OPEN',
    });
    setWfStates(prev => [...prev, ws]);
    setNodes(nds => [...nds, {
      id: ws.id,
      type: 'stateNode',
      position: { x, y },
      data: {
        label: state.name,
        category: state.category,
        color: state.color,
        isInitial: state.category === 'OPEN',
        onConfigure: () => {},
        onDelete: () => removeNode(ws.id),
      },
    }]);
  };

  // Filtered library states
  const libraryStates = useMemo(() => {
    const inWorkflow = new Set(wfStates.map(ws => ws.stateId));
    return allStates
      .filter(s => !inWorkflow.has(s.id))
      .filter(s => !search || s.name.toLowerCase().includes(search.toLowerCase()));
  }, [allStates, wfStates, search]);

  if (loading) {
    return <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--tx3)' }}>{t('common.loading')}</div>;
  }

  return (
    <div style={{ display: 'flex', flex: 1, minHeight: 0, gap: 0 }}>
      {/* Canvas */}
      <div style={{ flex: 1, minWidth: 0, position: 'relative', background: 'var(--bg)', overflow: 'hidden', borderRight: '1px solid var(--bd)' }}>
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
                  fontSize: 11, padding: '5px 12px', fontFamily: 'inherit', transition: 'all .15s',
                }}>
                {wf.name}
              </button>
            ))}
          </div>
        )}

        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeDragStop={onNodeDragStop}
          onEdgesDelete={onEdgesDelete}
          nodeTypes={nodeTypes}
          fitView
          snapToGrid
          snapGrid={[16, 16]}
          deleteKeyCode="Delete"
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
            <span className="material-symbols-outlined" style={{ fontSize: 48, opacity: .2, marginBottom: 8, display: 'block' }}>schema</span>
            <div style={{ fontSize: 13, fontWeight: 500 }}>{t('vectorLogic.noStates')}</div>
            <div style={{ fontSize: 11, opacity: .6, marginTop: 4 }}>{t('vectorLogic.addState')}</div>
          </div>
        )}
      </div>

      {/* Right sidebar — State Library */}
      <aside style={{
        width: 240, minWidth: 240, background: 'var(--sf)', borderLeft: '1px solid var(--bd)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        <div style={{ padding: '16px 14px 8px' }}>
          <h3 style={{
            fontSize: 12, fontWeight: 700, color: 'var(--tx)', textTransform: 'uppercase',
            letterSpacing: '.08em', marginBottom: 10,
          }}>{t('vectorLogic.stateLibrary')}</h3>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder={t('vectorLogic.filterStates')}
            style={{
              width: '100%', padding: '6px 10px', fontSize: 11, fontFamily: 'inherit',
              background: 'var(--sf2)', border: '1px solid var(--bd)', borderRadius: 6,
              color: 'var(--tx)', outline: 'none',
            }} />
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 10px' }}>
          {libraryStates.length === 0 && (
            <div style={{ fontSize: 11, color: 'var(--tx3)', textAlign: 'center', padding: '20px 0', opacity: .5 }}>
              {t('vectorLogic.noneYet')}
            </div>
          )}
          {libraryStates.map(s => {
            const catColor = CAT_VARS[s.category] ?? 'var(--tx3)';
            const hasOpen = wfStates.some(ws => ws.state?.category === 'OPEN');
            const blocked = s.category === 'OPEN' && hasOpen;
            return (
              <div key={s.id}
                onClick={() => !blocked && addStateToCanvas(s)}
                style={{
                  padding: '8px 10px', borderRadius: 6, marginBottom: 4,
                  cursor: blocked ? 'not-allowed' : 'pointer',
                  opacity: blocked ? .35 : 1,
                  borderLeft: `3px solid ${s.color || catColor}`,
                  transition: 'background .12s',
                }}
                onMouseEnter={e => { if (!blocked) e.currentTarget.style.background = 'var(--sf2)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--tx)' }}>{s.name}</div>
                <div style={{ fontSize: 9, color: catColor, fontWeight: 700, letterSpacing: '.05em', marginTop: 2 }}>{s.category}</div>
              </div>
            );
          })}
        </div>

        {/* Add state CTA */}
        <div style={{ padding: '10px 14px', borderTop: '1px solid var(--bd)' }}>
          <button style={{
            width: '100%', background: 'var(--ac)', color: '#fff', border: 'none',
            borderRadius: 8, padding: '8px 0', fontSize: 12, fontWeight: 600,
            cursor: 'pointer', fontFamily: 'inherit', display: 'flex',
            alignItems: 'center', justifyContent: 'center', gap: 6,
          }}>
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>add</span>
            {t('vectorLogic.addState')}
          </button>
        </div>
      </aside>
    </div>
  );
}
