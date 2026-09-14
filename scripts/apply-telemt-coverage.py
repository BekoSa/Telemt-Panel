from pathlib import Path

p = Path('src/client.jsx')
s = p.read_text()

old = "import ConnectionLinkConfigurator from './connection-link-configurator.jsx';\n"
new = """import ConnectionLinkConfigurator from './connection-link-configurator.jsx';
import userPolicy from './user-policy.cjs';
import UserQuotaRuntime from './user-quota-runtime.jsx';
import WebSessionsExplorer from './web-sessions-explorer.jsx';

const {buildCreateUserBody,buildPatchUserBody}=userPolicy;
"""
assert s.count(old) == 1
s = s.replace(old, new, 1)

start = s.index('function UserModal({user,onClose}) {')
end = s.index('\nfunction UserDetailModal', start)
user_modal = r'''function UserModal({user,onClose}) {
  const [form,setForm] = useState({
    username:user?.username||'', secret:'', user_ad_tag:user?.user_ad_tag??'',
    max_tcp_conns:user?.max_tcp_conns??'', expiration_rfc3339:user?.expiration_rfc3339??'',
    data_quota_bytes:user?.data_quota_bytes??'', rate_limit_up_bps:user?.rate_limit_up_bps??'',
    rate_limit_down_bps:user?.rate_limit_down_bps??'', max_unique_ips:user?.max_unique_ips??'',
    enabled:user?.enabled!==false,
  });
  const [loading,setL] = useState(false);
  const [err,setErr] = useState(null);
  const set = name => e => setForm(f=>({...f,[name]:e.target.value}));
  const submit = async()=>{
    setL(true); setErr(null);
    try{
      const body=user?buildPatchUserBody(user,form):buildCreateUserBody(form);
      if(!user) await api('/users','POST',body);
      else{
        let ifMatch=null;
        try{const cur=await api('/users/'+user.username);ifMatch=cur.revision;}catch{}
        await api('/users/'+user.username,'PATCH',body,ifMatch);
      }
      onClose();
    }catch(e){setErr(e.message);}finally{setL(false);}
  };
  return <div className="modal-overlay"><div className="modal">
    <div className="modal-title">{user?'Edit: '+user.username:'Create User'}</div><ErrBox msg={err}/>
    {!user&&<div className="form-row"><label className="form-label">Username *</label><input className="form-input" value={form.username} onChange={set('username')} placeholder="[A-Za-z0-9_.-], 1..64 chars" autoFocus/></div>}
    <div className="form-row"><label className="form-label">Secret</label><input className="form-input" value={form.secret} onChange={set('secret')} placeholder="32 hex chars (auto-generated if empty)" autoComplete="off"/></div>
    <div className="form-row"><label className="form-label">Ad Tag</label><input className="form-input" value={form.user_ad_tag} onChange={set('user_ad_tag')} placeholder="32 hex chars (optional)"/></div>
    <div className="form-row"><label className="form-label">Max TCP Connections</label><input className="form-input" type="number" min="0" value={form.max_tcp_conns} onChange={set('max_tcp_conns')} placeholder="Unlimited if empty"/></div>
    <div className="form-row"><label className="form-label">Expiration (RFC3339)</label><input className="form-input" value={form.expiration_rfc3339} onChange={set('expiration_rfc3339')} placeholder="2027-01-01T00:00:00Z"/></div>
    <div className="form-row"><label className="form-label">Data Quota (bytes)</label><input className="form-input" type="number" min="0" value={form.data_quota_bytes} onChange={set('data_quota_bytes')} placeholder="Unlimited if empty"/></div>
    <div className="form-row"><label className="form-label">Upload rate limit (bps)</label><input className="form-input" type="number" min="0" value={form.rate_limit_up_bps} onChange={set('rate_limit_up_bps')} placeholder="Unlimited if empty"/></div>
    <div className="form-row"><label className="form-label">Download rate limit (bps)</label><input className="form-input" type="number" min="0" value={form.rate_limit_down_bps} onChange={set('rate_limit_down_bps')} placeholder="Unlimited if empty"/></div>
    <div className="form-row"><label className="form-label">Max Unique IPs</label><input className="form-input" type="number" min="0" value={form.max_unique_ips} onChange={set('max_unique_ips')} placeholder="Unlimited if empty"/></div>
    {!user&&<label style={{display:'flex',alignItems:'center',gap:8,fontFamily:'var(--mono)',fontSize:12,color:'var(--text2)',marginBottom:14}}><input type="checkbox" checked={form.enabled} onChange={e=>setForm(f=>({...f,enabled:e.target.checked}))}/>Create enabled</label>}
    {user&&<div className="last-upd" style={{marginBottom:14,lineHeight:1.5}}><strong>Clear configured overrides:</strong> clear an optional field and Save to remove that per-user override. Secret remains unchanged when empty.</div>}
    <div className="modal-footer"><button className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={submit} disabled={loading}>{loading?'Saving…':user?'Save':'Create'}</button></div>
  </div></div>;
}
'''
s = s[:start] + user_modal + s[end:]

old = """            ['data quota',         u.data_quota_bytes?fmt_bytes(u.data_quota_bytes):'∞'],
            ['max TCP conns',      u.max_tcp_conns||'∞'],
"""
new = """            ['data quota',         u.data_quota_bytes!=null?fmt_bytes(u.data_quota_bytes):'∞'],
            ['upload limit',       u.rate_limit_up_bps!=null?u.rate_limit_up_bps+' bps':'∞'],
            ['download limit',     u.rate_limit_down_bps!=null?u.rate_limit_down_bps+' bps':'∞'],
            ['max TCP conns',      u.max_tcp_conns??'∞'],
"""
assert s.count(old) == 1
s = s.replace(old, new, 1)

anchor = '        <ConnectionLinkConfigurator\n'
assert s.count(anchor) == 1
s = s.replace(anchor, '        <UserQuotaRuntime user={u} apiFn={api}/>\n\n' + anchor, 1)

assert s.count('const d=status.data?.data;') == 1
assert s.count('const page=sessions.data?.data;') == 1
s = s.replace('const d=status.data?.data;', 'const d=status.data;', 1)
s = s.replace('const page=sessions.data?.data;', 'const page=sessions.data;', 1)

close_start = s.index('  const closeSession=async(sessionRef)=>{')
close_end = s.index('\n\n  if(status.loading)', close_start)
s = s[:close_start] + s[close_end+2:]

active_marker = '    <div className="card">\n      <div className="card-title" style={{justifyContent:\'space-between\'}}><span>Active WEB sessions</span>'
active_start = s.index(active_marker)
panel_end = s.index('  </div>;\n}\n\nfunction EdgeConnections', active_start)
s = s[:active_start] + '    <WebSessionsExplorer apiFn={api}/>\n' + s[panel_end:]

p.write_text(s)
