'use strict';

function isObject(value){
  return value!==null&&typeof value==='object'&&!Array.isArray(value);
}

function deepEqual(a,b){
  if(Object.is(a,b)) return true;
  if(Array.isArray(a)&&Array.isArray(b)){
    return a.length===b.length&&a.every((v,i)=>deepEqual(v,b[i]));
  }
  if(isObject(a)&&isObject(b)){
    const ak=Object.keys(a),bk=Object.keys(b);
    return ak.length===bk.length&&ak.every(k=>Object.hasOwn(b,k)&&deepEqual(a[k],b[k]));
  }
  return false;
}

function buildSparsePatch(base,draft){
  if(deepEqual(base,draft)) return {};
  if(!isObject(base)||!isObject(draft)){
    return structuredClone(draft);
  }
  const out={};
  for(const key of Object.keys(draft)){
    if(!Object.hasOwn(base,key)){
      out[key]=structuredClone(draft[key]);
      continue;
    }
    const before=base[key],after=draft[key];
    if(deepEqual(before,after)) continue;
    if(isObject(before)&&isObject(after)){
      const nested=buildSparsePatch(before,after);
      if(Object.keys(nested).length) out[key]=nested;
    }else{
      out[key]=structuredClone(after);
    }
  }
  return out;
}

function setPathValue(root,path,value){
  const next=structuredClone(root);
  if(!path.length) return structuredClone(value);
  let cursor=next;
  for(let i=0;i<path.length-1;i++) cursor=cursor[path[i]];
  cursor[path[path.length-1]]=value;
  return next;
}

function coerceLike(example,raw){
  if(typeof example==='boolean') return Boolean(raw);
  if(typeof example==='number'){
    if(raw==='') return example;
    const n=Number(raw);
    return Number.isFinite(n)?n:example;
  }
  if(example===null){
    if(raw==='null') return null;
    return raw;
  }
  return String(raw);
}

function emptyLike(value){
  if(Array.isArray(value)) return [];
  if(isObject(value)){
    return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,emptyLike(v)]));
  }
  if(typeof value==='boolean') return false;
  if(typeof value==='number') return 0;
  if(value===null) return null;
  return '';
}

function newArrayItem(path,current=[]){
  if(Array.isArray(current)&&current.length) return emptyLike(current[0]);
  const key=(path||[]).map(part=>typeof part==='number'?'*':String(part)).join('.');
  if(key==='server.listeners') return {ip:'0.0.0.0',port:443};
  if(key==='upstreams') return {type:'direct',enabled:true,weight:1,scopes:''};
  if(key==='web.vhosts') return {
    host:'',
    public_addr:'',
    decoy:{mode:'http_upstream',upstream:'http://127.0.0.1:18081'},
    profiles:[],
  };
  if(/^web\.vhosts\.\*\.profiles$/.test(key)) return {user:'',secret_mode:'dd'};
  return '';
}

module.exports={isObject,deepEqual,buildSparsePatch,setPathValue,coerceLike,emptyLike,newArrayItem};
