import React, {useEffect, useState} from 'react';
import webTools from './web-runtime-tools.cjs';

const {buildSessionQuery,isTerminalOperation} = webTools;

const CARRIERS = ['', 'https', 'https-lanes', 'websocket', 'websocket-lanes'];
const STATES = ['', 'provisional', 'replacing', 'committed', 'superseded', 'healthy', 'closing'];
const emptyFilters = () => ({ip:'',host:'',user:'',carrier:'',state:''});
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const fmtAge = ms => ms == null ? '—' : ms < 1000 ? `${ms}ms` : `${Math.round(ms/1000)}s`;
const fmtBytes = value => value == null ? '—' : value < 1024 ? `${value}B` : value < 1048576 ? `${(value/1024).toFixed(1)}KB` : `${(value/1048576).toFixed(2)}MB`;

export default function WebSessionsExplorer({apiFn}) {
  const [draft,setDraft] = useState(emptyFilters);
  const [filters,setFilters] = useState(emptyFilters);
  const [page,setPage] = useState({sessions:[]});
  const [cursor,setCursor] = useState(null);
  const [history,setHistory] = useState([]);
  const [runtimeInstance,setRuntimeInstance] = useState(null);
  const [loading,setLoading] = useState(false);
  const [busy,setBusy] = useState(null);
  const [error,setError] = useState(null);
  const [message,setMessage] = useState(null);
  const [detail,setDetail] = useState(null);
  const [operation,setOperation] = useState(null);

  const loadPage = async (targetCursor = cursor, targetFilters = filters) => {
    setLoading(true); setError(null);
    try{
      const [statusResponse,sessionsResponse] = await Promise.all([
        apiFn('/runtime/web/status'),
        apiFn('/runtime/web/sessions' + buildSessionQuery(targetFilters,targetCursor,50)),
      ]);
      setRuntimeInstance(statusResponse?.data?.runtime?.runtime_instance || null);
      setPage(sessionsResponse?.data || {sessions:[]});
      setCursor(targetCursor || null);
    }catch(e){setError(e.message||'Failed to load WEB sessions');}
    finally{setLoading(false);}
  };

  useEffect(()=>{ loadPage(null,filters); /* stable panel api helper */ /* eslint-disable-next-line react-hooks/exhaustive-deps */ },[]);

  const applyFilters = () => {
    const next={...draft};
    setFilters(next); setHistory([]); setCursor(null); setDetail(null);
    loadPage(null,next);
  };
  const clearFilters = () => {
    const next=emptyFilters();
    setDraft(next); setFilters(next); setHistory([]); setCursor(null); setDetail(null);
    loadPage(null,next);
  };
  const nextPage = () => {
    if(!page?.next_cursor) return;
    setHistory(h=>[...h,cursor]);
    loadPage(page.next_cursor,filters);
  };
  const prevPage = () => {
    if(!history.length) return;
    const previous=history[history.length-1] || null;
    setHistory(h=>h.slice(0,-1));
    loadPage(previous,filters);
  };

  const openDetail = async (sessionRef) => {
    setBusy('detail:'+sessionRef); setError(null); setMessage(null);
    try{
      const response=await apiFn('/runtime/web/sessions/'+encodeURIComponent(sessionRef));
      setDetail(response?.data || null);
    }catch(e){setError(e.message);}
    finally{setBusy(null);}
  };

  const pollOperation = async (operationId) => {
    for(let attempt=0; attempt<30; attempt++){
      const response=await apiFn('/runtime/web/operations/'+encodeURIComponent(operationId));
      const state=response?.data || null;
      setOperation(state);
      if(isTerminalOperation(state)) return state;
      await sleep(250);
    }
    return null;
  };

  const closeSession = async (sessionRef) => {
    if(!runtimeInstance) return setError('WEB runtime instance is unavailable');
    if(!window.confirm('Close this WEB session? Existing streams in this session will be terminated.')) return;
    setBusy('close:'+sessionRef); setError(null); setMessage(null); setOperation(null);
    try{
      const response=await apiFn('/runtime/web/sessions/close','POST',{
        runtime_instance:runtimeInstance,
        selector:{kind:'refs',session_refs:[sessionRef]},
      });
      const accepted=response?.data || null;
      setOperation(accepted);
      const operationId=accepted?.operation_id;
      const finalState=operationId ? await pollOperation(operationId) : accepted;
      setMessage(finalState?.state ? `Close operation ${finalState.state}` : 'Close operation accepted');
      setDetail(null);
      await loadPage(cursor,filters);
    }catch(e){setError(e.message);}
    finally{setBusy(null);}
  };

  const runtimeReset = async (kind) => {
    if(!runtimeInstance) return setError('WEB runtime instance is unavailable');
    const isDebug=kind==='debug';
    if(!window.confirm(isDebug?'Clear the bounded WEB debug ring?':'Reset process-local carrier learning evidence?')) return;
    setBusy(kind); setError(null); setMessage(null);
    try{
      const path=isDebug?'/runtime/web/debug/clear':'/runtime/web/carrier-learning/reset';
      const response=await apiFn(path,'POST',{runtime_instance:runtimeInstance});
      const data=response?.data||{};
      setMessage(isDebug?`Debug ring cleared: ${data.records_cleared??0} records`:`Carrier learning reset: ${data.entries_cleared??0} entries`);
    }catch(e){setError(e.message);}
    finally{setBusy(null);}
  };

  const rows=Array.isArray(page?.sessions)?page.sessions:[];
  return <div className="card">
    <div className="card-title" style={{justifyContent:'space-between',gap:8,flexWrap:'wrap'}}>
      <span>WEB Sessions Explorer</span>
      <span className="mono" style={{fontSize:10,color:'var(--text3)'}}>{runtimeInstance||'runtime unavailable'}</span>
    </div>

    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(145px,1fr))',gap:8,marginBottom:8}}>
      <input className="form-input mono" value={draft.user} onChange={e=>setDraft(f=>({...f,user:e.target.value}))} placeholder="user"/>
      <input className="form-input mono" value={draft.host} onChange={e=>setDraft(f=>({...f,host:e.target.value}))} placeholder="host"/>
      <input className="form-input mono" value={draft.ip} onChange={e=>setDraft(f=>({...f,ip:e.target.value}))} placeholder="client IP"/>
      <select className="form-input mono" value={draft.carrier} onChange={e=>setDraft(f=>({...f,carrier:e.target.value}))}>{CARRIERS.map(v=><option key={v||'all'} value={v}>{v||'all carriers'}</option>)}</select>
      <select className="form-input mono" value={draft.state} onChange={e=>setDraft(f=>({...f,state:e.target.value}))}>{STATES.map(v=><option key={v||'all'} value={v}>{v||'all states'}</option>)}</select>
    </div>
    <div style={{display:'flex',gap:7,flexWrap:'wrap',marginBottom:12}}>
      <button className="btn btn-primary btn-sm" onClick={applyFilters} disabled={loading}>Apply filters</button>
      <button className="btn btn-ghost btn-sm" onClick={clearFilters} disabled={loading}>Clear</button>
      <button className="btn btn-ghost btn-sm" onClick={()=>loadPage(cursor,filters)} disabled={loading}>{loading?'Loading…':'Refresh'}</button>
      <button className="btn btn-warn btn-sm" onClick={()=>runtimeReset('debug')} disabled={!runtimeInstance||!!busy}>Clear debug ring</button>
      <button className="btn btn-warn btn-sm" onClick={()=>runtimeReset('learning')} disabled={!runtimeInstance||!!busy}>Reset carrier learning</button>
    </div>

    {error&&<div className="error-box">⚠ {error}</div>}
    {message&&<div className="success-box">✓ {message}</div>}
    {operation&&<div className="data-grid" style={{marginBottom:12}}>
      <div className="data-row"><div className="data-key">operation</div><div className="data-val">{operation.operation_id||'—'}</div></div>
      <div className="data-row"><div className="data-key">state</div><div className="data-val">{operation.state||'—'}</div></div>
      <div className="data-row"><div className="data-key">matched / signalled</div><div className="data-val">{operation.matched??'—'} / {operation.signalled??'—'}</div></div>
      {operation.failure&&<div className="data-row"><div className="data-key">failure</div><div className="data-val">{String(operation.failure)}</div></div>}
    </div>}

    {rows.length===0&&!loading?<div className="empty-box" style={{padding:18}}>No WEB sessions match the current filters</div>:<div className="tbl-wrap"><table>
      <thead><tr><th>Session</th><th>User / IP</th><th>Host</th><th>Carrier</th><th>State</th><th>Streams</th><th>Pending</th><th>Age / idle</th><th>Actions</th></tr></thead>
      <tbody>{rows.map(row=><tr key={row.session_ref}>
        <td className="mono" style={{fontSize:10,maxWidth:190}} title={row.session_ref}>{row.session_ref}</td>
        <td><div className="mono" style={{color:'var(--accent)'}}>{row.user}</div><div className="mono" style={{fontSize:10,color:'var(--text3)'}}>{row.client_ip}</div></td>
        <td className="mono" style={{fontSize:11}}>{row.host}</td>
        <td><span className="badge badge-info">{row.carrier}</span></td>
        <td><span className={`badge ${row.state==='healthy'?'badge-ok':row.state==='closing'?'badge-warn':'badge-dim'}`}>{row.state}</span></td>
        <td className="mono">{row.streams}</td>
        <td className="mono">{fmtBytes(row.pending_bytes)}</td>
        <td className="mono" style={{fontSize:10}}>{fmtAge(row.age_ms)} / {fmtAge(row.idle_ms)}</td>
        <td><div style={{display:'flex',gap:4,flexWrap:'wrap'}}><button className="btn btn-ghost btn-sm" onClick={()=>openDetail(row.session_ref)} disabled={!!busy}>Detail</button><button className="btn btn-danger btn-sm" onClick={()=>closeSession(row.session_ref)} disabled={!runtimeInstance||!!busy}>Close</button></div></td>
      </tr>)}</tbody>
    </table></div>}

    <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap',marginTop:10}}>
      <button className="btn btn-ghost btn-sm" onClick={prevPage} disabled={!history.length||loading}>Previous</button>
      <button className="btn btn-ghost btn-sm" onClick={nextPage} disabled={!page?.next_cursor||loading}>Next</button>
      <span className="last-upd">rows {rows.length} · scanned {page?.scanned??'—'}{page?.scan_truncated?' · scan truncated':''}{page?.partial_sessions?` · partial ${page.partial_sessions}`:''}</span>
    </div>

    {detail&&<div style={{marginTop:14,borderTop:'1px solid var(--border)',paddingTop:12}}>
      <div className="card-title" style={{justifyContent:'space-between'}}><span>Session Detail</span><button className="btn btn-ghost btn-sm" onClick={()=>setDetail(null)}>Close detail</button></div>
      <div className="data-grid">
        {[
          ['session_ref',detail.session_ref],['user',detail.user],['client_ip',detail.client_ip],['host',detail.host],['user_agent',detail.user_agent||'—'],['user_agent_id',detail.user_agent_id||'—'],['key_id',detail.key_id||'—'],['carrier',detail.carrier],['attempt',detail.attempt],['state',detail.state],['health_publication',detail.health_publication],['streams',detail.streams],['tasks',detail.tasks],['lanes',detail.lanes],['websocket_active',detail.websocket_active],['pending_bytes',fmtBytes(detail.pending_bytes)],['control_bytes',fmtBytes(detail.control_bytes)],['age',fmtAge(detail.age_ms)],['idle',fmtAge(detail.idle_ms)],['peer_idle',fmtAge(detail.peer_idle_ms)],['peer_deadline_remaining',fmtAge(detail.peer_deadline_remaining_ms)],['negotiation_remaining',fmtAge(detail.negotiation_remaining_ms)],['closed_reason',detail.reason||'—'],['closed_age',fmtAge(detail.closed_age_ms)],
        ].filter(([,value])=>value!==undefined).map(([key,value])=><div className="data-row" key={key}><div className="data-key">{key}</div><div className="data-val">{String(value)}</div></div>)}
      </div>
    </div>}
  </div>;
}
