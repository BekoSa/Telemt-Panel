'use strict';

const fs = require('node:fs');
const path = require('node:path');

const file = path.join(__dirname, '..', 'src', 'client.jsx');
let source = fs.readFileSync(file, 'utf8');

function replaceOnce(oldText, newText, label) {
  const count = source.split(oldText).length - 1;
  if (count !== 1) throw new Error(`${label}: expected exactly one match, found ${count}`);
  source = source.replace(oldText, newText);
}

replaceOnce(
  "function ErrBox({msg}){ return msg?<div className=\"error-box\">⚠ {msg}</div>:null; }\n\nfunction useApi(path, deps=[]) {",
  "function ErrBox({msg}){ return msg?<div className=\"error-box\">⚠ {msg}</div>:null; }\nconst isUnsupportedCapability = (code,status) => status===404 || code==='not_found';\n\nfunction useApi(path, deps=[]) {",
  'capability helper',
);

replaceOnce(
`function useApi(path, deps=[]) {
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
}`,
`function useApi(path, deps=[]) {
  const [data,setData] = useState(null);
  const [err,setErr]   = useState(null);
  const [errCode,setErrCode] = useState(null);
  const [errStatus,setErrStatus] = useState(null);
  const [loading,setL] = useState(false);
  const [lastTs,setTs] = useState(null);
  const load = useCallback(async () => {
    setL(true); setErr(null); setErrCode(null); setErrStatus(null);
    try { const r = await api(path); setData(r.data); setTs(new Date().toLocaleTimeString()); }
    catch(e){ setErr(e.message); setErrCode(e.code||null); setErrStatus(e.status||null); }
    finally{ setL(false); }
  }, [path]);
  useEffect(()=>{ load(); },[load,...deps]);
  return {data,err,errCode,errStatus,loading,reload:load,lastTs};
}`,
  'useApi error metadata',
);

replaceOnce(
  "  const reload = () => { health.reload(); ready.reload(); info.reload(); sum.reload(); gates.reload(); };\n  return (",
  "  const reload = () => { health.reload(); ready.reload(); info.reload(); sum.reload(); gates.reload(); };\n  const readyUnsupported = ready.err && isUnsupportedCapability(ready.errCode,ready.errStatus);\n  return (",
  'readiness capability state',
);

replaceOnce(
`            {ready.loading?'…':ready.err?<span style={{color:'var(--text3)'}}>N/A</span>:ready.data?.ready?<span style={{color:'var(--accent)'}}>● READY</span>:<span style={{color:'var(--warn)'}}>● NOT READY</span>}
          </div>
          {ready.data&&<div className="stat-sub">{ready.data.status||'unknown'}</div>}
          {ready.err&&<div className="stat-sub">unsupported or unavailable</div>}`,
`            {ready.loading?'…':readyUnsupported?<span style={{color:'var(--text3)'}}>N/A</span>:ready.err?<span style={{color:'var(--err)'}}>ERROR</span>:ready.data?.ready?<span style={{color:'var(--accent)'}}>● READY</span>:<span style={{color:'var(--warn)'}}>● NOT READY</span>}
          </div>
          {ready.data&&<div className="stat-sub">{ready.data.status||'unknown'}</div>}
          {readyUnsupported&&<div className="stat-sub">unsupported on connected Telemt</div>}
          {ready.err&&!readyUnsupported&&<div className="stat-sub" style={{color:'var(--err)'}}>{ready.err}</div>}`,
  'readiness error display',
);

replaceOnce(
`function ActiveUserIps(){
  const {data,err,loading,reload,lastTs}=useApi('/stats/users/active-ips');
  if(loading) return <div className="card"><div className="card-title">Active source IPs</div><div className="loading-box">Loading</div></div>;
  if(err) return <div className="card"><div className="card-title">Active source IPs</div><div className="badge badge-dim">Unavailable on connected Telemt</div></div>;`,
`function ActiveUserIps(){
  const {data,err,errCode,errStatus,loading,reload,lastTs}=useApi('/stats/users/active-ips');
  if(loading) return <div className="card"><div className="card-title">Active source IPs</div><div className="loading-box">Loading</div></div>;
  if(err&&isUnsupportedCapability(errCode,errStatus)) return <div className="card"><div className="card-title">Active source IPs</div><div className="badge badge-dim">Unavailable on connected Telemt</div></div>;
  if(err) return <div className="card"><div className="card-title">Active source IPs</div><ErrBox msg={err}/></div>;`,
  'active IP error display',
);

replaceOnce(
`function EdgeTlsFingerprints(){
  const {data,err,loading,reload,lastTs}=useApi('/runtime/tls-fingerprints?limit=100');
  if(loading) return <div className="loading-box">Loading</div>;
  if(err) return <div className="badge badge-dim">TLS fingerprint telemetry is unavailable on the connected Telemt</div>;`,
`function EdgeTlsFingerprints(){
  const {data,err,errCode,errStatus,loading,reload,lastTs}=useApi('/runtime/tls-fingerprints?limit=100');
  if(loading) return <div className="loading-box">Loading</div>;
  if(err&&isUnsupportedCapability(errCode,errStatus)) return <div className="badge badge-dim">TLS fingerprint telemetry is unavailable on the connected Telemt</div>;
  if(err) return <ErrBox msg={err}/>;`,
  'TLS fingerprint error display',
);

replaceOnce(
`function WebRuntimePanel(){
  const status=useApi('/runtime/web/status');
  const sessions=useApi('/runtime/web/sessions?limit=100');
  const [busy,setBusy]=useState(null);`,
`function WebRuntimePanel(){
  const status=useApi('/runtime/web/status');
  const sessions=useApi('/runtime/web/sessions?limit=100');
  const webUnsupported=status.err&&isUnsupportedCapability(status.errCode,status.errStatus);
  const [busy,setBusy]=useState(null);`,
  'WEB capability state',
);

replaceOnce(
`  if(status.loading) return <div className="loading-box">Loading WEB runtime</div>;
  if(status.err) return <div><ErrBox msg={status.err}/><div className="badge badge-dim">WEB Runtime is unavailable on the connected Telemt</div></div>;
  return <div>`,
`  if(status.loading) return <div className="loading-box">Loading WEB runtime</div>;
  if(webUnsupported) return <div className="badge badge-dim">WEB Runtime is unavailable on the connected Telemt</div>;
  if(status.err) return <ErrBox msg={status.err}/>;
  return <div>`,
  'WEB error display',
);

fs.writeFileSync(file, source);
