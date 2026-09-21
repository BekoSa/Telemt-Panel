import React,{useCallback,useEffect,useMemo,useState} from 'react';
import configEditor from './config-editor.cjs';

const {isObject,buildSparsePatch,setPathValue,coerceLike,newArrayItem}=configEditor;

const SECTIONS=[
  {id:'general',label:'General',path:['general']},
  {id:'listeners',label:'Listeners',path:['server','listeners']},
  {id:'timeouts',label:'Timeouts',path:['timeouts']},
  {id:'censorship',label:'Censorship / TLS',path:['censorship']},
  {id:'upstreams',label:'Upstreams',path:['upstreams']},
  {id:'dc_overrides',label:'DC Overrides',path:['dc_overrides']},
  {id:'web',label:'WEB',path:['web']},
  {id:'advanced',label:'Advanced JSON Patch',path:null},
];

function getAt(root,path){
  return path?.reduce((value,key)=>value?.[key],root);
}

function prettyKey(key){
  return String(key).replaceAll('_',' ');
}

function ConfigValueEditor({value,path,onChange,label}){
  if(Array.isArray(value)){
    return <div className="card" style={{marginBottom:10,padding:12}}>
      <div className="card-title" style={{justifyContent:'space-between',marginBottom:8}}>
        <span>{label}</span>
        <button className="btn btn-ghost btn-sm" onClick={()=>{
          onChange(path,[...value,newArrayItem(path,value)]);
        }}>+ Add item</button>
      </div>
      {value.length===0&&<div className="empty-box">Empty array · Add item to create a value</div>}
      {value.map((item,index)=><div key={index} style={{border:'1px solid var(--border)',padding:10,marginBottom:8}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
          <span className="mono" style={{fontSize:10,color:'var(--text3)'}}>item {index+1}</span>
          <button className="btn btn-danger btn-sm" onClick={()=>{
            const next=value.filter((_,i)=>i!==index);
            onChange(path,next);
          }}>Remove</button>
        </div>
        <ConfigValueEditor value={item} path={[...path,index]} onChange={onChange} label={'Item '+(index+1)}/>
      </div>)}
    </div>;
  }

  if(isObject(value)){
    const entries=Object.entries(value);
    return <div style={{marginBottom:10}}>
      {label&&<div className="card-title" style={{marginBottom:8}}>{label}</div>}
      {entries.length===0?<div className="empty-box">No fields in this normalized section. Use Advanced JSON Patch to add a field.</div>:
        entries.map(([key,child])=><div key={key} style={{marginBottom:10}}>
          <ConfigValueEditor value={child} path={[...path,key]} onChange={onChange} label={prettyKey(key)}/>
        </div>)}
    </div>;
  }

  if(typeof value==='boolean'){
    return <label style={{display:'flex',alignItems:'center',gap:9,fontFamily:'var(--mono)',fontSize:12,color:'var(--text2)'}}>
      <input type="checkbox" checked={value} onChange={e=>onChange(path,e.target.checked)}/>
      <span>{label}</span>
    </label>;
  }

  if(typeof value==='number'){
    return <div className="form-row" style={{marginBottom:0}}>
      <label className="form-label">{label}</label>
      <input className="form-input" type="number" value={value} onChange={e=>onChange(path,coerceLike(value,e.target.value))}/>
    </div>;
  }

  if(value===null){
    return <div className="form-row" style={{marginBottom:0}}>
      <label className="form-label">{label}</label>
      <input className="form-input" value="null" onChange={e=>onChange(path,coerceLike(null,e.target.value))}/>
    </div>;
  }

  return <div className="form-row" style={{marginBottom:0}}>
    <label className="form-label">{label}</label>
    <input className="form-input" value={String(value??'')} onChange={e=>onChange(path,coerceLike(value,e.target.value))} spellCheck="false"/>
  </div>;
}

function Classification({result,reloadStatus}){
  if(!result&&!reloadStatus) return null;
  const deferred=[
    ...(result?.deferred_process_fields||[]),
    ...(reloadStatus?.deferred_process_fields||[]),
  ].filter((v,i,a)=>a.indexOf(v)===i);
  return <div className="card">
    <div className="card-title">Apply status</div>
    <div className="data-grid">
      <div className="data-row"><div className="data-key">changed</div><div className="data-val mono">{result?.changed?.join(', ')||'—'}</div></div>
      <div className="data-row"><div className="data-key">runtime reload required</div><div className="data-val">{String(result?.runtime_reload_required??false)}</div></div>
      <div className="data-row"><div className="data-key">process restart required</div><div className="data-val">{String(result?.process_restart_required??false)}</div></div>
      {reloadStatus&&<div className="data-row"><div className="data-key">reload state</div><div className="data-val mono">{reloadStatus.state||'—'}</div></div>}
    </div>
    {deferred.length>0&&<div style={{marginTop:10}}>
      <div className="stat-label">DEFERRED PROCESS FIELDS</div>
      <div className="tag-list">{deferred.map(field=><span className="tag" key={field}>{field}</span>)}</div>
    </div>}
  </div>;
}

export default function StructuredConfigEditor({apiFn}){
  const [base,setBase]=useState(null);
  const [draft,setDraft]=useState(null);
  const [revision,setRevision]=useState(null);
  const [tab,setTab]=useState('general');
  const [advanced,setAdvanced]=useState('{\n  \n}');
  const [busy,setBusy]=useState(null);
  const [error,setError]=useState(null);
  const [message,setMessage]=useState(null);
  const [result,setResult]=useState(null);
  const [reloadStatus,setReloadStatus]=useState(null);

  const load=useCallback(async()=>{
    setError(null);
    try{
      const response=await apiFn('/config');
      const snapshot=response?.data||{};
      setBase(structuredClone(snapshot));
      setDraft(structuredClone(snapshot));
      setRevision(response?.revision||snapshot?.revision||null);
    }catch(e){setError(e.message);}
  },[apiFn]);

  useEffect(()=>{load();},[load]);

  const patch=useMemo(()=>base&&draft?buildSparsePatch(base,draft):{},[base,draft]);
  const dirty=Object.keys(patch).length>0;

  const change=(path,value)=>setDraft(current=>setPathValue(current,path,value));

  const persist=async(patch)=>{
    if(!revision) throw new Error('Config revision is unavailable; refresh snapshot.');
    const response=await apiFn('/config','PATCH',patch,revision);
    setResult(response?.data||null);
    setMessage('Desired configuration persisted.');
    await load();
    return response;
  };

  const saveStructured=async()=>{
    if(!dirty) return;
    setBusy('save');setError(null);setMessage(null);setResult(null);
    try{await persist(patch);}
    catch(e){
      if(e.code==='revision_conflict'){
        setError('Config revision conflict: snapshot refreshed. Review the new diff before applying again.');
        await load();
      }else setError(e.message);
    }finally{setBusy(null);}
  };

  const applyAdvanced=async()=>{
    let parsed;
    try{
      parsed=JSON.parse(advanced);
      if(!parsed||Array.isArray(parsed)||typeof parsed!=='object'||Object.keys(parsed).length===0) throw new Error('Patch must be a non-empty JSON object');
    }catch(e){setError('Invalid patch: '+e.message);return;}
    setBusy('advanced');setError(null);setMessage(null);setResult(null);
    try{await persist(parsed);}
    catch(e){
      if(e.code==='revision_conflict'){
        setError('Config revision conflict: snapshot refreshed. Review and reapply your patch.');
        await load();
      }else setError(e.message);
    }finally{setBusy(null);}
  };

  const pollReload=async(id)=>{
    for(let attempt=0;attempt<120;attempt++){
      const response=await apiFn('/system/reload/'+id);
      const status=response?.data||{};
      setReloadStatus(status);
      if(['succeeded','rolled_back','failed'].includes(status.state)) return status;
      await new Promise(resolve=>setTimeout(resolve,1000));
    }
    throw new Error('Reload status polling timed out after 120 seconds');
  };

  const reloadRuntime=async()=>{
    if(!confirm('Reload Telemt runtime with a 30 second drain and rollback on activation failure?')) return;
    setBusy('reload');setError(null);setMessage(null);setReloadStatus(null);
    try{
      const response=await apiFn('/system/reload','POST',{mode:'drain',timeout_secs:30,failure_policy:'rollback'});
      const accepted=response?.data||{};
      setReloadStatus(accepted);
      if(accepted.reload_id==null) throw new Error('Telemt did not return reload_id');
      const terminal=await pollReload(accepted.reload_id);
      if(terminal.state==='succeeded') setMessage('Runtime reload succeeded.');
      else if(terminal.state==='rolled_back') setError('Runtime reload rolled back. '+(terminal.error||''));
      else setError('Runtime reload failed. '+(terminal.error||''));
      await load();
    }catch(e){setError(e.message);}
    finally{setBusy(null);}
  };

  const resetDraft=()=>{if(base)setDraft(structuredClone(base));};

  const section=SECTIONS.find(item=>item.id===tab);
  const value=section?.path?getAt(draft,section.path):null;

  return <div>
    <div className="page-hdr">
      <div className="page-title">Configuration</div>
      <div className="page-actions">
        <button className="btn btn-ghost btn-sm" onClick={load} disabled={!!busy}>Refresh snapshot</button>
        <button className="btn btn-ghost btn-sm" onClick={resetDraft} disabled={!!busy||!dirty}>Reset draft</button>
        <button className="btn btn-danger btn-sm" onClick={reloadRuntime} disabled={!!busy}>Drain + reload</button>
      </div>
    </div>
    {error&&<div className="error-box" style={{marginBottom:12}}>⚠ {error}</div>}
    {message&&<div className="badge badge-ok" style={{marginBottom:12}}>{message}</div>}

    <div className="card">
      <div className="card-title" style={{justifyContent:'space-between'}}>
        <span>Structured desired configuration</span>
        <span className="mono" style={{fontSize:10,color:'var(--text3)'}}>revision {revision||'unavailable'}</span>
      </div>
      <div className="last-upd" style={{marginBottom:12}}>
        Telemt exposes editable normalized sections only. access.* remains managed by Users; network and server.api stay protected.
      </div>
      <div className="tabs" style={{flexWrap:'wrap'}}>
        {SECTIONS.map(item=><div key={item.id} className={`tab ${tab===item.id?'active':''}`} onClick={()=>setTab(item.id)}>{item.label}</div>)}
      </div>

      {tab!=='advanced'&&(
        value===undefined
          ? <div className="empty-box">This section is absent from the normalized snapshot. Use Advanced JSON Patch to create it explicitly.</div>
          : <ConfigValueEditor value={value} path={section.path} onChange={change} label={section.label}/>
      )}

      {tab==='advanced'&&<div>
        <div className="last-upd" style={{marginBottom:10}}>
          Advanced JSON Patch is for fields not represented in the normalized form. Objects deep-merge; arrays replace wholesale. The same revision fence is used.
        </div>
        <textarea className="form-input" rows="14" value={advanced} onChange={e=>setAdvanced(e.target.value)} spellCheck="false" style={{resize:'vertical',lineHeight:1.45}}/>
        <button className="btn btn-primary" style={{marginTop:10}} onClick={applyAdvanced} disabled={!!busy||!revision}>
          {busy==='advanced'?'Applying…':'Apply advanced patch'}
        </button>
      </div>}
    </div>

    <div className="card">
      <div className="card-title" style={{justifyContent:'space-between'}}>
        <span>Patch preview</span>
        <span className={`badge ${dirty?'badge-warn':'badge-dim'}`}>{dirty?'unsaved changes':'clean'}</span>
      </div>
      <div className="last-upd" style={{marginBottom:10}}>Only changed object fields are sent. Changed arrays are shown and replaced as complete arrays, matching Telemt merge semantics.</div>
      <textarea className="form-input" readOnly rows="12" value={JSON.stringify(patch,null,2)} style={{resize:'vertical',lineHeight:1.45}}/>
      <div style={{display:'flex',gap:8,marginTop:12,flexWrap:'wrap'}}>
        <button className="btn btn-primary" onClick={saveStructured} disabled={!!busy||!revision||!dirty}>{busy==='save'?'Saving…':'Save desired config'}</button>
        <button className="btn btn-ghost" onClick={resetDraft} disabled={!!busy||!dirty}>Discard changes</button>
      </div>
    </div>

    <Classification result={result} reloadStatus={reloadStatus}/>
  </div>;
}
