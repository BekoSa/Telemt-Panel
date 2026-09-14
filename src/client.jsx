import React, {useState, useEffect, useCallback, useRef} from 'react';
import {createRoot} from 'react-dom/client';
import Chart from 'chart.js/auto';
import * as d3 from 'd3';
import * as topojson from 'topojson-client';
import worldAtlas from 'world-atlas/countries-110m.json';


// ─── Icons ──────────────────────────────────────────────────────────────────
const Icon = ({d,size=16}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
       strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={d}/></svg>
);
const IC = {
  dashboard:"M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z M9 22V12h6v10",
  users:"M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M23 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75",
  stats:"M18 20V10 M12 20V4 M6 20v-6",
  runtime:"M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z M12 6v6l4 2",
  security:"M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z",
  limits:"M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z",
  edge:"M1 6v16l7-4 8 4 7-4V2l-7 4-8-4-7 4z M8 2v16 M16 6v16",
  refresh:"M23 4v6h-6 M1 20v-6h6 M3.51 9a9 9 0 0 1 14.85-3.36L23 10 M1 14l4.64 4.36A9 9 0 0 0 20.49 15",
  add:"M12 5v14 M5 12h14",
  edit:"M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7 M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z",
  delete:"M3 6h18 M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2",
  user:"M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2 M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
  logout:"M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4 M16 17l5-5-5-5 M21 12H9",
  info:"M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z M12 16v-4 M12 8h.01",
  close:"M18 6 6 18 M6 6l12 12",
  link:"M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71 M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71",
};

// ─── API ─────────────────────────────────────────────────────────────────────
const _csrf = { token: null };
const CSRF_SAFE = new Set(['GET','HEAD','OPTIONS']);

async function api(path, method='GET', body=null, ifMatch=null) {
  const headers = {'Content-Type':'application/json'};
  if (ifMatch) headers['If-Match'] = ifMatch;
  if (!CSRF_SAFE.has(method) && _csrf.token) headers['X-CSRF-Token'] = _csrf.token;
  const opts = {method, headers, credentials:'same-origin'};
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch('/api/v1' + path, opts);
  if (r.status === 401) { window.__sessionExpired?.(); throw new Error('Session expired'); }
  const json = await r.json();
  if (!json.ok) {
    const err = new Error(json.error?.message || json.error?.code || 'Unknown error');
    err.code = json.error?.code || null;
    err.status = r.status;
    throw err;
  }
  return json;
}

async function panelFetch(path, method='GET', body=null) {
  const headers = {'Content-Type':'application/json'};
  if (!CSRF_SAFE.has(method) && _csrf.token) headers['X-CSRF-Token'] = _csrf.token;
  const opts = {method, headers, credentials:'same-origin'};
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(path, opts);
  if (r.status === 401) { window.__sessionExpired?.(); throw new Error('Session expired'); }
  return r.json();
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
const fmt_bytes  = b => !b&&b!==0?'—':b<1024?b+'B':b<1048576?(b/1024).toFixed(1)+'KB':b<1073741824?(b/1048576).toFixed(2)+'MB':(b/1073741824).toFixed(2)+'GB';
const fmt_uptime = s => !s&&s!==0?'—':s>=3600?`${Math.floor(s/3600)}h ${Math.floor(s%3600/60)}m`:`${Math.floor(s/60)}m ${Math.floor(s%60)}s`;
const fmt_ts     = e => e ? new Date(e*1000).toLocaleString() : '—';
const fmt_pct    = n => n==null?'—':n.toFixed(1)+'%';
const fmt_rtt    = ms => ms==null?'—':ms.toFixed(1)+'ms';

function StatusBadge({val}) {
  if (val==null) return <span className="badge badge-dim">—</span>;
  return val ? <span className="badge badge-ok">✓ yes</span> : <span className="badge badge-err">✗ no</span>;
}
function CovBar({pct}) {
  const c = pct>=100?'var(--accent)':pct>=60?'var(--warn)':'var(--err)';
  return (
    <div className="cov-bar">
      <div className="cov-track"><div style={{height:'100%',width:Math.min(pct||0,100)+'%',background:c,transition:'width .3s'}}/></div>
      <span className="mono" style={{color:c,fontSize:11}}>{fmt_pct(pct)}</span>
    </div>
  );
}
function CopyBtn({text}) {
  const [ok,setOk] = useState(false);
  return <button className="copy-btn" onClick={()=>{navigator.clipboard?.writeText(text);setOk(true);setTimeout(()=>setOk(false),1500)}}>{ok?'✓':'⎘'}</button>;
}
function ErrBox({msg}){ return msg?<div className="error-box">⚠ {msg}</div>:null; }

function useApi(path, deps=[]) {
  const [data,setData] = useState(null);
  const [err,setErr]   = useState(null);
  const [loading,setL] = useState(false);
  const [lastTs,setTs] = useState(null);
  const load = useCallback(async () => {
    setL(true); setErr(null);
    try { const r = await api(path); setData(r.data); setTs(new Date().toLocaleTimeString()); }
    catch(e){ setErr(e.message); }
    finally{ setL(false); }
  }, [path]);
  useEffect(()=>{ load(); },[load,...deps]);
  return {data,err,loading,reload:load,lastTs};
}
function RefreshBar({loading,onRefresh,lastTs}){
  return (
    <div className="refresh-row">
      <button className="btn btn-ghost btn-sm" onClick={onRefresh} disabled={loading}><Icon d={IC.refresh}/>{loading?'Loading…':'Refresh'}</button>
      {lastTs&&<span className="last-upd">upd {lastTs}</span>}
    </div>
  );
}

// ─── Login page ───────────────────────────────────────────────────────────────
function LoginPage({onLogin}) {
  const [user,setUser]   = useState('');
  const [pass,setPass]   = useState('');
  const [err,setErr]     = useState('');
  const [loading,setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!user||!pass) return;
    setLoading(true); setErr('');
    try {
      const r = await fetch('/auth/login', {
        method:'POST', credentials:'same-origin',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({username:user,password:pass})
      });
      const json = await r.json();
      if (json.ok) { if (json.csrfToken) _csrf.token = json.csrfToken; onLogin(json.username); }
      else setErr(json.error || 'Invalid credentials');
    } catch{ setErr('Network error'); }
    finally{ setLoading(false); }
  };

  return (
    <div className="login-wrap">
      <div className="login-bg"/>
      <div className="login-grid"/>
      <div className="login-box">
        <div className="login-logo">telemt<span>ctl</span></div>
        <div className="login-sub">Control Panel — Authenticate to continue</div>

        {err && <div className="login-err">⚠ {err}</div>}

        <form onSubmit={submit}>
          <label className="login-label">Username</label>
          <input className="login-input" value={user} onChange={e=>setUser(e.target.value)}
            autoComplete="username" autoFocus placeholder="admin"/>
          <label className="login-label">Password</label>
          <input className="login-input" type="password" value={pass} onChange={e=>setPass(e.target.value)}
            autoComplete="current-password" placeholder="••••••••" style={{marginBottom:0}}/>
          <button className="login-btn" type="submit" disabled={loading||!user||!pass}>
            {loading ? 'Authenticating…' : 'Sign In →'}
          </button>
        </form>

        <div className="login-caps">
          <div className="login-cap"><div className="login-cap-label">Auth</div><div className="login-cap-val">bcrypt · session</div></div>
          <div className="login-cap"><div className="login-cap-label">Transport</div><div className="login-cap-val">server-side proxy</div></div>
          <div className="login-cap"><div className="login-cap-label">Session</div><div className="login-cap-val">httpOnly cookie</div></div>
        </div>
      </div>
    </div>
  );
}

// ─── Dashboard ────────────────────────────────────────────────────────────────
function DashboardPage() {
  const health = useApi('/health');
  const ready  = useApi('/health/ready');
  const info   = useApi('/system/info');
  const sum    = useApi('/stats/summary');
  const gates  = useApi('/runtime/gates');
  const reload = () => { health.reload(); ready.reload(); info.reload(); sum.reload(); gates.reload(); };
  return (
    <div>
      <div className="page-hdr">
        <div className="page-title"><Icon d={IC.dashboard} size={20}/>Dashboard</div>
        <div className="page-actions"><button className="btn btn-ghost btn-sm" onClick={reload}><Icon d={IC.refresh}/>Refresh</button></div>
      </div>
      <div className="card-grid">
        <div className="stat-card">
          <div className="stat-label">STATUS</div>
          <div className="stat-value" style={{fontSize:15,marginTop:4}}>
            {health.loading?'…':health.err?<span style={{color:'var(--err)'}}>ERROR</span>:<span style={{color:'var(--accent)'}}>● ONLINE</span>}
          </div>
          {health.data&&<div className="stat-sub">read_only: {String(health.data.read_only)}</div>}
        </div>
        <div className="stat-card">
          <div className="stat-label">READY</div>
          <div className="stat-value" style={{fontSize:15,marginTop:4}}>
            {ready.loading?'…':ready.err?<span style={{color:'var(--text3)'}}>N/A</span>:ready.data?.ready?<span style={{color:'var(--accent)'}}>● READY</span>:<span style={{color:'var(--warn)'}}>● NOT READY</span>}
          </div>
          {ready.data&&<div className="stat-sub">{ready.data.status||'unknown'}</div>}
          {ready.err&&<div className="stat-sub">unsupported or unavailable</div>}
        </div>
        <div className="stat-card"><div className="stat-label">UPTIME</div><div className="stat-value accent">{sum.data?fmt_uptime(sum.data.uptime_seconds):'—'}</div></div>
        <div className="stat-card">
          <div className="stat-label">TOTAL CONNECTIONS</div>
          <div className="stat-value">{sum.data?sum.data.connections_total?.toLocaleString():'—'}</div>
          {sum.data&&<div className="stat-sub" style={{color:'var(--err)'}}>bad: {sum.data.connections_bad_total}</div>}
        </div>
        <div className="stat-card"><div className="stat-label">CONFIGURED USERS</div><div className="stat-value accent">{sum.data?sum.data.configured_users:'—'}</div></div>
        <div className="stat-card"><div className="stat-label">HANDSHAKE TIMEOUTS</div><div className="stat-value warn">{sum.data?sum.data.handshake_timeouts_total:'—'}</div></div>
        <div className="stat-card">
          <div className="stat-label">STARTUP</div>
          <div className="stat-value" style={{fontSize:14,marginTop:4}}>
            {gates.data?<span style={{color:gates.data.startup_status==='ready'?'var(--accent)':'var(--warn)'}}>{gates.data.startup_status?.toUpperCase()}</span>:'—'}
          </div>
          {gates.data&&<><div className="progress-bar"><div className={`progress-fill ${gates.data.startup_progress_pct>=100?'':'warn'}`} style={{width:(gates.data.startup_progress_pct||0)+'%'}}/></div><div className="stat-sub">{gates.data.startup_stage}</div></>}
        </div>
      </div>
      {info.data&&(
        <div className="card">
          <div className="card-title"><Icon d={IC.info}/>System Info</div>
          <div className="data-grid">
            {[['version',info.data.version],['arch / os',`${info.data.target_arch} / ${info.data.target_os}`],
              ['build profile',info.data.build_profile],['git commit',info.data.git_commit||'—'],
              ['build time',info.data.build_time_utc||'—'],['rustc',info.data.rustc_version||'—'],
              ['started at',fmt_ts(info.data.process_started_at_epoch_secs)],
              ['config path',info.data.config_path],['config hash',info.data.config_hash],
              ['reload count',info.data.config_reload_count],['last reload',fmt_ts(info.data.last_config_reload_epoch_secs)],
            ].map(([k,v])=>(
              <div key={k} className="data-row">
                <div className="data-key" title={k}>{k}</div>
                <div className="data-val">{String(v)}<CopyBtn text={String(v)}/></div>
              </div>
            ))}
          </div>
        </div>
      )}
      <ErrBox msg={health.err||info.err||sum.err}/>
    </div>
  );
}

// ─── Users ────────────────────────────────────────────────────────────────────
function UsersPage() {
  const [users,setUsers] = useState([]);
  const [loading,setL]   = useState(false);
  const [err,setErr]     = useState(null);
  const [modal,setModal] = useState(null);
  const [detail,setDetail] = useState(null);
  const [lastTs,setTs]   = useState(null);

  const load = useCallback(async () => {
    setL(true); setErr(null);
    try { const r = await api('/users'); setUsers(r.data||[]); setTs(new Date().toLocaleTimeString()); }
    catch(e){ setErr(e.message); }
    finally{ setL(false); }
  },[]);
  useEffect(()=>{ load(); },[load]);

  const del = async (u) => {
    if (!confirm(`Delete user "${u}"?`)) return;
    try {
      let ifMatch = null;
      try { const cur=await api('/users/'+u); ifMatch=cur.revision; } catch{}
      await api('/users/'+u,'DELETE',null,ifMatch); load();
    }
    catch(e){ alert('Error: '+e.message); }
  };

  return (
    <div>
      <div className="page-hdr">
        <div className="page-title"><Icon d={IC.users} size={20}/>Users</div>
        <div className="page-actions">
          <button className="btn btn-primary btn-sm" onClick={()=>setModal('create')}><Icon d={IC.add}/>New User</button>
          <button className="btn btn-ghost btn-sm" onClick={load} disabled={loading}><Icon d={IC.refresh}/></button>
        </div>
      </div>
      <RefreshBar loading={loading} onRefresh={load} lastTs={lastTs}/>
      <ErrBox msg={err}/>
      {!loading&&users.length===0&&!err&&<div className="empty-box">No users configured</div>}
      {users.length>0&&(
        <div className="tbl-wrap">
          <table>
            <thead><tr><th>Username</th><th>Connections</th><th>Traffic</th><th>Quota</th><th>Expires</th><th>IPs (active)</th><th>Actions</th></tr></thead>
            <tbody>
              {users.map(u=>(
                <tr key={u.username}>
                  <td><span className="mono" style={{color:'var(--accent)'}}>{u.username}</span></td>
                  <td><span className="mono">{u.current_connections}</span></td>
                  <td><span className="mono">{fmt_bytes(u.total_octets)}</span></td>
                  <td><span className="mono">{u.data_quota_bytes?fmt_bytes(u.data_quota_bytes):'∞'}</span></td>
                  <td><span className="mono" style={{fontSize:11}}>{u.expiration_rfc3339?new Date(u.expiration_rfc3339).toLocaleDateString():'—'}</span></td>
                  <td><span className="mono">{u.active_unique_ips}</span></td>
                  <td style={{display:'flex',gap:4,flexWrap:'wrap'}}>
                    <button className="btn btn-ghost btn-sm" onClick={()=>setDetail(u)}>Detail</button>
                    <button className="btn btn-ghost btn-sm" onClick={()=>setModal(u)}><Icon d={IC.edit}/></button>
                    <button className="btn btn-danger btn-sm" onClick={()=>del(u.username)}><Icon d={IC.delete}/></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <ActiveUserIps/>
      {modal&&<UserModal user={modal==='create'?null:modal} onClose={()=>{setModal(null);load();}}/>}
      {detail&&<UserDetailModal user={detail} onClose={()=>setDetail(null)} onEdit={(u)=>setModal(u)}/>}
    </div>
  );
}

function ActiveUserIps(){
  const {data,err,loading,reload,lastTs}=useApi('/stats/users/active-ips');
  if(loading) return <div className="card"><div className="card-title">Active source IPs</div><div className="loading-box">Loading</div></div>;
  if(err) return <div className="card"><div className="card-title">Active source IPs</div><div className="badge badge-dim">Unavailable on connected Telemt</div></div>;
  const rows=Array.isArray(data)?data:[];
  return <div className="card" style={{marginTop:16}}>
    <div className="card-title" style={{justifyContent:'space-between'}}><span>Active source IPs</span><button className="btn btn-ghost btn-sm" onClick={reload}>Refresh</button></div>
    {lastTs&&<div className="last-upd" style={{marginBottom:10}}>snapshot {lastTs}</div>}
    {rows.length===0?<div className="empty-box">No active source IPs</div>:<div className="tbl-wrap"><table>
      <thead><tr><th>Username</th><th>Active IPs</th></tr></thead>
      <tbody>{rows.map(row=><tr key={row.username}><td className="mono" style={{color:'var(--accent)'}}>{row.username}</td><td><div className="tag-list">{(row.active_ips||[]).map(ip=><span key={ip} className="tag">{ip}</span>)}</div></td></tr>)}</tbody>
    </table></div>}
  </div>;
}

function UserModal({user,onClose}) {
  const [form,setForm] = useState({username:user?.username||'',secret:'',user_ad_tag:user?.user_ad_tag||'',max_tcp_conns:user?.max_tcp_conns||'',expiration_rfc3339:user?.expiration_rfc3339||'',data_quota_bytes:user?.data_quota_bytes||'',max_unique_ips:user?.max_unique_ips||''});
  const [loading,setL] = useState(false);
  const [err,setErr]   = useState(null);
  const nums = ['max_tcp_conns','data_quota_bytes','max_unique_ips'];
  const set  = (name) => (e) => setForm(f => ({...f, [name]: e.target.value}));
  const submit = async () => {
    setL(true); setErr(null);
    try {
      const body = {};
      ['secret','user_ad_tag','max_tcp_conns','expiration_rfc3339','data_quota_bytes','max_unique_ips'].forEach(f=>{
        if (form[f]!==''&&form[f]!==undefined) body[f] = nums.includes(f)?Number(form[f]):form[f];
      });
      if (!user) { body.username=form.username; await api('/users','POST',body); }
      else {
        // Fetch current revision for optimistic concurrency
        let ifMatch = null;
        try { const cur=await api('/users/'+user.username); ifMatch=cur.revision; } catch{}
        await api('/users/'+user.username,'PATCH',body,ifMatch);
      }
      onClose();
    } catch(e){ setErr(e.message); }
    finally{ setL(false); }
  };
  return (
    <div className="modal-overlay">
      <div className="modal">
        <div className="modal-title">{user?'Edit: '+user.username:'Create User'}</div>
        <ErrBox msg={err}/>
        {!user&&<div className="form-row">
          <label className="form-label">Username *</label>
          <input className="form-input" value={form.username} onChange={set('username')} placeholder="[A-Za-z0-9_.-], 1..64 chars" autoFocus/>
        </div>}
        <div className="form-row">
          <label className="form-label">Secret</label>
          <input className="form-input" value={form.secret} onChange={set('secret')} placeholder="32 hex chars (auto-generated if empty)"/>
        </div>
        <div className="form-row">
          <label className="form-label">Ad Tag</label>
          <input className="form-input" value={form.user_ad_tag} onChange={set('user_ad_tag')} placeholder="32 hex chars (optional)"/>
        </div>
        <div className="form-row">
          <label className="form-label">Max TCP Connections</label>
          <input className="form-input" type="number" value={form.max_tcp_conns} onChange={set('max_tcp_conns')} placeholder="Unlimited if empty"/>
        </div>
        <div className="form-row">
          <label className="form-label">Expiration (RFC3339)</label>
          <input className="form-input" value={form.expiration_rfc3339} onChange={set('expiration_rfc3339')} placeholder="2026-01-01T00:00:00Z"/>
        </div>
        <div className="form-row">
          <label className="form-label">Data Quota (bytes)</label>
          <input className="form-input" type="number" value={form.data_quota_bytes} onChange={set('data_quota_bytes')} placeholder="Unlimited if empty"/>
        </div>
        <div className="form-row">
          <label className="form-label">Max Unique IPs</label>
          <input className="form-input" type="number" value={form.max_unique_ips} onChange={set('max_unique_ips')} placeholder="Unlimited if empty"/>
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={submit} disabled={loading}>{loading?'Saving…':user?'Save':'Create'}</button>
        </div>
      </div>
    </div>
  );
}

function UserDetailModal({user:initialUser,onClose,onEdit,cfg}) {
  const [user,setUser]   = useState(initialUser);
  const [loading,setL]   = useState(true);
  const [err,setErr]     = useState(null);
  const [busyAction,setBusyAction]=useState(null);
  const [actionMsg,setActionMsg]=useState(null);

  // Fresh fetch from GET /v1/users/{username}
  useEffect(()=>{
    let cancelled=false;
    (async()=>{
      try{
        const r=await api('/users/'+initialUser.username);
        if(!cancelled) setUser(r.data);
      }catch(e){ if(!cancelled) setErr(e.message); }
      finally{ if(!cancelled) setL(false); }
    })();
    return()=>{cancelled=true;};
  },[initialUser.username]);

  const runUserAction=async(path,successMessage,confirmMessage=null)=>{
    if(confirmMessage && !window.confirm(confirmMessage)) return;
    const action=path.split('/').pop();
    setBusyAction(action); setActionMsg(null);
    try{
      await api(path,'POST',{});
      const fresh=await api('/users/'+user.username);
      if(fresh?.data) setUser(fresh.data);
      setActionMsg({ok:true,msg:successMessage});
    }catch(e){
      const unsupported=e.status===404||e.status===405||e.code==='not_found'||e.code==='method_not_allowed';
      setActionMsg({ok:false,msg:unsupported
        ? `Action "${action}" is not supported by the connected Telemt version`
        : e.message});
    }finally{ setBusyAction(null); }
  };

  const rotateSecret=()=>runUserAction('/users/'+user.username+'/rotate-secret','Secret rotated successfully');
  const enableUser=()=>runUserAction('/users/'+user.username+'/enable','User enabled');
  const disableUser=()=>runUserAction('/users/'+user.username+'/disable','User disabled',`Disable ${user.username}? Active runtime sessions will be closed.`);
  const resetQuota=()=>runUserAction('/users/'+user.username+'/reset-quota','Quota reset',`Reset quota for ${user.username}?`);

  const u=user;
  return (
    <div className="modal-overlay">
      <div className="modal" style={{maxWidth:700}}>
        <div className="modal-title" style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <span>User: <span style={{color:'var(--accent)',fontFamily:'var(--mono)'}}>{u.username}</span></span>
          <div style={{display:'flex',gap:6}}>
            {loading&&<span style={{fontFamily:'var(--mono)',fontSize:11,color:'var(--text3)'}}>refreshing…</span>}
            <button className="btn btn-ghost btn-sm" onClick={onClose}><Icon d={IC.close}/></button>
          </div>
        </div>
        <ErrBox msg={err}/>

        <div className="data-grid" style={{marginBottom:16}}>
          {[
            ['connections (live)', u.current_connections],
            ['total traffic',      fmt_bytes(u.total_octets)],
            ['data quota',         u.data_quota_bytes?fmt_bytes(u.data_quota_bytes):'∞'],
            ['max TCP conns',      u.max_tcp_conns||'∞'],
            ['max unique IPs',     u.max_unique_ips||'∞'],
            ['expires',            u.expiration_rfc3339||'never'],
            ['active unique IPs',  u.active_unique_ips],
            ['recent unique IPs',  u.recent_unique_ips],
          ].map(([k,v])=>(
            <div key={k} className="data-row">
              <div className="data-key" title={k}>{k}</div>
              <div className="data-val">{String(v??'—')}</div>
            </div>
          ))}
        </div>

        {u.active_unique_ips_list?.length>0&&(
          <div style={{marginBottom:14}}>
            <div className="card-title">Active IPs</div>
            <div className="tag-list">{u.active_unique_ips_list.map(ip=><span key={ip} className="tag">{ip}</span>)}</div>
          </div>
        )}
        {u.recent_unique_ips_list?.length>0&&u.recent_unique_ips_list.some(ip=>!u.active_unique_ips_list?.includes(ip))&&(
          <div style={{marginBottom:14}}>
            <div className="card-title">Recent IPs <span style={{color:'var(--text3)',fontWeight:400}}>(window)</span></div>
            <div className="tag-list">{u.recent_unique_ips_list.map(ip=><span key={ip} className="tag" style={{opacity:u.active_unique_ips_list?.includes(ip)?1:0.5}}>{ip}</span>)}</div>
          </div>
        )}

        {u.links&&(['classic','secure','tls'].some(m=>u.links[m]?.length>0))&&(
          <div style={{marginBottom:14}}>
            <div className="card-title">Connection Links</div>
            {['classic','secure','tls'].map(m=>u.links[m]?.length>0&&(
              <div key={m} style={{marginBottom:8}}>
                <div style={{fontSize:10,color:'var(--text3)',fontFamily:'var(--mono)',marginBottom:4,textTransform:'uppercase',letterSpacing:'.06em'}}>{m}</div>
                <div className="tag-list">
                  {u.links[m].map(l=>(
                    <a key={l} href={l} className="link-chip" title={l}><Icon d={IC.link} size={10}/>{l.slice(0,58)+'…'}<CopyBtn text={l}/></a>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Telemt 3.5.7 user controls */}
        <div style={{borderTop:'1px solid var(--border)',paddingTop:14,marginTop:4}}>
          <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
            <button className="btn btn-warn btn-sm" onClick={rotateSecret} disabled={!!busyAction}>
              {busyAction==='rotate-secret'?'Rotating…':'⟳ Rotate Secret'}
            </button>
            {u.enabled===false ? (
              <button className="btn btn-primary btn-sm" onClick={enableUser} disabled={!!busyAction}>Enable user</button>
            ) : (
              <button className="btn btn-danger btn-sm" onClick={disableUser} disabled={!!busyAction}>Disable user</button>
            )}
            <button className="btn btn-ghost btn-sm" onClick={resetQuota} disabled={!!busyAction}>Reset quota</button>
          </div>
          <div style={{fontFamily:'var(--mono)',fontSize:11,color:'var(--text3)',marginTop:7}}>
            Disable closes active runtime sessions. Reset quota clears the persisted runtime quota counter.
          </div>
          {actionMsg&&(
            <div style={{marginTop:8,fontFamily:'var(--mono)',fontSize:11,
              color:actionMsg.ok?'var(--accent)':'var(--warn)',
              background:actionMsg.ok?'var(--accent3)':'var(--warn2)',
              border:`1px solid ${actionMsg.ok?'rgba(0,229,180,.2)':'rgba(245,168,50,.2)'}`,
              padding:'6px 10px'}}>
              {actionMsg.ok?'✓ ':'⚠ '}{actionMsg.msg}
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Close</button>
          <button className="btn btn-primary" onClick={()=>{onClose();onEdit(u);}}>Edit</button>
        </div>
      </div>
    </div>
  );
}

// ─── Stats ────────────────────────────────────────────────────────────────────
function StatsPage() {
  const [tab,setTab] = useState('summary');
  const tabs = [{id:'summary',l:'Summary'},{id:'zero',l:'Zero/All'},{id:'upstreams',l:'Upstreams'},{id:'dcs',l:'DCs'},{id:'mewriters',l:'ME Writers'},{id:'minimal',l:'Minimal All'}];
  return (
    <div>
      <div className="page-hdr"><div className="page-title"><Icon d={IC.stats} size={20}/>Statistics</div></div>
      <div className="tabs">{tabs.map(t=><div key={t.id} className={`tab ${tab===t.id?'active':''}`} onClick={()=>setTab(t.id)}>{t.l}</div>)}</div>
      {tab==='summary'  &&<StatsSummary/>}
      {tab==='zero'     &&<StatsZero/>}
      {tab==='upstreams'&&<StatsUpstreams/>}
      {tab==='dcs'      &&<StatsDcs/>}
      {tab==='mewriters'&&<StatsMeWriters/>}
      {tab==='minimal'  &&<StatsMinimal/>}
    </div>
  );
}
function StatsSummary(){
  const {data,err,loading,reload,lastTs}=useApi('/stats/summary');
  return <div>
    <RefreshBar loading={loading} onRefresh={reload} lastTs={lastTs}/>
    <ErrBox msg={err}/>
    {data&&<div className="card-grid">
      {[['UPTIME',fmt_uptime(data.uptime_seconds),'accent'],['TOTAL CONNECTIONS',data.connections_total?.toLocaleString(),''],
        ['BAD CONNECTIONS',data.connections_bad_total,'err'],['HANDSHAKE TIMEOUTS',data.handshake_timeouts_total,'warn'],
        ['CONFIGURED USERS',data.configured_users,'accent']].map(([l,v,c])=>(
        <div key={l} className="stat-card"><div className="stat-label">{l}</div><div className={`stat-value ${c}`}>{v}</div></div>
      ))}
    </div>}
  </div>;
}
function StatsZero(){
  const {data,err,loading,reload,lastTs}=useApi('/stats/zero/all');
  if(loading) return <div className="loading-box">Loading</div>;
  if(err) return <ErrBox msg={err}/>;
  if(!data) return null;
  const {core,upstream,middle_proxy,pool,desync}=data;
  const Sec=({title,rows})=>(
    <div className="card"><div className="card-title">{title}</div><div className="data-grid">
      {rows.map(([k,v])=><div key={k} className="data-row"><div className="data-key" title={k}>{k}</div><div className="data-val">{v==null?'—':String(v)}</div></div>)}
    </div></div>
  );
  return <div>
    <RefreshBar loading={loading} onRefresh={reload} lastTs={lastTs}/>
    <Sec title="Core" rows={[['uptime',fmt_uptime(core?.uptime_seconds)],['connections',core?.connections_total],['connections_bad',core?.connections_bad_total],['handshake_timeouts',core?.handshake_timeouts_total],['configured_users',core?.configured_users],['telemetry_me_level',core?.telemetry_me_level]]}/>
    {upstream&&<Sec title="Upstream" rows={[['attempt_total',upstream.connect_attempt_total],['success_total',upstream.connect_success_total],['fail_total',upstream.connect_fail_total],['bucket_1_try',upstream.connect_attempts_bucket_1],['bucket_2_try',upstream.connect_attempts_bucket_2],['bucket_3-4_try',upstream.connect_attempts_bucket_3_4],['bucket_>4_try',upstream.connect_attempts_bucket_gt_4],['ok ≤100ms',upstream.connect_duration_success_bucket_le_100ms],['ok >1000ms',upstream.connect_duration_success_bucket_gt_1000ms]]}/>}
    {middle_proxy&&<Sec title="Middle Proxy" rows={[['keepalive_sent',middle_proxy.keepalive_sent_total],['keepalive_failed',middle_proxy.keepalive_failed_total],['reconnect_attempt',middle_proxy.reconnect_attempt_total],['reconnect_success',middle_proxy.reconnect_success_total],['handshake_reject',middle_proxy.handshake_reject_total],['reader_eof',middle_proxy.reader_eof_total],['route_drop_no_conn',middle_proxy.route_drop_no_conn_total],['route_drop_q_full',middle_proxy.route_drop_queue_full_total],['kdf_drift',middle_proxy.kdf_drift_total],['floor_mode_switches',middle_proxy.floor_mode_switch_total]]}/>}
      {middle_proxy?.handshake_error_codes?.length>0&&<div className="card">
        <div className="card-title">Handshake Error Codes</div>
        <div className="tbl-wrap"><table>
          <thead><tr><th>Code</th><th>Total</th></tr></thead>
          <tbody>{middle_proxy.handshake_error_codes.map(e=>(
            <tr key={e.code}><td className="mono" style={{color:'var(--err)'}}>{e.code}</td><td className="mono">{e.total}</td></tr>
          ))}</tbody>
        </table></div>
      </div>}
    {pool&&<Sec title="ME Pool" rows={[['swap_total',pool.pool_swap_total],['drain_active',pool.pool_drain_active],['force_close_total',pool.pool_force_close_total],['writer_removed_total',pool.writer_removed_total],['refill_triggered',pool.refill_triggered_total],['refill_failed',pool.refill_failed_total]]}/>}
    {desync&&<Sec title="Desync" rows={[['desync_total',desync.desync_total],['suppressed',desync.desync_suppressed_total],['secure_padding_invalid',desync.secure_padding_invalid_total]]}/>}
  </div>;
}
function StatsUpstreams(){
  const {data,err,loading,reload,lastTs}=useApi('/stats/upstreams');
  if(loading) return <div className="loading-box">Loading</div>;
  if(err) return <ErrBox msg={err}/>;
  if(!data) return null;
  return <div>
    <RefreshBar loading={loading} onRefresh={reload} lastTs={lastTs}/>
    {!data.enabled&&<div className="badge badge-dim" style={{marginBottom:16}}>Feature disabled — minimal_runtime_enabled=false</div>}
    {data.summary&&<div className="card-grid" style={{marginBottom:16}}>
      {[['CONFIGURED',data.summary.configured_total,''],['HEALTHY',data.summary.healthy_total,'accent'],['UNHEALTHY',data.summary.unhealthy_total,'err']].map(([l,v,c])=>(
        <div key={l} className="stat-card"><div className="stat-label">{l}</div><div className={`stat-value ${c}`}>{v}</div></div>
      ))}
    </div>}
    {data.upstreams?.length>0&&<div className="tbl-wrap"><table>
      <thead><tr><th>ID</th><th>Kind</th><th>Address</th><th>Weight</th><th>Healthy</th><th>Fails</th><th>Latency</th><th>Last check</th></tr></thead>
      <tbody>{data.upstreams.map(u=><tr key={u.upstream_id}>
        <td className="mono">{u.upstream_id}</td>
        <td><span className="badge badge-info">{u.route_kind}</span></td>
        <td className="mono" style={{fontSize:11}}>{u.address}</td>
        <td className="mono">{u.weight}</td>
        <td>{u.healthy?<span className="badge badge-ok">yes</span>:<span className="badge badge-err">no</span>}</td>
        <td className="mono" style={{color:u.fails>0?'var(--err)':'inherit'}}>{u.fails}</td>
        <td className="mono">{fmt_rtt(u.effective_latency_ms)}</td>
        <td className="mono" style={{fontSize:11}}>{u.last_check_age_secs}s ago</td>
      </tr>)}</tbody>
    </table></div>}
  </div>;
}
function StatsDcs(){
  const {data,err,loading,reload,lastTs}=useApi('/stats/dcs');
  if(loading) return <div className="loading-box">Loading</div>;
  if(err) return <ErrBox msg={err}/>;
  if(!data) return null;
  return <div>
    <RefreshBar loading={loading} onRefresh={reload} lastTs={lastTs}/>
    {!data.middle_proxy_enabled&&<div className="badge badge-warn" style={{marginBottom:16}}>ME disabled — {data.reason}</div>}
    {data.dcs?.length>0&&<div className="tbl-wrap"><table>
      <thead><tr><th>DC</th><th>Available</th><th>Coverage</th><th>Alive/Req</th><th>RTT</th><th>Load</th><th>Floor min/tgt/max</th></tr></thead>
      <tbody>{data.dcs.map(dc=><tr key={dc.dc}>
        <td><span className="badge badge-info">DC{dc.dc}</span></td>
        <td className="mono">{dc.available_endpoints}/{dc.endpoints?.length||0}</td>
        <td><CovBar pct={dc.coverage_pct}/></td>
        <td className="mono">{dc.alive_writers}/{dc.required_writers}</td>
        <td className="mono">{fmt_rtt(dc.rtt_ms)}</td>
        <td className="mono">{dc.load}</td>
        <td className="mono" style={{fontSize:11}}>{dc.floor_min}/{dc.floor_target}/{dc.floor_max}{dc.floor_capped?' ⚠':''}</td>
      </tr>)}</tbody>
    </table></div>}
  </div>;
}
function StatsMeWriters(){
  const {data,err,loading,reload,lastTs}=useApi('/stats/me-writers');
  if(loading) return <div className="loading-box">Loading</div>;
  if(err) return <ErrBox msg={err}/>;
  if(!data) return null;
  const s=data.summary;
  return <div>
    <RefreshBar loading={loading} onRefresh={reload} lastTs={lastTs}/>
    {!data.middle_proxy_enabled&&<div className="badge badge-warn" style={{marginBottom:16}}>ME disabled — {data.reason}</div>}
    {s&&<div className="card-grid" style={{marginBottom:16}}>
      <div className="stat-card"><div className="stat-label">ENDPOINTS</div><div className="stat-value" style={{fontSize:16}}>{s.available_endpoints}/{s.configured_endpoints}</div><CovBar pct={s.available_pct}/></div>
      <div className="stat-card"><div className="stat-label">WRITERS</div><div className="stat-value accent" style={{fontSize:16}}>{s.alive_writers}/{s.required_writers}</div><CovBar pct={s.coverage_pct}/></div>
    </div>}
    {data.writers?.length>0&&<div className="tbl-wrap"><table>
      <thead><tr><th>ID</th><th>DC</th><th>Endpoint</th><th>State</th><th>Bound</th><th>RTT</th><th>Idle</th></tr></thead>
      <tbody>{data.writers.map(w=><tr key={w.writer_id}>
        <td className="mono" style={{fontSize:11}}>{w.writer_id}</td>
        <td className="mono">{w.dc??'—'}</td>
        <td className="mono" style={{fontSize:11}}>{w.endpoint}</td>
        <td><span className={`badge ${w.state==='active'?'badge-ok':w.state==='warm'?'badge-info':'badge-dim'}`}>{w.state}</span>{w.degraded&&<span className="badge badge-warn" style={{marginLeft:4}}>deg</span>}</td>
        <td className="mono">{w.bound_clients}</td>
        <td className="mono">{fmt_rtt(w.rtt_ema_ms)}</td>
        <td className="mono">{w.idle_for_secs!=null?w.idle_for_secs+'s':''}</td>
      </tr>)}</tbody>
    </table></div>}
  </div>;
}
function StatsMinimal(){
  const {data,err,loading,reload,lastTs}=useApi('/stats/minimal/all');
  if(loading) return <div className="loading-box">Loading</div>;
  if(err) return <ErrBox msg={err}/>;
  if(!data) return null;
  return <div>
    <RefreshBar loading={loading} onRefresh={reload} lastTs={lastTs}/>
    {!data.enabled&&<div className="badge badge-dim" style={{marginBottom:16}}>Feature disabled — {data.reason}</div>}
    {data.data?.network_path?.length>0&&<div className="card">
      <div className="card-title">Network Path</div>
      <div className="tbl-wrap"><table>
        <thead><tr><th>DC</th><th>IP Preference</th><th>IPv4</th><th>IPv6</th></tr></thead>
        <tbody>{data.data.network_path.map(p=><tr key={p.dc}>
          <td><span className="badge badge-info">DC{p.dc}</span></td>
          <td className="mono">{p.ip_preference||'—'}</td>
          <td className="mono" style={{fontSize:11}}>{p.selected_addr_v4||'—'}</td>
          <td className="mono" style={{fontSize:11}}>{p.selected_addr_v6||'—'}</td>
        </tr>)}</tbody>
      </table></div>
    </div>}
  </div>;
}

// ─── Runtime ──────────────────────────────────────────────────────────────────
function RuntimePage(){
  const [tab,setTab]=useState('gates');
  const tabs=[{id:'gates',l:'Gates'},{id:'init',l:'Initialization'},{id:'mepool',l:'ME Pool'},{id:'meq',l:'ME Quality'},{id:'upq',l:'Upstream Quality'},{id:'nat',l:'NAT/STUN'},{id:'selftest',l:'ME Selftest'}];
  return <div>
    <div className="page-hdr"><div className="page-title"><Icon d={IC.runtime} size={20}/>Runtime</div></div>
    <div className="tabs">{tabs.map(t=><div key={t.id} className={`tab ${tab===t.id?'active':''}`} onClick={()=>setTab(t.id)}>{t.l}</div>)}</div>
    {tab==='gates'   &&<RuntimeGates/>}
    {tab==='init'    &&<RuntimeInit/>}
    {tab==='mepool'  &&<RuntimeMePool/>}
    {tab==='meq'     &&<RuntimeMeQuality/>}
    {tab==='upq'     &&<RuntimeUpstreamQuality/>}
    {tab==='nat'     &&<RuntimeNatStun/>}
    {tab==='selftest'&&<RuntimeSelftest/>}
  </div>;
}
function RuntimeGates(){
  const {data,err,loading,reload,lastTs}=useApi('/runtime/gates');
  if(loading) return <div className="loading-box">Loading</div>;
  if(err) return <ErrBox msg={err}/>;
  if(!data) return null;
  const sc=data.startup_status;
  return <div>
    <RefreshBar loading={loading} onRefresh={reload} lastTs={lastTs}/>
    <div className="card-grid">
      <div className="stat-card">
        <div className="stat-label">STARTUP</div>
        <div className="stat-value" style={{fontSize:15,color:sc==='ready'?'var(--accent)':'var(--warn)'}}>{sc?.toUpperCase()}</div>
        <div className="progress-bar"><div className={`progress-fill ${data.startup_progress_pct>=100?'':'warn'}`} style={{width:(data.startup_progress_pct||0)+'%'}}/></div>
        <div className="stat-sub">{data.startup_stage}</div>
      </div>
    </div>
    <div className="card"><div className="card-title">Gates</div><div className="data-grid">
      {[['accepting_new_connections',data.accepting_new_connections],['conditional_cast_enabled',data.conditional_cast_enabled],['me_runtime_ready',data.me_runtime_ready],['me2dc_fallback_enabled',data.me2dc_fallback_enabled],['use_middle_proxy',data.use_middle_proxy]].map(([k,v])=>(
        <div key={k} className="data-row"><div className="data-key" title={k}>{k}</div><div className="data-val"><StatusBadge val={v}/></div></div>
      ))}
    </div></div>
  </div>;
}
function RuntimeInit(){
  const {data,err,loading,reload,lastTs}=useApi('/runtime/initialization');
  if(loading) return <div className="loading-box">Loading</div>;
  if(err) return <ErrBox msg={err}/>;
  if(!data) return null;
  const sc=s=>s==='ready'?'var(--accent)':s==='failed'?'var(--err)':s==='running'||s==='initializing'?'var(--warn)':'var(--text3)';
  return <div>
    <RefreshBar loading={loading} onRefresh={reload} lastTs={lastTs}/>
    <div className="card-grid">
      <div className="stat-card"><div className="stat-label">STATUS</div><div className="stat-value" style={{fontSize:15,color:sc(data.status)}}>{data.status?.toUpperCase()}</div><div className="progress-bar"><div className={`progress-fill ${data.progress_pct>=100?'':'warn'}`} style={{width:(data.progress_pct||0)+'%'}}/></div><div className="stat-sub">{data.current_stage}</div></div>
      <div className="stat-card"><div className="stat-label">TRANSPORT</div><div className="stat-value accent" style={{fontSize:14}}>{data.transport_mode}</div></div>
      <div className="stat-card"><div className="stat-label">ELAPSED</div><div className="stat-value">{data.total_elapsed_ms}ms</div>{data.degraded&&<div className="stat-sub" style={{color:'var(--warn)'}}>⚠ DEGRADED</div>}</div>
    </div>
    {data.me&&<div className="card"><div className="card-title">ME Init</div><div className="data-grid">
      {[['status',<span style={{color:sc(data.me.status)}}>{data.me.status}</span>],['stage',data.me.current_stage],['progress',fmt_pct(data.me.progress_pct)],['attempt',`${data.me.init_attempt} / ${data.me.retry_limit}`],['last_error',data.me.last_error||'—']].map(([k,v])=>(
        <div key={k} className="data-row"><div className="data-key" title={k}>{k}</div><div className="data-val">{v}</div></div>
      ))}
    </div></div>}
    {data.components?.length>0&&<div className="card"><div className="card-title">Components</div><div style={{border:'1px solid var(--border)'}}>
      <div className="comp-row comp-row-hdr"><div>Component</div><div>Status</div><div>Duration</div><div>Attempts</div><div>Details</div></div>
      {data.components.map(c=><div key={c.id} className="comp-row">
        <div className="mono" style={{fontSize:11}}>{c.title||c.id}</div>
        <div><span style={{color:sc(c.status),fontFamily:'var(--mono)',fontSize:11}}>{c.status}</span></div>
        <div className="mono" style={{fontSize:11}}>{c.duration_ms!=null?c.duration_ms+'ms':'—'}</div>
        <div className="mono" style={{fontSize:11}}>{c.attempts}</div>
        <div className="mono" style={{fontSize:11,color:'var(--text3)'}}>{c.details||''}</div>
      </div>)}
    </div></div>}
  </div>;
}
function RuntimeMePool(){
  const {data,err,loading,reload,lastTs}=useApi('/runtime/me_pool_state');
  if(loading) return <div className="loading-box">Loading</div>;
  if(err) return <ErrBox msg={err}/>;
  if(!data?.data) return <div className="badge badge-dim">{data?.reason||'Unavailable'}</div>;
  const d=data.data;
  return <div>
    <RefreshBar loading={loading} onRefresh={reload} lastTs={lastTs}/>
    <div className="card-grid">
      {[['ACTIVE GEN',d.generations?.active_generation,'accent'],['WARM GEN',d.generations?.warm_generation,'info'],['ALIVE',d.writers?.alive_non_draining,''],['DRAINING',d.writers?.draining,'warn'],['DEGRADED',d.writers?.degraded,'err']].map(([l,v,c])=>(
        <div key={l} className="stat-card"><div className="stat-label">{l}</div><div className={`stat-value ${c}`}>{v??'—'}</div></div>
      ))}
    </div>
    <div className="card"><div className="card-title">Writer Contour</div><div className="data-grid">
      {[['warm',d.writers?.contour?.warm],['active',d.writers?.contour?.active],['draining',d.writers?.contour?.draining]].map(([k,v])=>(
        <div key={k} className="data-row"><div className="data-key" title={k}>{k}</div><div className="data-val mono">{v??'—'}</div></div>
      ))}
    </div></div>
    {d.refill?.by_dc?.length>0&&<div className="card"><div className="card-title">Refill In-flight</div><div className="tbl-wrap"><table>
      <thead><tr><th>DC</th><th>Family</th><th>In-flight</th></tr></thead>
      <tbody>{d.refill.by_dc.map(r=><tr key={r.dc+r.family}><td><span className="badge badge-info">DC{r.dc}</span></td><td className="mono">{r.family}</td><td className="mono">{r.inflight}</td></tr>)}</tbody>
    </table></div></div>}
  </div>;
}
function RuntimeMeQuality(){
  const {data,err,loading,reload,lastTs}=useApi('/runtime/me_quality');
  if(loading) return <div className="loading-box">Loading</div>;
  if(err) return <ErrBox msg={err}/>;
  if(!data?.data) return <div className="badge badge-dim">{data?.reason||'Unavailable'}</div>;
  const d=data.data;
  return <div>
    <RefreshBar loading={loading} onRefresh={reload} lastTs={lastTs}/>
    {d.counters&&<div className="card"><div className="card-title">Quality Counters</div><div className="data-grid">
      {Object.entries(d.counters).map(([k,v])=><div key={k} className="data-row"><div className="data-key" title={k}>{k}</div><div className="data-val mono">{String(v)}</div></div>)}
    </div></div>}
    {d.route_drops&&<div className="card"><div className="card-title">Route Drops</div><div className="data-grid">
      {Object.entries(d.route_drops).map(([k,v])=><div key={k} className="data-row"><div className="data-key" title={k}>{k}</div><div className="data-val mono" style={{color:v>0?'var(--err)':'inherit'}}>{String(v)}</div></div>)}
    </div></div>}
    {d.dc_rtt?.length>0&&<div className="tbl-wrap"><table>
      <thead><tr><th>DC</th><th>RTT EMA</th><th>Coverage</th><th>Alive / Required</th></tr></thead>
      <tbody>{d.dc_rtt.map(r=><tr key={r.dc}>
        <td><span className="badge badge-info">DC{r.dc}</span></td>
        <td className="mono">{fmt_rtt(r.rtt_ema_ms)}</td>
        <td><CovBar pct={r.coverage_pct}/></td>
        <td className="mono">{r.alive_writers} / {r.required_writers}</td>
      </tr>)}</tbody>
    </table></div>}
  </div>;
}
function RuntimeUpstreamQuality(){
  const {data,err,loading,reload,lastTs}=useApi('/runtime/upstream_quality');
  if(loading) return <div className="loading-box">Loading</div>;
  if(err) return <ErrBox msg={err}/>;
  if(!data) return null;
  return <div>
    <RefreshBar loading={loading} onRefresh={reload} lastTs={lastTs}/>
    {data.summary&&<div className="card-grid">
      {[['CONFIGURED',data.summary.configured_total,''],['HEALTHY',data.summary.healthy_total,'accent'],['UNHEALTHY',data.summary.unhealthy_total,'err']].map(([l,v,c])=>(
        <div key={l} className="stat-card"><div className="stat-label">{l}</div><div className={`stat-value ${c}`}>{v}</div></div>
      ))}
    </div>}
    {data.counters&&<div className="card"><div className="card-title">Counters</div><div className="data-grid">
      {Object.entries(data.counters).map(([k,v])=><div key={k} className="data-row"><div className="data-key" title={k}>{k}</div><div className="data-val mono">{String(v)}</div></div>)}
    </div></div>}
    {data.upstreams?.length>0&&<div className="tbl-wrap"><table>
      <thead><tr><th>ID</th><th>Kind</th><th>Address</th><th>Healthy</th><th>Fails</th><th>Latency</th></tr></thead>
      <tbody>{data.upstreams.map(u=><tr key={u.upstream_id}>
        <td className="mono">{u.upstream_id}</td>
        <td><span className="badge badge-info">{u.route_kind}</span></td>
        <td className="mono" style={{fontSize:11}}>{u.address}</td>
        <td>{u.healthy?<span className="badge badge-ok">yes</span>:<span className="badge badge-err">no</span>}</td>
        <td className="mono" style={{color:u.fails>0?'var(--err)':'inherit'}}>{u.fails}</td>
        <td className="mono">{fmt_rtt(u.effective_latency_ms)}</td>
      </tr>)}</tbody>
    </table></div>}
  </div>;
}
function RuntimeNatStun(){
  const {data,err,loading,reload,lastTs}=useApi('/runtime/nat_stun');
  if(loading) return <div className="loading-box">Loading</div>;
  if(err) return <ErrBox msg={err}/>;
  if(!data?.data) return <div className="badge badge-dim">{data?.reason||'Unavailable'}</div>;
  const d=data.data;
  return <div>
    <RefreshBar loading={loading} onRefresh={reload} lastTs={lastTs}/>
    <div className="card"><div className="card-title">NAT Probe</div><div className="data-grid">
      {[['nat_probe_enabled',<StatusBadge val={d.flags?.nat_probe_enabled}/>],['nat_probe_disabled_runtime',<StatusBadge val={d.flags?.nat_probe_disabled_runtime}/>],['nat_probe_attempts',<span className="mono">{d.flags?.nat_probe_attempts}</span>]].map(([k,v])=>(
        <div key={k} className="data-row"><div className="data-key" title={k}>{k}</div><div className="data-val">{v}</div></div>
      ))}
    </div></div>
    {d.reflection&&<div className="card"><div className="card-title">Reflection</div><div className="data-grid">
      {d.reflection.v4&&[['v4_addr',d.reflection.v4.addr],['v4_age',d.reflection.v4.age_secs+'s']].map(([k,v])=><div key={k} className="data-row"><div className="data-key" title={k}>{k}</div><div className="data-val mono">{v}</div></div>)}
      {d.reflection.v6&&[['v6_addr',d.reflection.v6.addr],['v6_age',d.reflection.v6.age_secs+'s']].map(([k,v])=><div key={k} className="data-row"><div className="data-key" title={k}>{k}</div><div className="data-val mono">{v}</div></div>)}
    </div></div>}
    {d.servers?.live?.length>0&&<div className="card"><div className="card-title">Live STUN Servers ({d.servers.live_total})</div><div className="tag-list">{d.servers.live.map(s=><span key={s} className="tag">{s}</span>)}</div></div>}
  </div>;
}
function RuntimeSelftest(){
  const {data,err,loading,reload,lastTs}=useApi('/runtime/me-selftest');
  if(loading) return <div className="loading-box">Loading</div>;
  if(err) return <ErrBox msg={err}/>;
  if(!data?.data) return <div className="badge badge-dim">{data?.reason||'Unavailable'}</div>;
  const d=data.data;
  const sc=s=>s==='ok'?'var(--accent)':s==='error'?'var(--err)':'var(--text2)';
  return <div>
    <RefreshBar loading={loading} onRefresh={reload} lastTs={lastTs}/>
    <div className="card-grid">
      {[['KDF',d.kdf?.state],['TIMESKEW',d.timeskew?.state],['BND ADDR',d.bnd?.addr_state],['BND PORT',d.bnd?.port_state],['PID',d.pid?.state]].map(([l,s])=>(
        <div key={l} className="stat-card"><div className="stat-label">{l}</div><div className="stat-value" style={{fontSize:15,color:sc(s)}}>{s?.toUpperCase()||'—'}</div></div>
      ))}
    </div>
    {d.kdf&&<div className="card"><div className="card-title">KDF Health</div><div className="data-grid">
      {[['ewma_errors_per_min',d.kdf.ewma_errors_per_min?.toFixed(3)],['threshold',d.kdf.threshold_errors_per_min?.toFixed(3)],['errors_total',d.kdf.errors_total]].map(([k,v])=>(
        <div key={k} className="data-row"><div className="data-key" title={k}>{k}</div><div className="data-val mono">{String(v)}</div></div>
      ))}
    </div></div>}
    {d.timeskew&&<div className="card"><div className="card-title">Time Skew</div><div className="data-grid">
      {[['max_skew_15m',d.timeskew.max_skew_secs_15m!=null?d.timeskew.max_skew_secs_15m+'s':'—'],['samples_15m',d.timeskew.samples_15m],['last_skew',d.timeskew.last_skew_secs!=null?d.timeskew.last_skew_secs+'s':'—'],['last_source',d.timeskew.last_source||'—']].map(([k,v])=>(
        <div key={k} className="data-row"><div className="data-key" title={k}>{k}</div><div className="data-val mono">{String(v)}</div></div>
      ))}
    </div></div>}
  </div>;
}

// ─── Edge ─────────────────────────────────────────────────────────────────────
function EdgePage(){
  const [tab,setTab]=useState('connections');
  return <div>
    <div className="page-hdr"><div className="page-title"><Icon d={IC.edge} size={20}/>Runtime Edge</div></div>
    <div className="tabs">
      <div className={`tab ${tab==='connections'?'active':''}`} onClick={()=>setTab('connections')}>Connections</div>
      <div className={`tab ${tab==='events'?'active':''}`} onClick={()=>setTab('events')}>Events</div>
      <div className={`tab ${tab==='fingerprints'?'active':''}`} onClick={()=>setTab('fingerprints')}>Fingerprints</div>
      <div className={`tab ${tab==='web'?'active':''}`} onClick={()=>setTab('web')}>WEB Runtime</div>
    </div>
    {tab==='connections'&&<EdgeConnections/>}
    {tab==='events'&&<EdgeEvents/>}
    {tab==='fingerprints'&&<EdgeTlsFingerprints/>}
    {tab==='web'&&<WebRuntimePanel/>}
  </div>;
}
function WebRuntimePanel(){
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
  const lifecycleRoutes={
    pause:'/runtime/web/lifecycle/pause',
    drain:'/runtime/web/lifecycle/drain',
    resume:'/runtime/web/lifecycle/resume',
  };

  const reloadAll=()=>{status.reload();sessions.reload();};
  const lifecycle=async(kind)=>{
    if(!runtimeInstance) return;
    if(kind==='drain'&&!confirm('Drain WEB runtime? New WEB work will stop and remaining sessions will be force-closed after 30 seconds.')) return;
    setBusy(kind); setMsg(null); setActionErr(null);
    try{
      const body={runtime_instance:runtimeInstance};
      if(kind==='drain') body.timeout_secs=30;
      const r=await api(lifecycleRoutes[kind],'POST',body);
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
          <td><span className={`badge ${row.state==='healthy'?'badge-ok':row.state==='closing'?'badge-warn':'badge-dim'}`}>{row.state}</span></td>
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

function EdgeConnections(){
  const {data,err,loading,reload,lastTs}=useApi('/runtime/connections/summary');
  if(loading) return <div className="loading-box">Loading</div>;
  if(err) return <ErrBox msg={err}/>;
  if(!data?.data) return <div className="badge badge-dim">{data?.reason||'Feature disabled — runtime_edge_enabled=false'}</div>;
  const d=data.data;
  return <div>
    <RefreshBar loading={loading} onRefresh={reload} lastTs={lastTs}/>
    <div className="card-grid">
      {[['LIVE CONNECTIONS',d.totals?.current_connections,'accent'],['via ME',d.totals?.current_connections_me,''],['via DIRECT',d.totals?.current_connections_direct,''],['ACTIVE USERS',d.totals?.active_users,'accent']].map(([l,v,c])=>(
        <div key={l} className="stat-card"><div className="stat-label">{l}</div><div className={`stat-value ${c}`}>{v??'—'}</div></div>
      ))}
    </div>
    {d.top?.by_connections?.length>0&&<div className="card"><div className="card-title">Top Users — Connections</div><div className="tbl-wrap"><table>
      <thead><tr><th>Username</th><th>Connections</th><th>Total Traffic</th></tr></thead>
      <tbody>{d.top.by_connections.map(u=><tr key={u.username}><td className="mono" style={{color:'var(--accent)'}}>{u.username}</td><td className="mono">{u.current_connections}</td><td className="mono">{fmt_bytes(u.total_octets)}</td></tr>)}</tbody>
    </table></div></div>}
  </div>;
}
function EdgeEvents(){
  const {data,err,loading,reload,lastTs}=useApi('/runtime/events/recent?limit=100');
  if(loading) return <div className="loading-box">Loading</div>;
  if(err) return <ErrBox msg={err}/>;
  if(!data?.data) return <div className="badge badge-dim">{data?.reason||'Feature disabled'}</div>;
  const d=data.data;
  return <div>
    <RefreshBar loading={loading} onRefresh={reload} lastTs={lastTs}/>
    <div style={{marginBottom:8,fontSize:12,color:'var(--text3)',fontFamily:'var(--mono)'}}>capacity: {d.capacity} | dropped: {d.dropped_total} | shown: {d.events?.length}</div>
    <div className="tbl-wrap"><table>
      <thead><tr><th>Seq</th><th>Time</th><th>Type</th><th>Context</th></tr></thead>
      <tbody>{d.events?.slice().reverse().map(e=><tr key={e.seq}>
        <td className="mono" style={{fontSize:11}}>{e.seq}</td>
        <td className="mono" style={{fontSize:11}}>{fmt_ts(e.ts_epoch_secs)}</td>
        <td><span className="badge badge-info">{e.event_type}</span></td>
        <td className="mono" style={{fontSize:11,color:'var(--text2)'}}>{e.context}</td>
      </tr>)}</tbody>
    </table></div>
  </div>;
}

function EdgeTlsFingerprints(){
  const {data,err,loading,reload,lastTs}=useApi('/runtime/tls-fingerprints?limit=100');
  if(loading) return <div className="loading-box">Loading</div>;
  if(err) return <div className="badge badge-dim">TLS fingerprint telemetry is unavailable on the connected Telemt</div>;
  if(!data?.data) return <div className="badge badge-dim">{data?.reason||'Feature disabled or unavailable'}</div>;
  const d=data.data;
  const Table=({title,rows})=>{
    const list=Array.isArray(rows)?rows:[];
    if(!list.length) return null;
    return <div className="card"><div className="card-title">{title}</div><div className="tbl-wrap"><table>
      <thead><tr><th>Scope</th><th>JA4</th><th>JA3</th><th>Total</th><th>Auth OK</th><th>Bad / Probe</th><th>Last Seen</th></tr></thead>
      <tbody>{list.map((row,i)=><tr key={(row.scope||'global')+'-'+(row.ja4||row.ja3||i)}>
        <td className="mono">{row.scope||'global'}</td>
        <td className="mono" title={row.ja4_raw||''}>{row.ja4||'—'}</td>
        <td className="mono" title={row.ja3_raw||''}>{row.ja3||'—'}</td>
        <td className="mono">{row.total??0}</td>
        <td className="mono">{row.auth_success??0}</td>
        <td className="mono">{row.bad_or_probe??0}</td>
        <td className="mono">{row.last_seen_epoch_secs?fmt_ts(row.last_seen_epoch_secs):'—'}</td>
      </tr>)}</tbody>
    </table></div></div>;
  };
  return <div>
    <RefreshBar loading={loading} onRefresh={reload} lastTs={lastTs}/>
    <div className="card-grid">
      {[['RETENTION',d.retention_secs!=null?d.retention_secs+'s':'—'],['CAPACITY',d.capacity??'—'],['DROPPED',d.dropped_total??0],['PARSE ERRORS',d.parse_error_total??0]].map(([l,v])=><div key={l} className="stat-card"><div className="stat-label">{l}</div><div className="stat-value" style={{fontSize:18}}>{v}</div></div>)}
    </div>
    <Table title="Top TLS fingerprints" rows={d.by_fingerprint}/>
    <Table title="TLS fingerprints by user" rows={d.by_user}/>
    <Table title="TLS fingerprints by IP" rows={d.by_ip}/>
    <Table title="TLS fingerprints by CIDR" rows={d.by_cidr}/>
    {!d.by_fingerprint?.length&&!d.by_user?.length&&!d.by_ip?.length&&!d.by_cidr?.length&&<div className="empty-box">No TLS fingerprint observations yet</div>}
  </div>;
}

// ─── Security ─────────────────────────────────────────────────────────────────
function SecurityPage(){
  const posture  =useApi('/security/posture');
  const whitelist=useApi('/security/whitelist');
  return <div>
    <div className="page-hdr"><div className="page-title"><Icon d={IC.security} size={20}/>Security</div>
      <div className="page-actions"><button className="btn btn-ghost btn-sm" onClick={()=>{posture.reload();whitelist.reload();}}><Icon d={IC.refresh}/></button></div>
    </div>
    <ErrBox msg={posture.err||whitelist.err}/>
    {posture.data&&<div className="card"><div className="card-title">Security Posture</div><div className="data-grid">
      {[['api_read_only',<StatusBadge val={posture.data.api_read_only}/>],['api_whitelist_enabled',<StatusBadge val={posture.data.api_whitelist_enabled}/>],['api_whitelist_entries',posture.data.api_whitelist_entries],['api_auth_header_enabled',<StatusBadge val={posture.data.api_auth_header_enabled}/>],['proxy_protocol_enabled',<StatusBadge val={posture.data.proxy_protocol_enabled}/>],['log_level',<span className="badge badge-info">{posture.data.log_level}</span>],['telemetry_core',<StatusBadge val={posture.data.telemetry_core_enabled}/>],['telemetry_user',<StatusBadge val={posture.data.telemetry_user_enabled}/>],['telemetry_me_level',<span className="badge badge-info">{posture.data.telemetry_me_level}</span>]].map(([k,v])=>(
        <div key={k} className="data-row"><div className="data-key" title={k}>{k}</div><div className="data-val">{v}</div></div>
      ))}
    </div></div>}
    {whitelist.data&&<div className="card"><div className="card-title">IP Whitelist {whitelist.data.enabled?<span className="badge badge-ok" style={{marginLeft:6}}>active</span>:<span className="badge badge-dim" style={{marginLeft:6}}>disabled</span>}</div>
      <div style={{marginBottom:8,fontSize:12,color:'var(--text3)',fontFamily:'var(--mono)'}}>{whitelist.data.entries_total} entries — snapshot {fmt_ts(whitelist.data.generated_at_epoch_secs)}</div>
      {whitelist.data.entries?.length>0?<div className="tag-list">{whitelist.data.entries.map(e=><span key={e} className="tag">{e}</span>)}</div>:<div className="empty-box">No CIDR entries (allow all)</div>}
    </div>}
  </div>;
}

// ─── Limits ───────────────────────────────────────────────────────────────────
function LimitsPage(){
  const {data,err,loading,reload,lastTs}=useApi('/limits/effective');
  const Sec=({title,rows})=>(
    <div className="card"><div className="card-title">{title}</div><div className="data-grid">
      {rows.filter(([,v])=>v!==undefined).map(([k,v])=><div key={k} className="data-row"><div className="data-key" title={k}>{k}</div><div className="data-val mono">{String(v)}</div></div>)}
    </div></div>
  );
  return <div>
    <div className="page-hdr"><div className="page-title"><Icon d={IC.limits} size={20}/>Effective Limits</div>
      <div className="page-actions"><button className="btn btn-ghost btn-sm" onClick={reload} disabled={loading}><Icon d={IC.refresh}/></button></div>
    </div>
    <RefreshBar loading={loading} onRefresh={reload} lastTs={lastTs}/>
    <ErrBox msg={err}/>
    {data&&<>
      <Sec title="General" rows={[['update_every_secs',data.update_every_secs],['me_reinit_every_secs',data.me_reinit_every_secs],['me_pool_force_close_secs',data.me_pool_force_close_secs]]}/>
      {data.timeouts&&<Sec title="Timeouts" rows={Object.entries(data.timeouts)}/>}
      {data.upstream&&<Sec title="Upstream" rows={Object.entries(data.upstream)}/>}
      {data.user_ip_policy&&<Sec title="User IP Policy" rows={Object.entries(data.user_ip_policy)}/>}
      {data.middle_proxy&&<Sec title="Middle Proxy" rows={Object.entries(data.middle_proxy)}/>}
    </>}
  </div>;
}

// ─── App ─────────────────────────────────────────────────────────────────────

// ─── Analytics ────────────────────────────────────────────────────────────────
function ConnectionChart() {
  const canvasRef = useRef(null);
  const chartRef  = useRef(null);
  const bufRef    = useRef({labels:[],total:[],me:[],direct:[],users:[]});
  useEffect(()=>{
    if(!Chart) return;
    const buf=bufRef.current;
    const ctx=canvasRef.current.getContext('2d');
    const base={borderWidth:1.5,pointRadius:0,tension:0.4,fill:false};
    chartRef.current=new Chart(ctx,{
      type:'line',
      data:{
        labels:buf.labels,
        datasets:[
          {...base,label:'Total',  data:buf.total,  borderColor:'#00e5b4',backgroundColor:'rgba(0,229,180,.07)',fill:true},
          {...base,label:'via ME', data:buf.me,     borderColor:'#4dd6ea'},
          {...base,label:'Direct', data:buf.direct, borderColor:'#f5a832'},
          {...base,label:'Users',  data:buf.users,  borderColor:'#a78bfa',borderDash:[4,2]},
        ],
      },
      options:{
        responsive:true,maintainAspectRatio:false,animation:{duration:200},
        interaction:{mode:'index',intersect:false},
        scales:{
          x:{grid:{color:'#1e2d3e'},ticks:{color:'#3d5570',font:{family:'IBM Plex Mono',size:10},maxTicksLimit:8}},
          y:{min:0,grid:{color:'#1e2d3e'},ticks:{color:'#3d5570',font:{family:'IBM Plex Mono',size:10}}},
        },
        plugins:{
          legend:{labels:{color:'#7a96b0',font:{family:'IBM Plex Mono',size:11},boxWidth:12,padding:16}},
          tooltip:{backgroundColor:'#111720',borderColor:'#253545',borderWidth:1,
            titleFont:{family:'IBM Plex Mono',size:11},bodyFont:{family:'IBM Plex Mono',size:11},
            titleColor:'#b8cfe4',bodyColor:'#7a96b0'},
        },
      },
    });
    const MAX=72;
    const poll=async()=>{
      try{
        const r=await api('/runtime/connections/summary');
        if(!r.data?.data) return;
        const d=r.data.data;
        const t=new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit',second:'2-digit'});
        buf.labels.push(t);
        buf.total.push(d.totals?.current_connections||0);
        buf.me.push(d.totals?.current_connections_me||0);
        buf.direct.push(d.totals?.current_connections_direct||0);
        buf.users.push(d.totals?.active_users||0);
        if(buf.labels.length>MAX) ['labels','total','me','direct','users'].forEach(k=>buf[k].shift());
        chartRef.current?.update('none');
      }catch{}
    };
    poll();
    const id=setInterval(poll,5000);
    return()=>{clearInterval(id);chartRef.current?.destroy();};
  },[]);
  return (
    <div className="card" style={{marginBottom:16}}>
      <div className="card-title" style={{marginBottom:12}}>Live Connections <span style={{color:'var(--text3)',fontWeight:400}}>— 5s polling</span></div>
      <div style={{height:210,position:'relative'}}><canvas ref={canvasRef}/></div>
    </div>
  );
}

function TopUsersChart({users}) {
  const canvasRef=useRef(null);
  const chartRef=useRef(null);
  useEffect(()=>{
    if(!Chart||!users?.length) return;
    const top=[...users].sort((a,b)=>b.current_connections-a.current_connections).slice(0,10);
    chartRef.current?.destroy();
    const ctx=canvasRef.current.getContext('2d');
    chartRef.current=new Chart(ctx,{
      type:'bar',
      data:{
        labels:top.map(u=>u.username),
        datasets:[{
          label:'Active Connections',
          data:top.map(u=>u.current_connections),
          backgroundColor:top.map((_,i)=>`rgba(0,229,180,${0.9-i*0.07})`),
          borderColor:'#00e5b4',borderWidth:1,borderRadius:2,
        }],
      },
      options:{
        responsive:true,maintainAspectRatio:false,
        scales:{
          x:{grid:{display:false},ticks:{color:'#7a96b0',font:{family:'IBM Plex Mono',size:11}}},
          y:{min:0,grid:{color:'#1e2d3e'},ticks:{color:'#3d5570',font:{family:'IBM Plex Mono',size:10}}},
        },
        plugins:{
          legend:{display:false},
          tooltip:{backgroundColor:'#111720',borderColor:'#253545',borderWidth:1,
            bodyFont:{family:'IBM Plex Mono',size:11},bodyColor:'#b8cfe4'},
        },
      },
    });
    return()=>chartRef.current?.destroy();
  },[users]);
  if(!users?.length) return null;
  return (
    <div className="card" style={{marginBottom:16}}>
      <div className="card-title" style={{marginBottom:12}}>Top Users — Active Connections</div>
      <div style={{height:180,position:'relative'}}><canvas ref={canvasRef}/></div>
    </div>
  );
}


function GlobeControls({S}) {
  const [zoom,    setZoom]    = React.useState(1.0);
  const [spinning,setSpinning]= React.useState(true);

  React.useEffect(()=>{
    const id = setInterval(()=>{
      setZoom(Math.round(S.current.zoom*10)/10);
      setSpinning(S.current.spinning);
    }, 100);
    return ()=>clearInterval(id);
  },[S]);

  const resetZoom  = ()=>{ S.current.zoom=1.0; };
  const resetView  = ()=>{ S.current.zoom=1.0; S.current.rotLon=0; S.current.rotLat=-22; };
  const toggleSpin = ()=>{ S.current.spinning=!S.current.spinning; };

  const btnStyle = (active)=>({
    background: active?'var(--accent2)':'none',
    border:`1px solid ${active?'rgba(0,229,180,.4)':'var(--border)'}`,
    color: active?'var(--accent)':'var(--text3)',
    fontFamily:'var(--mono)',fontSize:10,padding:'2px 8px',cursor:'pointer',
    transition:'all .15s',
  });

  return (
    <div style={{display:'flex',alignItems:'center',gap:8,fontFamily:'var(--mono)',fontSize:11}}>
      {/* Spin toggle */}
      <button onClick={toggleSpin} style={btnStyle(spinning)}
        title={spinning?'Stop rotation':'Start rotation'}>
        {spinning ? '⏸ stop' : '▶ spin'}
      </button>
      {/* Zoom display + reset */}
      <div style={{display:'flex',alignItems:'center',gap:4}}>
        <span style={{color:'var(--text3)'}}>zoom</span>
        <span style={{color:zoom===1?'var(--text3)':'var(--accent)',minWidth:28,textAlign:'right'}}>{zoom.toFixed(1)}×</span>
        <button onClick={resetZoom} style={btnStyle(false)}
          title="Reset zoom (also double-click globe)">reset</button>
      </div>
      {/* Full view reset */}
      <button onClick={resetView} style={btnStyle(false)} title="Reset view to default">↺ view</button>
    </div>
  );
}

function GlobeMap({users}) {
  const canvasRef = useRef(null);
  const wrapRef   = useRef(null);
  const S = useRef({world:null,points:[],rotLon:0,rotLat:-22,animId:null,drag:false,dragX:0,dragY:0,dragLon:0,dragLat:0,zoom:1.0,minZoom:0.5,maxZoom:6.0,spinning:true});
  const [status,setStatus] = useState('loading');
  const [count,setCount]   = useState({resolved:0,sent:0});
  const [tooltip,setTooltip] = useState(null); // {x,y,ip,city,country}

  // returns current D3 projection based on canvas size
  const getProj = useCallback((canvas)=>{
    if(!d3||!canvas) return null;
    const W=canvas.width, H=canvas.height;
    const r=Math.min(W,H)/2-28;
    return d3.geoOrthographic().scale(r*S.current.zoom).translate([W/2,H/2]).rotate([S.current.rotLon,S.current.rotLat,0]);
  },[]);

  // visibility: dot product of point normal vs viewer direction
  const isVisible = (lat,lon)=>{
    const φ=lat*Math.PI/180, λ=lon*Math.PI/180;
    const φc=-S.current.rotLat*Math.PI/180, λc=-S.current.rotLon*Math.PI/180;
    return Math.sin(φ)*Math.sin(φc)+Math.cos(φ)*Math.cos(φc)*Math.cos(λ-λc)>0.01;
  };

  const draw = useCallback(()=>{
    const canvas=canvasRef.current;
    if(!canvas||!d3) return;
    const d3=d3;
    const ctx=canvas.getContext('2d');
    const W=canvas.parentElement?.clientWidth||700;
    const H=390;
    if(canvas.width!==W){canvas.width=W;canvas.height=H;}
    const r=Math.min(W,H)/2-28;
    const cx=W/2,cy=H/2;
    const proj=d3.geoOrthographic().scale(r*S.current.zoom).translate([cx,cy]).rotate([S.current.rotLon,S.current.rotLat,0]);
    const gp=d3.geoPath(proj,ctx);
    ctx.clearRect(0,0,W,H);
    // ambient glow
    const ag=ctx.createRadialGradient(cx,cy,r*0.85,cx,cy,r*1.2);
    ag.addColorStop(0,'rgba(0,80,140,0.18)');ag.addColorStop(1,'rgba(0,0,0,0)');
    ctx.beginPath();ctx.arc(cx,cy,r*1.2,0,2*Math.PI);ctx.fillStyle=ag;ctx.fill();
    // ocean
    ctx.beginPath();gp({type:'Sphere'});
    const og=ctx.createRadialGradient(cx-r*.25,cy-r*.25,0,cx,cy,r);
    og.addColorStop(0,'#0d1f32');og.addColorStop(1,'#060d15');
    ctx.fillStyle=og;ctx.fill();
    ctx.strokeStyle='#192d44';ctx.lineWidth=1.2;ctx.stroke();
    // graticule
    ctx.beginPath();gp(d3.geoGraticule()());
    ctx.strokeStyle='rgba(18,38,60,0.8)';ctx.lineWidth=0.4;ctx.stroke();
    // countries
    if(S.current.world){
      ctx.beginPath();gp(S.current.world);
      ctx.fillStyle='#0d2038';ctx.fill();
      ctx.strokeStyle='#1d3d63';ctx.lineWidth=0.5;ctx.stroke();
    }
    // points
    const now=Date.now();
    // First pass: draw connector lines for clusters
    for(const p of S.current.points){
      if(p.clusterSize<=1||p.origLat==null) continue;
      if(!isVisible(p.lat,p.lon)) continue;
      const xy=proj([p.lon,p.lat]);
      const oxy=proj([p.origLon,p.origLat]);
      if(!xy||!oxy) continue;
      ctx.beginPath();
      ctx.moveTo(xy[0],xy[1]);
      ctx.lineTo(oxy[0],oxy[1]);
      ctx.strokeStyle='rgba(0,229,180,0.15)';
      ctx.lineWidth=0.8;
      ctx.stroke();
    }
    // Second pass: draw dots
    for(const p of S.current.points){
      if(!isVisible(p.lat,p.lon)) continue;
      const xy=proj([p.lon,p.lat]);
      if(!xy) continue;
      const[px,py]=xy;
      const hovered=p===S.current.hovered;
      const dotColor = p.active ? '#00e5b4' : '#4dd6ea';
      // Pulse glow
      const pulse=(Math.sin(now/900+p.phase)+1)/2;
      const pr=(hovered?10:6)+pulse*(hovered?10:7);
      const pg=ctx.createRadialGradient(px,py,0,px,py,pr);
      const alpha=hovered?0.55:(p.active?0.35:0.2);
      pg.addColorStop(0,`rgba(${p.active?'0,229,180':'77,214,234'},${alpha*(1-pulse*0.5)})`);
      pg.addColorStop(1,'rgba(0,229,180,0)');
      ctx.beginPath();ctx.arc(px,py,pr,0,2*Math.PI);ctx.fillStyle=pg;ctx.fill();
      // Core dot
      const dotR = hovered ? 5 : 3.5;
      ctx.globalAlpha = p.active ? 1 : 0.6;
      ctx.beginPath();ctx.arc(px,py,dotR,0,2*Math.PI);
      ctx.fillStyle=hovered?'#fff':dotColor;ctx.fill();
      ctx.strokeStyle=hovered?dotColor:'rgba(180,255,240,0.5)';
      ctx.lineWidth=hovered?1.5:1;ctx.stroke();
      ctx.globalAlpha=1;
    }
  },[]);

  useEffect(()=>{
    const loop=()=>{if(!S.current.drag&&S.current.spinning)S.current.rotLon+=0.1;draw();S.current.animId=requestAnimationFrame(loop);};
    S.current.animId=requestAnimationFrame(loop);
    return()=>cancelAnimationFrame(S.current.animId);
  },[draw]);

  // drag + hover
  useEffect(()=>{
    const canvas=canvasRef.current;
    const wrap=wrapRef.current;

    const onDown=e=>{
      S.current.drag=true;
      S.current.dragX=e.clientX;
      S.current.dragY=e.clientY;
      S.current.dragLon=S.current.rotLon;
      S.current.dragLat=S.current.rotLat;
      canvas.style.cursor='grabbing';
    };
    const onMove=e=>{
      if(S.current.drag){
        const dx=e.clientX-S.current.dragX;
        const dy=e.clientY-S.current.dragY;
        S.current.rotLon=S.current.dragLon+dx*0.35;
        // Clamp latitude so poles don't flip
        S.current.rotLat=Math.max(-85,Math.min(85,S.current.dragLat-dy*0.25));
        S.current.hovered=null;
        setTooltip(null);
        return;
      }
      // hit-test against visible points
      const rect=canvas.getBoundingClientRect();
      const mx=e.clientX-rect.left, my=e.clientY-rect.top;
      // scale for devicePixelRatio / CSS sizing
      const scaleX=canvas.width/rect.width, scaleY=canvas.height/rect.height;
      const cx=mx*scaleX, cy=my*scaleY;
      const proj=getProj(canvas);
      if(!proj){return;}
      let hit=null, bestD=Infinity;
      for(const p of S.current.points){
        if(!isVisible(p.lat,p.lon)) continue;
        const xy=proj([p.lon,p.lat]);
        if(!xy) continue;
        const d=Math.hypot(xy[0]-cx,xy[1]-cy);
        if(d<20&&d<bestD){bestD=d;hit=p;}
      }
      S.current.hovered=hit||null;
      if(hit){
        canvas.style.cursor='pointer';
        setTooltip({x:e.clientX,y:e.clientY,ip:hit.ip,city:hit.city,country:hit.country});
      } else {
        canvas.style.cursor='grab';
        setTooltip(null);
      }
    };
    const onUp=()=>{S.current.drag=false;canvas.style.cursor='grab';};
    const onLeave=()=>{S.current.hovered=null;setTooltip(null);};

    // ── Scroll wheel zoom ──────────────────────────────────────────────────
    const onWheel=e=>{
      e.preventDefault();
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      S.current.zoom = Math.min(S.current.maxZoom, Math.max(S.current.minZoom, S.current.zoom * delta));
    };

    // ── Pinch-to-zoom (touch) ──────────────────────────────────────────────
    let lastPinchDist = null;
    const onTouchStart=e=>{
      if(e.touches.length===2){
        lastPinchDist=Math.hypot(
          e.touches[0].clientX-e.touches[1].clientX,
          e.touches[0].clientY-e.touches[1].clientY
        );
      } else if(e.touches.length===1){
        S.current.drag=true;
        S.current.dragX=e.touches[0].clientX;
        S.current.dragY=e.touches[0].clientY;
        S.current.dragLon=S.current.rotLon;
        S.current.dragLat=S.current.rotLat;
      }
    };
    const onTouchMove=e=>{
      e.preventDefault();
      if(e.touches.length===2){
        const dist=Math.hypot(
          e.touches[0].clientX-e.touches[1].clientX,
          e.touches[0].clientY-e.touches[1].clientY
        );
        if(lastPinchDist){
          const delta=dist/lastPinchDist;
          S.current.zoom=Math.min(S.current.maxZoom,Math.max(S.current.minZoom,S.current.zoom*delta));
        }
        lastPinchDist=dist;
      } else if(e.touches.length===1&&S.current.drag){
        const dx=e.touches[0].clientX-S.current.dragX;
        const dy=e.touches[0].clientY-S.current.dragY;
        S.current.rotLon=S.current.dragLon+dx*0.35;
        S.current.rotLat=Math.max(-85,Math.min(85,S.current.dragLat-dy*0.25));
        S.current.hovered=null;setTooltip(null);
      }
    };
    const onTouchEnd=e=>{ S.current.drag=false; lastPinchDist=null; };

    // ── Double-click to reset zoom ─────────────────────────────────────────
    const onDblClick=()=>{ S.current.zoom=1.0; S.current.rotLon=0; S.current.rotLat=-22; };

    canvas.addEventListener('mousedown',onDown);
    canvas.addEventListener('mouseleave',onLeave);
    canvas.addEventListener('wheel',onWheel,{passive:false});
    canvas.addEventListener('dblclick',onDblClick);
    canvas.addEventListener('touchstart',onTouchStart,{passive:false});
    canvas.addEventListener('touchmove',onTouchMove,{passive:false});
    canvas.addEventListener('touchend',onTouchEnd);
    window.addEventListener('mousemove',onMove);
    window.addEventListener('mouseup',onUp);
    return()=>{
      canvas.removeEventListener('mousedown',onDown);
      canvas.removeEventListener('mouseleave',onLeave);
      canvas.removeEventListener('wheel',onWheel);
      canvas.removeEventListener('dblclick',onDblClick);
      canvas.removeEventListener('touchstart',onTouchStart);
      canvas.removeEventListener('touchmove',onTouchMove);
      canvas.removeEventListener('touchend',onTouchEnd);
      window.removeEventListener('mousemove',onMove);
      window.removeEventListener('mouseup',onUp);
    };
  },[getProj]);

  // Stable IP key — only re-run geo when the actual IP set changes
  const ipKey = React.useMemo(()=>{
    const ips = (users||[]).flatMap(u=>[
      ...(u.active_unique_ips_list||[]),
      ...(u.recent_unique_ips_list||[]),
    ]);
    return [...new Set(ips)].sort().join(',');
  },[users]);

  useEffect(()=>{
    if(!d3||!topojson) return;
    let cancelled=false;
    (async()=>{
      try{
        // Load world topology (cached by browser after first load)
        if(!S.current.world){
          const world=worldAtlas;
          if(cancelled) return;
          S.current.world=topojson.feature(world,world.objects.countries);
        }

        // Collect all unique public IPs: active first, then recent
        const allIps=[...new Set(
          (users||[]).flatMap(u=>[
            ...(u.active_unique_ips_list||[]),
            ...(u.recent_unique_ips_list||[]),
          ]).filter(Boolean)
        )];

        if(allIps.length>0){
          const geo=await panelFetch('/panel/geo','POST',{ips:allIps});
          if(cancelled) return;
          // Mark active vs recent for different visual treatment
          const activeSet=new Set((users||[]).flatMap(u=>u.active_unique_ips_list||[]));
          const rawPoints=(geo.data||[]).map(p=>({
            ...p,
            phase:Math.random()*Math.PI*2,
            active: activeSet.has(p.ip),
          }));

          // Group points that share the same location (within 0.05°)
          // and spread them in a small circle so they don't overlap
          const SPREAD_DEG = 0.6; // degrees offset radius for cluster members
          const groups = [];
          const assigned = new Set();
          for (let i=0; i<rawPoints.length; i++) {
            if (assigned.has(i)) continue;
            const group = [i];
            assigned.add(i);
            for (let j=i+1; j<rawPoints.length; j++) {
              if (assigned.has(j)) continue;
              const dLat = Math.abs(rawPoints[i].lat - rawPoints[j].lat);
              const dLon = Math.abs(rawPoints[i].lon - rawPoints[j].lon);
              if (dLat < 0.5 && dLon < 0.5) { group.push(j); assigned.add(j); }
            }
            groups.push(group);
          }

          S.current.points = [];
          for (const group of groups) {
            if (group.length === 1) {
              S.current.points.push({ ...rawPoints[group[0]], offset: null, clusterSize: 1 });
            } else {
              // Arrange in a circle around the center point
              const center = rawPoints[group[0]];
              group.forEach((idx, i) => {
                const angle = (2 * Math.PI * i) / group.length - Math.PI/2;
                const oLat  = center.lat + SPREAD_DEG * Math.sin(angle);
                const oLon  = center.lon + SPREAD_DEG * Math.cos(angle);
                S.current.points.push({
                  ...rawPoints[idx],
                  lat: oLat, lon: oLon,
                  origLat: center.lat, origLon: center.lon,
                  clusterSize: group.length,
                  clusterIdx: i,
                });
              });
            }
          }
          setCount({resolved: S.current.points.length, sent: geo.meta?.sent||allIps.length});
        } else {
          S.current.points=[];
          setCount({resolved:0,sent:0});
        }
        if(!cancelled) setStatus('ready');
      }catch(e){ if(!cancelled){console.error('[Globe]',e);setStatus('error');} }
    })();
    return()=>{cancelled=true;};
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[ipKey]);

  return(
    <div className="card" style={{padding:0,overflow:'hidden',marginBottom:16}}>
      <div style={{padding:'10px 20px',display:'flex',alignItems:'center',justifyContent:'space-between',borderBottom:'1px solid var(--border)'}}>
        <div className="card-title" style={{margin:0}}>User Locations</div>
        <div style={{display:'flex',alignItems:'center',gap:12}}>
          <GlobeControls S={S}/>
          <div style={{fontFamily:'var(--mono)',fontSize:11,color:'var(--text3)'}}>
          {status==='loading'&&'⟳ geolocating…'}
          {status==='ready'&&(
            <span style={{fontFamily:'var(--mono)',fontSize:11}}>
              <span style={{color:'var(--accent)'}}>●</span>
              <span style={{color:'var(--text3)'}}> active </span>
              <span style={{color:'var(--info)',opacity:.6}}>●</span>
              <span style={{color:'var(--text3)'}}>
                {' '}recent · {count.resolved}/{count.sent} IPs plotted
                {count.sent>count.resolved&&
                  <span style={{color:'var(--warn)'}}> ({count.sent-count.resolved} not geolocated)</span>}
                {' '}· drag to rotate
              </span>
            </span>
          )}
          {status==='error'&&'⚠ geo lookup failed'}
          </div>
        </div>
      </div>
      <div ref={wrapRef} style={{position:'relative'}}>
        <canvas ref={canvasRef} style={{width:'100%',height:390,display:'block',cursor:'grab',background:'var(--bg)'}}
        title="Scroll to zoom · Drag to rotate freely · Double-click to reset view"/>
        {tooltip&&(
          <div style={{
            position:'fixed',left:tooltip.x+14,top:tooltip.y-10,
            background:'#111720',border:'1px solid #253545',
            padding:'7px 12px',pointerEvents:'none',zIndex:200,
            fontFamily:'var(--mono)',fontSize:11,lineHeight:1.7,
            boxShadow:'0 4px 20px rgba(0,0,0,.5)',
          }}>
            <div style={{color:'#00e5b4',fontWeight:600,marginBottom:2}}>{tooltip.ip}</div>
            {tooltip.city&&<div style={{color:'#b8cfe4'}}>{tooltip.city}</div>}
            {tooltip.country&&<div style={{color:'#7a96b0'}}>{tooltip.country}</div>}
          </div>
        )}
      </div>
    </div>
  );
}

function AnalyticsPage(){
  const {data:users,err,loading,reload}=useApi('/users');
  return(
    <div>
      <div className="page-hdr">
        <div className="page-title">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
          Analytics
        </div>
        <div className="page-actions">
          <button className="btn btn-ghost btn-sm" onClick={reload} disabled={loading}><Icon d={IC.refresh}/></button>
        </div>
      </div>
      <ErrBox msg={err}/>
      <ConnectionChart/>
      {users&&<TopUsersChart users={users}/>}
      {users&&<GlobeMap users={users}/>}
    </div>
  );
}



// ─── Helpers for new pages ────────────────────────────────────────────────────
function timeSince(ms) {
  if (!ms) return '—';
  const s = Math.floor((Date.now() - ms) / 1000);
  if (s < 60)   return s + 's ago';
  if (s < 3600) return Math.floor(s/60) + 'm ago';
  return Math.floor(s/3600) + 'h ago';
}
function fmtTime(ms) {
  if (!ms) return '—';
  return new Date(ms).toLocaleString();
}
function uaShort(ua) {
  if (!ua || ua==='—') return '—';
  if (/Firefox\/(\d+)/.test(ua))  return 'Firefox ' + ua.match(/Firefox\/(\d+)/)[1];
  if (/Chrome\/(\d+)/.test(ua))   return 'Chrome '  + ua.match(/Chrome\/(\d+)/)[1];
  if (/Safari\//.test(ua))        return 'Safari';
  if (/curl/.test(ua))            return 'curl';
  return ua.slice(0, 28) + '…';
}

// ─── Telemt Configuration ────────────────────────────────────────────────────
function TelemtConfigPage(){
  const [config,setConfig]=useState(null);
  const [revision,setRevision]=useState(null);
  const [patchText,setPatchText]=useState('{\n  \n}');
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
function PanelSecurityPage() {
  const [tab, setTab] = useState('sessions');
  return (
    <div>
      <div className="page-hdr">
        <div className="page-title">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
          Panel Security
        </div>
      </div>
      <div className="tabs">
        <div className={`tab ${tab==='sessions'?'active':''}`} onClick={()=>setTab('sessions')}>Active Sessions</div>
        <div className={`tab ${tab==='audit'?'active':''}`}    onClick={()=>setTab('audit')}>Audit Log</div>
        <div className={`tab ${tab==='config'?'active':''}`}   onClick={()=>setTab('config')}>Config</div>
      </div>
      {tab==='sessions' && <SessionsPanel/>}
      {tab==='audit'    && <AuditPanel/>}
      {tab==='config'   && <PanelConfigPanel/>}
    </div>
  );
}

function SessionsPanel() {
  const [sessions,setSessions] = useState([]);
  const [loading,setL]         = useState(false);
  const [err,setErr]           = useState(null);
  const [msg,setMsg]           = useState(null);

  const load = useCallback(async () => {
    setL(true); setErr(null);
    try { const r = await panelFetch('/panel/sessions'); setSessions(r.data||[]); }
    catch(e) { setErr(e.message); }
    finally { setL(false); }
  },[]);
  useEffect(()=>{ load(); },[load]);

  const revoke = async (id) => {
    try {
      await panelFetch('/panel/sessions/'+id, 'DELETE');
      setMsg({ok:true, text:'Session revoked'});
      load();
    } catch(e) { setMsg({ok:false, text:e.message}); }
    setTimeout(()=>setMsg(null), 3000);
  };

  const revokeAll = async () => {
    if (!confirm('Revoke all other sessions?')) return;
    try {
      const r = await panelFetch('/panel/sessions', 'DELETE');
      setMsg({ok:true, text:`Revoked ${r.revoked} session(s)`});
      load();
    } catch(e) { setMsg({ok:false, text:e.message}); }
    setTimeout(()=>setMsg(null), 3000);
  };

  const others = sessions.filter(s=>!s.current);

  return (
    <div>
      <div className="refresh-row">
        <button className="btn btn-ghost btn-sm" onClick={load} disabled={loading}><Icon d={IC.refresh}/>{loading?'Loading…':'Refresh'}</button>
        {others.length>0 && <button className="btn btn-danger btn-sm" onClick={revokeAll}>Revoke all others ({others.length})</button>}
      </div>
      <ErrBox msg={err}/>
      {msg && <div style={{marginBottom:12,fontFamily:'var(--mono)',fontSize:12,padding:'8px 12px',
        background:msg.ok?'var(--accent3)':'var(--err2)',
        border:`1px solid ${msg.ok?'rgba(0,229,180,.2)':'rgba(255,74,94,.25)'}`,
        color:msg.ok?'var(--accent)':'var(--err)'}}>{msg.ok?'✓ ':'✗ '}{msg.text}</div>}
      {sessions.length===0&&!loading&&<div className="empty-box">No active sessions</div>}
      {sessions.length>0&&(
        <div className="tbl-wrap">
          <table>
            <thead><tr>
              <th>Status</th><th>IP</th><th>Browser</th>
              <th>Logged in</th><th>Last active</th><th>Action</th>
            </tr></thead>
            <tbody>
              {sessions.map(s=>(
                <tr key={s.id}>
                  <td>{s.current
                    ? <span className="badge badge-ok">● current</span>
                    : <span className="badge badge-dim">other</span>}
                  </td>
                  <td className="mono" style={{fontSize:11}}>{s.ip}</td>
                  <td className="mono" style={{fontSize:11}}>{uaShort(s.userAgent)}</td>
                  <td className="mono" style={{fontSize:11}}>{fmtTime(s.loginAt)}</td>
                  <td className="mono" style={{fontSize:11}}>{timeSince(s.lastActivity)}</td>
                  <td>{!s.current&&<button className="btn btn-danger btn-sm" onClick={()=>revoke(s.id)}>Revoke</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const AUDIT_COLORS = {
  login:               'var(--accent)',
  login_fail:          'var(--err)',
  logout:              'var(--text3)',
  session_revoke:      'var(--warn)',
  session_revoke_all:  'var(--warn)',
  session_idle_expire: 'var(--warn)',
  session_ip_mismatch: 'var(--err)',
  telemt_api_post:     'var(--info)',
  telemt_api_patch:    'var(--info)',
  telemt_api_delete:   'var(--err)',
};

function AuditPanel() {
  const [entries,setEntries] = useState([]);
  const [loading,setL]       = useState(false);
  const [err,setErr]         = useState(null);
  const [filter,setFilter]   = useState('');
  const [total,setTotal]     = useState(0);

  const load = useCallback(async () => {
    setL(true); setErr(null);
    try {
      const qs = filter ? `?action=${encodeURIComponent(filter)}&limit=500` : '?limit=500';
      const r = await panelFetch('/panel/audit'+qs);
      setEntries(r.data||[]);
      setTotal(r.total||0);
    } catch(e) { setErr(e.message); }
    finally { setL(false); }
  },[filter]);
  useEffect(()=>{ load(); },[load]);

  const FILTERS = [
    {l:'All',v:''},
    {l:'Logins',v:'login'},
    {l:'Failures',v:'fail'},
    {l:'Sessions',v:'session'},
    {l:'API calls',v:'telemt_api'},
  ];

  return (
    <div>
      <div className="refresh-row" style={{flexWrap:'wrap',gap:8}}>
        <button className="btn btn-ghost btn-sm" onClick={load} disabled={loading}><Icon d={IC.refresh}/>{loading?'Loading…':'Refresh'}</button>
        <div style={{display:'flex',gap:4}}>
          {FILTERS.map(f=>(
            <button key={f.v} className={`btn btn-sm ${filter===f.v?'btn-primary':'btn-ghost'}`}
              onClick={()=>setFilter(f.v)}>{f.l}</button>
          ))}
        </div>
        <span className="last-upd">{entries.length} of {total} entries</span>
      </div>
      <ErrBox msg={err}/>
      {entries.length===0&&!loading&&<div className="empty-box">No audit entries</div>}
      {entries.length>0&&(
        <div className="tbl-wrap">
          <table>
            <thead><tr><th>Time</th><th>Action</th><th>User</th><th>IP</th><th>Details</th></tr></thead>
            <tbody>
              {entries.map((e,i)=>{
                const color = AUDIT_COLORS[e.action] || 'var(--text2)';
                const { ts, action, username, ip, ...extra } = e;
                delete extra.success;
                const details = Object.entries(extra).map(([k,v])=>`${k}: ${v}`).join(' · ');
                return (
                  <tr key={i}>
                    <td className="mono" style={{fontSize:10,whiteSpace:'nowrap'}}>{new Date(ts).toLocaleString()}</td>
                    <td><span className="badge" style={{background:'rgba(0,0,0,.2)',border:`1px solid ${color}40`,color}}>{action}</span></td>
                    <td className="mono" style={{fontSize:11}}>{username}</td>
                    <td className="mono" style={{fontSize:11}}>{ip}</td>
                    <td className="mono" style={{fontSize:10,color:'var(--text3)'}}>{details}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function PanelConfigPanel() {
  const [cfg,setCfg] = useState(null);
  const [err,setErr] = useState(null);
  useEffect(()=>{
    panelFetch('/panel/config').then(r=>setCfg(r.data)).catch(e=>setErr(e.message));
  },[]);
  return (
    <div>
      <ErrBox msg={err}/>
      {cfg&&(
        <div className="card">
          <div className="card-title">Panel Security Configuration</div>
          <div className="data-grid">
            {[
              ['session_max_age',      cfg.sessionMaxAgeHours + 'h'],
              ['session_idle_timeout', cfg.sessionIdleMinutes ? cfg.sessionIdleMinutes+'m' : 'disabled'],
              ['ip_session_binding',   cfg.bindSessionIp ? '✓ enabled' : '✗ disabled'],
              ['cookie_secure',        cfg.cookieSecure  ? '✓ enabled' : '✗ disabled (HTTP mode)'],
              ['trust_proxy',          cfg.trustProxy    ? '✓ enabled' : '✗ disabled'],
              ['rate_limit_window',    cfg.rateLimitWindow],
              ['rate_limit_max_tries', cfg.rateLimitMaxTries + ' attempts'],
              ['audit_log_capacity',   cfg.auditLogMax + ' entries'],
              ['audit_log_current',    cfg.auditLogCurrent + ' entries'],
            ].map(([k,v])=>(
              <div key={k} className="data-row">
                <div className="data-key" title={k}>{k}</div>
                <div className="data-val mono" style={{
                  color: v?.startsWith?.('✓')?'var(--accent)':v?.startsWith?.('✗')?'var(--warn)':'inherit'
                }}>{v}</div>
              </div>
            ))}
          </div>
          <div style={{marginTop:12,fontFamily:'var(--mono)',fontSize:11,color:'var(--text3)',lineHeight:1.8,borderTop:'1px solid var(--border)',paddingTop:10}}>
            <div>To change: edit <span style={{color:'var(--accent)'}}>.env</span> and rebuild container</div>
            <div>BIND_SESSION_IP=true · SESSION_IDLE_MINUTES=30 · COOKIE_SECURE=true</div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Analysis Page ────────────────────────────────────────────────────────────
function AnalysisPage() {
  const summary  = useApi('/stats/summary');
  const writers  = useApi('/stats/me-writers');
  const upstreams= useApi('/stats/upstreams');
  const dcs      = useApi('/stats/dcs');
  const meq      = useApi('/runtime/me_quality');
  const selftest = useApi('/runtime/me-selftest');
  const {data:users} = useApi('/users');

  const reload = () => [summary,writers,upstreams,dcs,meq,selftest].forEach(x=>x.reload());

  // ── Health Score ───────────────────────────────────────────────────────────
  const score = React.useMemo(()=>{
    let total=0, weight=0;
    const add = (val, w) => { if (val!=null) { total+=val*w; weight+=w; } };
    // ME writer coverage
    if (writers.data?.middle_proxy_enabled && writers.data?.summary)
      add(Math.min(writers.data.summary.coverage_pct, 100), 30);
    // Upstream health
    if (upstreams.data?.summary) {
      const {healthy_total,configured_total}=upstreams.data.summary;
      add(configured_total>0?(healthy_total/configured_total)*100:100, 20);
    }
    // Bad connection rate (inverse)
    if (summary.data) {
      const {connections_total,connections_bad_total}=summary.data;
      const badRate = connections_total>0?(connections_bad_total/connections_total)*100:0;
      add(Math.max(0, 100-badRate*10), 20);
    }
    // Handshake timeout rate (inverse)
    if (summary.data) {
      const {connections_total,handshake_timeouts_total}=summary.data;
      const toRate = connections_total>0?(handshake_timeouts_total/connections_total)*100:0;
      add(Math.max(0, 100-toRate*20), 15);
    }
    // DC average coverage
    if (dcs.data?.dcs?.length) {
      const avg=dcs.data.dcs.reduce((a,d)=>a+Math.min(d.coverage_pct,100),0)/dcs.data.dcs.length;
      add(avg, 15);
    }
    return weight>0 ? Math.round(total/weight) : null;
  },[writers.data,upstreams.data,summary.data,dcs.data]);

  const scoreColor = s => s>=80?'var(--accent)':s>=50?'var(--warn)':'var(--err)';
  const scoreLabel = s => s>=80?'Good':s>=50?'Degraded':'Critical';

  // ── Anomalies ──────────────────────────────────────────────────────────────
  const anomalies = React.useMemo(()=>{
    const list=[];
    const warn=(msg,detail='')=>list.push({level:'warn',msg,detail});
    const err =(msg,detail='')=>list.push({level:'err', msg,detail});
    const info=(msg,detail='')=>list.push({level:'info',msg,detail});

    if (summary.data) {
      const {connections_total:ct,connections_bad_total:cb,handshake_timeouts_total:ht}=summary.data;
      if (ct>0 && cb/ct>0.05) err(`High bad connection rate: ${(cb/ct*100).toFixed(1)}%`,'Check client versions and network conditions');
      if (ct>0 && ht/ct>0.03) warn(`Handshake timeout rate elevated: ${(ht/ct*100).toFixed(1)}%`,'Possible network congestion or client issues');
    }

    if (writers.data?.middle_proxy_enabled && writers.data?.summary) {
      const {coverage_pct,alive_writers,required_writers}=writers.data.summary;
      if (coverage_pct<50)  err(`ME writer coverage critical: ${coverage_pct.toFixed(1)}%`,`${alive_writers}/${required_writers} writers alive`);
      else if (coverage_pct<80) warn(`ME writer coverage low: ${coverage_pct.toFixed(1)}%`,`${alive_writers}/${required_writers} writers alive`);
    }

    if (dcs.data?.dcs) {
      const badDcs = dcs.data.dcs.filter(d=>d.coverage_pct<80);
      badDcs.forEach(d=>warn(`DC${d.dc} coverage low: ${d.coverage_pct.toFixed(1)}%`,`RTT: ${d.rtt_ms?d.rtt_ms.toFixed(0)+'ms':'—'}`));
    }

    if (upstreams.data?.summary) {
      const {unhealthy_total,configured_total}=upstreams.data.summary;
      if (unhealthy_total>0) warn(`${unhealthy_total}/${configured_total} upstream(s) unhealthy`,'Check upstream connectivity');
    }

    if (selftest.data?.data) {
      const d=selftest.data.data;
      if (d.kdf?.state==='error')       err('KDF health check failed',`EWMA errors/min: ${d.kdf.ewma_errors_per_min?.toFixed(2)}`);
      if (d.timeskew?.state==='error')  warn('Time skew too high',`Max skew 15m: ${d.timeskew.max_skew_secs_15m}s`);
      if (d.bnd?.addr_state!=='ok')     warn(`BND address state: ${d.bnd?.addr_state}`,'SOCKS BND address may be bogon');
      if (d.bnd?.port_state!=='ok')     warn(`BND port state: ${d.bnd?.port_state}`,'SOCKS BND port issue');
      if (d.pid?.state==='one')         info('Running as PID 1','Consider using an init process');
    }

    if (meq.data?.data?.route_drops) {
      const rd=meq.data.data.route_drops;
      const qfull=rd.queue_full_total||0;
      if (qfull>100) warn(`Queue drop pressure: ${qfull} drops`,'ME queue full — possible overload');
    }

    // User anomalies
    if (users) {
      const near_ip_limit = users.filter(u=>u.max_unique_ips && u.recent_unique_ips>=u.max_unique_ips*0.8);
      near_ip_limit.forEach(u=>warn(`User "${u.username}" near IP limit`,`${u.recent_unique_ips}/${u.max_unique_ips} unique IPs`));

      const near_conn_limit = users.filter(u=>u.max_tcp_conns && u.current_connections>=u.max_tcp_conns*0.8);
      near_conn_limit.forEach(u=>warn(`User "${u.username}" near connection limit`,`${u.current_connections}/${u.max_tcp_conns} connections`));

      const expired = users.filter(u=>u.expiration_rfc3339 && new Date(u.expiration_rfc3339)<new Date());
      expired.forEach(u=>err(`User "${u.username}" is expired`,`Expired: ${new Date(u.expiration_rfc3339).toLocaleDateString()}`));

      const expiring_soon = users.filter(u=>{
        if (!u.expiration_rfc3339) return false;
        const exp=new Date(u.expiration_rfc3339);
        const days=(exp-new Date())/(1000*86400);
        return days>0 && days<7;
      });
      expiring_soon.forEach(u=>{
        const days=Math.ceil((new Date(u.expiration_rfc3339)-new Date())/(1000*86400));
        warn(`User "${u.username}" expires in ${days} day(s)`);
      });
    }

    if (list.length===0) info('No anomalies detected','All systems nominal');
    return list;
  },[summary.data,writers.data,dcs.data,upstreams.data,selftest.data,meq.data,users]);

  // ── User analysis table ────────────────────────────────────────────────────
  const userStats = React.useMemo(()=>{
    if (!users) return [];
    return [...users].sort((a,b)=>(b.total_octets||0)-(a.total_octets||0)).map(u=>({
      ...u,
      connUsage:  u.max_tcp_conns ? Math.round(u.current_connections/u.max_tcp_conns*100) : null,
      ipUsage:    u.max_unique_ips? Math.round(u.recent_unique_ips/u.max_unique_ips*100)  : null,
      expired:    u.expiration_rfc3339 && new Date(u.expiration_rfc3339)<new Date(),
    }));
  },[users]);

  return (
    <div>
      <div className="page-hdr">
        <div className="page-title">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
          Analysis
        </div>
        <div className="page-actions"><button className="btn btn-ghost btn-sm" onClick={reload}><Icon d={IC.refresh}/>Refresh all</button></div>
      </div>

      {/* Health Score */}
      <div className="card-grid" style={{marginBottom:0}}>
        <div className="stat-card" style={{gridColumn:'span 2',display:'flex',alignItems:'center',gap:24,padding:'18px 24px'}}>
          <div style={{flexShrink:0}}>
            <div style={{
              width:80,height:80,borderRadius:'50%',
              background:`conic-gradient(${score!=null?scoreColor(score):'var(--border)'} ${(score||0)*3.6}deg, var(--bg3) 0)`,
              display:'flex',alignItems:'center',justifyContent:'center',
              boxShadow:score!=null?`0 0 24px ${scoreColor(score)}40`:'none',
            }}>
              <div style={{width:60,height:60,borderRadius:'50%',background:'var(--bg2)',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center'}}>
                <div style={{fontFamily:'var(--mono)',fontSize:18,fontWeight:700,color:score!=null?scoreColor(score):'var(--text3)',lineHeight:1}}>{score??'—'}</div>
                <div style={{fontFamily:'var(--mono)',fontSize:9,color:'var(--text3)'}}>/ 100</div>
              </div>
            </div>
          </div>
          <div>
            <div style={{fontSize:11,color:'var(--text3)',fontFamily:'var(--mono)',letterSpacing:'.08em',textTransform:'uppercase',marginBottom:4}}>System Health Score</div>
            <div style={{fontSize:22,fontWeight:700,color:score!=null?scoreColor(score):'var(--text3)',marginBottom:4}}>{score!=null?scoreLabel(score):'Loading…'}</div>
            <div style={{fontSize:11,color:'var(--text3)',fontFamily:'var(--mono)'}}>
              Weighted: ME coverage 30% · upstream health 20% · bad conn rate 20% · timeout rate 15% · DC coverage 15%
            </div>
          </div>
        </div>
      </div>

      {/* Anomalies */}
      <div className="card" style={{marginTop:16}}>
        <div className="card-title">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          Anomalies &amp; Alerts
          <span style={{marginLeft:'auto',fontFamily:'var(--mono)',fontSize:11,color:'var(--text3)',fontWeight:400}}>
            {anomalies.filter(a=>a.level==='err').length} critical · {anomalies.filter(a=>a.level==='warn').length} warnings
          </span>
        </div>
        <div style={{display:'flex',flexDirection:'column',gap:6}}>
          {anomalies.map((a,i)=>{
            const c=a.level==='err'?'var(--err)':a.level==='warn'?'var(--warn)':'var(--info)';
            const bg=a.level==='err'?'var(--err2)':a.level==='warn'?'var(--warn2)':'rgba(77,214,234,.08)';
            const icon=a.level==='err'?'✗':a.level==='warn'?'⚠':'✓';
            return (
              <div key={i} style={{display:'flex',gap:10,padding:'8px 12px',background:bg,border:`1px solid ${c}30`}}>
                <span style={{color:c,fontFamily:'var(--mono)',fontSize:12,flexShrink:0}}>{icon}</span>
                <div>
                  <div style={{fontSize:13,fontWeight:500,color:a.level==='info'?'var(--text2)':c}}>{a.msg}</div>
                  {a.detail&&<div style={{fontSize:11,color:'var(--text3)',fontFamily:'var(--mono)',marginTop:2}}>{a.detail}</div>}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* User analysis */}
      {userStats.length>0&&(
        <div className="card">
          <div className="card-title">User Analysis</div>
          <div className="tbl-wrap">
            <table>
              <thead><tr>
                <th>User</th>
                <th>Connections</th><th>Conn limit</th>
                <th>Unique IPs</th><th>IP limit</th>
                <th>Traffic</th>
                <th>Expires</th>
                <th>Status</th>
              </tr></thead>
              <tbody>
                {userStats.map(u=>{
                  const connPct = u.connUsage;
                  const ipPct   = u.ipUsage;
                  const connC   = connPct>=90?'var(--err)':connPct>=70?'var(--warn)':'var(--accent)';
                  const ipC     = ipPct  >=90?'var(--err)':ipPct  >=70?'var(--warn)':'var(--accent)';
                  return (
                    <tr key={u.username}>
                      <td className="mono" style={{color:'var(--accent)'}}>{u.username}</td>
                      <td className="mono">{u.current_connections}</td>
                      <td>
                        {u.max_tcp_conns
                          ? <div className="cov-bar"><div className="cov-track"><div style={{height:'100%',width:Math.min(connPct,100)+'%',background:connC}}/></div>
                              <span className="mono" style={{fontSize:10,color:connC}}>{connPct}%</span></div>
                          : <span style={{color:'var(--text3)',fontSize:11}}>∞</span>}
                      </td>
                      <td className="mono">{u.recent_unique_ips}</td>
                      <td>
                        {u.max_unique_ips
                          ? <div className="cov-bar"><div className="cov-track"><div style={{height:'100%',width:Math.min(ipPct,100)+'%',background:ipC}}/></div>
                              <span className="mono" style={{fontSize:10,color:ipC}}>{ipPct}%</span></div>
                          : <span style={{color:'var(--text3)',fontSize:11}}>∞</span>}
                      </td>
                      <td className="mono">{fmt_bytes(u.total_octets)}</td>
                      <td className="mono" style={{fontSize:10}}>
                        {u.expiration_rfc3339
                          ? <span style={{color:u.expired?'var(--err)':'inherit'}}>{new Date(u.expiration_rfc3339).toLocaleDateString()}</span>
                          : '—'}
                      </td>
                      <td>
                        {u.expired&&<span className="badge badge-err">expired</span>}
                        {!u.expired&&u.current_connections>0&&<span className="badge badge-ok">active</span>}
                        {!u.expired&&u.current_connections===0&&<span className="badge badge-dim">idle</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

const NAV = [
  {id:'dashboard',   l:'Dashboard',      icon:IC.dashboard, section:null},
  {id:'users',       l:'Users',          icon:IC.users,     section:'MANAGE'},
  {id:'analytics',   l:'Analytics',      icon:'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z M2 12h20 M12 2c-4 6-4 14 0 20 M12 2c4 6 4 14 0 20', section:'DATA'},
  {id:'analysis',    l:'Analysis',       icon:'M22 12h-4l-3 9L9 3l-3 9H2', section:null},
  {id:'stats',       l:'Statistics',     icon:IC.stats,     section:'TELEMT'},
  {id:'runtime',     l:'Runtime',        icon:IC.runtime,   section:null},
  {id:'edge',        l:'Edge',           icon:IC.edge,      section:null},
  {id:'security',    l:'Security',       icon:IC.security,  section:null},
  {id:'limits',      l:'Limits',         icon:IC.limits,    section:null},
  {id:'config',      l:'Configuration',  icon:IC.runtime,   section:null},
  {id:'panelsec',    l:'Panel Security', icon:'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z M9 12l2 2 4-4', section:'PANEL'},
];

function App() {
  const [authState, setAuthState] = useState('loading'); // loading | guest | authed
  const [username, setUsername]   = useState('');
  const [page, setPage]           = useState('dashboard');
  const [sessionToast, setToast]  = useState(false);

  // Check existing session on mount
  useEffect(() => {
    fetch('/auth/me', {credentials:'same-origin'})
      .then(r => r.json())
      .then(j => { if (j.ok) { if (j.csrfToken) _csrf.token = j.csrfToken; setUsername(j.username); setAuthState('authed'); } else setAuthState('guest'); })
      .catch(() => setAuthState('guest'));
  }, []);

  // Handle session expiry from any API call
  useEffect(() => {
    window.__sessionExpired = () => {
      setAuthState('guest');
      setToast(true);
      setTimeout(() => setToast(false), 4000);
    };
    return () => { delete window.__sessionExpired; };
  }, []);

  const logout = async () => {
    await fetch('/auth/logout', {method:'POST', credentials:'same-origin'});
    setAuthState('guest');
    setUsername('');
    setPage('dashboard');
  };

  if (authState === 'loading') {
    return (
      <div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',background:'var(--bg)'}}>
        <div style={{fontFamily:'var(--mono)',color:'var(--text3)',fontSize:13}}>Checking session…</div>
      </div>
    );
  }

  if (authState === 'guest') {
    return (
      <>
        {sessionToast && <div className="session-toast">⚠ Session expired — please log in again</div>}
        <LoginPage onLogin={u => { setUsername(u); setAuthState('authed'); }}/>
      </>
    );
  }

  let lastSection = null;

  return (
    <div className="layout">
      {/* Topbar */}
      <div className="topbar">
        <div className="topbar-brand"><div className="brand">telemt<span>ctl</span></div></div>
        <div className="topbar-right">
          <div className="topbar-status"><div className="topbar-status-dot"/>Live</div>
          <div className="topbar-user"><Icon d={IC.user} size={13}/>{username}</div>
          <button className="logout-btn" onClick={logout}><Icon d={IC.logout} size={12}/>Sign out</button>
        </div>
      </div>

      {/* Sidebar */}
      <div className="sidebar">
        {NAV.map(item => {
          const showSec = item.section && item.section !== lastSection;
          if (item.section) lastSection = item.section;
          return (
            <React.Fragment key={item.id}>
              {showSec && <div className="nav-section">{item.section}</div>}
              <div className={`nav-item ${page===item.id?'active':''}`} onClick={()=>setPage(item.id)}>
                <Icon d={item.icon}/>{item.l}
              </div>
            </React.Fragment>
          );
        })}
        <div style={{flex:1}}/>
        <div style={{padding:'12px 16px',fontSize:11,color:'var(--text3)',fontFamily:'var(--mono)',borderTop:'1px solid var(--border)',lineHeight:1.9}}>
          <div>Telemt Control Panel</div>
          <div style={{color:'var(--border2)'}}>API v1 · session auth</div>
        </div>
      </div>

      {/* Main */}
      <div className="main">
        {page==='dashboard'&&<DashboardPage/>}
        {page==='users'    &&<UsersPage/>}
        {page==='analytics'&&<AnalyticsPage/>}
        {page==='analysis' &&<AnalysisPage/>}
        {page==='stats'    &&<StatsPage/>}
        {page==='runtime'  &&<RuntimePage/>}
        {page==='edge'     &&<EdgePage/>}
        {page==='security' &&<SecurityPage/>}
        {page==='limits'   &&<LimitsPage/>}
        {page==='config'   &&<TelemtConfigPage/>}
        {page==='panelsec' &&<PanelSecurityPage/>}
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App/>);
