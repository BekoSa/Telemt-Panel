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
`      {users.length>0&&(
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
      {modal&&<UserModal`,
`      {users.length>0&&(
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
      {modal&&<UserModal`,
'users active IP component mount');

replaceOnce(
`function UserModal({user,onClose}) {`,
`function ActiveUserIps(){
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

function UserModal({user,onClose}) {`,
'active IP component');

replaceOnce(
`      <div className={\`tab \${tab==='events'?'active':''}\`} onClick={()=>setTab('events')}>Events</div>
    </div>
    {tab==='connections'&&<EdgeConnections/>}
    {tab==='events'&&<EdgeEvents/>}`, 
`      <div className={\`tab \${tab==='events'?'active':''}\`} onClick={()=>setTab('events')}>Events</div>
      <div className={\`tab \${tab==='fingerprints'?'active':''}\`} onClick={()=>setTab('fingerprints')}>Fingerprints</div>
    </div>
    {tab==='connections'&&<EdgeConnections/>}
    {tab==='events'&&<EdgeEvents/>}
    {tab==='fingerprints'&&<EdgeTlsFingerprints/>}`,
'fingerprints tab');

replaceOnce(
`// ─── Security ─────────────────────────────────────────────────────────────────`,
`function EdgeTlsFingerprints(){
  const {data,err,loading,reload,lastTs}=useApi('/runtime/tls-fingerprints?limit=100');
  if(loading) return <div className="loading-box">Loading</div>;
  if(err) return <ErrBox msg={err}/>;
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

// ─── Security ─────────────────────────────────────────────────────────────────`,
'fingerprint component');

fs.writeFileSync(file, source);
