// @ts-nocheck
import { useState, useEffect } from 'react';
import { useTranslation } from '@worksuite/i18n';
import type { TaskType } from '../../domain/entities/TaskType';
import type { Workflow } from '../../domain/entities/Workflow';
import { taskTypeRepo, workflowRepo } from '../../container';

export function AssignmentManagerView() {
  const { t } = useTranslation();
  const [taskTypes, setTaskTypes] = useState<TaskType[]>([]);
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [assignWfId, setAssignWfId] = useState('');

  // New task type form
  const [showForm, setShowForm] = useState(false);
  const [formName, setFormName] = useState('');
  const [formIcon, setFormIcon] = useState('task_alt');

  useEffect(() => {
    (async () => {
      try {
        const [tts, wfs] = await Promise.all([taskTypeRepo.findAll(), workflowRepo.findAll()]);
        setTaskTypes(tts);
        setWorkflows(wfs);
      } catch (err) { console.error('[AssignmentManager]', err); }
      finally { setLoading(false); }
    })();
  }, []);

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === taskTypes.length) setSelected(new Set());
    else setSelected(new Set(taskTypes.map(tt => tt.id)));
  };

  const bulkAssign = async () => {
    if (!assignWfId || selected.size === 0) return;
    await Promise.all(
      [...selected].map(id => taskTypeRepo.update(id, { workflowId: assignWfId }))
    );
    setTaskTypes(prev => prev.map(tt =>
      selected.has(tt.id) ? { ...tt, workflowId: assignWfId } : tt
    ));
    setSelected(new Set());
  };

  const createTaskType = async () => {
    if (!formName.trim()) return;
    const created = await taskTypeRepo.create({
      name: formName.trim(),
      icon: formIcon || null,
      workflowId: null,
      schema: [],
    });
    setTaskTypes(prev => [...prev, created]);
    setFormName(''); setShowForm(false);
  };

  const getWorkflowName = (wfId: string | null) => {
    if (!wfId) return t('vectorLogic.unassigned');
    return workflows.find(w => w.id === wfId)?.name ?? '—';
  };

  if (loading) {
    return <div style={{textAlign:'center',padding:'40px 0',color:'var(--tx3)',fontSize:13}}>{t('common.loading')}</div>;
  }

  return (
    <div>
      {/* Header */}
      <div style={{marginBottom:24}}>
        <h2 style={{fontSize:22,fontWeight:700,color:'var(--tx)',margin:0,fontFamily:"'Space Grotesk',sans-serif"}}>
          {t('vectorLogic.assignmentManager')}
        </h2>
        <p style={{fontSize:12,color:'var(--tx3)',marginTop:4,maxWidth:600}}>
          {t('vectorLogic.taskTypes')}
        </p>
      </div>

      {/* Toolbar */}
      <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:16}}>
        <button onClick={() => setShowForm(true)} style={btnStyle('primary')}>
          <span className="material-symbols-outlined" style={{fontSize:16}}>add</span>
          {t('vectorLogic.taskTypes')}
        </button>
        {selected.size > 0 && (
          <div style={{display:'flex',alignItems:'center',gap:8,marginLeft:'auto'}}>
            <select value={assignWfId} onChange={e => setAssignWfId(e.target.value)}
              style={{padding:'6px 10px',fontSize:12,background:'var(--sf2)',border:'1px solid var(--bd)',
                borderRadius:8,color:'var(--tx)',fontFamily:'inherit'}}>
              <option value="">{t('vectorLogic.assignWorkflow')}</option>
              {workflows.map(wf => <option key={wf.id} value={wf.id}>{wf.name}</option>)}
            </select>
            <button onClick={bulkAssign} disabled={!assignWfId}
              style={btnStyle('primary', { opacity: assignWfId ? 1 : .4 })}>
              {t('vectorLogic.assignWorkflow')}
            </button>
          </div>
        )}
      </div>

      {/* Table */}
      <div style={{background:'var(--sf2)',borderRadius:10,overflow:'hidden',border:'1px solid var(--bd)'}}>
        <table style={{width:'100%',borderCollapse:'collapse'}}>
          <thead>
            <tr>
              <th style={thStyle}>
                <input type="checkbox" checked={selected.size === taskTypes.length && taskTypes.length > 0}
                  onChange={toggleAll} style={{cursor:'pointer'}} />
              </th>
              <th style={thStyle}>{t('vectorLogic.taskTypes')}</th>
              <th style={thStyle}>{t('vectorLogic.currentWorkflow')}</th>
              <th style={thStyle}>{t('vectorLogic.lastModified')}</th>
              <th style={thStyle}>{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {taskTypes.map(tt => (
              <tr key={tt.id} style={{transition:'background .12s'}}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--sf3)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                <td style={tdStyle}>
                  <input type="checkbox" checked={selected.has(tt.id)}
                    onChange={() => toggleSelect(tt.id)} style={{cursor:'pointer'}} />
                </td>
                <td style={tdStyle}>
                  <div style={{display:'flex',alignItems:'center',gap:8}}>
                    <span className="material-symbols-outlined" style={{fontSize:18,color:'var(--ac)'}}>{tt.icon || 'task_alt'}</span>
                    <div>
                      <div style={{fontSize:13,fontWeight:600,color:'var(--tx)'}}>{tt.name}</div>
                      <div style={{fontSize:10,color:'var(--tx3)'}}>{(tt.schema as unknown[]).length} {t('vectorLogic.states').toLowerCase()}</div>
                    </div>
                  </div>
                </td>
                <td style={tdStyle}>
                  <span style={{
                    padding:'3px 10px',borderRadius:20,fontSize:11,fontWeight:600,
                    background: tt.workflowId ? 'rgba(79,110,247,.1)' : 'rgba(140,144,159,.08)',
                    color: tt.workflowId ? 'var(--ac)' : 'var(--tx3)',
                  }}>
                    {getWorkflowName(tt.workflowId)}
                  </span>
                </td>
                <td style={tdStyle}>
                  <span style={{fontSize:12,color:'var(--tx3)'}}>
                    {new Date(tt.updatedAt).toLocaleDateString(undefined, {day:'numeric',month:'short',year:'numeric'})}
                  </span>
                </td>
                <td style={tdStyle}>
                  <button onClick={() => taskTypeRepo.remove(tt.id).then(() => setTaskTypes(p => p.filter(x => x.id !== tt.id)))}
                    style={{background:'none',border:'none',cursor:'pointer',color:'var(--red)',fontSize:12,fontFamily:'inherit'}}>
                    <span className="material-symbols-outlined" style={{fontSize:16}}>delete</span>
                  </button>
                </td>
              </tr>
            ))}
            {taskTypes.length === 0 && (
              <tr>
                <td colSpan={5} style={{...tdStyle,textAlign:'center',padding:'32px 0',color:'var(--tx3)'}}>
                  {t('vectorLogic.noTaskTypes')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* New Task Type modal */}
      {showForm && (
        <div style={{position:'fixed',inset:0,zIndex:200,display:'flex',alignItems:'center',
          justifyContent:'center',padding:20,background:'rgba(0,0,0,.6)',backdropFilter:'blur(2px)'}}
          onClick={e => e.target === e.currentTarget && setShowForm(false)}>
          <div style={{background:'var(--sf)',border:'1px solid var(--bd)',borderRadius:16,
            width:'100%',maxWidth:420,overflow:'hidden',boxShadow:'0 24px 80px rgba(0,0,0,.6)'}}>
            <div style={{padding:'16px 20px',borderBottom:'1px solid var(--bd)',
              display:'flex',alignItems:'center',justifyContent:'space-between'}}>
              <h3 style={{fontSize:15,fontWeight:700,color:'var(--tx)',margin:0}}>{t('vectorLogic.taskTypes')}</h3>
              <button onClick={() => setShowForm(false)} style={{background:'none',border:'none',cursor:'pointer',color:'var(--tx3)'}}>
                <span className="material-symbols-outlined" style={{fontSize:18}}>close</span>
              </button>
            </div>
            <div style={{padding:'18px 20px',display:'flex',flexDirection:'column',gap:14}}>
              <div>
                <label style={lblStyle}>{t('common.name')}</label>
                <input style={inpStyle()} value={formName} onChange={e => setFormName(e.target.value)}
                  placeholder="e.g. Bug, Feature Request" autoFocus
                  onKeyDown={e => { if (e.key === 'Enter') createTaskType(); }} />
              </div>
              <div style={{display:'flex',justifyContent:'flex-end',gap:8,paddingTop:8,borderTop:'1px solid var(--bd)'}}>
                <button style={btnStyle('ghost')} onClick={() => setShowForm(false)}>{t('common.cancel')}</button>
                <button style={btnStyle('primary')} onClick={createTaskType}>{t('common.create')}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

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

const thStyle = {
  padding: '10px 16px', fontSize: 10, fontWeight: 700, color: 'var(--tx3)',
  textTransform: 'uppercase', letterSpacing: '.08em', textAlign: 'left',
  background: 'var(--sf3)', borderBottom: '1px solid var(--bd)',
};

const tdStyle = {
  padding: '12px 16px', fontSize: 13, color: 'var(--tx)',
  borderBottom: '1px solid var(--bd)', verticalAlign: 'middle',
};
