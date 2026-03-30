// @ts-nocheck
import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from '@worksuite/i18n';
import { TimeParser } from '../domain/services/TimeParser';
import { TODAY } from '@/shared/lib/constants';
import { MOCK_ISSUES_FALLBACK } from '@/shared/lib/fallbackData';

interface LogWorklogModalProps {
  initialDate?: string;
  initialIssueKey?: string;
  onClose: () => void;
  onSave: (date: string, wl: any) => void;
  currentUser: any;
  jiraIssues?: any[];
}

export function LogWorklogModal({ initialDate, initialIssueKey, onClose, onSave, currentUser, jiraIssues }: LogWorklogModalProps) {
  const { t } = useTranslation();
  const issues = jiraIssues || MOCK_ISSUES_FALLBACK;
  const [ik,     setIk]    = useState(initialIssueKey||"");
  const [query,  setQuery] = useState(initialIssueKey||"");
  const [open,   setOpen]  = useState(false);
  const [dt,     setDt]    = useState(initialDate||TODAY);
  const [tr,     setTr]    = useState("");
  const [st,     setSt]    = useState("09:00");
  const [dc,     setDc]    = useState("");
  const [er,     setEr]    = useState<any>({});
  const [ok,     setOk]    = useState(false);
  const cbRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => { if (cbRef.current && !cbRef.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const filtered = query.trim()
    ? issues.filter(i =>
        i.key.toLowerCase().includes(query.toLowerCase()) ||
        i.summary.toLowerCase().includes(query.toLowerCase()))
    : issues;

  const selectIssue = (issue: any) => {
    setIk(issue.key);
    setQuery(issue.key);
    setOpen(false);
    setEr((v: any) => ({...v, ik:null}));
  };

  const ps = TimeParser.parse(tr), tp = ps > 0 ? TimeParser.format(ps) : null;

  const MAX_H = 160 * 3600;
  const [warnConfirmed, setWarnConfirmed] = useState(false);
  const [showWarn, setShowWarn] = useState(false);

  const validate = () => {
    const e: any = {};
    if (!ik)   e.ik = t("jiraTracker.taskRequired");
    if (!dt)   e.dt = t("jiraTracker.dateRequired");
    if (ps<=0) e.tr = t("jiraTracker.timeInvalid");
    if (ps>MAX_H) e.tr = t("jiraTracker.timeExceeds");
    return e;
  };

  const submit = () => {
    const errs = validate();
    if (Object.keys(errs).length) { setEr(errs); return; }
    if (ps > 16 * 3600 && !warnConfirmed) {
      setShowWarn(true);
      return;
    }
    const iss = issues.find(i => i.key===ik);
    setOk(true);
    setTimeout(() => {
      onSave(dt, { id:`wl-${Date.now()}`, issue:ik, summary:iss?.summary||ik, type:iss?.type||"Task",
        epic:iss?.epic||"—", epicName:iss?.epicName||"—", author:currentUser.name,
        authorId:currentUser.id, time:tp, seconds:ps, started:st,
        project:iss?.project||"—", description:dc, isNew:true });
      onClose();
    }, 750);
  };

  const si = issues.find(i => i.key===ik);
  return (
    <div className="ov" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="mb" style={{maxWidth:480}}>
        <div className="mh"><div className="mt">⏱ {t("jiraTracker.logWorklog")}</div><button className="mc" onClick={onClose}>×</button></div>
        {ok ? <div className="mbody"><div className="ok-fl">✓ {t("jiraTracker.savedFlash")} — {tp} · {ik} · {dt}</div></div> : showWarn ? (
          <div className="mbody">
            <div style={{textAlign:"center",padding:"20px 0"}}>
              <div style={{fontSize:28,marginBottom:12}}>⚠️</div>
              <div style={{fontWeight:700,fontSize:14,color:"var(--amber)",marginBottom:8}}>
                {t("jiraTracker.timeWarn", {h: (ps/3600).toFixed(1)})}
              </div>
              <div style={{fontSize:12,color:"var(--tx3)",marginBottom:20}}>
                {TimeParser.format(ps)} · {ik}
              </div>
              <div style={{display:"flex",gap:10,justifyContent:"center"}}>
                <button className="b-cancel" onClick={()=>setShowWarn(false)}>{t("common.cancel")}</button>
                <button className="b-sub" style={{background:"var(--amber)"}} onClick={()=>{setWarnConfirmed(true);setShowWarn(false);setTimeout(()=>submit(),50);}}>
                  {t("common.confirm")} {TimeParser.format(ps)}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <>
            <div className="mbody">
              <div className="fr">
                <label className="fl">{t("jiraTracker.taskField")}</label>
                <div ref={cbRef} style={{position:"relative"}}>
                  <input
                    className={`mi ${er.ik?"err":""}`}
                    placeholder={t("jiraTracker.selectTask")}
                    value={query}
                    autoComplete="off"
                    onChange={e => { setQuery(e.target.value); setIk(""); setOpen(true); setEr((v: any)=>({...v,ik:null})); }}
                    onFocus={() => setOpen(true)}
                    style={{fontFamily:"var(--mono)",fontSize:12}}
                  />
                  {open && filtered.length > 0 && (
                    <div className="cb-drop">
                      {filtered.map(i => (
                        <div key={i.key} className={`cb-opt ${i.key===ik?"cb-sel":""}`}
                          onMouseDown={e => { e.preventDefault(); selectIssue(i); }}>
                          <span className="cb-key">{i.key}</span>
                          <span className="cb-sum">{i.summary}</span>
                          <span className="cb-prj">{i.project}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {open && filtered.length === 0 && (
                    <div className="cb-drop">
                      <div style={{padding:"10px 12px",color:"var(--tx3)",fontSize:12}}>No results for "{query}"</div>
                    </div>
                  )}
                </div>
                {er.ik&&<span className="em">{er.ik}</span>}
                {si && <div style={{display:"flex",gap:6,marginTop:4,flexWrap:"wrap",alignItems:"center"}}>
                  <span className="t-pill">{si.type}</span>
                  <span className="er" style={{fontSize:10}}>{si.epic} · {si.epicName}</span>
                  <span style={{fontSize:10,color:"var(--tx3)",marginLeft:"auto"}}>{si.summary}</span>
                </div>}
              </div>
              <div className="fr2">
                <div className="fr"><label className="fl">{t("jiraTracker.dateField")}</label><input className={`mi ${er.dt?"err":""}`} type="date" value={dt} onChange={e=>{setDt(e.target.value);setEr((v: any)=>({...v,dt:null}));}}/>{er.dt&&<span className="em">{er.dt}</span>}</div>
                <div className="fr"><label className="fl">{t("jiraTracker.startTime")}</label><input className="mi" type="time" value={st} onChange={e=>setSt(e.target.value)}/></div>
              </div>
              <div className="fr">
                <label className="fl">{t("jiraTracker.timeLogged")}</label>
                <input className={`mi ${er.tr?"err":""}`} placeholder={t("jiraTracker.timePlaceholder")} value={tr} onChange={e=>{setTr(e.target.value);setEr((v: any)=>({...v,tr:null}));}} style={{fontFamily:"var(--mono)"}} autoFocus/>
                <span className="fh">{t("jiraTracker.timeFormats")} <code>2h</code> · <code>1h 30m</code> · <code>45m</code> · <code>1.5</code> {t("jiraTracker.decimalHours")}</span>
                {er.tr&&<span className="em">{er.tr}</span>}
                {tp&&!er.tr&&<div className="tp"><span className="tl">→</span><span className="tv">{tp}</span><span className="tl">({(ps/3600).toFixed(2)}h)</span></div>}
              </div>
              <div className="fr">
                <label className="fl">{t("jiraTracker.descField")} <span style={{color:"var(--tx3)",textTransform:"none",letterSpacing:0}}>{t("jiraTracker.descOptional")}</span></label>
                <textarea className="mi" style={{minHeight:56,resize:"vertical",fontFamily:"var(--body)",fontSize:12}} placeholder={t("jiraTracker.descPlaceholder")} value={dc} onChange={e=>setDc(e.target.value)}/>
              </div>
            </div>
            <div className="mf">
              <button className="b-cancel" onClick={onClose}>{t("common.cancel")}</button>
              <button className="b-sub" onClick={submit} disabled={!ik||ps<=0}>{t("jiraTracker.saveWorklog")}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
