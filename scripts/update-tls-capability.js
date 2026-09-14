'use strict';

const fs = require('node:fs');
const path = require('node:path');

const file = path.join(__dirname, '..', 'src', 'client.jsx');
let source = fs.readFileSync(file, 'utf8');
const oldText = `function EdgeTlsFingerprints(){
  const {data,err,loading,reload,lastTs}=useApi('/runtime/tls-fingerprints?limit=100');
  if(loading) return <div className="loading-box">Loading</div>;
  if(err) return <ErrBox msg={err}/>;
  if(!data?.data) return <div className="badge badge-dim">{data?.reason||'Feature disabled or unavailable'}</div>;`;
const newText = `function EdgeTlsFingerprints(){
  const {data,err,loading,reload,lastTs}=useApi('/runtime/tls-fingerprints?limit=100');
  if(loading) return <div className="loading-box">Loading</div>;
  if(err) return <div className="badge badge-dim">TLS fingerprint telemetry is unavailable on the connected Telemt</div>;
  if(!data?.data) return <div className="badge badge-dim">{data?.reason||'Feature disabled or unavailable'}</div>;`;
const count = source.split(oldText).length - 1;
if (count !== 1) throw new Error(`TLS fingerprint block: expected exactly one match, found ${count}`);
source = source.replace(oldText, newText);
fs.writeFileSync(file, source);
