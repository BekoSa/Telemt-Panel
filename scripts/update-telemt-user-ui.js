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
`  const health = useApi('/health');
  const info   = useApi('/system/info');
  const sum    = useApi('/stats/summary');
  const gates  = useApi('/runtime/gates');
  const reload = () => { health.reload(); info.reload(); sum.reload(); gates.reload(); };`,
`  const health = useApi('/health');
  const ready  = useApi('/health/ready');
  const info   = useApi('/system/info');
  const sum    = useApi('/stats/summary');
  const gates  = useApi('/runtime/gates');
  const reload = () => { health.reload(); ready.reload(); info.reload(); sum.reload(); gates.reload(); };`,
'dashboard readiness query');

replaceOnce(
`        <div className="stat-card">
          <div className="stat-label">STATUS</div>
          <div className="stat-value" style={{fontSize:15,marginTop:4}}>
            {health.loading?'…':health.err?<span style={{color:'var(--err)'}}>ERROR</span>:<span style={{color:'var(--accent)'}}>● ONLINE</span>}
          </div>
          {health.data&&<div className="stat-sub">read_only: {String(health.data.read_only)}</div>}
        </div>`,
`        <div className="stat-card">
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
        </div>`,
'dashboard readiness card');

replaceOnce(
`  const [rotating,setRot]= useState(false);`,
`  const [busyAction,setBusyAction]=useState(null);`,
'user busy state');
replaceOnce(
`  const [rotMsg,setRotMsg]= useState(null);`,
`  const [actionMsg,setActionMsg]=useState(null);`,
'user message state');

const rotateStart = source.indexOf('  const rotateSecret=async()=>{');
const rotateEnd = source.indexOf('\n\n  const u=user;', rotateStart);
if (rotateStart === -1 || rotateEnd === -1) throw new Error('rotate-secret function block not found');
source = source.slice(0, rotateStart) + `  const runUserAction=async(path,successMessage,confirmMessage=null)=>{
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
        ? \`Action "\${action}" is not supported by the connected Telemt version\`
        : e.message});
    }finally{ setBusyAction(null); }
  };

  const rotateSecret=()=>runUserAction('/users/'+user.username+'/rotate-secret','Secret rotated successfully');
  const enableUser=()=>runUserAction('/users/'+user.username+'/enable','User enabled');
  const disableUser=()=>runUserAction('/users/'+user.username+'/disable','User disabled',\`Disable \${user.username}? Active runtime sessions will be closed.\`);
  const resetQuota=()=>runUserAction('/users/'+user.username+'/reset-quota','Quota reset',\`Reset quota for \${user.username}?\`);` + source.slice(rotateEnd);

replaceOnce(
`  if (!json.ok) throw new Error(json.error?.message || json.error?.code || 'Unknown error');`,
`  if (!json.ok) {
    const err = new Error(json.error?.message || json.error?.code || 'Unknown error');
    err.code = json.error?.code || null;
    err.status = r.status;
    throw err;
  }`,
'api error metadata');

const controlsStart = source.indexOf('        {/* Rotate secret */}');
const controlsEnd = source.indexOf('        <div className="modal-footer">', controlsStart);
if (controlsStart === -1 || controlsEnd === -1) throw new Error('user controls block not found');
const controls = `        {/* Telemt 3.5.7 user controls */}
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
              border:\`1px solid \${actionMsg.ok?'rgba(0,229,180,.2)':'rgba(245,168,50,.2)'}\`,
              padding:'6px 10px'}}>
              {actionMsg.ok?'✓ ':'⚠ '}{actionMsg.msg}
            </div>
          )}
        </div>

`;
source = source.slice(0, controlsStart) + controls + source.slice(controlsEnd);

fs.writeFileSync(file, source);
