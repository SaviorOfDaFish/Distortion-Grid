import './styles.css';
import { initDiscord } from './discord.js';

const D={N:[-1,0],E:[0,1],S:[1,0],W:[0,-1]}, O={N:'S',E:'W',S:'N',W:'E'}, ORD=['N','E','S','W'];
let S={n:5,tiles:[],moves:0,start:null,done:false,finished:null,timer:null,num:1,min:1,key:'',isTest:false,difficulty:'Unstable',testIndex:0,crystalCount:1,branchAttempts:5,studyTimer:null,studyRemaining:15,studying:false,soundOn:true,lastPowered:new Set(),lastPoweredCrystals:new Set(),audioCtx:null,isDailyChampion:false,leaderboardSize:5,forcedDifficulty:'Auto',studySeconds:15,gaveUp:false};

function hash(s){let h=2166136261>>>0;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)}return h>>>0}
function rng(seed){return function(){let t=seed+=0x6D2B79F5;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296}}
function today(){let d=new Date();return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,'0')+"-"+String(d.getDate()).padStart(2,'0')}


function getAdminPassword(){
  return localStorage.getItem('dg_admin_password') || 'distortion123';
}
function loadAdminSettings(){
  try{
    const s=JSON.parse(localStorage.getItem('dg_admin_settings')||'{}');
    S.forcedDifficulty=s.forcedDifficulty||'Auto';
    S.studySeconds=Math.max(5,Math.min(60,Number(s.studySeconds||15)));
    S.leaderboardSize=Math.max(3,Math.min(10,Number(s.leaderboardSize||5)));
    if(typeof s.soundDefault==='boolean') S.soundOn=s.soundDefault;
  }catch{}
}
function saveAdminSettings(){
  const forced=document.getElementById('adminDifficulty').value;
  const study=Math.max(5,Math.min(60,Number(document.getElementById('adminStudySeconds').value||15)));
  const leaderboardSize=Math.max(3,Math.min(10,Number(document.getElementById('adminLeaderboardSize').value||5)));
  const soundDefault=document.getElementById('adminSoundDefault').checked;

  S.forcedDifficulty=forced;
  S.studySeconds=study;
  S.leaderboardSize=leaderboardSize;
  S.soundOn=soundDefault;

  localStorage.setItem('dg_admin_settings',JSON.stringify({
    forcedDifficulty:forced,
    studySeconds:study,
    leaderboardSize,
    soundDefault
  }));

  const newPw=document.getElementById('adminPasswordChange').value.trim();
  if(newPw){
    localStorage.setItem('dg_admin_password',newPw);
    document.getElementById('adminPasswordChange').value='';
  }

  const sb=document.getElementById('soundBtn');
  if(sb){
    sb.textContent=S.soundOn?'🔊':'🔇';
    sb.classList.toggle('sound-muted',!S.soundOn);
  }
}
function populateAdminPanel(){
  document.getElementById('adminDifficulty').value=S.forcedDifficulty||'Auto';
  document.getElementById('adminStudySeconds').value=S.studySeconds||15;
  document.getElementById('adminLeaderboardSize').value=S.leaderboardSize||5;
  document.getElementById('adminSoundDefault').checked=!!S.soundOn;
  document.getElementById('adminCurrentDifficulty').textContent=S.difficulty;
  document.getElementById('adminCurrentPar').textContent=S.min;
  document.getElementById('adminCurrentGrid').textContent=`${S.n}×${S.n}`;
}
function adminMessage(msg){
  const el=document.getElementById('adminStatus');
  el.textContent=msg;
  setTimeout(()=>{if(el.textContent===msg)el.textContent=''},2600);
}

const DIFFICULTIES = ['Stable','Unstable','Fractured','Cataclysm'];

const DIFF_CONFIG = {
  Stable: {
    size: 4,
    crystals: 1,
    branches: 2,
    label: 'STABLE'
  },
  Unstable: {
    size: 5,
    crystals: 1,
    branches: 5,
    label: 'UNSTABLE'
  },
  Fractured: {
    size: 6,
    crystals: 2,
    branches: 8,
    label: 'FRACTURED'
  },
  Cataclysm: {
    size: 7,
    crystals: 3,
    branches: 12,
    label: 'CATACLYSM'
  }
};

function isoWeekKey(date=new Date()){
  const d=new Date(Date.UTC(date.getFullYear(),date.getMonth(),date.getDate()));
  const day=d.getUTCDay()||7;
  d.setUTCDate(d.getUTCDate()+4-day);
  const yearStart=new Date(Date.UTC(d.getUTCFullYear(),0,1));
  const week=Math.ceil((((d-yearStart)/86400000)+1)/7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2,'0')}`;
}

function seededShuffle(arr, seed){
  const r=rng(seed), out=[...arr];
  for(let i=out.length-1;i>0;i--){
    const j=Math.floor(r()*(i+1));
    [out[i],out[j]]=[out[j],out[i]];
  }
  return out;
}

function weightedBonusDifficulty(r){
  const x=r();
  if(x<0.35) return 'Stable';
  if(x<0.70) return 'Unstable';
  if(x<0.92) return 'Fractured';
  return 'Cataclysm';
}

function weeklyDifficultyPlan(date=new Date()){
  const wk=isoWeekKey(date);
  const seed=hash('DG-WEEK-'+wk);
  const r=rng(seed);
  const bag=['Stable','Unstable','Fractured','Cataclysm'];
  for(let i=0;i<3;i++) bag.push(weightedBonusDifficulty(r));
  return seededShuffle(bag, seed ^ 0x9e3779b9);
}

function getDailyDifficulty(date=new Date()){
  const plan=weeklyDifficultyPlan(date);
  // Monday = 0 ... Sunday = 6
  const jsDay=date.getDay(); 
  const mondayIndex=(jsDay+6)%7;
  return plan[mondayIndex];
}

function applyDifficulty(name){
  S.difficulty=name;
  const cfg=DIFF_CONFIG[name];
  S.n=cfg.size;
  S.crystalCount=cfg.crystals;
  S.branchAttempts=cfg.branches;

  const badge=document.getElementById('difficultyBadge');
  if(badge){
    badge.textContent=cfg.label;
    badge.className='badge diff-'+name.toLowerCase();
  }

  const board=document.getElementById('board');
  if(board){
    board.style.gridTemplateColumns=`repeat(${cfg.size},1fr)`;
  }
  document.body.classList.remove('theme-stable','theme-unstable','theme-fractured','theme-cataclysm');
  document.body.classList.add('theme-'+name.toLowerCase());
}

function rotate(ds,k){return ds.map(d=>ORD[(ORD.indexOf(d)+k)%4])}
function dirs(t){return rotate(t.base,t.rot)}

function normalizeDirs(ds){
  return [...ds].sort((a,b)=>ORD.indexOf(a)-ORD.indexOf(b));
}

function sameDirs(a,b){
  const aa=normalizeDirs(a), bb=normalizeDirs(b);
  return aa.length===bb.length && aa.every((v,i)=>v===bb[i]);
}

function clockwiseDistanceToSolved(t){
  const current=dirs(t);
  for(let steps=0;steps<4;steps++){
    if(sameDirs(rotate(current,steps),t.base)) return steps;
  }
  return 0;
}

function gen(seed){
  const R=rng(seed), n=S.n;

  // Every tile is part of one connected spanning-tree network.
  // This removes "throwaway" tiles and makes the entire board matter.
  const T=Array.from({length:n},(_,r)=>Array.from({length:n},(_,c)=>({
    r,c,base:[],rot:0,kind:'normal',on:false,required:true
  })));

  function con(a,b){
    const dr=b.r-a.r,dc=b.c-a.c;
    const d=dr===-1?'N':dr===1?'S':dc===1?'E':'W';
    if(!T[a.r][a.c].base.includes(d)) T[a.r][a.c].base.push(d);
    if(!T[b.r][b.c].base.includes(O[d])) T[b.r][b.c].base.push(O[d]);
  }

  // Randomized DFS creates a full-grid maze/tree with no unused tiles.
  const root={r:Math.floor(R()*n),c:0};
  const stack=[root];
  const seen=new Set([`${root.r},${root.c}`]);
  const visitOrder=[root];

  while(stack.length){
    const cur=stack[stack.length-1];
    let candidates=ORD.map(d=>{
      const [dr,dc]=D[d];
      return {r:cur.r+dr,c:cur.c+dc,d};
    }).filter(p=>p.r>=0&&p.r<n&&p.c>=0&&p.c<n&&!seen.has(`${p.r},${p.c}`));

    if(!candidates.length){
      stack.pop();
      continue;
    }

    // Light directional bias varies by difficulty but remains seeded/random.
    candidates=candidates.sort(()=>R()-.5);
    const next=candidates[Math.floor(R()*candidates.length)];
    con(cur,next);
    seen.add(`${next.r},${next.c}`);
    visitOrder.push({r:next.r,c:next.c});
    stack.push({r:next.r,c:next.c});
  }

  // Core begins on the left side. Goal is a distant tile, preferably right side.
  const leftTiles=visitOrder.filter(p=>p.c===0);
  const start=leftTiles[Math.floor(R()*leftTiles.length)] || root;

  let farthest=visitOrder[0], farScore=-1;
  for(const p of visitOrder){
    const score=Math.abs(p.r-start.r)+Math.abs(p.c-start.c)+(p.c===n-1? n:0);
    if(score>farScore){farScore=score;farthest=p;}
  }
  const end=farthest;

  T[start.r][start.c].kind='core';
  T[end.r][end.c].kind='exit';

  // Pick crystals spread across the traversal so harder modes require more checkpoints.
  const crystalCandidates=visitOrder.filter(p=>!(p.r===start.r&&p.c===start.c)&&!(p.r===end.r&&p.c===end.c));
  for(let i=1;i<=S.crystalCount;i++){
    const idx=Math.max(0,Math.min(crystalCandidates.length-1,Math.floor(crystalCandidates.length*(i/(S.crystalCount+1)))));
    let cp=crystalCandidates[idx];
    if(cp && T[cp.r][cp.c].kind==='normal') T[cp.r][cp.c].kind='crystal';
  }

  // Difficulty-based minimum scramble. We regenerate rotations until the board
  // has enough required moves to avoid trivially easy daily puzzles.
  const minParByDifficulty={Stable:10,Unstable:18,Fractured:30,Cataclysm:45};
  const targetPar=minParByDifficulty[S.difficulty]||18;

  let bestPar=0;
  let bestRots=null;
  for(let attempt=0;attempt<80;attempt++){
    let par=0;
    const rots=[];
    for(let r=0;r<n;r++){
      rots[r]=[];
      for(let c=0;c<n;c++){
        const t=T[r][c];
        // Do not intentionally leave a tile solved unless randomness forces it;
        // harder difficulties favor 1-3 quarter-turn offsets.
        let rot;
        if(S.difficulty==='Stable') rot=Math.floor(R()*4);
        else rot=1+Math.floor(R()*3);
        t.rot=rot;
        rots[r][c]=rot;
        par+=clockwiseDistanceToSolved(t);
      }
    }
    if(par>bestPar){bestPar=par;bestRots=rots.map(row=>[...row]);}
    if(par>=targetPar) break;
  }

  if(bestRots){
    for(let r=0;r<n;r++)for(let c=0;c<n;c++) T[r][c].rot=bestRots[r][c];
  }

  let exactPar=0;
  for(const t of T.flat()) exactPar+=clockwiseDistanceToSolved(t);

  S.tiles=T;
  S.min=Math.max(1,exactPar);
}

function tileEl(t){
  let b=document.createElement('button');b.className='tile '+t.kind;b.dataset.r=t.r;b.dataset.c=t.c;
  let ds=dirs(t);
  ds.forEach(d=>{
    let s=document.createElement('div');s.className='seg '+((d==='N'||d==='S')?'v':'h');
    if(d==='N'){s.style.bottom='50%';s.style.top='0'}
    if(d==='S'){s.style.top='50%';s.style.bottom='0'}
    if(d==='W'){s.style.right='50%';s.style.left='0'}
    if(d==='E'){s.style.left='50%';s.style.right='0'}
    b.appendChild(s)
  });
  let n=document.createElement('div');n.className='node';b.appendChild(n);
  if(['core','exit','crystal'].includes(t.kind)){
    let i=document.createElement('div');i.className='icon';i.textContent=t.kind==='core'?'✦':t.kind==='exit'?'◈':'◆';b.appendChild(i)
  }
  b.onclick=()=>turn(t.r,t.c);return b
}

function render(){
  let board=document.getElementById('board');board.innerHTML='';
  S.tiles.flat().forEach(t=>board.appendChild(tileEl(t)));
  flow();document.getElementById('moves').textContent=S.moves
}


function ensureAudio(){
  if(!S.soundOn) return null;
  try{
    if(!S.audioCtx){
      S.audioCtx=new (window.AudioContext||window.webkitAudioContext)();
    }
    if(S.audioCtx.state==='suspended') S.audioCtx.resume();
    return S.audioCtx;
  }catch(e){return null}
}

function zapSound(strength=1){
  const ctx=ensureAudio();
  if(!ctx) return;

  const now=ctx.currentTime;
  const osc=ctx.createOscillator();
  const gain=ctx.createGain();
  const filter=ctx.createBiquadFilter();

  osc.type='sawtooth';
  osc.frequency.setValueAtTime(720 + Math.random()*180, now);
  osc.frequency.exponentialRampToValueAtTime(180 + Math.random()*60, now+0.085);

  filter.type='bandpass';
  filter.frequency.setValueAtTime(1300, now);
  filter.Q.setValueAtTime(1.7, now);

  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.055*strength, now+0.006);
  gain.gain.exponentialRampToValueAtTime(0.0001, now+0.09);

  osc.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);

  osc.start(now);
  osc.stop(now+0.1);
}

function overloadSound(){
  const ctx=ensureAudio();
  if(!ctx) return;

  const now=ctx.currentTime;

  // Low electric surge
  const low=ctx.createOscillator();
  const lowGain=ctx.createGain();
  low.type='sawtooth';
  low.frequency.setValueAtTime(110,now);
  low.frequency.exponentialRampToValueAtTime(48,now+0.55);
  lowGain.gain.setValueAtTime(0.0001,now);
  lowGain.gain.exponentialRampToValueAtTime(0.11,now+0.025);
  lowGain.gain.exponentialRampToValueAtTime(0.0001,now+0.65);
  low.connect(lowGain);
  lowGain.connect(ctx.destination);
  low.start(now);
  low.stop(now+0.7);

  // High crackle burst
  const buffer=ctx.createBuffer(1,ctx.sampleRate*0.45,ctx.sampleRate);
  const data=buffer.getChannelData(0);
  for(let i=0;i<data.length;i++){
    const decay=1-i/data.length;
    data[i]=(Math.random()*2-1)*decay*decay;
  }
  const noise=ctx.createBufferSource();
  noise.buffer=buffer;
  const bp=ctx.createBiquadFilter();
  bp.type='bandpass';
  bp.frequency.setValueAtTime(1700,now);
  bp.Q.setValueAtTime(0.9,now);
  const ng=ctx.createGain();
  ng.gain.setValueAtTime(0.0001,now);
  ng.gain.exponentialRampToValueAtTime(0.13,now+0.015);
  ng.gain.exponentialRampToValueAtTime(0.0001,now+0.42);
  noise.connect(bp);
  bp.connect(ng);
  ng.connect(ctx.destination);
  noise.start(now);
}

function poweredKey(t){return t.r+','+t.c}

function flow(){
  S.tiles.flat().forEach(t=>t.on=false);
  let core=S.tiles.flat().find(t=>t.kind==='core'), q=[core];core.on=true;
  while(q.length){
    let t=q.shift();
    for(let d of dirs(t)){
      let[dr,dc]=D[d],r=t.r+dr,c=t.c+dc;if(r<0||r>=S.n||c<0||c>=S.n)continue;
      let nt=S.tiles[r][c];if(!dirs(nt).includes(O[d]))continue;
      if(!nt.on){nt.on=true;q.push(nt)}
    }
  }
  const poweredNow=new Set(S.tiles.flat().filter(t=>t.on).map(poweredKey));
  const poweredCrystals=new Set(S.tiles.flat().filter(t=>t.on&&t.kind==='crystal').map(poweredKey));
  const newlyPoweredCrystals=[...poweredCrystals].filter(k=>!S.lastPoweredCrystals.has(k));

  if(!S.studying && S.start && S.soundOn){
    const newlyPowered=[...poweredNow].filter(k=>!S.lastPowered.has(k));
    newlyPowered.slice(0,8).forEach((k,i)=>setTimeout(()=>zapSound(0.75),i*24));
  }

  S.lastPowered=poweredNow;
  S.lastPoweredCrystals=poweredCrystals;

  document.querySelectorAll('.tile').forEach(el=>{
    let t=S.tiles[+el.dataset.r][+el.dataset.c];
    if(t.on){
      el.style.boxShadow='0 0 20px var(--energyA) inset,0 0 10px var(--accentGlow)';
      el.querySelectorAll('.seg').forEach(x=>x.classList.add('on'));
      el.querySelector('.node').classList.add('on');
    }
    if(newlyPoweredCrystals.includes(poweredKey(t))){
      el.classList.remove('crystal-pulse');
      void el.offsetWidth;
      el.classList.add('crystal-pulse');
      setTimeout(()=>el.classList.remove('crystal-pulse'),700);
    }
  })
}


function startStudyPhase(){
  clearInterval(S.studyTimer);
  clearInterval(S.timer);
  S.start=null;
  S.studyRemaining=S.studySeconds||15;
  S.studying=true;

  const board=document.getElementById('board');
  const overlay=document.getElementById('studyOverlay');
  const countdown=document.getElementById('studyCountdown');
  const phase=document.getElementById('phaseBanner');

  if(board) board.classList.add('studying');
  if(overlay) overlay.classList.remove('hidden');
  if(countdown) countdown.textContent=S.studyRemaining;
  if(phase){
    phase.textContent='Study '+S.studyRemaining+'s';
    phase.classList.remove('live');
  }

  document.getElementById('time').textContent='0:00';

  S.studyTimer=setInterval(()=>{
    S.studyRemaining--;
    if(countdown) countdown.textContent=Math.max(0,S.studyRemaining);
    if(phase) phase.textContent='Study '+Math.max(0,S.studyRemaining)+'s';

    if(S.studyRemaining<=0){
      clearInterval(S.studyTimer);
      S.studying=false;
      if(board) board.classList.remove('studying');
      if(overlay) overlay.classList.add('hidden');
      if(phase){
        phase.textContent='Live';
        phase.classList.add('live');
      }
      startClock();
    }
  },1000);
}

function startClock(){
  if(S.studying||S.start)return;S.start=Date.now();S.timer=setInterval(clock,250)
}
function clock(){
  if(!S.start)return;let ms=(S.done?S.finished:Date.now())-S.start,sec=Math.floor(ms/1000);
  document.getElementById('time').textContent=Math.floor(sec/60)+":"+String(sec%60).padStart(2,'0')
}
function solved(){
  flow();
  const all=S.tiles.flat();
  const e=all.find(t=>t.kind==='exit');
  const crystals=all.filter(t=>t.kind==='crystal');

  // A valid solve powers the entire board, every crystal, and the goal.
  // This prevents players from ignoring most of the grid.
  const allPowered=all.every(t=>t.on);
  return allPowered && e?.on && crystals.every(c=>c.on);
}
function turn(r,c){if(S.done||S.studying)return;startClock();let t=S.tiles[r][c];t.rot=(t.rot+1)%4;S.moves++;render();if(solved())finish()}
function stars(){let x=S.moves/S.min;return x<=1.15?'⭐⭐⭐':x<=1.6?'⭐⭐':'⭐'}
function text(){
  return `🌌 DISTORTION GRID #${String(S.num).padStart(3,'0')}
${S.isDailyChampion?'👑 NEW DAILY CHAMPION':'✅ Stabilized'}
🔄 ${S.moves} moves (Par ${S.min})
⏱️ ${document.getElementById('time').textContent}
${stars()}

🟪🟪🟪🟪🟪
🟪✨✨✨🟪
🟪✨🌌✨🟪
🟪✨✨✨🟪
🟪🟪🟪🟪🟪

🔥 Daily Distortion complete!`
}

function secondsTaken(){
  if(!S.start) return 0;
  return Math.max(0,Math.floor(((S.done?S.finished:Date.now())-S.start)/1000))
}
function formatSec(sec){return Math.floor(sec/60)+":"+String(sec%60).padStart(2,'0')}

function leaderboardStorageKey(){return 'dg_top5_'+S.key}
function historyStorageKey(){return 'dg_history'}
function getLeaderboard(){
  try{return JSON.parse(localStorage.getItem(leaderboardStorageKey())||'[]')}catch{return []}
}
function saveLeaderboard(rows){
  localStorage.setItem(leaderboardStorageKey(),JSON.stringify(rows.slice(0,S.leaderboardSize||5)))
}
function addLeaderboardResult(name,moves,seconds){
  let rows=getLeaderboard();
  rows.push({name,moves,seconds});
  rows.sort((a,b)=>a.moves-b.moves || a.seconds-b.seconds);
  saveLeaderboard(rows);
  return rows;
}
function renderTop5(){
  const list=document.getElementById('top5List');
  const rows=getLeaderboard();
  list.innerHTML='';
  if(!rows.length){
    list.innerHTML='<div class="personal-note">No official results yet today.</div>';
    return;
  }
  rows.slice(0,S.leaderboardSize||5).forEach((r,i)=>{
    const el=document.createElement('div');
    el.className='top5-row';
    el.innerHTML=`<div class="top5-rank">${i===0?'🥇':i===1?'🥈':i===2?'🥉':String(i+1)}</div>
      <div class="top5-name">${r.name}</div>
      <div class="top5-score">${r.moves} moves</div>
      <div class="top5-time">${formatSec(r.seconds)}</div>`;
    list.appendChild(el);
  });
}
function getHistory(){
  try{return JSON.parse(localStorage.getItem(historyStorageKey())||'[]')}catch{return []}
}
function addHistory(entry){
  const h=getHistory();
  h.push(entry);
  while(h.length>100) h.shift();
  localStorage.setItem(historyStorageKey(),JSON.stringify(h));
  return h;
}
function personalSummary(moves,seconds){
  const before=getHistory();
  if(!before.length) return '✨ First official solve recorded!';
  const avg=before.reduce((s,x)=>s+x.moves,0)/before.length;
  const diff=Math.round((avg-moves)*10)/10;
  const weekAgo=Date.now()-7*86400000;
  const recent=before.filter(x=>x.ts>=weekAgo);
  const fastest=recent.length?Math.min(...recent.map(x=>x.seconds)):null;

  let parts=[];
  if(diff>0) parts.push(`${diff} moves better than your average`);
  else if(diff<0) parts.push(`${Math.abs(diff)} moves above your average`);
  else parts.push('right on your average moves');

  if(fastest===null || seconds<fastest) parts.push('🏆 Fastest solve this week!');
  return parts.join(' • ');
}

function recordStorageKey(){return 'dg_record_'+S.key}
function getRecord(){
  try{return JSON.parse(localStorage.getItem(recordStorageKey())||'null')}catch{return null}
}
function beatsRecord(moves,seconds,rec){
  return !rec || moves<rec.moves || (moves===rec.moves && seconds<rec.seconds)
}

function updateTestButton(){
  const btn=document.getElementById('new');
  if(!btn) return;
  const next=DIFFICULTIES[(S.testIndex+1)%DIFFICULTIES.length];
  btn.textContent='Test: '+next;
}

function updateRecordPanel(){
  let rec=getRecord(), empty=document.getElementById('recordEmpty'), data=document.getElementById('recordData');
  if(!rec){empty.classList.remove('hidden');data.classList.add('hidden');return}
  empty.classList.add('hidden');data.classList.remove('hidden');
  document.getElementById('recordName').textContent=rec.name;
  document.getElementById('recordMoves').textContent=rec.moves;
  document.getElementById('recordTime').textContent=formatSec(rec.seconds);
}

function incompleteStorageKey(){return 'dg_incomplete_'+S.key}\n\nfunction revealParPath(){\n  // rot=0 is the generator's solved orientation for every tile.\n  S.tiles.flat().forEach(t=>t.rot=0);\n  render();\n  const board=document.getElementById('board');\n  board?.classList.add('par-revealed');\n}\n\nfunction giveUp(){\n  if(S.done || S.gaveUp) return;\n\n  const ok=window.confirm(\n    'Give up on today\\'s Distortion?\\n\\nYour attempt will be marked Incomplete and the Par solution will be revealed.'\n  );\n  if(!ok) return;\n\n  clearInterval(S.timer);\n  clearInterval(S.studyTimer);\n\n  S.gaveUp=true;\n  S.done=true;\n  S.finished=Date.now();\n  S.studying=false;\n\n  document.getElementById('studyOverlay')?.classList.add('hidden');\n  document.getElementById('board')?.classList.remove('studying');\n\n  const phase=document.getElementById('phaseBanner');\n  if(phase){\n    phase.textContent='Incomplete';\n    phase.classList.remove('live');\n    phase.classList.add('incomplete');\n  }\n\n  // Preserve the time/moves they had when they surrendered.\n  const elapsed=secondsTaken();\n  if(!S.isTest){\n    localStorage.setItem(incompleteStorageKey(),JSON.stringify({\n      status:'incomplete',\n      moves:S.moves,\n      seconds:elapsed,\n      par:S.min,\n      difficulty:S.difficulty,\n      gridNumber:S.num,\n      gaveUpAt:Date.now()\n    }));\n  }\n\n  revealParPath();\n\n  document.getElementById('gMoves').textContent=S.moves;\n  document.getElementById('gPar').textContent=S.min;\n  document.getElementById('gTime').textContent=formatSec(elapsed);\n  document.getElementById('giveUpResult').classList.remove('hidden');\n}\n\nfunction finish(){
  S.done=true;S.finished=Date.now();clearInterval(S.timer);clock();
  if(S.soundOn) overloadSound();

  const sec=secondsTaken();
  const name=(document.getElementById('playerName').value||'Player').trim().slice(0,32)||'Player';
  const previous=getRecord();
  const isRecord=beatsRecord(S.moves,sec,previous);

  // Personal performance summary uses prior solves, then stores this solve.
  const summary=personalSummary(S.moves,sec);
  addHistory({ts:Date.now(),moves:S.moves,seconds:sec,difficulty:S.difficulty});

  // Local prototype leaderboard. Real Activity will use the shared backend.
  const rows=addLeaderboardResult(name,S.moves,sec);
  S.isDailyChampion=rows.length>0 && rows[0].name===name && rows[0].moves===S.moves && rows[0].seconds===sec;

  if(isRecord){
    localStorage.setItem(recordStorageKey(),JSON.stringify({name,moves:S.moves,seconds:sec}));
  }
  updateRecordPanel();

  // Full-board completion effect.
  const board=document.getElementById('board');
  board.querySelectorAll('.tile').forEach(el=>{
    const t=S.tiles[+el.dataset.r][+el.dataset.c];
    if(t.on) el.classList.add('on-complete');
  });
  board.classList.add('complete-surge');
  const wave=document.getElementById('collapseWave');
  wave.classList.remove('go'); void wave.offsetWidth; wave.classList.add('go');

  document.getElementById('rMoves').textContent=S.moves;
  document.getElementById('rPar').textContent=S.min;
  document.getElementById('rTime').textContent=document.getElementById('time').textContent;
  document.getElementById('rStars').textContent=stars();
  document.getElementById('newRecord').classList.toggle('hidden',!S.isDailyChampion);

  const personal=document.getElementById('personalNote');
  personal.textContent=summary;
  personal.classList.remove('hidden');

  document.getElementById('shareText').textContent=text();

  setTimeout(()=>{
    document.getElementById('result').classList.remove('hidden');
    board.classList.remove('complete-surge');
    board.querySelectorAll('.tile').forEach(el=>el.classList.remove('on-complete'));
  },900);

  let st=(+localStorage.getItem('dg_streak')||0)+1;
  localStorage.setItem('dg_streak',st);
  document.getElementById('streak').textContent='🔥 '+st
}
function reset(test=false){
  clearInterval(S.timer);
  clearInterval(S.studyTimer);
  S.moves=0;S.start=null;S.done=false;S.finished=null;S.isTest=test;S.lastPowered=new Set();S.lastPoweredCrystals=new Set();S.isDailyChampion=false;S.gaveUp=false;

  if(test){
    S.testIndex=(S.testIndex+1)%DIFFICULTIES.length;
    const diff=DIFFICULTIES[S.testIndex];
    applyDifficulty(diff);
    S.key=today()+"-test-"+diff+"-"+Date.now();
  }else{
    const diff=(S.forcedDifficulty && S.forcedDifficulty!=='Auto')
      ? S.forcedDifficulty
      : getDailyDifficulty(new Date());
    applyDifficulty(diff);
    S.key=today();
  }

  let seed=hash(S.key);
  S.num=seed%999+1;
  gen(seed);

  document.getElementById('gridNum').textContent='Grid #'+String(S.num).padStart(3,'0');
  document.getElementById('moves').textContent='0';
  document.getElementById('par').textContent=S.min;
  document.getElementById('time').textContent='0:00';
  document.getElementById('result').classList.add('hidden');
  document.getElementById('giveUpResult')?.classList.add('hidden');
  document.getElementById('board')?.classList.remove('par-revealed');
  const nr=document.getElementById('newRecord'); if(nr) nr.classList.add('hidden'); const pn=document.getElementById('personalNote'); if(pn) pn.classList.add('hidden');
  const st=document.getElementById('status'); if(st) st.textContent='';
  updateRecordPanel();
  updateTestButton();
  render();
  const seenTutorial=localStorage.getItem('dg_tutorial_seen_v1')==='1';
  if(!seenTutorial && !test){
    clearInterval(S.studyTimer);
    S.studying=true;
    document.getElementById('studyOverlay')?.classList.add('hidden');
    document.getElementById('tutorialModal').classList.remove('hidden');
  }else{
    startStudyPhase();
  }
}



document.getElementById('tutorialStart').onclick=()=>{
  localStorage.setItem('dg_tutorial_seen_v1','1');
  document.getElementById('tutorialModal').classList.add('hidden');
  startStudyPhase();
};


loadAdminSettings();

document.getElementById('adminBtn').onclick=()=>{
  document.getElementById('adminPasswordInput').value='';
  document.getElementById('adminLoginStatus').textContent='';
  document.getElementById('adminLoginModal').classList.remove('hidden');
  setTimeout(()=>document.getElementById('adminPasswordInput').focus(),50);
};
document.getElementById('adminLoginCancel').onclick=()=>document.getElementById('adminLoginModal').classList.add('hidden');
document.getElementById('adminLoginBtn').onclick=()=>{
  const entered=document.getElementById('adminPasswordInput').value;
  if(entered===getAdminPassword()){
    document.getElementById('adminLoginModal').classList.add('hidden');
    populateAdminPanel();
    document.getElementById('adminPanelModal').classList.remove('hidden');
  }else{
    document.getElementById('adminLoginStatus').textContent='Incorrect password.';
  }
};
document.getElementById('adminPasswordInput').addEventListener('keydown',e=>{
  if(e.key==='Enter') document.getElementById('adminLoginBtn').click();
});
document.getElementById('adminClose').onclick=()=>document.getElementById('adminPanelModal').classList.add('hidden');

document.getElementById('adminSaveSettings').onclick=()=>{
  saveAdminSettings();
  populateAdminPanel();
  adminMessage('Settings saved. Daily difficulty will apply on the next reset/load.');
};

document.getElementById('adminRegenerate').onclick=()=>{
  saveAdminSettings();
  document.getElementById('adminPanelModal').classList.add('hidden');
  reset(true);
};

document.getElementById('adminResetLeaderboard').onclick=()=>{
  localStorage.removeItem(leaderboardStorageKey());
  localStorage.removeItem(recordStorageKey());
  updateRecordPanel();
  renderTop5();
  adminMessage('Today’s leaderboard has been reset.');
};

document.getElementById('adminResetTutorial').onclick=()=>{
  localStorage.removeItem('dg_tutorial_seen_v1');
  adminMessage('First-play tutorial reset.');
};

document.getElementById('adminResetStreak').onclick=()=>{
  localStorage.setItem('dg_streak','0');
  document.getElementById('streak').textContent='🔥 0';
  adminMessage('Player streak reset on this browser.');
};

document.getElementById('adminClearHistory').onclick=()=>{
  localStorage.removeItem(historyStorageKey());
  adminMessage('Personal performance history cleared.');
};

const soundBtn=document.getElementById('soundBtn');
if(soundBtn){
  soundBtn.onclick=()=>{
    S.soundOn=!S.soundOn;
    soundBtn.textContent=S.soundOn?'🔊':'🔇';
    soundBtn.classList.toggle('sound-muted',!S.soundOn);
    if(S.soundOn) ensureAudio();
  };
}


document.getElementById('championCard').onclick=()=>{
  renderTop5();
  document.getElementById('top5Modal').classList.remove('hidden');
};
document.getElementById('closeTop5').onclick=()=>document.getElementById('top5Modal').classList.add('hidden');
document.getElementById('top5Modal').addEventListener('click',e=>{if(e.target.id==='top5Modal')document.getElementById('top5Modal').classList.add('hidden')});

document.getElementById('infoBtn').onclick=()=>document.getElementById('infoModal').classList.remove('hidden');
document.getElementById('closeInfo').onclick=()=>document.getElementById('infoModal').classList.add('hidden');
document.getElementById('infoModal').addEventListener('click',e=>{if(e.target.id==='infoModal')document.getElementById('infoModal').classList.add('hidden')});

document.getElementById('giveUp').onclick=giveUp;
document.getElementById('closeGiveUp').onclick=()=>document.getElementById('giveUpResult').classList.add('hidden');
reset(false);
updateTestButton();
document.getElementById('new').onclick=()=>reset(true);
document.getElementById('close').onclick=()=>document.getElementById('result').classList.add('hidden');
document.getElementById('copy').onclick=async()=>{try{await navigator.clipboard.writeText(text());document.getElementById('status').textContent='Copied! Paste it into Discord.'}catch{document.getElementById('status').textContent='Copy blocked by this browser.'}};
document.getElementById('share').onclick=async()=>{try{if(navigator.share){await navigator.share({title:'Distortion Grid',text:text()});document.getElementById('status').textContent='Shared!'}else{await navigator.clipboard.writeText(text());document.getElementById('status').textContent='Share sheet unavailable — copied instead.'}}catch{}};
window.addEventListener('keydown',e=>{if(e.key.toLowerCase()==='s'){
  clearInterval(S.studyTimer);
  S.studying=false;
  document.getElementById('studyOverlay')?.classList.add('hidden');
  document.getElementById('board')?.classList.remove('studying');
  S.tiles.flat().forEach(t=>t.rot=0);
  render();
  if(!S.done){
    if(!S.start){S.start=Date.now();S.finished=S.start}
    finish()
  }
}});
document.getElementById('streak').textContent='🔥 '+(localStorage.getItem('dg_streak')||0);
reset(false);

// Initialize Discord Activity context when running inside Discord.
initDiscord().catch(err => console.warn('Discord SDK init:', err));
