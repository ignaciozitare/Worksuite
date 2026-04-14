// @ts-nocheck
import { useState, useEffect, useRef } from 'react';
import { supabase }            from '@/shared/lib/supabaseClient';
import { StatusManager, DualPanelPicker } from '@worksuite/ui';
import { useTranslation }      from '@worksuite/i18n';
import type { Environment }    from '../domain/entities/Environment';
import type { Repository, EnvPolicy } from '../domain/entities/Reservation';
import { SupabaseEnvironmentRepo } from '../infra/supabase/SupabaseEnvironmentRepo';
import { SupabaseReservationRepo } from '../infra/supabase/SupabaseReservationRepo';
import { SupabaseReservationStatusRepo } from '../infra/supabase/SupabaseReservationStatusRepo';
import { SupabaseJiraFilterConfigRepo } from '../infra/supabase/SupabaseJiraFilterConfigRepo';
import { SupabaseEnvHistoryNoteRepo } from '../infra/supabase/SupabaseEnvHistoryNoteRepo';
import { HttpJiraApiAdapter } from '@/shared/infra/HttpJiraApiAdapter';

const envRepo = new SupabaseEnvironmentRepo(supabase);
const resRepo = new SupabaseReservationRepo(supabase);
const statusRepo = new SupabaseReservationStatusRepo(supabase);
const jiraFilterRepo = new SupabaseJiraFilterConfigRepo(supabase);
const historyNoteRepo = new SupabaseEnvHistoryNoteRepo(supabase);

const API_BASE = ((import.meta as any).env?.VITE_API_URL || 'http://localhost:3001').replace(/\/$/, '');
async function getAuthHeaders() {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
}
const jiraApi = new HttpJiraApiAdapter(API_BASE, getAuthHeaders);

// ── Admin: Filtro Jira (pre-selección de tickets mostrados en reserva) ──────
export function AdminEnvJiraFilter() {
  const { t } = useTranslation();
  const [config, setConfig] = useState({ projectKeys: [], issueTypes: [], statuses: [] });
  const [projects, setProjects] = useState([]);   // [{key,name}]
  const [issueTypes, setIssueTypes] = useState([]); // [{id,name,subtask}]
  const [statuses, setStatuses] = useState([]);     // [{id,name,category}]
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [cfg, projects, issueTypes, statuses] = await Promise.all([
          jiraFilterRepo.get(),
          jiraApi.listProjects().catch(() => []),
          jiraApi.listIssueTypes().catch(() => []),
          jiraApi.listStatuses().catch(() => []),
        ]);
        if (cancelled) return;
        setConfig(cfg);
        setProjects(projects.map(p => ({ key: p.key, name: p.name })));
        // Include ALL issue types (including subtasks)
        setIssueTypes(issueTypes);
        setStatuses(statusesDedup(statuses));
      } catch (err) {
        console.error('[AdminEnvJiraFilter]', err);
      } finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, []);

  const toggle = (field, value) => {
    setConfig(c => {
      const list = c[field];
      return { ...c, [field]: list.includes(value) ? list.filter(v => v !== value) : [...list, value] };
    });
    setSaved(false);
  };

  const save = async () => {
    setSaving(true);
    try {
      await jiraFilterRepo.save(config);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      console.error('[AdminEnvJiraFilter] save error', err);
    } finally { setSaving(false); }
  };

  if (loading) return <div style={{fontSize:12,color:'var(--tx3)'}}>{t('common.loading')}</div>;

  return (
    <div>
      <div style={{fontWeight:700,fontSize:14,color:'var(--tx)',marginBottom:6}}>
        {t('admin.envJiraFilterTitle')}
      </div>
      <div style={{fontSize:11,color:'var(--tx3)',marginBottom:14}}>
        {t('admin.envJiraFilterHint')}
      </div>

      <FilterSection
        label={t('admin.envJiraFilterProjects')}
        hint={t('admin.envJiraFilterAllHint')}
        options={projects.map(p => ({ value: p.key, label: `${p.key} — ${p.name}` }))}
        selected={config.projectKeys}
        onToggle={v => toggle('projectKeys', v)}
      />

      {/* Issue Types — dual-panel drag & drop */}
      <DualPanelPicker
        label={t('admin.envJiraFilterIssueTypes')}
        allItems={issueTypes.map(it => ({ value: it.name, label: it.name, hint: it.subtask ? t('admin.envSubtask') : '' }))}
        selected={config.issueTypes}
        onAdd={v => { setConfig(c => ({ ...c, issueTypes: [...c.issueTypes, v] })); setSaved(false); }}
        onRemove={v => { setConfig(c => ({ ...c, issueTypes: c.issueTypes.filter(x => x !== v) })); setSaved(false); }}
      />

      <FilterSection
        label={t('admin.envJiraFilterStatuses')}
        hint={t('admin.envJiraFilterAllHint')}
        options={statuses.map(s => ({ value: s.name, label: `${s.name}${s.category ? ` (${s.category})` : ''}` }))}
        selected={config.statuses}
        onToggle={v => toggle('statuses', v)}
      />

      <div style={{display:'flex',alignItems:'center',gap:10,marginTop:12}}>
        <button onClick={save} disabled={saving} style={btn('primary',{padding:'7px 16px'})}>
          {saving ? t('common.loading') : t('common.save')}
        </button>
        {saved && <span style={{fontSize:11,color:'#22c55e'}}>✓ {t('admin.savedOk')}</span>}
      </div>
    </div>
  );
}

// Dedupe statuses by name (Jira returns the same status per project).
function statusesDedup(arr) {
  const seen = new Set();
  return arr.filter(s => seen.has(s.name) ? false : (seen.add(s.name), true));
}

function FilterSection({ label, hint, options, selected, onToggle }) {
  const { t } = useTranslation();
  const allOn = selected.length === 0;
  return (
    <div style={{marginBottom:14,padding:'10px 12px',background:'var(--sf2)',borderRadius:8,border:'1px solid var(--bd)'}}>
      <div style={{display:'flex',alignItems:'baseline',gap:8,marginBottom:8}}>
        <div style={{fontSize:12,fontWeight:700,color:'var(--tx)'}}>{label}</div>
        <div style={{fontSize:10,color:allOn?'var(--green)':'var(--tx3)'}}>{allOn ? `✓ ${hint}` : t(selected.length!==1?'admin.envSelectedCount_other':'admin.envSelectedCount_one',{count:selected.length})}</div>
      </div>
      <div style={{display:'flex',flexWrap:'wrap',gap:4}}>
        {options.map(opt => {
          const on = selected.includes(opt.value);
          return (
            <button key={opt.value} onClick={()=>onToggle(opt.value)}
              style={{
                fontSize:11, padding:'3px 10px', borderRadius:12, cursor:'pointer', fontFamily:'inherit', fontWeight:600,
                background: on ? 'rgba(79,110,247,.15)' : 'var(--sf)',
                color:      on ? '#4f6ef7'              : 'var(--tx3)',
                border: `1px solid ${on ? '#4f6ef7' : 'var(--bd)'}`,
                transition: 'all .12s',
              }}>
              {opt.label}
            </button>
          );
        })}
        {options.length === 0 && <div style={{fontSize:10,color:'var(--tx3)'}}>—</div>}
      </div>
    </div>
  );
}

// ── Admin: Estados de reserva ────────────────────────────────────────────────
export function AdminEnvStatuses() {
  const { t } = useTranslation();
  const [statuses, setStatuses] = useState([]);
  const [loading, setLoading]   = useState(true);

  const categories = [
    { value: 'reserved',  label: t('admin.envStatusCatReserved')  },
    { value: 'in_use',    label: t('admin.envStatusCatInUse')     },
    { value: 'completed', label: t('admin.envStatusCatCompleted') },
    { value: 'cancelled', label: t('admin.envStatusCatCancelled') },
    { value: 'violation', label: t('admin.envStatusCatViolation') },
  ];

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await statusRepo.findAll();
        if (!cancelled) setStatuses(data);
      } catch (err) { console.error('[AdminEnvStatuses]', err); }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, []);

  if (loading) return <div style={{fontSize:12,color:'var(--tx3)'}}>{t('common.loading')}</div>;

  return (
    <div>
      <StatusManager
        statuses={statuses}
        categories={categories}
        defaultCategory="reserved"
        labels={{
          title:       t('admin.envStatusesTitle'),
          hint:        t('admin.envStatusesHint'),
          newStatus:   t('admin.statusNew'),
          name:        t('common.name'),
          color:       t('admin.statusColor'),
          add:         t('admin.statusAdd'),
          placeholder: t('admin.statusPlaceholder'),
        }}
        onCreate={async (draft) => {
          const ord = statuses.length;
          return await statusRepo.create({ ...draft, ord });
        }}
        onUpdate={(id, patch) => statusRepo.update(id, patch)}
        onDelete={(id) => statusRepo.delete(id)}
        onReorder={(items) => statusRepo.reorder(items)}
        onChange={setStatuses}
      />
    </div>
  );
}

const uid = () => Math.random().toString(36).slice(2,10);

const btn = (variant='primary', extra={}) => ({
  display:'inline-flex', alignItems:'center', gap:5, padding:'6px 12px',
  borderRadius:8, fontWeight:600, fontSize:12, cursor:'pointer', border:'none',
  fontFamily:'inherit', transition:'all .15s',
  ...(variant==='primary' && { background:'var(--ac)', color:'#fff' }),
  ...(variant==='ghost'   && { background:'var(--sf2)', color:'var(--tx3)', border:'1px solid var(--bd)' }),
  ...(variant==='danger'  && { background:'rgba(224,82,82,.1)', color:'var(--red)', border:'1px solid rgba(224,82,82,.25)' }),
  ...extra,
});

const inp = (extra={}) => ({
  width:'100%', padding:'7px 10px', fontSize:13, fontFamily:'inherit',
  background:'var(--sf2)', border:'1px solid var(--bd)',
  borderRadius:8, color:'var(--tx)', outline:'none', ...extra,
});

const lbl = { fontSize:11, fontWeight:700, color:'var(--tx3)',
  textTransform:'uppercase', letterSpacing:'.05em', display:'block', marginBottom:5 };

const CAT = {
  DEV:     { color:'#a78bfa', bg:'rgba(124,58,237,.15)' },
  PRE:     { color:'#fbbf24', bg:'rgba(180,83,9,.15)'   },
  STAGING: { color:'#22d3ee', bg:'rgba(14,116,144,.15)' },
};

function Modal({ title, onClose, children }) {
  return (
    <div style={{position:'fixed',inset:0,zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center',
      background:'rgba(0,0,0,.65)',padding:16}} onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{background:'var(--sf)',border:'1px solid var(--bd2)',borderRadius:16,
        maxWidth:480,width:'100%',overflow:'hidden',boxShadow:'0 24px 80px rgba(0,0,0,.6)'}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',
          padding:'16px 20px',borderBottom:'1px solid var(--bd)'}}>
          <span style={{fontWeight:700,fontSize:15,color:'var(--tx)'}}>{title}</span>
          <button onClick={onClose} style={{background:'none',border:'none',cursor:'pointer',
            color:'var(--tx3)',fontSize:20,lineHeight:1,fontFamily:'inherit'}}>×</button>
        </div>
        <div style={{padding:20}}>{children}</div>
      </div>
    </div>
  );
}

// ── Admin: Entornos ───────────────────────────────────────────────────────────
export function AdminEnvEnvironments() {
  const { t } = useTranslation();
  const [envs,setEnvs] = useState([]);
  const [form,setForm] = useState(null);

  useEffect(()=>{ envRepo.getAll().then(setEnvs); },[]);

  const save = async env => {
    if(envs.find(x=>x.id===env.id)){
      await envRepo.update(env); setEnvs(p=>p.map(x=>x.id===env.id?env:x));
    } else {
      const created=await envRepo.create(env); setEnvs(p=>[...p,created]);
    }
    setForm(null);
  };

  const toggle = async (env,field) => {
    const updated={...env,[field]:!env[field]};
    await envRepo.update(updated); setEnvs(p=>p.map(x=>x.id===env.id?updated:x));
  };

  function EnvForm({ env, onSave, onClose }) {
    const [name,setName]     = useState(env?.name??'');
    const [cat,setCat]       = useState(env?.category??'DEV');
    const [max,setMax]       = useState(env?.maxReservationDuration??8);
    const [url,setUrl]       = useState(env?.url??'');
    const [priority,setPrio] = useState(env?.priority??99);
    const [err,setErr]       = useState('');

    const submit = () => {
      if(!name.trim()){setErr(t('admin.envNameRequired'));return;}
      onSave({ id:env?.id??uid(), name:name.trim(), category:cat,
        maxReservationDuration:Number(max)||8, url:url.trim()||null, color:env?.color??null,
        isLocked:env?.isLocked??false, isArchived:env?.isArchived??false,
        priority:Number(priority)||99 });
    };

    return (
      <Modal title={env?t('admin.envEditEnv'):t('admin.envNewEnv')} onClose={onClose}>
        <div style={{display:'flex',flexDirection:'column',gap:14}}>
          <div>
            <label style={lbl}>{t('common.name')}</label>
            <input style={inp()} value={name} onChange={e=>{setName(e.target.value);setErr('');}}
              placeholder="DEV-03" autoFocus/>
            {err&&<p style={{fontSize:11,color:'var(--red)',marginTop:3}}>⚠ {err}</p>}
          </div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:12}}>
            <div>
              <label style={lbl}>{t('admin.envCategory')}</label>
              <select style={inp()} value={cat} onChange={e=>setCat(e.target.value)}>
                <option value="DEV">DEV</option>
                <option value="PRE">PRE</option>
                <option value="STAGING">STAGING</option>
              </select>
            </div>
            <div>
              <label style={lbl}>{t('admin.envMaxDuration')}</label>
              <input type="number" style={inp()} value={max} onChange={e=>setMax(e.target.value)} min={1}/>
            </div>
            <div>
              <label style={lbl}>{t('admin.envPriority')}</label>
              <input type="number" style={inp()} value={priority} onChange={e=>setPrio(e.target.value)} min={1} max={99}
                title={t('admin.envPriorityHint')}/>
            </div>
          </div>
          <div>
            <label style={lbl}>{t('admin.envUrlOptional')}</label>
            <input style={inp()} value={url} onChange={e=>setUrl(e.target.value)} placeholder="https://dev.example.com"/>
          </div>
          <div style={{display:'flex',justifyContent:'flex-end',gap:8,paddingTop:8,borderTop:'1px solid var(--bd)'}}>
            <button style={btn('ghost')} onClick={onClose}>{t('common.cancel')}</button>
            <button style={btn('primary')} onClick={submit}>{env?t('admin.envUpdate'):t('common.create')}</button>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <div>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16}}>
        <span style={{fontWeight:700,fontSize:14,color:'var(--tx)'}}>
          {t('admin.envCount',{count:envs.filter(e=>!e.isArchived).length})}
        </span>
        <button style={btn('primary',{padding:'6px 14px',fontSize:12})} onClick={()=>setForm('new')}>{t('admin.envNew')}</button>
      </div>
      <div style={{display:'flex',flexDirection:'column',gap:8}}>
        {envs.map(env=>{
          const cc=CAT[env.category]??CAT.DEV;
          return (
            <div key={env.id} style={{display:'flex',alignItems:'center',gap:10,padding:'12px 14px',
              background:'var(--sf2)',borderRadius:10,border:'1px solid var(--bd)',
              opacity:env.isArchived?.5:1}}>
              <div style={{width:4,height:32,borderRadius:2,background:env.color??cc.color,flexShrink:0}}/>
              <div style={{flex:1,minWidth:0}}>
                <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:2}}>
                  <span style={{fontWeight:600,fontSize:13,color:'var(--tx)'}}>{env.name}</span>
                  <span style={{background:cc.bg,color:cc.color,padding:'1px 7px',borderRadius:20,fontSize:10,fontWeight:600}}>{env.category}</span>
                  {env.isLocked&&<span style={{fontSize:9,color:'var(--amber)',fontWeight:700}}>{t('admin.envLocked')}</span>}
                  {env.isArchived&&<span style={{fontSize:9,color:'var(--tx3)'}}>{t('admin.envArchived')}</span>}
                </div>
                <span style={{fontSize:11,color:'var(--tx3)'}}>#{env.priority??99} · Max {env.maxReservationDuration}h{env.url?' · '+env.url:''}</span>
              </div>
              <div style={{display:'flex',gap:6,flexShrink:0}}>
                <button onClick={()=>toggle(env,'isLocked')} style={btn('ghost',{fontSize:11,padding:'3px 8px'})}>
                  {env.isLocked?'🔓':'🔒'}
                </button>
                <button onClick={()=>setForm(env)} style={btn('ghost',{fontSize:11,padding:'3px 8px'})}>✏️</button>
                {!env.isArchived&&<button onClick={()=>toggle(env,'isArchived')} style={btn('danger',{fontSize:11,padding:'3px 8px'})}>{t('admin.envArchive')}</button>}
              </div>
            </div>
          );
        })}
        {envs.length===0&&<div style={{fontSize:12,color:'var(--tx3)',padding:'20px 0',textAlign:'center'}}>{t('admin.envNoEnvs')}</div>}
      </div>
      {form&&<EnvForm env={form==='new'?null:form} onSave={save} onClose={()=>setForm(null)}/>}
    </div>
  );
}

// ── Admin: Repositorios ───────────────────────────────────────────────────────
export function AdminEnvRepositories() {
  const { t } = useTranslation();
  const [repos,setRepos] = useState([]);
  const [show,setShow]   = useState(false);
  const [name,setName]   = useState('');
  const [err,setErr]     = useState('');

  useEffect(()=>{ resRepo.getRepositories().then(setRepos); },[]);

  const create = async () => {
    if(!name.trim()){setErr(t('admin.envNameRequired'));return;}
    const created=await resRepo.createRepository({name:name.trim(),isArchived:false});
    setRepos(p=>[...p,created]); setName(''); setShow(false); setErr('');
  };

  const archive = async r => {
    await resRepo.updateRepository({...r,isArchived:true});
    setRepos(p=>p.map(x=>x.id===r.id?{...x,isArchived:true}:x));
  };

  return (
    <div>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16}}>
        <span style={{fontWeight:700,fontSize:14,color:'var(--tx)'}}>
          {t('admin.envRepoCount',{count:repos.filter(r=>!r.isArchived).length})}
        </span>
        <button style={btn('primary',{padding:'6px 14px',fontSize:12})} onClick={()=>setShow(true)}>{t('admin.envNew')}</button>
      </div>
      <div style={{display:'flex',flexWrap:'wrap',gap:8}}>
        {repos.map(r=>(
          <div key={r.id} style={{display:'flex',alignItems:'center',gap:8,padding:'7px 12px',
            background:'var(--sf2)',borderRadius:8,border:'1px solid var(--bd)',opacity:r.isArchived?.5:1}}>
            <span style={{fontSize:13,color:'var(--tx)'}}>📦 {r.name}</span>
            {!r.isArchived&&<button onClick={()=>archive(r)} style={btn('danger',{fontSize:11,padding:'1px 6px'})}>×</button>}
          </div>
        ))}
        {repos.length===0&&<div style={{fontSize:12,color:'var(--tx3)'}}>{t('admin.envNoRepos')}</div>}
      </div>
      {show&&(
        <Modal title={t('admin.envNewRepo')} onClose={()=>{setShow(false);setErr('');}}>
          <div style={{display:'flex',flexDirection:'column',gap:12}}>
            <input style={inp()} value={name} onChange={e=>{setName(e.target.value);setErr('');}}
              placeholder="frontend-app" autoFocus onKeyDown={e=>{if(e.key==='Enter')create();}}/>
            {err&&<p style={{fontSize:11,color:'var(--red)'}}>⚠ {err}</p>}
            <div style={{display:'flex',justifyContent:'flex-end',gap:8}}>
              <button style={btn('ghost')} onClick={()=>setShow(false)}>{t('common.cancel')}</button>
              <button style={btn('primary')} onClick={create}>{t('common.create')}</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ── Admin: Política ───────────────────────────────────────────────────────────
export function AdminEnvPolicy() {
  const { t } = useTranslation();
  const [pol,setPol] = useState({
    booking_window_days:30, min_duration_hours:.5, allow_past_start:true,
    business_hours_only:false, business_hours_start:8, business_hours_end:20,
  });
  const [saved,setSaved] = useState(false);

  useEffect(()=>{ resRepo.getPolicy().then(p=>setPol({
    booking_window_days:p.bookingWindowDays, min_duration_hours:p.minDurationHours,
    allow_past_start:p.allowPastStart, business_hours_only:p.businessHoursOnly,
    business_hours_start:p.businessHoursStart, business_hours_end:p.businessHoursEnd,
  })); },[]);

  const save = async () => {
    await resRepo.savePolicy({
      bookingWindowDays:pol.booking_window_days, minDurationHours:pol.min_duration_hours,
      allowPastStart:pol.allow_past_start, businessHoursOnly:pol.business_hours_only,
      businessHoursStart:pol.business_hours_start, businessHoursEnd:pol.business_hours_end,
    });
    setSaved(true); setTimeout(()=>setSaved(false),2500);
  };

  const Row = ({label,children}) => (
    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',
      padding:'10px 0',borderBottom:'1px solid var(--bd)'}}>
      <span style={{fontSize:13,color:'var(--tx3)'}}>{label}</span>
      {children}
    </div>
  );

  return (
    <div style={{maxWidth:520}}>
      <Row label={t('admin.envBookingWindow')}>
        <input type="number" style={inp({width:80,textAlign:'center'})}
          value={pol.booking_window_days} onChange={e=>setPol(p=>({...p,booking_window_days:Number(e.target.value)}))} min={1}/>
      </Row>
      <Row label={t('admin.envMinDuration')}>
        <input type="number" style={inp({width:80,textAlign:'center'})} step={.5}
          value={pol.min_duration_hours} onChange={e=>setPol(p=>({...p,min_duration_hours:Number(e.target.value)}))} min={0}/>
      </Row>
      <Row label={t('admin.envAllowPast')}>
        <input type="checkbox" checked={pol.allow_past_start}
          onChange={e=>setPol(p=>({...p,allow_past_start:e.target.checked}))}
          style={{width:18,height:18,cursor:'pointer'}}/>
      </Row>
      <Row label={t('admin.envBusinessOnly')}>
        <input type="checkbox" checked={pol.business_hours_only}
          onChange={e=>setPol(p=>({...p,business_hours_only:e.target.checked}))}
          style={{width:18,height:18,cursor:'pointer'}}/>
      </Row>
      {pol.business_hours_only&&<>
        <Row label={t('admin.envBusinessStart')}>
          <input type="number" style={inp({width:80,textAlign:'center'})}
            value={pol.business_hours_start} onChange={e=>setPol(p=>({...p,business_hours_start:Number(e.target.value)}))} min={0} max={23}/>
        </Row>
        <Row label={t('admin.envBusinessEnd')}>
          <input type="number" style={inp({width:80,textAlign:'center'})}
            value={pol.business_hours_end} onChange={e=>setPol(p=>({...p,business_hours_end:Number(e.target.value)}))} min={0} max={23}/>
        </Row>
      </>}
      <div style={{display:'flex',alignItems:'center',gap:10,marginTop:16}}>
        <button style={btn('primary',{padding:'8px 18px'})} onClick={save}>{t('admin.envSavePolicy')}</button>
        {saved&&<span style={{fontSize:12,color:'var(--green)'}}>✓ {t('admin.envSaved')}</span>}
      </div>
    </div>
  );
}

// ── Admin: Nota de historial (Retention Policy) ──────────────────────────────
export function AdminEnvHistoryNote() {
  const { t } = useTranslation();
  const [html, setHtml] = useState('');
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const editorRef = useRef(null);

  useEffect(() => {
    historyNoteRepo.get().then(v => { setHtml(v); setLoading(false); });
  }, []);

  const save = async () => {
    await historyNoteRepo.save(html);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  if (loading) return <div style={{padding:20,color:'var(--tx3)',fontSize:13}}>{t('common.loading')}</div>;

  return (
    <div style={{padding:20,maxWidth:700}}>
      <label style={lbl}>{t('admin.envHistoryNoteLabel')}</label>
      <p style={{fontSize:12,color:'var(--tx3)',marginBottom:12,lineHeight:1.5}}>
        {t('admin.envHistoryNoteHint')}
      </p>
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onInput={e => setHtml(e.currentTarget.innerHTML)}
        dangerouslySetInnerHTML={{ __html: html }}
        style={{
          minHeight:120,padding:'12px 14px',fontSize:13,lineHeight:1.7,
          fontFamily:'inherit',color:'var(--tx)',
          background:'var(--sf2)',border:'1px solid var(--bd)',
          borderRadius:8,outline:'none',overflowY:'auto',maxHeight:300,
        }}
      />
      <div style={{display:'flex',alignItems:'center',gap:10,marginTop:12}}>
        <button style={btn('primary',{padding:'8px 18px'})} onClick={save}>{t('common.save')}</button>
        {saved&&<span style={{fontSize:12,color:'var(--green)'}}>✓ {t('admin.envSaved')}</span>}
      </div>
    </div>
  );
}
