import './styles.css';
import { initDiscord, getDiscordAuth, getDiscordAuthStatus } from './discord.js';

const D={N:[-1,0],E:[0,1],S:[1,0],W:[0,-1]}, O={N:'S',E:'W',S:'N',W:'E'}, ORD=['N','E','S','W'];
let S={n:5,tiles:[],moves:0,start:null,done:false,finished:null,timer:null,num:1,min:1,perfectMin:1,key:'',isTest:false,difficulty:'Unstable',testIndex:0,crystalCount:1,branchAttempts:5,studyTimer:null,studyRemaining:15,studying:false,soundOn:true,lastPowered:new Set(),lastPoweredCrystals:new Set(),audioCtx:null,isDailyChampion:false,leaderboardSize:5,forcedDifficulty:'Auto',studySeconds:15,gaveUp:false,activeLockerCategory:'trail'};

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
  updateTestModeUI();
}
function adminMessage(msg){
  const el=document.getElementById('adminStatus');
  el.textContent=msg;
  setTimeout(()=>{if(el.textContent===msg)el.textContent=''},2600);
}


function isAdminTestMode(){
  return localStorage.getItem('dg_admin_test_mode')==='1';
}

function parAllowance(){
  return {
    Stable:2,
    Unstable:3,
    Fractured:4,
    Cataclysm:5
  }[S.difficulty] || 3;
}

function golfScore(moves=S.moves){
  if(moves===S.perfectMin){
    return {
      key:'ace',
      label:'🎯 HOLE-IN-ONE!',
      short:'HOLE-IN-ONE',
      detail:'Perfect Route'
    };
  }

  const delta=moves-S.min;

  if(delta<=-3) return {key:'albatross',label:'🪽 ALBATROSS',short:'Albatross',detail:`${Math.abs(delta)} under Par`};
  if(delta===-2) return {key:'eagle',label:'🦅 EAGLE',short:'Eagle',detail:'2 under Par'};
  if(delta===-1) return {key:'birdie',label:'🐦 BIRDIE',short:'Birdie',detail:'1 under Par'};
  if(delta===0) return {key:'par',label:'⛳ PAR',short:'Par',detail:'Exactly Par'};
  if(delta===1) return {key:'bogey',label:'Bogey',short:'Bogey',detail:'1 over Par'};
  if(delta===2) return {key:'double-bogey',label:'Double Bogey',short:'Double Bogey',detail:'2 over Par'};
  if(delta===3) return {key:'triple-bogey',label:'Triple Bogey',short:'Triple Bogey',detail:'3 over Par'};
  return {key:'over-par',label:`+${delta} OVER PAR`,short:`+${delta}`,detail:`${delta} over Par`};
}

function officialPlayerId(){
  return getDiscordAuth()?.user?.id || 'browser';
}

function dailyAttemptStorageKey(playerId=officialPlayerId()){
  return `dg_daily_attempt_${today()}_${playerId}`;
}

function getDailyAttempt(){
  try{
    return JSON.parse(localStorage.getItem(dailyAttemptStorageKey())||'null');
  }catch{
    return null;
  }
}

function saveDailyAttempt(attempt){
  if(S.isTest || isAdminTestMode()) return;
  localStorage.setItem(
    dailyAttemptStorageKey(),
    JSON.stringify({
      date:today(),
      playerId:officialPlayerId(),
      ...attempt
    })
  );
}

function migrateBrowserDailyAttempt(){
  const userId=getDiscordAuth()?.user?.id;
  if(!userId) return;

  const browserKey=`dg_daily_attempt_${today()}_browser`;
  const userKey=`dg_daily_attempt_${today()}_${userId}`;

  if(!localStorage.getItem(userKey) && localStorage.getItem(browserKey)){
    localStorage.setItem(userKey,localStorage.getItem(browserKey));
  }

  localStorage.removeItem(browserKey);
}

function showDailyLock(attempt){
  if(!attempt || isAdminTestMode()) return false;

  clearInterval(S.timer);
  clearInterval(S.studyTimer);
  S.done=true;
  S.studying=false;

  const title=document.getElementById('dailyLockedTitle');
  const copy=document.getElementById('dailyLockedCopy');
  const stats=document.getElementById('dailyLockedStats');

  if(attempt.status==='incomplete'){
    title.textContent='Daily Attempt Incomplete';
    copy.textContent='You gave up on today’s official Distortion Grid. Come back tomorrow for a new grid.';
  }else{
    title.textContent='Daily Attempt Complete';
    copy.textContent='Your official Distortion Grid result for today has already been recorded.';
  }

  if(stats){
    const pieces=[];
    if(Number.isFinite(attempt.moves)) pieces.push(`${attempt.moves} moves`);
    if(Number.isFinite(attempt.par)) pieces.push(`Par ${attempt.par}`);
    if(Number.isFinite(attempt.seconds)) pieces.push(formatSec(attempt.seconds));
    if(attempt.scoreLabel) pieces.push(attempt.scoreLabel);
    stats.textContent=pieces.join(' • ') || 'Today’s attempt is locked.';
  }

  document.getElementById('dailyLockedModal')?.classList.remove('hidden');
  document.getElementById('giveUp')?.setAttribute('disabled','disabled');
  return true;
}

function enforceDailyAttemptLock(){
  if(S.isTest || isAdminTestMode()) return false;
  migrateBrowserDailyAttempt();
  const attempt=getDailyAttempt();
  return attempt ? showDailyLock(attempt) : false;
}

function updateTestModeUI(){
  const enabled=isAdminTestMode();
  const btn=document.getElementById('new');
  const adminBtn=document.getElementById('adminToggleTestMode');

  if(btn){
    btn.style.display=enabled?'':'none';
    btn.disabled=!enabled;
  }

  if(adminBtn){
    adminBtn.textContent=enabled?'Disable Test Mode':'Enable Test Mode';
    adminBtn.classList.toggle('admin-danger',enabled);
  }
}


const COSMETIC_STORAGE_KEY='dg_cosmetics_v1';
const COSMETIC_STATS_KEY='dg_cosmetic_stats_v1';

const COSMETIC_CATEGORIES=[
  ['trail','Energy Trails'],
  ['frame','Board Frames'],
  ['effect','Completion Effects']
];

const COSMETICS={
  trail:[
    {id:'default',name:'Distortion Current',rarity:'Common',desc:'The standard difficulty-colored energy trail.',req:()=>true,requirement:'Unlocked by default.'},
    {id:'void',name:'Void Current',rarity:'Rare',desc:'Deep violet energy with a cold blue edge.',req:s=>s.unstableClears>=3,requirement:'Complete 3 Unstable grids.'},
    {id:'solar',name:'Solar Flare',rarity:'Epic',desc:'Hot orange energy fading into brilliant gold.',req:s=>s.fracturedClears>=3,requirement:'Complete 3 Fractured grids.'},
    {id:'cataclysm',name:'Cataclysm Pulse',rarity:'Legendary',desc:'Violent crimson-magenta distortion energy.',req:s=>s.cataclysmClears>=3,requirement:'Complete 3 Cataclysm grids.'},
    {id:'champion',name:'Champion Gold',rarity:'Champion',desc:'Prestigious molten-gold energy reserved for winners.',req:s=>s.championWins>=3,requirement:'Become Daily Champion 3 times.'}
  ],
  frame:[
    {id:'default',name:'Standard Grid',rarity:'Common',desc:'Clean dark Distortion Grid border.',req:()=>true,requirement:'Unlocked by default.'},
    {id:'fractured',name:'Fractured Glass',rarity:'Rare',desc:'Cracked luminous edges around the board.',req:s=>s.fracturedClears>=5,requirement:'Complete 5 Fractured grids.'},
    {id:'rift',name:'Cataclysm Rift',rarity:'Legendary',desc:'A red-magenta rift burns around the grid.',req:s=>s.cataclysmClears>=5,requirement:'Complete 5 Cataclysm grids.'},
    {id:'gold',name:'Champion Frame',rarity:'Champion',desc:'A bright gold frame showing leaderboard prestige.',req:s=>s.championWins>=5,requirement:'Become Daily Champion 5 times.'}
  ],
  effect:[
    {id:'default',name:'Stabilization Surge',rarity:'Common',desc:'The standard board-wide energy surge.',req:()=>true,requirement:'Unlocked by default.'},
    {id:'galaxy',name:'Galaxy Burst',rarity:'Rare',desc:'A violet-cyan starburst erupts from the grid.',req:s=>s.totalClears>=5,requirement:'Complete 5 grids.'},
    {id:'gold',name:'Golden Collapse',rarity:'Epic',desc:'The grid collapses inward in a brilliant golden flash.',req:s=>s.perfectSolves>=10,requirement:'Earn 10 Perfect solves.'},
    {id:'storm',name:'Cataclysm Storm',rarity:'Legendary',desc:'Red-magenta electrical arcs storm across the board.',req:s=>s.cataclysmClears>=5,requirement:'Complete 5 Cataclysm grids.'}
  ]
};

function defaultCosmeticStats(){
  return {totalClears:0,perfectSolves:0,championWins:0,bestStreak:0,stableClears:0,unstableClears:0,fracturedClears:0,cataclysmClears:0};
}
function getCosmeticStats(){
  try{return {...defaultCosmeticStats(),...JSON.parse(localStorage.getItem(COSMETIC_STATS_KEY)||'{}')}}catch{return defaultCosmeticStats()}
}
function saveCosmeticStats(stats){localStorage.setItem(COSMETIC_STATS_KEY,JSON.stringify(stats))}
function getEquippedCosmetics(){
  try{return {trail:'default',frame:'default',crystal:'default',core:'default',goal:'default',effect:'default',...JSON.parse(localStorage.getItem(COSMETIC_STORAGE_KEY)||'{}')}}catch{
    return {trail:'default',frame:'default',crystal:'default',core:'default',goal:'default',effect:'default'};
  }
}
function saveEquippedCosmetics(equipped){localStorage.setItem(COSMETIC_STORAGE_KEY,JSON.stringify(equipped))}
function cosmeticUnlocked(item){
  if(localStorage.getItem('dg_admin_unlock_all_cosmetics')==='1') return true;
  return item.req(getCosmeticStats());
}
function rarityClass(rarity){return 'rarity-'+String(rarity).toLowerCase()}
function trailPalette(id){
  return {
    void:['#7c3cff','#57c7ff','#7c3cffaa'],
    solar:['#ff6a2a','#ffd75e','#ff9a3daa'],
    cataclysm:['#ff235f','#ff43dd','#ff235faa'],
    champion:['#ffb51b','#fff2a8','#ffc32aaa']
  }[id]||null;
}
function applyCosmetics(){
  const equipped=getEquippedCosmetics();
  const body=document.body;
  const board=document.getElementById('board');
  body.dataset.trail=equipped.trail;
  body.dataset.frame=equipped.frame;
  body.dataset.completionEffect=equipped.effect;
  const palette=trailPalette(equipped.trail);
  if(palette){
    body.style.setProperty('--energyA',palette[0]);
    body.style.setProperty('--energyB',palette[1]);
    body.style.setProperty('--accentGlow',palette[2]);
  }else{
    const palettes={
      Stable:['#69b7ff','#8fffe8','#78e9ff88'],
      Unstable:['#9b6cff','#63e6ff','#7b66ff88'],
      Fractured:['#ff9a4d','#d378ff','#ff9a4d88'],
      Cataclysm:['#ff4f8b','#ff7b5e','#ff3f7188']
    };
    const p=palettes[S.difficulty]||palettes.Unstable;
    body.style.setProperty('--energyA',p[0]);
    body.style.setProperty('--energyB',p[1]);
    body.style.setProperty('--accentGlow',p[2]);
  }
  if(board){
    board.classList.remove('frame-default','frame-fractured','frame-rift','frame-gold');
    board.classList.add('frame-'+equipped.frame);
  }
}
function updateCosmeticProgressAfterClear(){
  const stats=getCosmeticStats();
  stats.totalClears+=1;
  const key=S.difficulty.toLowerCase()+'Clears';
  if(key in stats) stats[key]+=1;
  if(S.moves===S.perfectMin) stats.perfectSolves+=1;
  if(S.isDailyChampion) stats.championWins+=1;
  const streak=Number(localStorage.getItem('dg_streak')||0)+1;
  stats.bestStreak=Math.max(stats.bestStreak,streak);
  saveCosmeticStats(stats);
}
function cosmeticPreview(category,id){
  if(category==='trail') return `<div class="cosmetic-preview preview-trail trail-${id}"><span></span></div>`;
  if(category==='frame') return `<div class="cosmetic-preview preview-frame frame-${id}"><div></div></div>`;
  return `<div class="cosmetic-preview preview-effect effect-${id}">✧</div>`;
}
function renderLocker(){
  const equipped=getEquippedCosmetics();
  const stats=getCosmeticStats();
  const summary=document.getElementById('lockerSummary');
  const tabs=document.getElementById('lockerTabs');
  const grid=document.getElementById('lockerGrid');
  if(!summary||!tabs||!grid)return;
  const all=Object.values(COSMETICS).flat();
  const unlocked=all.filter(c=>cosmeticUnlocked(c)).length;
  summary.innerHTML=`
    <div><span>Unlocked</span><b>${unlocked}/${all.length}</b></div>
    <div><span>Clears</span><b>${stats.totalClears}</b></div>
    <div><span>Perfect</span><b>${stats.perfectSolves}</b></div>
    <div><span>Champion</span><b>${stats.championWins}</b></div>`;
  tabs.innerHTML='';
  COSMETIC_CATEGORIES.forEach(([id,label])=>{
    const btn=document.createElement('button');
    btn.className='locker-tab'+(S.activeLockerCategory===id?' active':'');
    btn.textContent=label;
    btn.onclick=()=>{S.activeLockerCategory=id;renderLocker()};
    tabs.appendChild(btn);
  });
  grid.innerHTML='';
  COSMETICS[S.activeLockerCategory].forEach(item=>{
    const unlocked=cosmeticUnlocked(item);
    const isEquipped=equipped[S.activeLockerCategory]===item.id;
    const card=document.createElement('div');
    card.className=`cosmetic-card ${rarityClass(item.rarity)} ${unlocked?'unlocked':'locked'} ${isEquipped?'equipped':''}`;
    card.innerHTML=`
      ${cosmeticPreview(S.activeLockerCategory,item.id)}
      <div class="cosmetic-card-body">
        <div class="cosmetic-name-row"><b>${item.name}</b><span class="rarity-pill ${rarityClass(item.rarity)}">${item.rarity}</span></div>
        <p>${item.desc}</p>
        <small>${unlocked?(isEquipped?'✓ Currently equipped':item.requirement):'🔒 '+item.requirement}</small>
      </div>
      <button class="cosmetic-equip ${isEquipped?'equipped':''}" ${unlocked?'':'disabled'}>${isEquipped?'Equipped':unlocked?'Equip':'Locked'}</button>`;
    const equipBtn=card.querySelector('.cosmetic-equip');
    if(unlocked&&!isEquipped){
      equipBtn.onclick=()=>{
        const next=getEquippedCosmetics();
        next[S.activeLockerCategory]=item.id;
        saveEquippedCosmetics(next);
        applyCosmetics();
        render();
        renderLocker();
      };
    }
    grid.appendChild(card);
  });
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
  applyCosmetics();
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

  const T=Array.from({length:n},(_,r)=>Array.from({length:n},(_,c)=>({
    r,c,base:[],rot:0,kind:'decoy',on:false,required:false
  })));

  function con(a,b){
    const dr=b.r-a.r,dc=b.c-a.c;
    const d=dr===-1?'N':dr===1?'S':dc===1?'E':'W';
    if(!T[a.r][a.c].base.includes(d)) T[a.r][a.c].base.push(d);
    if(!T[b.r][b.c].base.includes(O[d])) T[b.r][b.c].base.push(O[d]);
  }

  function shuffle(arr){
    const out=[...arr];
    for(let i=out.length-1;i>0;i--){
      const j=Math.floor(R()*(i+1));
      [out[i],out[j]]=[out[j],out[i]];
    }
    return out;
  }

  function borderCells(){
    const cells=[];
    for(let r=0;r<n;r++) for(let c=0;c<n;c++){
      if(r===0||c===0||r===n-1||c===n-1) cells.push({r,c});
    }
    return cells;
  }

  const routeRatio={Stable:[0.42,0.52],Unstable:[0.50,0.62],Fractured:[0.56,0.68],Cataclysm:[0.62,0.74]};
  const [lo,hi]=routeRatio[S.difficulty]||routeRatio.Unstable;
  const targetLen=Math.max(
    S.crystalCount+3,
    Math.min(n*n-2,Math.round(n*n*(lo+R()*(hi-lo))))
  );

  function findRoute(){
    const starts=shuffle(borderCells());

    for(const start of starts){
      const path=[start];
      const used=new Set([`${start.r},${start.c}`]);

      function walk(){
        if(path.length>=targetLen){
          const end=path[path.length-1];
          const distance=Math.abs(end.r-start.r)+Math.abs(end.c-start.c);
          return distance>=Math.max(2,Math.floor(n/2));
        }

        const cur=path[path.length-1];
        let neighbors=[];
        for(const d of ORD){
          const [dr,dc]=D[d];
          const nr=cur.r+dr,nc=cur.c+dc;
          if(nr<0||nr>=n||nc<0||nc>=n) continue;
          const key=`${nr},${nc}`;
          if(used.has(key)) continue;
          neighbors.push({r:nr,c:nc,d});
        }

        // Prefer moves that keep several future choices open so the route winds
        // through the board instead of trapping itself immediately.
        neighbors=shuffle(neighbors).sort((a,b)=>{
          const freeCount=p=>ORD.reduce((count,d)=>{
            const [dr,dc]=D[d],rr=p.r+dr,cc=p.c+dc;
            return count+(rr>=0&&rr<n&&cc>=0&&cc<n&&!used.has(`${rr},${cc}`)?1:0);
          },0);
          return freeCount(b)-freeCount(a);
        });

        for(const next of neighbors){
          const key=`${next.r},${next.c}`;
          used.add(key);path.push({r:next.r,c:next.c});
          if(walk()) return true;
          path.pop();used.delete(key);
        }
        return false;
      }

      if(walk()) return path;
    }
    return null;
  }

  let path=findRoute();

  // Guaranteed fallback: take only part of a snake route, never the whole board.
  if(!path){
    const snake=[];
    for(let r=0;r<n;r++){
      const cols=r%2===0
        ? Array.from({length:n},(_,i)=>i)
        : Array.from({length:n},(_,i)=>n-1-i);
      cols.forEach(c=>snake.push({r,c}));
    }
    const maxStart=Math.max(0,snake.length-targetLen);
    const cut=Math.floor(R()*(maxStart+1));
    path=snake.slice(cut,cut+targetLen);
    if(R()<.5) path.reverse();
  }

  // Build only the hidden official route.
  path.forEach(p=>{
    T[p.r][p.c].required=true;
    T[p.r][p.c].kind='normal';
  });
  for(let i=0;i<path.length-1;i++) con(path[i],path[i+1]);

  const startCell=path[0];
  const endCell=path[path.length-1];
  T[startCell.r][startCell.c].kind='core';
  T[endCell.r][endCell.c].kind='exit';

  // Required crystals appear in route order.
  for(let i=1;i<=S.crystalCount;i++){
    const idx=Math.max(1,Math.min(path.length-2,Math.round((path.length-1)*(i/(S.crystalCount+1)))));
    const cp=path[idx];
    if(T[cp.r][cp.c].kind==='normal') T[cp.r][cp.c].kind='crystal';
  }

  // Fill every unused tile with a plausible decoy piece.
  const decoys=[
    ['N','S'],['E','W'],['N','E'],['E','S'],['S','W'],['W','N'],
    ['N'],['E'],['S'],['W'],
    ['N','E','S'],['E','S','W'],['S','W','N'],['W','N','E']
  ];
  for(const t of T.flat()){
    if(!t.required){
      t.base=[...decoys[Math.floor(R()*decoys.length)]];
      t.kind='decoy';
    }
  }

  // Par counts ONLY the real hidden route. Decoys never inflate the official Par.
  const minParByDifficulty={Stable:8,Unstable:14,Fractured:22,Cataclysm:32};
  const targetPar=minParByDifficulty[S.difficulty]||14;
  let bestPar=-1,bestRots=null;

  for(let attempt=0;attempt<160;attempt++){
    let par=0;
    const rots=[];
    for(let r=0;r<n;r++){
      rots[r]=[];
      for(let c=0;c<n;c++){
        const t=T[r][c];
        let rot;
        if(t.required){
          rot=S.difficulty==='Stable' ? Math.floor(R()*4) : 1+Math.floor(R()*3);
        }else{
          rot=Math.floor(R()*4);
        }
        t.rot=rot;
        rots[r][c]=rot;
        if(t.required) par+=clockwiseDistanceToSolved(t);
      }
    }
    if(par>bestPar){bestPar=par;bestRots=rots.map(row=>[...row]);}
    if(par>=targetPar) break;
  }

  if(bestRots){
    for(let r=0;r<n;r++) for(let c=0;c<n;c++) T[r][c].rot=bestRots[r][c];
  }

  S.tiles=T;
  S.perfectMin=Math.max(1,T.flat().filter(t=>t.required).reduce((sum,t)=>sum+clockwiseDistanceToSolved(t),0));
  S.min=S.perfectMin+parAllowance();
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
  const route=all.filter(t=>t.required);
  const goal=all.find(t=>t.kind==='exit');
  const crystals=all.filter(t=>t.kind==='crystal');

  // Only the official hidden route needs to be solved. Decoy tiles are optional.
  const routeOriented=route.every(t=>sameDirs(dirs(t),t.base));
  const routePowered=route.every(t=>t.on);

  return routeOriented && routePowered && goal?.on && crystals.every(c=>c.on);
}
function turn(r,c){if(S.done||S.studying)return;startClock();let t=S.tiles[r][c];t.rot=(t.rot+1)%4;S.moves++;render();if(solved())finish()}
function stars(){return golfScore().label}
function text(){
  return `🌌 DISTORTION GRID #${String(S.num).padStart(3,'0')}
${S.isDailyChampion?'👑 NEW DAILY CHAMPION':'✅ Stabilized'}
🔄 ${S.moves} moves (Par ${S.min})
⏱️ ${document.getElementById('time').textContent}
${golfScore().label} — ${golfScore().detail}

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
  btn.style.display=isAdminTestMode()?'':'none';
  btn.disabled=!isAdminTestMode();
}

function updateRecordPanel(){
  let rec=getRecord(), empty=document.getElementById('recordEmpty'), data=document.getElementById('recordData');
  if(!rec){empty.classList.remove('hidden');data.classList.add('hidden');return}
  empty.classList.add('hidden');data.classList.remove('hidden');
  document.getElementById('recordName').textContent=rec.name;
  document.getElementById('recordMoves').textContent=rec.moves;
  document.getElementById('recordTime').textContent=formatSec(rec.seconds);
}

function incompleteStorageKey(){
  return 'dg_incomplete_'+S.key;
}

function revealParPath(){
  // Reveal only the official Core → Crystal(s) → Goal Par route.
  S.tiles.flat().forEach(t=>{
    if(t.required) t.rot=0;
  });
  render();
  const board=document.getElementById('board');
  board?.classList.add('par-revealed');
}

function giveUp(){
  if(S.done || S.gaveUp) return;

  const ok=window.confirm(
    "Give up on today's Distortion?\n\nYour attempt will be marked Incomplete and the Par solution will be revealed."
  );
  if(!ok) return;

  clearInterval(S.timer);
  clearInterval(S.studyTimer);

  S.gaveUp=true;
  S.done=true;
  S.finished=Date.now();
  S.studying=false;

  document.getElementById('studyOverlay')?.classList.add('hidden');
  document.getElementById('board')?.classList.remove('studying');

  const phase=document.getElementById('phaseBanner');
  if(phase){
    phase.textContent='Incomplete';
    phase.classList.remove('live');
    phase.classList.add('incomplete');
  }

  // Preserve the time/moves they had when they surrendered.
  const elapsed=secondsTaken();
  if(!S.isTest){
    const incompleteAttempt={
      status:'incomplete',
      moves:S.moves,
      seconds:elapsed,
      par:S.min,
      perfectMin:S.perfectMin,
      difficulty:S.difficulty,
      gridNumber:S.num,
      gaveUpAt:Date.now()
    };

    localStorage.setItem(incompleteStorageKey(),JSON.stringify(incompleteAttempt));
    saveDailyAttempt(incompleteAttempt);
  }

  revealParPath();

  document.getElementById('gMoves').textContent=S.moves;
  document.getElementById('gPar').textContent=S.min;
  document.getElementById('gTime').textContent=formatSec(elapsed);
  document.getElementById('giveUpResult').classList.remove('hidden');
}

function lightWholeBoardForCompletion(){
  const board=document.getElementById('board');
  if(!board) return;

  // Once the real route reaches the Goal, the stabilized Distortion surges
  // through every visible tile as a reward animation. This does not affect Par.
  board.querySelectorAll('.tile').forEach(el=>{
    el.style.boxShadow='0 0 22px var(--energyA) inset,0 0 13px var(--accentGlow)';
    el.querySelectorAll('.seg').forEach(seg=>seg.classList.add('on'));
    el.querySelector('.node')?.classList.add('on');
    el.classList.add('on-complete');
  });
}


async function postCompletedResultToDiscord({
  seconds,
  streak,
  rank=null
}){
  const status=document.getElementById('autoPostStatus');

  try{
    if(status) status.textContent='Posting result to Discord…';

    let auth=getDiscordAuth();

    if(!auth){
      auth=await initDiscord();
    }

    if(!auth?.access_token){
      throw new Error('Discord authentication is not ready.');
    }

    const response=await fetch('/api/activity-result',{
      method:'POST',
      headers:{
        'Content-Type':'application/json',
        'Authorization':`Bearer ${auth.access_token}`
      },
      body:JSON.stringify({
        gridNumber:S.num,
        gridSize:S.n,
        difficulty:S.difficulty,
        moves:S.moves,
        par:S.min,
        perfectMin:S.perfectMin,
        scoreLabel:golfScore().short,
        seconds,
        streak,
        rank,
        isChampion:S.isDailyChampion,
        isPerfect:S.moves===S.perfectMin,
        isTest:S.isTest
      })
    });

    const data=await response.json().catch(()=>({}));

    if(!response.ok){
      throw new Error(data.error||response.statusText||'Result post failed.');
    }

    if(status){
      status.textContent=data.duplicate
        ? '✓ Result already posted to Discord'
        : '✓ Posted automatically to Discord';
    }

    return true;
  }catch(error){
    console.error('Could not post Distortion Grid result to Discord:',error);
    if(status){
      status.textContent='⚠ Could not post to Discord automatically. Check bot connection/permissions.';
    }
    return false;
  }
}


function migrateLegacyPlayerRecords(displayName){
  if(!displayName || displayName==='Player') return;

  try{
    const recordKey=recordStorageKey();
    const record=JSON.parse(localStorage.getItem(recordKey)||'null');

    if(record?.name==='Player'){
      record.name=displayName;
      localStorage.setItem(recordKey,JSON.stringify(record));
    }
  }catch{}

  try{
    const leaderboardKey=leaderboardStorageKey();
    const rows=JSON.parse(localStorage.getItem(leaderboardKey)||'[]');
    let changed=false;

    rows.forEach(row=>{
      if(row?.name==='Player'){
        row.name=displayName;
        changed=true;
      }
    });

    if(changed){
      localStorage.setItem(leaderboardKey,JSON.stringify(rows));
    }
  }catch{}

  updateRecordPanel();
}


function ensureDiscordStatusBadge(){
  let badge=document.getElementById('discordConnectionStatus');

  if(badge) return badge;

  badge=document.createElement('div');
  badge.id='discordConnectionStatus';
  badge.style.cssText=[
    'position:fixed',
    'left:10px',
    'bottom:10px',
    'z-index:9999',
    'padding:7px 10px',
    'border-radius:10px',
    'font:700 12px/1.2 system-ui,sans-serif',
    'background:#0d0a18e8',
    'border:1px solid #6b4d9b',
    'color:#d8cbff',
    'box-shadow:0 0 16px #0008',
    'max-width:min(420px,calc(100vw - 20px))',
    'white-space:normal'
  ].join(';');

  badge.textContent='Discord: Connecting…';
  document.body.appendChild(badge);
  return badge;
}

function updateDiscordStatusBadge(detail){
  const badge=ensureDiscordStatusBadge();
  const stage=detail?.stage||getDiscordAuthStatus()?.stage||'idle';
  const error=detail?.error||getDiscordAuthStatus()?.error;
  const user=detail?.user||getDiscordAuth()?.user;

  const labels={
    idle:'Starting…',
    'sdk-starting':'Opening Discord SDK…',
    'sdk-ready':'Discord SDK ready',
    authorizing:'Requesting Discord authorization…',
    'authorization-consent':'Waiting for Discord approval…',
    authorized:'Discord authorization received',
    'token-exchange':'Exchanging Discord token…',
    authenticating:'Authenticating Discord user…',
    connected:'Connected',
    error:'Login Error'
  };

  if(stage==='connected' && user){
    const name=user.global_name||user.username||user.id;
    badge.textContent=`Discord: Connected as ${name}`;
    badge.style.borderColor='#35d07f';
    badge.style.color='#aef5ce';
    return;
  }

  if(stage==='error'){
    badge.textContent=`Discord Login Error: ${error||'Unknown authentication error'}`;
    badge.style.borderColor='#e85a7b';
    badge.style.color='#ffd0da';
    return;
  }

  badge.textContent=`Discord: ${labels[stage]||stage}`;
  badge.style.borderColor='#6b4d9b';
  badge.style.color='#d8cbff';
}

window.addEventListener('dg-discord-auth-status',event=>{
  updateDiscordStatusBadge(event.detail);
});

ensureDiscordStatusBadge();
updateDiscordStatusBadge();


function finish(){
  S.done=true;S.finished=Date.now();clearInterval(S.timer);clock();
  if(S.soundOn) overloadSound();

  const sec=secondsTaken();
  const discordUser=getDiscordAuth()?.user;
  const discordDisplayName=(discordUser?.global_name||discordUser?.username||'').trim();
  const name=(discordDisplayName||document.getElementById('playerName')?.value||'Player').trim().slice(0,32)||'Player';
  const previous=getRecord();
  const isRecord=beatsRecord(S.moves,sec,previous);

  // Personal performance summary uses prior solves, then stores this solve.
  const summary=personalSummary(S.moves,sec);
  addHistory({ts:Date.now(),moves:S.moves,seconds:sec,difficulty:S.difficulty});

  // Local prototype leaderboard. Real Activity will use the shared backend.
  const rows=addLeaderboardResult(name,S.moves,sec);
  S.isDailyChampion=rows.length>0 && rows[0].name===name && rows[0].moves===S.moves && rows[0].seconds===sec;
  updateCosmeticProgressAfterClear();

  if(isRecord){
    localStorage.setItem(recordStorageKey(),JSON.stringify({name,moves:S.moves,seconds:sec}));
  }
  updateRecordPanel();

  // The solved route triggers a stabilization surge across the entire board.
  const board=document.getElementById('board');
  lightWholeBoardForCompletion();
  const equippedCosmetics=getEquippedCosmetics();
  board.classList.remove('effect-default','effect-galaxy','effect-gold','effect-storm');
  board.classList.add('effect-'+equippedCosmetics.effect);
  board.classList.add('complete-surge');
  const wave=document.getElementById('collapseWave');
  wave.className='collapse-wave effect-'+equippedCosmetics.effect;
  void wave.offsetWidth;
  wave.classList.add('go');

  document.getElementById('rMoves').textContent=S.moves;
  document.getElementById('rPar').textContent=S.min;
  document.getElementById('rTime').textContent=document.getElementById('time').textContent;
  document.getElementById('rStars').textContent=golfScore().label;
  document.getElementById('newRecord').classList.toggle('hidden',!S.isDailyChampion);

  const personal=document.getElementById('personalNote');
  personal.textContent=summary;
  personal.classList.remove('hidden');


  setTimeout(()=>{
    document.getElementById('result').classList.remove('hidden');
    board.classList.remove('complete-surge');
    board.querySelectorAll('.tile').forEach(el=>el.classList.remove('on-complete'));
  },900);

  let st=(+localStorage.getItem('dg_streak')||0)+1;
  localStorage.setItem('dg_streak',st);
  document.getElementById('streak').textContent='🔥 '+st;

  const myRank=Math.max(
    1,
    rows.findIndex(r=>r.name===name && r.moves===S.moves && r.seconds===sec)+1
  );

  const score=golfScore();
  saveDailyAttempt({
    status:'complete',
    moves:S.moves,
    seconds:sec,
    par:S.min,
    perfectMin:S.perfectMin,
    scoreLabel:score.short,
    difficulty:S.difficulty,
    gridNumber:S.num,
    rank:myRank,
    completedAt:Date.now()
  });

  // Post the completed result into the configured Discord results channel.
  // This intentionally happens after local rank/champion status is calculated.
  postCompletedResultToDiscord({
    seconds:sec,
    streak:st,
    rank:myRank
  });
}
function reset(test=false){
  clearInterval(S.timer);
  clearInterval(S.studyTimer);

  const testMode=isAdminTestMode();
  test=!!test && testMode;

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
  document.getElementById('giveUp')?.removeAttribute('disabled');
  updateRecordPanel();
  updateTestButton();
  updateTestModeUI();
  render();
  applyCosmetics();

  if(!test && enforceDailyAttemptLock()){
    return;
  }

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

document.getElementById('adminUnlockCosmetics').onclick=()=>{
  localStorage.setItem('dg_admin_unlock_all_cosmetics','1');
  renderLocker();
  applyCosmetics();
  adminMessage('All cosmetics unlocked for testing on this browser.');
};

document.getElementById('adminToggleTestMode').onclick=()=>{
  const enabling=!isAdminTestMode();

  if(enabling){
    localStorage.setItem('dg_admin_test_mode','1');
    adminMessage('Test Mode enabled: unlimited test attempts are available.');
    updateTestModeUI();
    setTimeout(()=>{
      document.getElementById('adminPanelModal').classList.add('hidden');
      reset(true);
    },350);
  }else{
    localStorage.removeItem('dg_admin_test_mode');
    adminMessage('Test Mode disabled: official daily rules are active.');
    updateTestModeUI();
    setTimeout(()=>{
      document.getElementById('adminPanelModal').classList.add('hidden');
      reset(false);
    },350);
  }
};

document.getElementById('adminResetEverything').onclick=()=>{
  const confirmed=window.confirm(
    'Reset EVERYTHING for Distortion Grid on this browser?\n\n' +
    'This clears cosmetics, cosmetic progress, streaks, tutorial status, ' +
    'leaderboards, personal history, test records, and admin settings.\n\n' +
    'This cannot be undone.'
  );

  if(!confirmed) return;

  const keysToRemove=[];
  for(let i=0;i<localStorage.length;i++){
    const key=localStorage.key(i);
    if(
      key &&
      (
        key.startsWith('dg_') ||
        key.startsWith('distortion_')
      )
    ){
      keysToRemove.push(key);
    }
  }

  keysToRemove.forEach(key=>localStorage.removeItem(key));

  // Restore the default prototype admin password after the reset.
  localStorage.setItem('dg_admin_password','distortion123');

  window.location.reload();
};


document.getElementById('lockerBtn').onclick=()=>{
  renderLocker();
  document.getElementById('lockerModal').classList.remove('hidden');
};
document.getElementById('closeLocker').onclick=()=>document.getElementById('lockerModal').classList.add('hidden');
document.getElementById('closeLockerX').onclick=()=>document.getElementById('lockerModal').classList.add('hidden');
document.getElementById('lockerModal').addEventListener('click',e=>{
  if(e.target.id==='lockerModal') document.getElementById('lockerModal').classList.add('hidden');
});

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
document.getElementById('dailyLockedClose').onclick=()=>document.getElementById('dailyLockedModal').classList.add('hidden');
document.getElementById('closeGiveUp').onclick=()=>document.getElementById('giveUpResult').classList.add('hidden');
reset(false);
updateTestButton();
document.getElementById('new').onclick=()=>{
  if(!isAdminTestMode()) return;
  reset(true);
};
document.getElementById('close').onclick=()=>document.getElementById('result').classList.add('hidden');
window.addEventListener('keydown',e=>{if(e.key.toLowerCase()==='s'){
  if(!isAdminTestMode()) return;
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
initDiscord().then(auth=>{
  updateDiscordStatusBadge({stage:'connected',user:auth?.user});
  const user=auth?.user;
  const displayName=user?.global_name||user?.username;
  const input=document.getElementById('playerName');

  if(input && displayName){
    input.value=displayName;
    input.readOnly=true;
    input.title='Connected to your Discord account';
  }

  if(displayName){
    migrateLegacyPlayerRecords(displayName);
  }

  migrateBrowserDailyAttempt();
  enforceDailyAttemptLock();
}).catch(err=>{
  console.error('Discord SDK authentication failed:',err);
  updateDiscordStatusBadge({stage:'error',error:err?.message||String(err)});
});
