import React, {useCallback, useEffect, useState} from 'react';
import userPolicy from './user-policy.cjs';

const {findUserQuota} = userPolicy;

const fmtBytes = value => value == null ? '—' : value < 1024 ? `${value}B` : value < 1048576 ? `${(value/1024).toFixed(1)}KB` : value < 1073741824 ? `${(value/1048576).toFixed(2)}MB` : `${(value/1073741824).toFixed(2)}GB`;
const fmtTs = seconds => seconds ? new Date(seconds * 1000).toLocaleString() : '—';

export default function UserQuotaRuntime({user, apiFn}) {
  const [row,setRow] = useState(null);
  const [loading,setLoading] = useState(false);
  const [error,setError] = useState(null);
  const [unsupported,setUnsupported] = useState(false);

  const load = useCallback(async()=>{
    setLoading(true); setError(null); setUnsupported(false);
    try{
      const response=await apiFn('/stats/users/quota');
      setRow(findUserQuota(response?.data,user?.username));
    }catch(e){
      if(e.status===404||e.code==='not_found') setUnsupported(true);
      else setError(e.message||'Failed to load quota runtime');
    }finally{setLoading(false);}
  },[apiFn,user?.username]);

  useEffect(()=>{load();},[load]);

  if(unsupported) return null;
  return <div style={{marginBottom:14}}>
    <div className="card-title" style={{justifyContent:'space-between'}}>
      <span>Quota Runtime</span>
      <button className="btn btn-ghost btn-sm" onClick={load} disabled={loading}>{loading?'Loading…':'Refresh'}</button>
    </div>
    {error&&<div className="error-box">⚠ {error}</div>}
    {!error&&!loading&&!row&&<div className="empty-box" style={{padding:14}}>No persisted quota counter for this user</div>}
    {row&&<div className="data-grid">
      <div className="data-row"><div className="data-key">quota</div><div className="data-val">{fmtBytes(row.data_quota_bytes)}</div></div>
      <div className="data-row"><div className="data-key">used</div><div className="data-val">{fmtBytes(row.used_bytes)}</div></div>
      <div className="data-row"><div className="data-key">remaining</div><div className="data-val">{fmtBytes(Math.max(0,(row.data_quota_bytes||0)-(row.used_bytes||0)))}</div></div>
      <div className="data-row"><div className="data-key">last reset</div><div className="data-val">{fmtTs(row.last_reset_epoch_secs)}</div></div>
    </div>}
  </div>;
}
