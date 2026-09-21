'use strict';

const assert=require('node:assert/strict');
const http=require('node:http');
const os=require('node:os');
const fs=require('node:fs');
const path=require('node:path');
const {spawn,spawnSync}=require('node:child_process');

const PANEL_PORT=3310;
const TELEMT_PORT=39091;
const CDP_PORT=9222;
const PANEL_URL=`http://127.0.0.1:${PANEL_PORT}`;

const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));

function telemtData(pathname){
  switch(pathname){
    case '/v1/health':
      return {read_only:false};
    case '/v1/health/ready':
      return {ready:true,status:'ready'};
    case '/v1/system/info':
      return {
        version:'3.5.7',target_arch:'x86_64',target_os:'linux',build_profile:'release',
        git_commit:'e2e',build_time_utc:'2026-09-21T00:00:00Z',rustc_version:'test',
        process_started_at_epoch_secs:1,config_path:'/etc/telemt.toml',config_hash:'e2e',
        config_reload_count:0,last_config_reload_epoch_secs:0,
      };
    case '/v1/stats/summary':
      return {
        uptime_seconds:3600,connections_total:42,connections_bad_total:1,
        configured_users:2,handshake_timeouts_total:0,
      };
    case '/v1/runtime/gates':
      return {startup_status:'ready',startup_progress_pct:100,startup_stage:'ready'};
    case '/v1/runtime/connections/summary':
      return {
        enabled:true,
        data:{
          totals:{
            current_connections:7,current_connections_me:2,current_connections_direct:5,active_users:2,
          },
          top:{by_connections:[
            {username:'alice',current_connections:5,total_octets:5000},
            {username:'bob',current_connections:2,total_octets:2000},
          ]},
        },
      };
    case '/v1/runtime/web/status':
      return {
        lifecycle:'running',lifecycle_epoch:1,
        runtime:{
          runtime_instance:'e2e-runtime',generation_id:1,
          manager:{sessions:3},streams:{live:4},websockets:{entries:2},
          budget:{websocket_bytes:128},bytes_up:12000,bytes_down:34000,
        },
        operator_lifecycle:{state:'running',effective_new_work_admission:true},
      };
    case '/v1/runtime/web/sessions':
      return {
        sessions:[
          {session_ref:'ws1.e2e.1',user:'alice',carrier:'websocket',state:'healthy'},
          {session_ref:'ws1.e2e.2',user:'alice',carrier:'https-lanes',state:'healthy'},
          {session_ref:'ws1.e2e.3',user:'bob',carrier:'websocket-lanes',state:'healthy'},
        ],
        next_cursor:null,scanned:3,scan_truncated:false,partial_sessions:0,partial:[],
      };
    case '/v1/users':
      return [
        {username:'alice',current_connections:5,total_octets:5000,active_unique_ips_list:[],recent_unique_ips_list:[]},
        {username:'bob',current_connections:2,total_octets:2000,active_unique_ips_list:[],recent_unique_ips_list:[]},
      ];
    default:
      return {};
  }
}

function createMockTelemt(){
  return http.createServer((req,res)=>{
    const url=new URL(req.url,`http://127.0.0.1:${TELEMT_PORT}`);
    const body={ok:true,data:telemtData(url.pathname),revision:'e2e-revision'};
    res.writeHead(200,{'content-type':'application/json; charset=utf-8'});
    res.end(JSON.stringify(body));
  });
}

async function waitHttp(url,timeoutMs=15000){
  const deadline=Date.now()+timeoutMs;
  let lastError;
  while(Date.now()<deadline){
    try{
      const response=await fetch(url);
      if(response.ok) return;
    }catch(error){lastError=error;}
    await sleep(100);
  }
  throw new Error(`Timed out waiting for ${url}: ${lastError?.message||'not ready'}`);
}

function findChrome(){
  const candidates=[process.env.CHROME_BIN,'google-chrome','google-chrome-stable','chromium','chromium-browser'].filter(Boolean);
  for(const binary of candidates){
    const probe=spawnSync(binary,['--version'],{encoding:'utf8'});
    if(probe.status===0) return binary;
  }
  throw new Error('No Chrome/Chromium binary found for browser smoke test');
}

class CdpClient{
  constructor(ws){
    this.ws=ws;
    this.nextId=1;
    this.pending=new Map();
    this.handlers=new Map();
    ws.onmessage=event=>{
      const message=JSON.parse(String(event.data));
      if(message.id){
        const waiter=this.pending.get(message.id);
        if(!waiter) return;
        this.pending.delete(message.id);
        if(message.error) waiter.reject(new Error(message.error.message));
        else waiter.resolve(message.result||{});
        return;
      }
      const handlers=this.handlers.get(message.method)||[];
      for(const handler of handlers) handler(message.params||{});
    };
  }
  on(method,handler){
    const list=this.handlers.get(method)||[];
    list.push(handler);
    this.handlers.set(method,list);
  }
  send(method,params={}){
    const id=this.nextId++;
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{
        this.pending.delete(id);
        reject(new Error(`CDP timeout: ${method}`));
      },10000);
      this.pending.set(id,{
        resolve:value=>{clearTimeout(timer);resolve(value);},
        reject:error=>{clearTimeout(timer);reject(error);},
      });
      this.ws.send(JSON.stringify({id,method,params}));
    });
  }
  close(){this.ws.close();}
}

async function connectCdp(){
  const deadline=Date.now()+15000;
  let target;
  while(Date.now()<deadline){
    try{
      const response=await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`);
      const list=await response.json();
      target=list.find(item=>item.type==='page'&&item.webSocketDebuggerUrl);
      if(target) break;
    }catch{}
    await sleep(100);
  }
  if(!target) throw new Error('Chrome DevTools target did not become ready');
  const ws=new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(new Error('CDP websocket timeout')),10000);
    ws.onopen=()=>{clearTimeout(timer);resolve();};
    ws.onerror=()=>{clearTimeout(timer);reject(new Error('CDP websocket failed'));};
  });
  return new CdpClient(ws);
}

async function evaluate(cdp,expression){
  const result=await cdp.send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});
  if(result.exceptionDetails) throw new Error(result.exceptionDetails.text||'Browser evaluation failed');
  return result.result?.value;
}

async function waitFor(cdp,expression,timeoutMs=15000){
  const deadline=Date.now()+timeoutMs;
  let last;
  while(Date.now()<deadline){
    try{
      last=await evaluate(cdp,expression);
      if(last) return last;
    }catch{}
    await sleep(100);
  }
  throw new Error(`Browser condition timed out: ${expression}; last=${JSON.stringify(last)}`);
}

async function main(){
  const mock=createMockTelemt();
  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'telemt-panel-e2e-'));
  let panel;
  let chrome;
  let cdp;
  const browserErrors=[];
  const panelLogs=[];

  await new Promise((resolve,reject)=>{
    mock.once('error',reject);
    mock.listen(TELEMT_PORT,'127.0.0.1',resolve);
  });

  try{
    panel=spawn(process.execPath,['server.js'],{
      cwd:path.join(__dirname,'..'),
      env:{
        ...process.env,
        PORT:String(PANEL_PORT),
        PANEL_USERNAME:'admin',
        PANEL_PASSWORD:'browser-smoke',
        SESSION_SECRET:'browser-smoke-session-secret-0123456789abcdef',
        TELEMT_API_URL:`http://127.0.0.1:${TELEMT_PORT}`,
        GEOIP_DISABLED:'true',
        COOKIE_SECURE:'false',
      },
      stdio:['ignore','pipe','pipe'],
    });
    panel.stdout.on('data',chunk=>panelLogs.push(String(chunk)));
    panel.stderr.on('data',chunk=>panelLogs.push(String(chunk)));
    await waitHttp(PANEL_URL+'/healthz');

    const chromeBin=findChrome();
    chrome=spawn(chromeBin,[
      '--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
      `--remote-debugging-port=${CDP_PORT}`,`--user-data-dir=${tmp}`,'about:blank',
    ],{stdio:['ignore','ignore','pipe']});
    chrome.stderr.on('data',()=>{});

    cdp=await connectCdp();
    cdp.on('Runtime.exceptionThrown',params=>{
      browserErrors.push(params.exceptionDetails?.exception?.description||params.exceptionDetails?.text||'Runtime exception');
    });
    cdp.on('Runtime.consoleAPICalled',params=>{
      if(params.type==='error') browserErrors.push('console.error: '+(params.args||[]).map(arg=>arg.value||arg.description||'').join(' '));
    });
    await cdp.send('Runtime.enable');
    await cdp.send('Page.enable');

    await cdp.send('Page.navigate',{url:PANEL_URL});
    await waitFor(cdp,`document.readyState==='complete' && !!document.querySelector('input[autocomplete="username"]')`);

    await evaluate(cdp,`(()=>{
      const set=(el,value)=>{
        const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;
        setter.call(el,value);
        el.dispatchEvent(new Event('input',{bubbles:true}));
        el.dispatchEvent(new Event('change',{bubbles:true}));
      };
      set(document.querySelector('input[autocomplete="username"]'),'admin');
      set(document.querySelector('input[autocomplete="current-password"]'),'browser-smoke');
      document.querySelector('form').requestSubmit();
      return true;
    })()`);

    await waitFor(cdp,`!!document.querySelector('.layout')`);
    await evaluate(cdp,`(()=>{
      const item=[...document.querySelectorAll('.nav-item')].find(el=>el.textContent.trim()==='Analytics');
      if(!item) throw new Error('Analytics navigation item missing');
      item.click();
      return true;
    })()`);
    try{
      await waitFor(cdp,`document.body.innerText.includes('Live Activity') && document.body.innerText.includes('Top Users — Live Activity')`);
    }catch(error){
      const state=await evaluate(cdp,`({
        body:document.body.innerText.slice(0,6000),
        active:[...document.querySelectorAll('.nav-item.active')].map(el=>el.textContent.trim()),
        nav:[...document.querySelectorAll('.nav-item')].map(el=>el.textContent.trim())
      })`).catch(()=>null);
      throw new Error(error.message+'; browserErrors='+JSON.stringify(browserErrors)+'; state='+JSON.stringify(state));
    }
    await sleep(1200);

    const result=await evaluate(cdp,`(()=>{
      const inspect=title=>{
        const card=[...document.querySelectorAll('.card')].find(el=>el.textContent.includes(title));
        const canvas=card?.querySelector('canvas');
        if(!canvas) return {found:false};
        const ctx=canvas.getContext('2d');
        const pixels=ctx.getImageData(0,0,canvas.width,canvas.height).data;
        let ink=0;
        for(let i=3;i<pixels.length;i+=4) if(pixels[i]>0) ink++;
        return {found:true,width:canvas.width,height:canvas.height,ink};
      };
      return {
        activity:inspect('Live Activity'),
        users:inspect('Top Users — Live Activity'),
        body:document.body.innerText,
      };
    })()`);

    assert.equal(result.activity.found,true,'Live Activity canvas must exist');
    assert.equal(result.users.found,true,'Top Users canvas must exist');
    assert.ok(result.activity.width>0&&result.activity.height>0,'Live Activity canvas must have dimensions');
    assert.ok(result.users.width>0&&result.users.height>0,'Top Users canvas must have dimensions');
    assert.ok(result.activity.ink>100,'Live Activity Chart.js canvas must contain rendered pixels');
    assert.ok(result.users.ink>100,'Top Users Chart.js canvas must contain rendered pixels');
    assert.match(result.body,/WEB sessions/);
    assert.match(result.body,/WSS sockets/);
    assert.match(result.body,/MTProxy connections/);
    assert.deepEqual(browserErrors,[],'browser must not emit runtime/console errors');

    console.log('Browser smoke passed:',{
      activityInk:result.activity.ink,
      usersInk:result.users.ink,
      browserErrors:browserErrors.length,
    });
  }catch(error){
    if(panelLogs.length) console.error(panelLogs.join(''));
    throw error;
  }finally{
    try{cdp?.close();}catch{}
    if(chrome&&!chrome.killed) chrome.kill('SIGKILL');
    if(panel&&!panel.killed) panel.kill('SIGKILL');
    await new Promise(resolve=>mock.close(resolve));
    fs.rmSync(tmp,{recursive:true,force:true});
  }
}

main().catch(error=>{
  console.error(error);
  process.exitCode=1;
});
