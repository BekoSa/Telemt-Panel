'use strict';

const fs = require('node:fs');
const path = require('node:path');

const file = path.join(__dirname, '..', 'public', 'index.html');
let source = fs.readFileSync(file, 'utf8');

function replaceOnce(oldText, newText, label) {
  const count = source.split(oldText).length - 1;
  if (count !== 1) throw new Error(`${label}: expected exactly one match, found ${count}`);
  source = source.replace(oldText, newText);
}

replaceOnce(
`      <div className={\`tab \${tab==='fingerprints'?'active':''}\`} onClick={()=>setTab('fingerprints')}>Fingerprints</div>
    </div>
    {tab==='connections'&&<EdgeConnections/>}
    {tab==='events'&&<EdgeEvents/>}
    {tab==='fingerprints'&&<EdgeTlsFingerprints/>}`,
`      <div className={\`tab \${tab==='fingerprints'?'active':''}\`} onClick={()=>setTab('fingerprints')}>Fingerprints</div>
      <div className={\`tab \${tab==='web'?'active':''}\`} onClick={()=>setTab('web')}>WEB Runtime</div>
    </div>
    {tab==='connections'&&<EdgeConnections/>}
    {tab==='events'&&<EdgeEvents/>}
    {tab==='fingerprints'&&<EdgeTlsFingerprints/>}
    {tab==='web'&&<WebRuntimePanel/>}`,
'WEB Runtime tab');

replaceOnce(
`function EdgeConnections(){`,
`function WebRuntimePanel(){
  const status=useApi('/runtime/web/status');
  const sessions=useApi('/runtime/web/sessions?limit=100');
  const [busy,setBusy]=useState(null);
  const [msg,setMsg]=useState(null);
  const [actionErr,setActionErr]=useState(null);
  const d=status.data?.data;
  const page=sessions.data?.data;
  const rows=Array.isArray(page?.sessions)?page.sessions:[];
  const runtimeInstance=d?.runtime?.runtime_instance;
  const operator=d?.operator_lifecycle;

  const reloadAll=()=>{status.reload();sessions.reload();};
  const lifecycle=async(kind)=>{
    if(!runtimeInstance) return;
    if(kind==='drain'&&!confirm('Drain WEB runtime? New WEB work will stop and remaining sessions will be force-closed after 30 seconds.')) return;
    setBusy(kind); setMsg(null); setActionErr(null);
    try{
      const body={runtime_instance:runtimeInstance};
      if(kind==='drain') body.timeout_secs=30;
      const r=await api('/runtime/web/lifecycle/'+kind,'POST',body);
      const state=r.data?.state||kind;
      setMsg(kind==='drain'?('Drain accepted · '+state):('WEB runtime '+state));
      reloadAll();
    }catch(e){setActionErr(e.message);}
    finally{setBusy(null);}
  };
  const closeSession=async(sessionRef)=>{
    if(!runtimeInstance) return;
    if(!confirm('Close this WEB session? Existing streams in this session will be terminated.')) return;
    setBusy(sessionRef); setMsg(null); setActionErr(null);
    try{
      const r=await api('/runtime/web/sessions/close','POST',{
        runtime_instance:runtimeInstance,
        selector:{kind:'refs',session_refs:[sessionRef]},
      });
      const op=r.data?.operation_id;
      setMsg(op?'Close accepted · operation '+op:'Close accepted');
      sessions.reload(); status.reload();
    }catch(e){setActionErr(e.message);}
    finally{setBusy(null);}
  };

  if(status.loading) return <div className="loading-box">Loading WEB runtime</div>;
  if(status.err) return <div><ErrBox msg={status.err}/><div className="badge badge-dim">WEB Runtime is unavailable on the connected Telemt</div></div>;
  return <div>
    <RefreshBar loading={status.loading||sessions.loading} onRefresh={reloadAll} lastTs={status.lastTs}/>
    <ErrBox msg={actionErr||sessions.err}/>
    {msg&&<div className="badge badge-ok" style={{marginBottom:12}}>{msg}</div>}
    <div className="card-grid">
      <div className="stat-card"><div className="stat-label">WEB LIFECYCLE</div><div className="stat-value" style={{fontSize:17}}>{d?.lifecycle||'—'}</div><div className="stat-sub">epoch {d?.lifecycle_epoch??'—'}</div></div>
      <div className="stat-card"><div className="stat-label">OPERATOR</div><div className="stat-value" style={{fontSize:17}}>{operator?.state||'—'}</div><div className="stat-sub">admission {operator?.effective_new_work_admission?'open':'closed'}</div></div>
      <div className="stat-card"><div className="stat-label">SESSIONS</div><div className="stat-value accent">{d?.runtime?.manager?.sessions??rows.length}</div><div className="stat-sub">snapshot {rows.length} rows</div></div>
      <div className="stat-card"><div className="stat-label">STREAMS</div><div className="stat-value">{d?.runtime?.streams?.live??'—'}</div><div className="stat-sub">generation {d?.runtime?.generation_id??'—'}</div></div>
    </div>
    <div className="card">
      <div className="card-title" style={{justifyContent:'space-between'}}><span>Operator lifecycle</span><span className="mono" style={{fontSize:10,color:'var(--text3)'}}>{runtimeInstance||'runtime unavailable'}</span></div>
      <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:12}}>
        <button className="btn btn-ghost btn-sm" disabled={!runtimeInstance||!!busy||operator?.state==='paused'} onClick={()=>lifecycle('pause')}>Pause</button>
        <button className="btn btn-danger btn-sm" disabled={!runtimeInstance||!!busy||operator?.state==='draining'||operator?.state==='force_closing'} onClick={()=>lifecycle('drain')}>Drain</button>
        <button className="btn btn-primary btn-sm" disabled={!runtimeInstance||!!busy||operator?.state==='running'} onClick={()=>lifecycle('resume')}>Resume</button>
      </div>
      {operator?.drain&&<div className="data-grid">
        {[['operation_id',operator.drain.operation_id],['state',operator.drain.state],['outcome',operator.drain.outcome||'—'],['timeout_secs',operator.drain.timeout_secs],['remaining_sessions',operator.drain.remaining_sessions],['remaining_streams',operator.drain.remaining_streams],['remaining_websockets',operator.drain.remaining_websockets]].map(([k,v])=><div className="data-row" key={k}><div className="data-key">{k}</div><div className="data-val">{String(v??'—')}</div></div>)}
      </div>}
      {d?.listeners?.length>0&&<div style={{marginTop:12}}><div className="stat-label">LISTENERS</div><div className="tag-list">{d.listeners.map(x=><span className="tag" key={x}>{x}</span>)}</div></div>}
      {d?.runtime?.partial?.length>0&&<div className="badge badge-warn" style={{marginTop:12}}>partial snapshot: {d.runtime.partial.join(', ')}</div>}
    </div>
    <div className="card">
      <div className="card-title" style={{justifyContent:'space-between'}}><span>Active WEB sessions</span><span>{rows.length} / 100</span></div>
      {sessions.loading?<div className="loading-box">Loading sessions</div>:rows.length===0?<div className="empty-box">No active WEB sessions</div>:<div className="tbl-wrap"><table>
        <thead><tr><th>Session</th><th>User / IP</th><th>Host</th><th>Carrier</th><th>State</th><th>Streams</th><th>Age</th><th>Action</th></tr></thead>
        <tbody>{rows.map(row=><tr key={row.session_ref}>
          <td className="mono" style={{fontSize:10,maxWidth:220}} title={row.session_ref}>{row.session_ref}<CopyBtn text={row.session_ref}/></td>
          <td><div className="mono" style={{color:'var(--accent)'}}>{row.user}</div><div className="mono" style={{fontSize:10,color:'var(--text3)'}}>{row.client_ip}</div></td>
          <td className="mono" style={{fontSize:11}}>{row.host}</td>
          <td><span className="badge badge-info">{row.carrier}</span></td>
          <td><span className={\`badge \${row.state==='healthy'?'badge-ok':row.state==='closing'?'badge-warn':'badge-dim'}\`}>{row.state}</span></td>
          <td className="mono">{row.streams}</td>
          <td className="mono">{row.age_ms!=null?Math.round(row.age_ms/1000)+'s':'—'}</td>
          <td><button className="btn btn-danger btn-sm" disabled={!runtimeInstance||!!busy} onClick={()=>closeSession(row.session_ref)}>Close session</button></td>
        </tr>)}</tbody>
      </table></div>}
      {page?.next_cursor&&<div className="last-upd" style={{marginTop:10}}>More sessions exist; current panel shows the first bounded page.</div>}
      {(page?.partial?.length>0||page?.partial_sessions>0)&&<div className="badge badge-warn" style={{marginTop:10}}>partial session snapshot</div>}
    </div>
  </div>;
}

function EdgeConnections(){`,
'WEB Runtime component');

fs.writeFileSync(file, source);
