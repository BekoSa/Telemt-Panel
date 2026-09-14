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
  "  const rows=Array.isArray(page?.sessions)?page.sessions:[];\n  const runtimeInstance=d?.runtime?.runtime_instance;",
  "  const rows=Array.isArray(page?.sessions)?page.sessions:[];\n  const wssRows=rows.filter(row=>row.carrier==='websocket'||row.carrier==='websocket-lanes');\n  const runtimeInstance=d?.runtime?.runtime_instance;",
  'WSS session rows',
);

replaceOnce(
`    <div className="card-grid">
      <div className="stat-card"><div className="stat-label">WEB LIFECYCLE</div><div className="stat-value" style={{fontSize:17}}>{d?.lifecycle||'—'}</div><div className="stat-sub">epoch {d?.lifecycle_epoch??'—'}</div></div>
      <div className="stat-card"><div className="stat-label">OPERATOR</div><div className="stat-value" style={{fontSize:17}}>{operator?.state||'—'}</div><div className="stat-sub">admission {operator?.effective_new_work_admission?'open':'closed'}</div></div>
      <div className="stat-card"><div className="stat-label">SESSIONS</div><div className="stat-value accent">{d?.runtime?.manager?.sessions??rows.length}</div><div className="stat-sub">snapshot {rows.length} rows</div></div>
      <div className="stat-card"><div className="stat-label">STREAMS</div><div className="stat-value">{d?.runtime?.streams?.live??'—'}</div><div className="stat-sub">generation {d?.runtime?.generation_id??'—'}</div></div>
    </div>
    <div className="card">
      <div className="card-title" style={{justifyContent:'space-between'}}><span>Operator lifecycle</span>`,
`    <div className="card-grid">
      <div className="stat-card"><div className="stat-label">WEB LIFECYCLE</div><div className="stat-value" style={{fontSize:17}}>{d?.lifecycle||'—'}</div><div className="stat-sub">epoch {d?.lifecycle_epoch??'—'}</div></div>
      <div className="stat-card"><div className="stat-label">OPERATOR</div><div className="stat-value" style={{fontSize:17}}>{operator?.state||'—'}</div><div className="stat-sub">admission {operator?.effective_new_work_admission?'open':'closed'}</div></div>
      <div className="stat-card"><div className="stat-label">SESSIONS</div><div className="stat-value accent">{d?.runtime?.manager?.sessions??rows.length}</div><div className="stat-sub">snapshot {rows.length} rows</div></div>
      <div className="stat-card"><div className="stat-label">STREAMS</div><div className="stat-value">{d?.runtime?.streams?.live??'—'}</div><div className="stat-sub">generation {d?.runtime?.generation_id??'—'}</div></div>
    </div>
    <div className="card">
      <div className="card-title">WEB / WSS Traffic</div>
      <div className="card-grid" style={{marginBottom:10}}>
        <div className="stat-card"><div className="stat-label">WEB UP</div><div className="stat-value accent" style={{fontSize:18}}>{fmt_bytes(d?.runtime?.bytes_up)}</div><div className="stat-sub">carrier payload sent upstream</div></div>
        <div className="stat-card"><div className="stat-label">WEB DOWN</div><div className="stat-value" style={{fontSize:18}}>{fmt_bytes(d?.runtime?.bytes_down)}</div><div className="stat-sub">carrier payload sent downstream</div></div>
        <div className="stat-card"><div className="stat-label">WSS SESSIONS</div><div className="stat-value accent">{wssRows.length}</div><div className="stat-sub">websocket + websocket-lanes</div></div>
        <div className="stat-card"><div className="stat-label">WSS SOCKETS</div><div className="stat-value">{d?.runtime?.websockets?.entries??'—'}</div><div className="stat-sub">live registry entries</div></div>
        <div className="stat-card"><div className="stat-label">WSS BUFFERED</div><div className="stat-value warn" style={{fontSize:18}}>{fmt_bytes(d?.runtime?.budget?.websocket_bytes)}</div><div className="stat-sub">current websocket buffer budget</div></div>
      </div>
      <div className="last-upd">WEB payload totals include HTTPS and WebSocket carriers in Telemt 3.5.7; the Control API does not expose cumulative WSS-only byte counters.</div>
    </div>
    <div className="card">
      <div className="card-title" style={{justifyContent:'space-between'}}><span>Operator lifecycle</span>`,
  'WEB/WSS traffic card',
);

fs.writeFileSync(file, source);
