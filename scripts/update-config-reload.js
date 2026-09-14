'use strict';

const fs = require('node:fs');
const path = require('node:path');

const file = path.join(__dirname, '..', 'public', 'index.html');
let source = fs.readFileSync(file, 'utf8');

function replaceOnce(oldText, newText, label) {
  const count = source.split(oldText).length - 1;
  if (count !== 1) throw new Error(label + ': expected exactly one match, found ' + count);
  source = source.replace(oldText, newText);
}

replaceOnce(
"  {id:'limits',      l:'Limits',         icon:IC.limits,    section:null},\n  {id:'panelsec',    l:'Panel Security', icon:'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z M9 12l2 2 4-4', section:'PANEL'},",
"  {id:'limits',      l:'Limits',         icon:IC.limits,    section:null},\n  {id:'config',      l:'Configuration',  icon:IC.runtime,   section:null},\n  {id:'panelsec',    l:'Panel Security', icon:'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z M9 12l2 2 4-4', section:'PANEL'},",
'configuration navigation');

replaceOnce(
"        {page==='limits'   &&<LimitsPage/>}\n        {page==='panelsec' &&<PanelSecurityPage/>}",
"        {page==='limits'   &&<LimitsPage/>}\n        {page==='config'   &&<TelemtConfigPage/>}\n        {page==='panelsec' &&<PanelSecurityPage/>}",
'configuration page mount');

replaceOnce(
"// ─── Panel Security Page ──────────────────────────────────────────────────────\nfunction PanelSecurityPage() {",
`// ─── Telemt Configuration ────────────────────────────────────────────────────
function TelemtConfigPage(){
  const [config,setConfig]=useState(null);
  const [revision,setRevision]=useState(null);
  const [patchText,setPatchText]=useState('{\\n  \\n}');
  const [patchResult,setPatchResult]=useState(null);
  const [reloadStatus,setReloadStatus]=useState(null);
  const [busy,setBusy]=useState(null);
  const [err,setErr]=useState(null);
  const [msg,setMsg]=useState(null);

  const loadConfig=useCallback(async()=>{
    setErr(null);
    try{
      const r=await api('/config');
      setConfig(r.data||{});
      setRevision(r.revision||r.data?.revision||null);
    }catch(e){setErr(e.message);}
  },[]);
  useEffect(()=>{loadConfig();},[loadConfig]);

  const applyPatch=async()=>{
    let patch;
    try{
      patch=JSON.parse(patchText);
      if(!patch||Array.isArray(patch)||typeof patch!=='object'||Object.keys(patch).length===0) throw new Error('Patch must be a non-empty JSON object');
    }catch(e){setErr('Invalid patch: '+e.message);return;}
    if(!revision){setErr('Config revision is unavailable; refresh the snapshot first.');return;}
    setBusy('patch'); setErr(null); setMsg(null); setPatchResult(null);
    try{
      const r=await api('/config','PATCH',patch,revision);
      setPatchResult(r.data||null);
      setMsg('Config patch persisted.');
      await loadConfig();
    }catch(e){
      if(e.code==='revision_conflict'){
        setErr('Config revision conflict: the file changed since this snapshot. Snapshot refreshed; review and reapply your patch.');
        await loadConfig();
      }else setErr(e.message);
    }finally{setBusy(null);}
  };

  const pollReload=async(reloadId)=>{
    for(let attempt=0;attempt<120;attempt++){
      const r=await api('/system/reload/'+reloadId);
      const status=r.data||{};
      setReloadStatus(status);
      if(status.state==='succeeded'||status.state==='rolled_back'||status.state==='failed'){
        await loadConfig();
        return status;
      }
      await new Promise(resolve=>setTimeout(resolve,1000));
    }
    throw new Error('Reload status polling timed out after 120 seconds');
  };

  const reloadRuntime=async()=>{
    if(!confirm('Reload Telemt runtime with a 30 second drain and rollback on activation failure?')) return;
    setBusy('reload'); setErr(null); setMsg(null); setReloadStatus(null);
    try{
      const r=await api('/system/reload','POST',{mode:'drain',timeout_secs:30,failure_policy:'rollback'});
      const accepted=r.data||{};
      setReloadStatus(accepted);
      const reloadId=accepted.reload_id;
      if(reloadId==null) throw new Error('Telemt did not return reload_id');
      const terminal=await pollReload(reloadId);
      if(terminal?.state==='succeeded') setMsg('Runtime reload succeeded.');
      else if(terminal?.state==='rolled_back') setErr('Runtime reload rolled back. '+(terminal.error||''));
      else setErr('Runtime reload failed. '+(terminal?.error||''));
    }catch(e){setErr(e.message);}
    finally{setBusy(null);}
  };

  const deferred=[
    ...(patchResult?.deferred_process_fields||[]),
    ...(reloadStatus?.deferred_process_fields||[]),
  ].filter((v,i,a)=>a.indexOf(v)===i);

  return <div>
    <div className="page-hdr">
      <div className="page-title"><Icon d={IC.runtime} size={20}/>Configuration</div>
      <div className="page-actions">
        <button className="btn btn-ghost btn-sm" onClick={loadConfig} disabled={!!busy}><Icon d={IC.refresh}/>Refresh snapshot</button>
        <button className="btn btn-danger btn-sm" onClick={reloadRuntime} disabled={!!busy}>Drain + reload</button>
      </div>
    </div>
    <ErrBox msg={err}/>
    {msg&&<div className="badge badge-ok" style={{marginBottom:12}}>{msg}</div>}
    <div className="card">
      <div className="card-title" style={{justifyContent:'space-between'}}><span>Editable desired configuration</span><span className="mono" style={{fontSize:10,color:'var(--text3)'}}>revision {revision||'unavailable'}</span></div>
      <div style={{fontSize:12,color:'var(--text3)',marginBottom:10}}>Snapshot contains only sections Telemt permits through the config API. access.*, network and server.api remain intentionally unavailable.</div>
      <textarea className="form-input" readOnly rows="16" value={config?JSON.stringify(config,null,2):'Loading…'} style={{resize:'vertical',lineHeight:1.45}}/>
    </div>
    <div className="card">
      <div className="card-title">Sparse JSON patch</div>
      <div style={{fontSize:12,color:'var(--text3)',marginBottom:10}}>Nested objects merge field-by-field. Arrays replace the previous array wholesale. The patch is guarded by the revision shown above.</div>
      <textarea className="form-input" rows="12" value={patchText} onChange={e=>setPatchText(e.target.value)} spellCheck="false" style={{resize:'vertical',lineHeight:1.45}}/>
      <div style={{display:'flex',gap:8,marginTop:12,alignItems:'center',flexWrap:'wrap'}}>
        <button className="btn btn-primary" onClick={applyPatch} disabled={!!busy||!revision}>{busy==='patch'?'Applying…':'Apply patch'}</button>
        {patchResult?.changed?.length>0&&<span className="last-upd">changed: {patchResult.changed.join(', ')}</span>}
        {patchResult?.runtime_reload_required&&<span className="badge badge-warn">runtime reload required</span>}
        {patchResult?.process_restart_required&&<span className="badge badge-warn">process restart required</span>}
      </div>
    </div>
    {reloadStatus&&<div className="card">
      <div className="card-title">Reload operation</div>
      <div className="data-grid">
        {[['reload_id',reloadStatus.reload_id],['state',reloadStatus.state],['mode',reloadStatus.mode],['failure_policy',reloadStatus.failure_policy],['target_generation',reloadStatus.target_generation],['config_revision',reloadStatus.config_revision],['error',reloadStatus.error||'—']].map(([k,v])=><div className="data-row" key={k}><div className="data-key">{k}</div><div className="data-val">{String(v??'—')}</div></div>)}
      </div>
      {reloadStatus.warnings?.length>0&&<div className="badge badge-warn" style={{marginTop:10}}>warnings: {reloadStatus.warnings.join(' · ')}</div>}
    </div>}
    {deferred.length>0&&<div className="card">
      <div className="card-title">Deferred until process restart</div>
      <div className="tag-list">{deferred.map(x=><span className="tag" key={x}>{x}</span>)}</div>
    </div>}
  </div>;
}

// ─── Panel Security Page ──────────────────────────────────────────────────────
function PanelSecurityPage() {`,
'configuration component');

fs.writeFileSync(file, source);
