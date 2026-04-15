// @ts-nocheck
import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from '@worksuite/i18n';
import type { State, StateCategory, WorkflowState } from '../../domain/entities/State';
import type { Workflow } from '../../domain/entities/Workflow';
import { workflowRepo, stateRepo } from '../../container';

// Column order requested by user: open → backlog → in_progress → done
const CATEGORIES: StateCategory[] = ['OPEN', 'BACKLOG', 'IN_PROGRESS', 'DONE'];

const CAT_COLORS: Record<StateCategory, { color: string; bg: string; border: string }> = {
  BACKLOG:     { color: 'var(--tx3)',    bg: 'rgba(140,144,159,.08)', border: 'rgba(140,144,159,.15)' },
  OPEN:        { color: 'var(--amber)',  bg: 'rgba(245,158,11,.08)', border: 'rgba(245,158,11,.2)' },
  IN_PROGRESS: { color: 'var(--ac)',     bg: 'rgba(79,110,247,.08)', border: 'rgba(79,110,247,.2)' },
  DONE:        { color: 'var(--green)',  bg: 'rgba(62,207,142,.08)', border: 'rgba(62,207,142,.2)' },
};

interface Props {
  currentUser: { id: string; [k: string]: unknown };
}

export function StateManagerView({ currentUser }: Props) {
  const { t } = useTranslation();
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [states, setStates] = useState<State[]>([]);
  const [selected, setSelected] = useState<Workflow | null>(null);
  const [wfStates, setWfStates] = useState<WorkflowState[]>([]);
  const [loading, setLoading] = useState(true);

  // State form (create OR edit)
  const [showForm, setShowForm] = useState(false);
  const [editingState, setEditingState] = useState<State | null>(null);
  const [formName, setFormName] = useState('');
  const [formCategory, setFormCategory] = useState<StateCategory>('OPEN');
  const [formColor, setFormColor] = useState('#6366f1');
  const [formError, setFormError] = useState('');

  // DnD state
  const [draggingWs, setDraggingWs] = useState<WorkflowState | null>(null);
  const [draggingLib, setDraggingLib] = useState<State | null>(null);
  const [dragOverCat, setDragOverCat] = useState<StateCategory | null>(null);

  // New workflow form
  const [showWfForm, setShowWfForm] = useState(false);
  const [wfName, setWfName] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const [wfs, sts] = await Promise.all([workflowRepo.findAll(), stateRepo.findAll()]);
        setWorkflows(wfs);
        setStates(sts);
        if (wfs.length > 0) {
          setSelected(wfs[0]);
          const ws = await stateRepo.findByWorkflow(wfs[0].id);
          setWfStates(ws);
        }
      } catch (err) { console.error('[StateManager]', err); }
      finally { setLoading(false); }
    })();
  }, []);

  const selectWorkflow = async (wf: Workflow) => {
    setSelected(wf);
    const ws = await stateRepo.findByWorkflow(wf.id);
    setWfStates(ws);
  };

  const grouped = useMemo(() => {
    const map: Record<StateCategory, WorkflowState[]> = { BACKLOG: [], OPEN: [], IN_PROGRESS: [], DONE: [] };
    wfStates.forEach(ws => {
      if (ws.state) map[ws.state.category].push(ws);
    });
    return map;
  }, [wfStates]);

  const openCreateForm = () => {
    setEditingState(null);
    setFormName(''); setFormCategory('OPEN'); setFormColor('#6366f1');
    setFormError(''); setShowForm(true);
  };

  const openEditForm = (s: State) => {
    setEditingState(s);
    setFormName(s.name);
    setFormCategory(s.category);
    setFormColor(s.color ?? '#6366f1');
    setFormError(''); setShowForm(true);
  };

  const saveState = async () => {
    if (!formName.trim()) { setFormError(t('admin.envNameRequired')); return; }
    try {
      if (editingState) {
        // Update existing state
        await stateRepo.update(editingState.id, {
          name: formName.trim(),
          category: formCategory,
          color: formColor,
        });
        setStates(prev => prev.map(s => s.id === editingState.id
          ? { ...s, name: formName.trim(), category: formCategory, color: formColor }
          : s));
        // Refresh wfStates so the columns reflect any category change
        if (selected) {
          const ws = await stateRepo.findByWorkflow(selected.id);
          setWfStates(ws);
        }
      } else {
        // Create new state
        const created = await stateRepo.create({
          name: formName.trim(),
          category: formCategory,
          color: formColor,
          isGlobal: false,
        });
        setStates(prev => [...prev, created]);
        // Auto-add to current workflow if one is selected
        if (selected) {
          if (formCategory === 'OPEN' && grouped.OPEN.length > 0) {
            setFormError(t('vectorLogic.oneOpenWarning'));
            return;
          }
          const ws = await stateRepo.addToWorkflow({
            workflowId: selected.id,
            stateId: created.id,
            positionX: 100 + Math.random() * 200,
            positionY: 100 + Math.random() * 200,
            isInitial: formCategory === 'OPEN',
          });
          setWfStates(prev => [...prev, ws]);
        }
      }
      setShowForm(false);
      setEditingState(null);
    } catch (err) { console.error('[SaveState]', err); setFormError(String(err)); }
  };

  const createWorkflow = async () => {
    if (!wfName.trim()) return;
    const wf = await workflowRepo.create({
      name: wfName.trim(),
      description: null,
      isPublished: false,
      createdBy: currentUser.id,
    });
    setWorkflows(prev => [...prev, wf]);
    setWfName('');
    setShowWfForm(false);
    selectWorkflow(wf);
  };

  const addExistingState = async (state: State) => {
    if (!selected) return;
    if (state.category === 'OPEN' && grouped.OPEN.length > 0) return;
    if (wfStates.some(ws => ws.stateId === state.id)) return;
    const ws = await stateRepo.addToWorkflow({
      workflowId: selected.id,
      stateId: state.id,
      positionX: 100 + Math.random() * 200,
      positionY: 100 + Math.random() * 200,
      isInitial: state.category === 'OPEN',
    });
    setWfStates(prev => [...prev, ws]);
  };

  const removeState = async (wsId: string) => {
    await stateRepo.removeFromWorkflow(wsId);
    setWfStates(prev => prev.filter(ws => ws.id !== wsId));
  };

  // Delete a state permanently from the library
  const deleteLibraryState = async (s: State) => {
    if (!confirm(t('common.delete') + ': ' + s.name + '?')) return;
    try {
      await stateRepo.remove(s.id);
      setStates(prev => prev.filter(x => x.id !== s.id));
      // Also drop any workflow usage locally
      setWfStates(prev => prev.filter(ws => ws.stateId !== s.id));
    } catch (err) { console.error('[DeleteState]', err); alert(String(err)); }
  };

  // Drop handler — change category when dropping into a column
  const handleDropOnColumn = async (cat: StateCategory) => {
    setDragOverCat(null);
    try {
      // Case A: dragging an existing workflow state card
      if (draggingWs && draggingWs.state) {
        const cur = draggingWs;
        setDraggingWs(null);
        if (cur.state!.category === cat) return;
        // One-OPEN rule
        if (cat === 'OPEN' && grouped.OPEN.length > 0) return;
        await stateRepo.update(cur.stateId, { category: cat });
        setStates(prev => prev.map(s => s.id === cur.stateId ? { ...s, category: cat } : s));
        setWfStates(prev => prev.map(ws => ws.stateId === cur.stateId
          ? { ...ws, state: ws.state ? { ...ws.state, category: cat } : ws.state }
          : ws));
        return;
      }
      // Case B: dragging a library state
      if (draggingLib) {
        const lib = draggingLib;
        setDraggingLib(null);
        if (wfStates.some(ws => ws.stateId === lib.id)) return;
        if (cat === 'OPEN' && grouped.OPEN.length > 0) return;
        if (lib.category !== cat) {
          await stateRepo.update(lib.id, { category: cat });
          setStates(prev => prev.map(s => s.id === lib.id ? { ...s, category: cat } : s));
        }
        const ws = await stateRepo.addToWorkflow({
          workflowId: selected!.id,
          stateId: lib.id,
          positionX: 100 + Math.random() * 200,
          positionY: 100 + Math.random() * 200,
          isInitial: cat === 'OPEN',
        });
        // Attach updated state to ws for local render
        setWfStates(prev => [...prev, { ...ws, state: { ...lib, category: cat } }]);
      }
    } catch (err) {
      console.error('[DropCategory]', err);
    }
  };

  if (loading) {
    return <div style={{textAlign:'center',padding:'40px 0',color:'var(--tx3)',fontSize:13}}>{t('common.loading')}</div>;
  }

  return (
    <div>
      {/* Header */}
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:24}}>
        <div>
          <h2 style={{fontSize:22,fontWeight:700,color:'var(--tx)',margin:0,fontFamily:"'Space Grotesk',sans-serif"}}>
            {t('vectorLogic.workflowEngine')}
          </h2>
          <p style={{fontSize:12,color:'var(--tx3)',marginTop:4}}>
            {t('vectorLogic.stateManager')}
          </p>
        </div>
        <div style={{display:'flex',gap:8}}>
          <button onClick={openCreateForm} style={btnStyle('primary')}>
            <span className="material-symbols-outlined" style={{fontSize:16}}>add</span>
            {t('vectorLogic.newState')}
          </button>
          <button onClick={() => setShowWfForm(true)} style={btnStyle('ghost')}>
            <span className="material-symbols-outlined" style={{fontSize:16}}>add</span>
            {t('vectorLogic.newWorkflow')}
          </button>
        </div>
      </div>

      {/* Workflow selector tabs */}
      {workflows.length > 0 && (
        <div style={{display:'flex',gap:4,marginBottom:20,background:'var(--sf2)',border:'1px solid var(--bd)',borderRadius:10,padding:4,width:'fit-content'}}>
          {workflows.map(wf => (
            <button key={wf.id} onClick={() => selectWorkflow(wf)}
              style={{
                background: selected?.id === wf.id ? 'var(--ac)' : 'transparent',
                color: selected?.id === wf.id ? '#fff' : 'var(--tx3)',
                border: 'none', borderRadius: 7, cursor: 'pointer', fontWeight: selected?.id === wf.id ? 600 : 400,
                fontSize: 12, padding: '6px 14px', transition: 'all .15s', fontFamily: 'inherit',
              }}>
              {wf.name}
              <span style={{fontSize:9,marginLeft:6,opacity:.7}}>{wf.isPublished ? '●' : '○'}</span>
            </button>
          ))}
        </div>
      )}

      {!selected && workflows.length === 0 && (
        <div style={{textAlign:'center',padding:'60px 0',color:'var(--tx3)'}}>
          <span className="material-symbols-outlined" style={{fontSize:48,opacity:.3,marginBottom:12,display:'block'}}>account_tree</span>
          <div style={{fontSize:14,fontWeight:500,marginBottom:8}}>{t('vectorLogic.noWorkflows')}</div>
          <button onClick={() => setShowWfForm(true)} style={btnStyle('primary')}>
            {t('vectorLogic.newWorkflow')}
          </button>
        </div>
      )}

      {/* State columns by category */}
      {selected && (
        <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:16}}>
          {CATEGORIES.map(cat => {
            const cc = CAT_COLORS[cat];
            const items = grouped[cat];
            const isOver = dragOverCat === cat;
            return (
              <div key={cat}
                onDragOver={(e) => {
                  if (draggingWs || draggingLib) {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = draggingLib ? 'copy' : 'move';
                    if (dragOverCat !== cat) setDragOverCat(cat);
                  }
                }}
                onDragLeave={(e) => {
                  if (e.currentTarget === e.target) setDragOverCat(null);
                }}
                onDrop={(e) => { e.preventDefault(); handleDropOnColumn(cat); }}
                style={{background:'var(--sf2)',borderRadius:10,padding:16,
                borderTop:`2px solid ${cc.color}`,minHeight:200,
                outline: isOver ? `2px dashed ${cc.color}` : 'none',
                outlineOffset: isOver ? '-4px' : '0',
                transition: 'outline .12s',
              }}>
                <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:12}}>
                  <span style={{fontSize:10,fontWeight:700,textTransform:'uppercase',letterSpacing:'.1em',color:cc.color}}>
                    {t(`vectorLogic.category${cat.charAt(0) + cat.slice(1).toLowerCase().replace(/_([a-z])/g, (_, c) => c.toUpperCase())}`)}
                  </span>
                  <span style={{fontSize:10,color:'var(--tx3)',fontWeight:600}}>{items.length}</span>
                </div>
                <div style={{display:'flex',flexDirection:'column',gap:8}}>
                  {items.map(ws => (
                    <div key={ws.id}
                      draggable
                      onDragStart={(e) => {
                        setDraggingWs(ws);
                        e.dataTransfer.effectAllowed = 'move';
                        e.dataTransfer.setData('text/plain', ws.id);
                      }}
                      onDragEnd={() => { setDraggingWs(null); setDragOverCat(null); }}
                      onClick={() => ws.state && openEditForm(ws.state)}
                      style={{
                        background:'var(--sf3)',borderRadius:8,padding:'10px 12px',
                        borderLeft:`3px solid ${ws.state?.color || cc.color}`,
                        display:'flex',alignItems:'center',justifyContent:'space-between',
                        transition:'background .15s, transform .15s',
                        cursor: draggingWs?.id === ws.id ? 'grabbing' : 'grab',
                        opacity: draggingWs?.id === ws.id ? .4 : 1,
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = 'rgba(79,110,247,.06)'; e.currentTarget.style.transform = 'translateX(2px)'; }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'var(--sf3)'; e.currentTarget.style.transform = 'translateX(0)'; }}>
                      <div>
                        <div style={{fontSize:13,fontWeight:600,color:'var(--tx)'}}>{ws.state?.name}</div>
                        {ws.isInitial && <span style={{fontSize:9,color:'var(--amber)',fontWeight:700}}>INITIAL</span>}
                      </div>
                      <div style={{display:'flex',gap:4}}>
                        <span className="material-symbols-outlined" style={{fontSize:14,color:'var(--tx3)',opacity:.4}}>edit</span>
                        <button onClick={(e) => { e.stopPropagation(); removeState(ws.id); }}
                          style={{background:'none',border:'none',cursor:'pointer',color:'var(--tx3)',fontSize:14,fontFamily:'inherit',opacity:.5,transition:'opacity .15s'}}
                          onMouseEnter={e => e.currentTarget.style.opacity = '1'}
                          onMouseLeave={e => e.currentTarget.style.opacity = '.5'}>
                          <span className="material-symbols-outlined" style={{fontSize:16}}>close</span>
                        </button>
                      </div>
                    </div>
                  ))}
                  {items.length === 0 && (
                    <div style={{fontSize:11,color:'var(--tx3)',textAlign:'center',padding:'16px 0',opacity:.5}}>
                      {t('vectorLogic.noneYet')}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* State library — existing states to add */}
      {selected && states.length > 0 && (
        <div style={{marginTop:24}}>
          <h3 style={{fontSize:12,fontWeight:700,color:'var(--tx3)',textTransform:'uppercase',letterSpacing:'.08em',marginBottom:12}}>
            {t('vectorLogic.stateLibrary')}
          </h3>
          <div style={{display:'flex',flexWrap:'wrap',gap:8}}>
            {states.filter(s => !wfStates.some(ws => ws.stateId === s.id)).map(s => {
              const cc = CAT_COLORS[s.category];
              const blocked = s.category === 'OPEN' && grouped.OPEN.length > 0;
              const isDragging = draggingLib?.id === s.id;
              return (
                <div key={s.id}
                  draggable={!blocked}
                  onDragStart={(e) => {
                    if (blocked) { e.preventDefault(); return; }
                    setDraggingLib(s);
                    e.dataTransfer.effectAllowed = 'copy';
                    e.dataTransfer.setData('text/plain', s.id);
                  }}
                  onDragEnd={() => { setDraggingLib(null); setDragOverCat(null); }}
                  style={{
                    display:'flex',alignItems:'center',gap:6,padding:'6px 10px',borderRadius:8,
                    background:cc.bg,border:`1px solid ${cc.border}`,color:cc.color,
                    fontSize:12,fontWeight:600,
                    cursor: blocked ? 'not-allowed' : 'grab',
                    opacity: blocked ? .4 : (isDragging ? .5 : 1),
                    fontFamily:'inherit',transition:'all .15s',
                  }}>
                  <span style={{width:6,height:6,borderRadius:'50%',background:s.color || cc.color}}/>
                  <span onClick={() => !blocked && addExistingState(s)} style={{ cursor: blocked ? 'not-allowed' : 'pointer' }}>
                    {s.name}
                  </span>
                  <span style={{fontSize:9,opacity:.6}}>{s.category}</span>
                  <button
                    title={t('common.edit')}
                    onClick={(e) => { e.stopPropagation(); openEditForm(s); }}
                    style={{ background:'none', border:'none', padding:0, marginLeft:4, cursor:'pointer', color:cc.color, opacity:.7, display:'flex', alignItems:'center' }}
                    onMouseEnter={e => e.currentTarget.style.opacity = '1'}
                    onMouseLeave={e => e.currentTarget.style.opacity = '.7'}>
                    <span className="material-symbols-outlined" style={{fontSize:14}}>edit</span>
                  </button>
                  <button
                    title={t('common.delete')}
                    onClick={(e) => { e.stopPropagation(); deleteLibraryState(s); }}
                    style={{ background:'none', border:'none', padding:0, cursor:'pointer', color:'var(--red)', opacity:.7, display:'flex', alignItems:'center' }}
                    onMouseEnter={e => e.currentTarget.style.opacity = '1'}
                    onMouseLeave={e => e.currentTarget.style.opacity = '.7'}>
                    <span className="material-symbols-outlined" style={{fontSize:14}}>delete</span>
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* New State modal */}
      {showForm && (
        <Modal title={editingState ? t('vectorLogic.editState') : t('vectorLogic.newState')} onClose={() => { setShowForm(false); setEditingState(null); setFormError(''); }}>
          <div style={{display:'flex',flexDirection:'column',gap:14}}>
            <div>
              <label style={lblStyle}>{t('vectorLogic.stateName')}</label>
              <input style={inpStyle()} value={formName} onChange={e => { setFormName(e.target.value); setFormError(''); }}
                placeholder="e.g. Code Review" autoFocus />
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
              <div>
                <label style={lblStyle}>{t('vectorLogic.stateCategory')}</label>
                <select style={inpStyle()} value={formCategory} onChange={e => setFormCategory(e.target.value as StateCategory)}>
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label style={lblStyle}>{t('vectorLogic.stateColor')}</label>
                <input type="color" value={formColor} onChange={e => setFormColor(e.target.value)}
                  style={{width:'100%',height:36,border:'1px solid var(--bd)',borderRadius:8,background:'var(--sf2)',cursor:'pointer'}} />
              </div>
            </div>
            {formError && <div style={{fontSize:12,color:'var(--red)',padding:'6px 10px',background:'rgba(224,82,82,.08)',borderRadius:6}}>{formError}</div>}
            <div style={{display:'flex',justifyContent:'flex-end',gap:8,paddingTop:8,borderTop:'1px solid var(--bd)'}}>
              <button style={btnStyle('ghost')} onClick={() => { setShowForm(false); setEditingState(null); }}>{t('common.cancel')}</button>
              <button style={btnStyle('primary')} onClick={saveState}>{editingState ? t('common.save') : t('common.create')}</button>
            </div>
          </div>
        </Modal>
      )}

      {/* New Workflow modal */}
      {showWfForm && (
        <Modal title={t('vectorLogic.newWorkflow')} onClose={() => setShowWfForm(false)}>
          <div style={{display:'flex',flexDirection:'column',gap:14}}>
            <div>
              <label style={lblStyle}>{t('common.name')}</label>
              <input style={inpStyle()} value={wfName} onChange={e => setWfName(e.target.value)}
                placeholder="e.g. Standard Agile" autoFocus onKeyDown={e => { if (e.key === 'Enter') createWorkflow(); }} />
            </div>
            <div style={{display:'flex',justifyContent:'flex-end',gap:8,paddingTop:8,borderTop:'1px solid var(--bd)'}}>
              <button style={btnStyle('ghost')} onClick={() => setShowWfForm(false)}>{t('common.cancel')}</button>
              <button style={btnStyle('primary')} onClick={createWorkflow}>{t('common.create')}</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

/* ── Shared inline styles ────────────────────────────────────────────────── */
const btnStyle = (variant = 'primary', extra = {}) => ({
  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px',
  borderRadius: 8, fontWeight: 600, fontSize: 12, cursor: 'pointer', border: 'none',
  fontFamily: 'inherit', transition: 'all .15s',
  ...(variant === 'primary' && { background: 'var(--ac)', color: '#fff' }),
  ...(variant === 'ghost' && { background: 'var(--sf2)', color: 'var(--tx3)', border: '1px solid var(--bd)' }),
  ...extra,
});

const inpStyle = (extra = {}) => ({
  width: '100%', padding: '8px 10px', fontSize: 13, fontFamily: 'inherit',
  background: 'var(--sf2)', border: '1px solid var(--bd)',
  borderRadius: 8, color: 'var(--tx)', outline: 'none', ...extra,
});

const lblStyle = {
  fontSize: 11, fontWeight: 700, color: 'var(--tx3)',
  textTransform: 'uppercase', letterSpacing: '.05em', display: 'block', marginBottom: 5,
};

/* ── Inline Modal ────────────────────────────────────────────────────────── */
function Modal({ title, onClose, children }) {
  return (
    <div style={{position:'fixed',inset:0,zIndex:200,display:'flex',alignItems:'center',
      justifyContent:'center',padding:20,background:'rgba(0,0,0,.6)',backdropFilter:'blur(2px)'}}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{background:'var(--sf)',border:'1px solid var(--bd)',
        borderRadius:16,width:'100%',maxWidth:480,overflow:'hidden',
        boxShadow:'0 24px 80px rgba(0,0,0,.6)'}}>
        <div style={{padding:'16px 20px',borderBottom:'1px solid var(--bd)',
          display:'flex',alignItems:'center',justifyContent:'space-between'}}>
          <h3 style={{fontSize:15,fontWeight:700,color:'var(--tx)',margin:0}}>{title}</h3>
          <button onClick={onClose} style={{background:'none',border:'none',cursor:'pointer',
            color:'var(--tx3)',fontSize:20,lineHeight:1,fontFamily:'inherit'}}>
            <span className="material-symbols-outlined" style={{fontSize:18}}>close</span>
          </button>
        </div>
        <div style={{padding:'18px 20px'}}>{children}</div>
      </div>
    </div>
  );
}
