import React, {useCallback, useEffect, useState} from 'react';
import unifiedStats from './unified-stats.cjs';

const {normalizeUnifiedSnapshot}=unifiedStats;

const fmtBytes = value => {
  const n=Number(value);
  if(!Number.isFinite(n)) return '—';
  if(n<1024) return n+'B';
  if(n<1048576) return (n/1024).toFixed(1)+'KB';
  if(n<1073741824) return (n/1048576).toFixed(2)+'MB';
  return (n/1073741824).toFixed(2)+'GB';
};

export default function UnifiedStatsPanel({apiFn,pollMs=10000,compact=false}) {
  const [snapshot,setSnapshot]=useState(null);
  const [availability,setAvailability]=useState({mtproxy:false,web:false});
  const [error,setError]=useState(null);
  const [updated,setUpdated]=useState(null);

  const load=useCallback(async()=>{
    const [edgeResult,webResult]=await Promise.allSettled([
      apiFn('/runtime/connections/summary'),
      apiFn('/runtime/web/status'),
    ]);
    const edge=edgeResult.status==='fulfilled'?edgeResult.value?.data:null;
    const web=webResult.status==='fulfilled'?webResult.value?.data:null;
    setSnapshot(normalizeUnifiedSnapshot({edge,web}));
    setAvailability({
      mtproxy:!!edge?.data,
      web:!!web?.runtime,
    });
    const errors=[];
    if(edgeResult.status==='rejected') errors.push('MTProxy: '+edgeResult.reason.message);
    if(webResult.status==='rejected'&&webResult.reason?.status!==404) errors.push('WEB: '+webResult.reason.message);
    setError(errors.length?errors.join(' · '):null);
    setUpdated(new Date().toLocaleTimeString());
  },[apiFn]);

  useEffect(()=>{
    let cancelled=false;
    const run=async()=>{if(!cancelled) await load();};
    run();
    if(!pollMs) return()=>{cancelled=true;};
    const id=setInterval(run,pollMs);
    return()=>{cancelled=true;clearInterval(id);};
  },[load,pollMs]);

  if(!snapshot) return <div className="card"><div className="loading-box">Loading unified telemetry</div></div>;

  const s=snapshot;
  return <div className="card" style={{marginBottom:16}}>
    <div className="card-title" style={{justifyContent:'space-between'}}>
      <span>Unified Telemetry</span>
      <button className="btn btn-ghost btn-sm" onClick={load}>Refresh</button>
    </div>
    {error&&<div className="error-box" style={{marginBottom:10}}>⚠ {error}</div>}
    <div className="card-grid" style={{marginBottom:compact?8:12}}>
      <div className="stat-card">
        <div className="stat-label">MTPROXY LIVE</div>
        <div className="stat-value accent">{availability.mtproxy?s.mtproxy.current:'—'}</div>
        <div className="stat-sub">direct {availability.mtproxy?s.mtproxy.direct:'—'} · ME {availability.mtproxy?s.mtproxy.me:'—'}</div>
      </div>
      <div className="stat-card">
        <div className="stat-label">MTPROXY ACTIVE USERS</div>
        <div className="stat-value">{availability.mtproxy?s.mtproxy.activeUsers:'—'}</div>
        <div className="stat-sub">runtime edge snapshot</div>
      </div>
      <div className="stat-card">
        <div className="stat-label">WEB SESSIONS</div>
        <div className="stat-value accent">{availability.web?s.web.sessions:'—'}</div>
        <div className="stat-sub">streams {availability.web?s.web.streams:'—'} · WSS sockets {availability.web?s.web.wssSockets:'—'}</div>
      </div>
      <div className="stat-card">
        <div className="stat-label">WEB UP</div>
        <div className="stat-value" style={{fontSize:18}}>{availability.web?fmtBytes(s.web.bytesUp):'—'}</div>
        <div className="stat-sub">cumulative carrier payload</div>
      </div>
      <div className="stat-card">
        <div className="stat-label">WEB DOWN</div>
        <div className="stat-value" style={{fontSize:18}}>{availability.web?fmtBytes(s.web.bytesDown):'—'}</div>
        <div className="stat-sub">cumulative carrier payload</div>
      </div>
    </div>
    <div className="last-upd">
      MTProxy and WEB planes are reported separately: live connection/session counts and byte counters have different semantics and are not merged into a fake traffic total. The core cumulative connection counter may include WEB logical streams after they enter the MTProto backend.
      {updated?' · updated '+updated:''}
    </div>
  </div>;
}
