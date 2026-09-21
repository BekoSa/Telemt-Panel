'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.join(__dirname,'..');
const helperPath=path.join(root,'src','config-editor.cjs');
const uiPath=path.join(root,'src','structured-config-editor.jsx');
const clientPath=path.join(root,'src','client.jsx');

function helper(){
  assert.ok(fs.existsSync(helperPath),'src/config-editor.cjs must exist');
  delete require.cache[require.resolve(helperPath)];
  return require(helperPath);
}

test('structured config diff deep-merges objects but replaces changed arrays wholesale',()=>{
  const {buildSparsePatch}=helper();
  const base={
    general:{log_level:'normal',links:{public_host:'old.example',public_port:443}},
    server:{listeners:[{bind:'0.0.0.0:443',mode:'mtproxy'}]},
    web:{enabled:true,timeouts:{request_secs:10}},
  };
  const draft={
    general:{log_level:'debug',links:{public_host:'old.example',public_port:443}},
    server:{listeners:[{bind:'127.0.0.1:8443',mode:'mtproxy'}]},
    web:{enabled:true,timeouts:{request_secs:15}},
  };
  assert.deepEqual(buildSparsePatch(base,draft),{
    general:{log_level:'debug'},
    server:{listeners:[{bind:'127.0.0.1:8443',mode:'mtproxy'}]},
    web:{timeouts:{request_secs:15}},
  });
});

test('structured config diff is empty when the draft is unchanged',()=>{
  const {buildSparsePatch}=helper();
  const config={general:{log_level:'normal'},web:{enabled:true}};
  assert.deepEqual(buildSparsePatch(config,structuredClone(config)),{});
});

test('path updates preserve siblings and coerce values from the existing field type',()=>{
  const {setPathValue,coerceLike}=helper();
  const base={web:{enabled:true,timeouts:{request_secs:10}},general:{log_level:'normal'}};
  const changed=setPathValue(base,['web','timeouts','request_secs'],coerceLike(10,'25'));
  assert.deepEqual(changed,{web:{enabled:true,timeouts:{request_secs:25}},general:{log_level:'normal'}});
  assert.equal(base.web.timeouts.request_secs,10);
  assert.equal(coerceLike(true,false),false);
  assert.equal(coerceLike('normal','debug'),'debug');
});

test('new array rows can be created from the shape of an existing item',()=>{
  const {emptyLike}=helper();
  assert.deepEqual(emptyLike({bind:'0.0.0.0:443',enabled:true,weight:10,tags:['a'],nested:{mode:'x'}}),{
    bind:'',enabled:false,weight:0,tags:[],nested:{mode:''},
  });
});

test('structured config editor exposes normal sections arrays diff preview advanced JSON and safe writes',()=>{
  assert.ok(fs.existsSync(uiPath),'src/structured-config-editor.jsx must exist');
  const ui=fs.readFileSync(uiPath,'utf8');
  for(const label of ['General','Listeners','Timeouts','Censorship / TLS','Upstreams','DC Overrides','WEB']){
    assert.match(ui,new RegExp(label.replace('/','\\/')));
  }
  assert.match(ui,/Add item/);
  assert.match(ui,/Remove/);
  assert.match(ui,/Patch preview/);
  assert.match(ui,/Advanced JSON Patch/);
  assert.match(ui,/buildSparsePatch/);
  assert.match(ui,/apiFn\('\/config','PATCH',patch,revision\)/);
  assert.match(ui,/revision_conflict/);
  assert.match(ui,/apiFn\('\/system\/reload','POST'/);
  assert.match(ui,/deferred_process_fields/);
  assert.match(ui,/runtime_reload_required/);
  assert.match(ui,/process_restart_required/);
});

test('configuration page renders the structured editor instead of the legacy raw-patch-only UI',()=>{
  const client=fs.readFileSync(clientPath,'utf8');
  assert.match(client,/StructuredConfigEditor/);
  assert.match(client,/<StructuredConfigEditor apiFn=\{api\}/);
});
