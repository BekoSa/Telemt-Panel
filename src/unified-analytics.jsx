import React, {useEffect, useRef, useState} from 'react';
import Chart from 'chart.js/auto';
import unifiedStats from './unified-stats.cjs';

const {normalizeUnifiedSnapshot,createTimelineBuffer,appendTimelinePoint,buildTopUserRows}=unifiedStats;

async function fetchAllWebSessions(apiFn) {
  const rows=[];
  let cursor=null;
  let pageCount=0;
  do {
    const query='/runtime/web/sessions?limit=200'+(cursor?'&cursor='+encodeURIComponent(cursor):'');
    const response=await apiFn(query);
    const page=response?.data||{};
    if(Array.isArray(page.sessions)) rows.push(...page.sessions);
    cursor=page.next_cursor||null;
    pageCount+=1;
  } while(cursor&&pageCount<5);
  return rows;
}

function chartOptions() {
  return {
    responsive:true,
    maintainAspectRatio:false,
    animation:{duration:160},
    interaction:{mode:'index',intersect:false},
    scales:{
      x:{grid:{color:'#1e2d3e'},ticks:{color:'#3d5570',font:{family:'IBM Plex Mono',size:10},maxTicksLimit:8}},
      y:{beginAtZero:true,grid:{color:'#1e2d3e'},ticks:{color:'#3d5570',font:{family:'IBM Plex Mono',size:10},precision:0}},
    },
    plugins:{
      legend:{labels:{color:'#7a96b0',font:{family:'IBM Plex Mono',size:11},boxWidth:12,padding:14}},
      tooltip:{backgroundColor:'#111720',borderColor:'#253545',borderWidth:1,titleColor:'#b8cfe4',bodyColor:'#7a96b0'},
    },
  };
}

export default function UnifiedAnalytics({apiFn,pollMs=5000}) {
  const activityCanvas=useRef(null);
  const usersCanvas=useRef(null);
  const activityChart=useRef(null);
  const usersChart=useRef(null);
  const timeline=useRef(createTimelineBuffer());
  const [pollError,setPollError]=useState(null);
  const [updated,setUpdated]=useState(null);
  const [summary,setSummary]=useState(null);

  useEffect(()=>{
    if(!activityCanvas.current||!usersCanvas.current) return;
    const base={borderWidth:1.5,pointRadius:0,tension:0.32,fill:false};
    const b=timeline.current;
    activityChart.current=new Chart(activityCanvas.current.getContext('2d'),{
      type:'line',
      data:{labels:b.labels,datasets:[
        {...base,label:'MTProxy',data:b.mtproxy,borderColor:'#00e5b4'},
        {...base,label:'Direct',data:b.direct,borderColor:'#f5a832'},
        {...base,label:'via ME',data:b.me,borderColor:'#4dd6ea'},
        {...base,label:'WEB sessions',data:b.webSessions,borderColor:'#a78bfa'},
        {...base,label:'WEB streams',data:b.webStreams,borderColor:'#ff7ac6',borderDash:[4,2]},
        {...base,label:'WSS sockets',data:b.wssSockets,borderColor:'#7dd3fc',borderDash:[2,2]},
      ]},
      options:chartOptions(),
    });
    usersChart.current=new Chart(usersCanvas.current.getContext('2d'),{
      type:'bar',
      data:{labels:[],datasets:[
        {label:'MTProxy connections',data:[],backgroundColor:'rgba(0,229,180,.65)',borderColor:'#00e5b4',borderWidth:1},
        {label:'WEB sessions',data:[],backgroundColor:'rgba(167,139,250,.55)',borderColor:'#a78bfa',borderWidth:1},
      ]},
      options:{...chartOptions(),scales:{
        x:{stacked:false,grid:{display:false},ticks:{color:'#7a96b0',font:{family:'IBM Plex Mono',size:10}}},
        y:{beginAtZero:true,grid:{color:'#1e2d3e'},ticks:{color:'#3d5570',precision:0,font:{family:'IBM Plex Mono',size:10}}},
      }},
    });
    return()=>{activityChart.current?.destroy();usersChart.current?.destroy();};
  },[]);

  useEffect(()=>{
    let cancelled=false;
    const poll=async()=>{
      try{
        const [edgeResult,webResult,usersResult,sessionsResult]=await Promise.allSettled([
          apiFn('/runtime/connections/summary'),
          apiFn('/runtime/web/status'),
          apiFn('/users'),
          fetchAllWebSessions(apiFn),
        ]);
        if(cancelled) return;
        const failures=[];
        if(edgeResult.status==='rejected') failures.push('MTProxy: '+edgeResult.reason.message);
        if(webResult.status==='rejected'&&webResult.reason?.status!==404) failures.push('WEB status: '+webResult.reason.message);
        if(usersResult.status==='rejected') failures.push('users: '+usersResult.reason.message);
        if(sessionsResult.status==='rejected'&&sessionsResult.reason?.status!==404) failures.push('WEB sessions: '+sessionsResult.reason.message);
        setPollError(failures.length?failures.join(' · '):null);

        const edge=edgeResult.status==='fulfilled'?edgeResult.value?.data:null;
        const web=webResult.status==='fulfilled'?webResult.value?.data:null;
        const users=usersResult.status==='fulfilled'&&Array.isArray(usersResult.value?.data)?usersResult.value.data:[];
        const sessions=sessionsResult.status==='fulfilled'?sessionsResult.value:[];
        const snapshot=normalizeUnifiedSnapshot({edge,web});
        const label=new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit',second:'2-digit'});
        appendTimelinePoint(timeline.current,snapshot,label,72);
        activityChart.current?.update('none');

        const top=buildTopUserRows(users,sessions).slice(0,10);
        if(usersChart.current){
          usersChart.current.data.labels=top.map(row=>row.username);
          usersChart.current.data.datasets[0].data=top.map(row=>row.mtproxyConnections);
          usersChart.current.data.datasets[1].data=top.map(row=>row.webSessions);
          usersChart.current.update('none');
        }
        setSummary({snapshot,sessionRows:sessions.length,users:top.length});
        setUpdated(label);
      }catch(error){
        if(!cancelled) setPollError(error.message);
      }
    };
    poll();
    const id=setInterval(poll,pollMs);
    return()=>{cancelled=true;clearInterval(id);};
  },[apiFn,pollMs]);

  return <div>
    {pollError&&<div className="error-box" style={{marginBottom:12}}>⚠ Live analytics polling: {pollError}</div>}
    <div className="card" style={{marginBottom:16}}>
      <div className="card-title" style={{marginBottom:12}}>Live Activity <span style={{color:'var(--text3)',fontWeight:400}}>— {pollMs/1000}s polling</span></div>
      <div className="last-upd" style={{marginBottom:8}}>
        MTProxy is direct + ME. WEB sessions/streams and WSS sockets are separate count series; bytes are intentionally not mixed onto this axis.
        {updated?' · updated '+updated:''}
      </div>
      <div style={{height:250,position:'relative'}}><canvas ref={activityCanvas}/></div>
    </div>
    <div className="card" style={{marginBottom:16}}>
      <div className="card-title" style={{marginBottom:12}}>Top Users — Live Activity</div>
      <div className="last-upd" style={{marginBottom:8}}>
        MTProxy connections and WEB sessions are shown as separate datasets. WEB session ownership is read from the bounded session API.
        {summary?' · WEB rows '+summary.sessionRows:''}
      </div>
      <div style={{height:210,position:'relative'}}><canvas ref={usersCanvas}/></div>
    </div>
  </div>;
}

export {fetchAllWebSessions};
