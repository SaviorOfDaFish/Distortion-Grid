import './styles.css';
import { initDiscord, getDiscordAuth, getDiscordAuthStatus } from './discord.js';

const D={N:[-1,0],E:[0,1],S:[1,0],W:[0,-1]}, O={N:'S',E:'W',S:'N',W:'E'}, ORD=['N','E','S','W'];
let S={n:5,tiles:[],moves:0,start:null,done:false,finished:null,timer:null,num:1,min:1,perfectMin:1,key:'',isTest:false,difficulty:'Unstable',testIndex:0,crystalCount:1,branchAttempts:5,studyTimer:null,studyRemaining:15,studying:false,soundOn:true,lastPowered:new Set(),lastPoweredCrystals:new Set(),audioCtx:null,isDailyChampion:false,leaderboardSize:5,forcedDifficulty:'Auto',studySeconds:15,gaveUp:false,activeLockerCategory:'trail',guidePaused:false,guidePauseStarted:null,guidePausedMs:0,tutorialMode:false,tutorialStep:0,tutorialPracticeLive:false,tutorialPracticeSolved:false,officialPreparing:false,serverAttempt:null,stateSaveTimer:null,tutorialStatusResolved:false,tutorialServerComplete:false};

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

function distortionScore(moves=S.moves){
  if(moves===S.perfectMin){
    return {
      key:'perfect-stabilization',
      label:'✨ PERFECT STABILIZATION',
      short:'Perfect Stabilization',
      detail:'Exact minimum route'
    };
  }

  const delta=moves-S.min;

  if(delta<=-3) return {key:'reality-break',label:'🌌 REALITY BREAK',short:'Reality Break',detail:`${Math.abs(delta)} under Par`};
  if(delta===-2) return {key:'rift-mastery',label:'🌀 RIFT MASTERY',short:'Rift Mastery',detail:'2 under Par'};
  if(delta===-1) return {key:'distortion-surge',label:'⚡ DISTORTION SURGE',short:'Distortion Surge',detail:'1 under Par'};
  if(delta===0) return {key:'stabilized',label:'◆ STABILIZED',short:'Stabilized',detail:'Exactly Par'};
  if(delta===1) return {key:'minor-instability',label:'⚠ MINOR INSTABILITY',short:'Minor Instability',detail:'1 over Par'};
  if(delta===2) return {key:'major-instability',label:'⚠ MAJOR INSTABILITY',short:'Major Instability',detail:'2 over Par'};
  if(delta===3) return {key:'critical-instability',label:'🚨 CRITICAL INSTABILITY',short:'Critical Instability',detail:'3 over Par'};
  return {key:'unstable',label:`🚨 UNSTABLE +${delta}`,short:`Unstable +${delta}`,detail:`${delta} over Par`};
}

function officialPlayerId(){
  return getDiscordAuth()?.user?.id || 'browser';
}

function dailyAttemptStorageKey(playerId=officialPlayerId()){
  return `dg_daily_attempt_${today()}_${playerId}`;
}

function dailyAttemptFallbackKey(){
  return `dg_daily_attempt_${today()}`;
}

function parseStoredAttempt(key){
  try{
    return JSON.parse(localStorage.getItem(key)||'null');
  }catch{
    return null;
  }
}

function getDailyAttempt(){
  // Prefer the authenticated Discord-user lock.
  const scoped=parseStoredAttempt(dailyAttemptStorageKey());
  if(scoped && scoped.status!=='active') return scoped;

  const fallback=parseStoredAttempt(dailyAttemptFallbackKey());
  return fallback && fallback.status!=='active' ? fallback : null;
}

function saveDailyAttempt(attempt){
  if(S.isTest || isAdminTestMode()) return;

  const stored={
    date:today(),
    playerId:officialPlayerId(),
    ...attempt
  };

  // Always save a same-day fallback immediately.
  localStorage.setItem(dailyAttemptFallbackKey(),JSON.stringify(stored));

  // Also save the Discord-scoped record whenever identity is available.
  localStorage.setItem(dailyAttemptStorageKey(),JSON.stringify(stored));
}

function migrateBrowserDailyAttempt(){
  const userId=getDiscordAuth()?.user?.id;
  if(!userId) return;

  const browserKey=`dg_daily_attempt_${today()}_browser`;
  const fallbackKey=dailyAttemptFallbackKey();
  const userKey=`dg_daily_attempt_${today()}_${userId}`;

  const source=
    localStorage.getItem(userKey) ||
    localStorage.getItem(fallbackKey) ||
    localStorage.getItem(browserKey);

  if(source){
    localStorage.setItem(userKey,source);
    localStorage.setItem(fallbackKey,source);
  }

  localStorage.removeItem(browserKey);
}



function serializeOfficialBoardState(){
  return {
    n:S.n,
    rotations:S.tiles.map(row=>row.map(t=>t.rot)),
    moves:S.moves
  };
}

function applyOfficialBoardState(state){
  if(!state || !Array.isArray(state.rotations) || Number(state.n)!==S.n) return false;
  if(state.rotations.length!==S.n) return false;

  for(let r=0;r<S.n;r++){
    if(!Array.isArray(state.rotations[r]) || state.rotations[r].length!==S.n) return false;

    for(let c=0;c<S.n;c++){
      const value=Number(state.rotations[r][c]);
      if(Number.isFinite(value)) S.tiles[r][c].rot=((value%4)+4)%4;
    }
  }

  S.moves=Math.max(0,Math.floor(Number(state.moves)||0));
  return true;
}

async function authenticatedFetch(url,options={}){
  let auth=getDiscordAuth();

  if(!auth?.access_token){
    auth=await initDiscord();
  }

  if(!auth?.access_token){
    throw new Error('Discord authentication is not ready.');
  }

  return fetch(url,{
    ...options,
    headers:{
      ...(options.headers||{}),
      'Authorization':`Bearer ${auth.access_token}`
    }
  });
}

async function saveActiveAttemptState({keepalive=false}={}){
  if(S.isTest || isAdminTestMode() || S.tutorialMode || S.done || S.gaveUp) return;
  if(!S.serverAttempt || S.serverAttempt.status!=='active') return;

  try{
    const response=await authenticatedFetch('/api/attempts/state',{
      method:'PUT',
      keepalive,
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        moves:S.moves,
        state:serializeOfficialBoardState()
      })
    });

    if(!response.ok){
      const data=await response.json().catch(()=>({}));
      console.warn('Active attempt state save failed:',data.error||response.statusText);
    }
  }catch(error){
    console.warn('Active attempt state save failed:',error);
  }
}

function queueActiveAttemptSave(){
  clearTimeout(S.stateSaveTimer);
  S.stateSaveTimer=setTimeout(()=>{
    S.stateSaveTimer=null;
    saveActiveAttemptState();
  },120);
}

function startServerStudyPhase(seconds){
  clearInterval(S.studyTimer);
  clearInterval(S.timer);

  S.start=null;
  S.studying=true;
  S.studyRemaining=Math.max(1,Math.ceil(Number(seconds)||1));

  const overlay=document.getElementById('studyOverlay');
  const countdown=document.getElementById('studyCountdown');
  const board=document.getElementById('board');
  const phase=document.getElementById('phaseBanner');

  board?.classList.add('studying');
  overlay?.classList.remove('hidden');

  if(countdown) countdown.textContent=String(S.studyRemaining);
  if(phase){
    phase.textContent=`Study ${S.studyRemaining}s`;
    phase.classList.remove('live');
  }

  S.studyTimer=setInterval(()=>{
    S.studyRemaining--;

    if(countdown) countdown.textContent=String(Math.max(0,S.studyRemaining));
    if(phase) phase.textContent=`Study ${Math.max(0,S.studyRemaining)}s`;

    if(S.studyRemaining<=0){
      clearInterval(S.studyTimer);
      S.studying=false;
      board?.classList.remove('studying');
      overlay?.classList.add('hidden');

      if(phase){
        phase.textContent='Live';
        phase.classList.add('live');
      }

      S.start=Date.now();
      clearInterval(S.timer);
      S.timer=setInterval(clock,250);
      clock();
    }
  },1000);
}

function resumeServerLiveAttempt(attempt){
  const elapsed=Math.max(0,Math.floor(Number(attempt?.seconds)||0));

  S.studying=false;
  S.start=Date.now()-(elapsed*1000);
  S.done=false;

  document.getElementById('studyOverlay')?.classList.add('hidden');
  document.getElementById('board')?.classList.remove('studying');

  const phase=document.getElementById('phaseBanner');
  if(phase){
    phase.textContent='Live';
    phase.classList.add('live');
  }

  clearInterval(S.timer);
  S.timer=setInterval(clock,250);
  clock();
}

async function prepareOfficialAttempt(){
  if(S.isTest || isAdminTestMode() || S.tutorialMode || S.officialPreparing) return;

  S.officialPreparing=true;

  try{
    const response=await authenticatedFetch('/api/attempts/start',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        gridNumber:S.num,
        difficulty:S.difficulty,
        moves:S.moves,
        par:S.min,
        perfectMin:S.perfectMin,
        studySeconds:S.studySeconds,
        state:serializeOfficialBoardState()
      })
    });

    const data=await response.json().catch(()=>({}));

    if(!response.ok){
      throw new Error(data.error||response.statusText||'Could not start the official attempt.');
    }

    const attempt=data.attempt;
    S.serverAttempt=attempt;

    if(!attempt){
      throw new Error('Server did not return an official attempt.');
    }

    if(attempt.status==='complete' || attempt.status==='incomplete'){
      saveDailyAttempt(attempt);
      showDailyLock(attempt);
      return;
    }

    if(attempt.status!=='active'){
      throw new Error(`Unknown attempt status: ${attempt.status}`);
    }

    if(attempt.state){
      applyOfficialBoardState(attempt.state);
      document.getElementById('moves').textContent=String(S.moves);
      render();
      applyCosmetics();
    }

    localStorage.setItem(dailyAttemptFallbackKey(),JSON.stringify(attempt));
    localStorage.setItem(dailyAttemptStorageKey(),JSON.stringify(attempt));

    if(Number(attempt.studyRemainingSeconds)>0){
      startServerStudyPhase(attempt.studyRemainingSeconds);
    }else{
      resumeServerLiveAttempt(attempt);
    }
  }catch(error){
    console.error('Official attempt preparation failed:',error);

    clearInterval(S.timer);
    clearInterval(S.studyTimer);
    S.studying=true;

    const phase=document.getElementById('phaseBanner');
    if(phase){
      phase.textContent='Connecting…';
      phase.classList.remove('live');
    }

    document.getElementById('board')?.classList.add('studying');
  }finally{
    S.officialPreparing=false;
  }
}

async function fetchServerDailyAttempt(){
  if(isAdminTestMode() || S.isTest) return null;

  let auth=getDiscordAuth();

  if(!auth?.access_token){
    auth=await initDiscord();
  }

  if(!auth?.access_token){
    throw new Error('Discord authentication is not ready.');
  }

  const response=await fetch('/api/attempts/today',{
    headers:{
      'Authorization':`Bearer ${auth.access_token}`
    }
  });

  const data=await response.json().catch(()=>({}));

  if(!response.ok){
    throw new Error(data.error||response.statusText||"Could not check today's attempt.");
  }

  return data.attempt||null;
}

async function syncServerDailyAttempt(){
  if(isAdminTestMode() || S.isTest || S.tutorialMode) return false;

  try{
    const attempt=await fetchServerDailyAttempt();
    if(!attempt) return false;

    S.serverAttempt=attempt;

    localStorage.setItem(dailyAttemptFallbackKey(),JSON.stringify(attempt));
    localStorage.setItem(dailyAttemptStorageKey(),JSON.stringify(attempt));

    document.getElementById('result')?.classList.add('hidden');
    document.getElementById('giveUpResult')?.classList.add('hidden');
    document.getElementById('tutorialModal')?.classList.add('hidden');

    if(attempt.status==='active'){
      if(attempt.state){
        applyOfficialBoardState(attempt.state);
        document.getElementById('moves').textContent=String(S.moves);
        render();
        applyCosmetics();
      }

      if(Number(attempt.studyRemainingSeconds)>0){
        startServerStudyPhase(attempt.studyRemainingSeconds);
      }else{
        resumeServerLiveAttempt(attempt);
      }

      return true;
    }

    document.getElementById('studyOverlay')?.classList.add('hidden');
    return showDailyLock(attempt);
  }catch(error){
    console.error('Server daily-attempt check failed:',error);
    return false;
  }
}

async function saveGiveUpToServer(incompleteAttempt){
  if(S.isTest || isAdminTestMode()) return;

  try{
    let auth=getDiscordAuth();

    if(!auth?.access_token){
      auth=await initDiscord();
    }

    if(!auth?.access_token){
      throw new Error('Discord authentication is not ready.');
    }

    const response=await fetch('/api/attempts/give-up',{
      method:'POST',
      headers:{
        'Content-Type':'application/json',
        'Authorization':`Bearer ${auth.access_token}`
      },
      body:JSON.stringify({
        gridNumber:incompleteAttempt.gridNumber,
        difficulty:incompleteAttempt.difficulty,
        moves:incompleteAttempt.moves,
        par:incompleteAttempt.par,
        perfectMin:incompleteAttempt.perfectMin,
        seconds:incompleteAttempt.seconds,
        state:serializeOfficialBoardState()
      })
    });

    const data=await response.json().catch(()=>({}));

    if(!response.ok){
      throw new Error(data.error||response.statusText||'Could not save Give Up.');
    }

    if(data.attempt){
      localStorage.setItem(dailyAttemptFallbackKey(),JSON.stringify(data.attempt));
      localStorage.setItem(dailyAttemptStorageKey(),JSON.stringify(data.attempt));
    }
  }catch(error){
    console.error('Server Give Up persistence failed:',error);
  }
}

function showDailyLock(attempt){
  if(!attempt || attempt.status==='active' || isAdminTestMode()) return false;

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

  // Prevent any board clicks if the daily attempt is already consumed.
  document.querySelectorAll('#board .tile').forEach(tile=>{
    tile.disabled=true;
  });

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


const TUTORIAL_COMPLETE_KEY='dg_guided_tutorial_v2_complete';

const TUTORIAL_STEPS=[
  {
    icon:'🌌',
    title:'Welcome to Distortion Grid',
    text:'This quick walkthrough shows you the entire game, then gives you a simple 6×6 practice grid. The practice does not use your daily attempt.'
  },
  {
    icon:'🟢',
    title:'Make Sure Discord Is Connected',
    text:'Look for “Discord: Connected as …” in the top-left. Your Discord account is how Distortion Grid tracks your official daily result across devices.',
    target:'#discordConnectionStatus'
  },
  {
    icon:'🖥️',
    title:'Your Main Display',
    text:'This is the main Distortion Grid screen. The daily challenge information, competitive stats, puzzle board, and controls all live here.',
    target:'.hero'
  },
  {
    icon:'⏳',
    title:'Study Phase',
    text:'Every official grid begins with a short Study Phase. The grid is visible but locked so you can inspect the layout before the gameplay timer starts.',
    target:'#phaseBanner'
  },
  {
    icon:'▦',
    title:'The Distortion Grid',
    text:'The center board is the puzzle. Not every tile belongs to the solution — some are decoys. Your job is to discover the real powered route.',
    target:'#board'
  },
  {
    icon:'✦',
    title:'Core, Crystal, Goal, and Path',
    text:'✦ Core is where energy begins. ◆ Crystal is a required checkpoint. ◈ Goal is the final Stabilizer. ━ Path tiles rotate to carry the energy.',
    target:'.mini-key'
  },
  {
    icon:'📊',
    title:'Moves, Par, Time, Streak, and Phase',
    text:'Moves counts every rotation. Par is the target score. Time breaks ties. Streak tracks consecutive daily clears. Phase tells you whether you are studying, live, or finished.',
    target:'.compact-stats'
  },
  {
    icon:'🧪',
    title:'Try a 6×6 Practice Grid',
    text:'Now you get to play. First you will have a short 5-second practice Study Phase. Then click tiles to rotate them. Connected energy lights up automatically.',
    target:'#board',
    practiceStart:true
  }
];

const TUTORIAL_AFTER_PRACTICE=[
  {
    icon:'✅',
    title:'Grid Complete!',
    text:'You did it. A real daily solve ends when the powered route travels from the Core, through every required Crystal, and reaches the Goal.'
  },
  {
    icon:'✦',
    title:'Cosmetic Locker',
    text:'The ✦ Locker lets you equip unlocked Energy Trails, Board Frames, and Completion Effects. Cosmetics never change puzzle scoring.',
    target:'#lockerBtn'
  },
  {
    icon:'🔊',
    title:'Sound Controls',
    text:'Use the speaker button to turn the electric connection sounds and completion effects on or off.',
    target:'#soundBtn'
  },
  {
    icon:'ⓘ',
    title:'How to Play Guide',
    text:'The Guide contains the rules, difficulty levels, and Distortion Ratings. Opening it during live gameplay pauses your gameplay timer.',
    target:'#infoBtn'
  },
  {
    icon:'🚫',
    title:'Give Up',
    text:'If you get completely stuck, Give Up ends the official attempt as Incomplete and reveals the correct Par route. Giving up still uses your one daily attempt.',
    target:'#giveUp'
  },
  {
    icon:'💥',
    title:'Cataclysm',
    text:'Daily difficulty is randomized. Cataclysm is the biggest version: a 7×7 grid with 3 Crystals and the most complex route.',
    extra:'cataclysm'
  },
  {
    icon:'💬',
    title:'Results Post Automatically',
    text:'When you finish an official grid, your verified Discord name, avatar, score, and a covered teaser of the board are automatically posted in the Distortion Grid channel.'
  },
  {
    icon:'📅',
    title:'One Official Grid Per Day',
    text:'You get one official attempt per Discord account each day. Finish on your phone and your computer will know you already played — and vice versa.'
  },
  {
    icon:'🚀',
    title:'Ready for Today’s Grid?',
    text:'The tutorial is complete. Your next button starts the real daily challenge. From this point on, the official one-attempt-per-day rules apply.',
    ready:true
  }
];

function setTutorialPageMode(enabled){
  document.documentElement.classList.toggle('tutorial-page-mode',enabled);
  document.body.classList.toggle('tutorial-page-mode',enabled);
}

function clearTutorialHighlight(){
  document.querySelectorAll('.tutorial-highlight').forEach(el=>el.classList.remove('tutorial-highlight'));

  const mask=document.getElementById('tutorialModal');
  if(mask){
    mask.classList.remove('coach-top','coach-bottom','coach-center');
  }
}

function positionTutorialCoachForTarget(el){
  const mask=document.getElementById('tutorialModal');
  if(!mask) return;

  mask.classList.remove('coach-top','coach-bottom','coach-center');

  if(!el){
    mask.classList.add('coach-bottom');
    return;
  }

  const rect=el.getBoundingClientRect();
  const center=rect.top+(rect.height/2);

  // Put the coach opposite the target so the explanation doesn't cover it.
  if(center < window.innerHeight*0.52){
    mask.classList.add('coach-bottom');
  }else{
    mask.classList.add('coach-top');
  }
}

function centerTutorialTarget(selector,{instant=false}={}){
  if(!selector) return false;

  const el=document.querySelector(selector);
  if(!el) return false;

  setTutorialPageMode(true);

  try{
    el.scrollIntoView({
      behavior:instant?'auto':'smooth',
      block:'center',
      inline:'nearest'
    });
  }catch{
    try{el.scrollIntoView()}catch{}
  }

  // Reposition the coach after scrolling settles.
  setTimeout(()=>positionTutorialCoachForTarget(el),instant?0:280);
  return true;
}

function highlightTutorialTarget(selector){
  clearTutorialHighlight();

  if(!selector){
    positionTutorialCoachForTarget(null);
    return;
  }

  const el=document.querySelector(selector);

  if(!el){
    positionTutorialCoachForTarget(null);
    return;
  }

  el.classList.add('tutorial-highlight');
  centerTutorialTarget(selector,{instant:false});
}

function tutorialCataclysmPreview(){
  let cells='';
  for(let i=0;i<49;i++){
    const special=[3,17,31,45].includes(i);
    cells+=`<span class="${special?'special':''}"></span>`;
  }

  return `
    <div class="tutorial-cataclysm-preview" aria-label="Covered 7 by 7 Cataclysm preview">
      ${cells}
    </div>
    <small>A covered 7×7 example — the real route stays hidden.</small>
  `;
}

function tutorialAllSteps(){
  return [...TUTORIAL_STEPS,...TUTORIAL_AFTER_PRACTICE];
}

function showTutorialCoach(){
  setTutorialPageMode(true);
  document.getElementById('tutorialModal')?.classList.remove('hidden');
}

function hideTutorialCoach(){
  document.getElementById('tutorialModal')?.classList.add('hidden');
  clearTutorialHighlight();
  setTutorialPageMode(false);
}

function renderTutorialStep(){
  const all=tutorialAllSteps();
  const step=all[S.tutorialStep];

  if(!step) return;

  const icon=document.getElementById('tutorialCoachIcon');
  const title=document.getElementById('tutorialCoachTitle');
  const text=document.getElementById('tutorialCoachText');
  const extra=document.getElementById('tutorialExtra');
  const back=document.getElementById('tutorialBack');
  const showMe=document.getElementById('tutorialShowMe');
  const next=document.getElementById('tutorialNext');
  const progress=document.getElementById('tutorialProgressText');

  icon.textContent=step.icon||'✦';
  title.textContent=step.title;
  text.textContent=step.text;
  progress.textContent=`${S.tutorialStep+1} / ${all.length}`;

  extra.innerHTML='';
  extra.classList.add('hidden');

  if(step.extra==='cataclysm'){
    extra.innerHTML=tutorialCataclysmPreview();
    extra.classList.remove('hidden');
  }

  back.disabled=S.tutorialStep===0 || S.tutorialPracticeLive;

  if(showMe){
    showMe.classList.toggle('hidden',!step.target);
    showMe.disabled=!step.target;
    showMe.dataset.target=step.target||'';
  }

  if(step.practiceStart){
    next.textContent='Start 6×6 Practice';
    next.classList.add('tutorial-ready-button');
  }else if(step.ready){
    next.textContent='READY FOR TODAY’S GRID';
    next.classList.add('tutorial-ready-button');
  }else{
    next.textContent='Next';
    next.classList.remove('tutorial-ready-button');
  }

  highlightTutorialTarget(step.target);
  showTutorialCoach();
}

function tutorialConnect(a,b){
  const dr=b.r-a.r,dc=b.c-a.c;
  const d=dr===-1?'N':dr===1?'S':dc===1?'E':'W';

  if(!a.base.includes(d)) a.base.push(d);
  if(!b.base.includes(O[d])) b.base.push(O[d]);
}

function buildTutorialPracticeGrid(){
  clearInterval(S.timer);
  clearInterval(S.studyTimer);

  S.tutorialMode=true;
  S.tutorialPracticeLive=false;
  S.tutorialPracticeSolved=false;
  S.isTest=true;
  S.n=6;
  S.difficulty='Tutorial';
  S.crystalCount=1;
  S.moves=0;
  S.start=null;
  S.done=false;
  S.finished=null;
  S.studying=false;
  S.gaveUp=false;
  S.lastPowered=new Set();
  S.lastPoweredCrystals=new Set();
  S.guidePaused=false;
  S.guidePauseStarted=null;
  S.guidePausedMs=0;
  S.key='tutorial-practice';

  const tiles=Array.from({length:6},(_,r)=>
    Array.from({length:6},(_,c)=>({
      r,c,base:[],rot:0,kind:'decoy',on:false,required:false
    }))
  );

  const route=[
    {r:5,c:0},
    {r:4,c:0},
    {r:3,c:0},
    {r:2,c:0},
    {r:2,c:1},
    {r:2,c:2},
    {r:2,c:3},
    {r:2,c:4},
    {r:3,c:4},
    {r:4,c:4},
    {r:4,c:5},
    {r:3,c:5},
    {r:2,c:5},
    {r:1,c:5},
    {r:0,c:5}
  ];

  route.forEach(p=>{
    const t=tiles[p.r][p.c];
    t.required=true;
    t.kind='normal';
  });

  for(let i=0;i<route.length-1;i++){
    tutorialConnect(
      tiles[route[i].r][route[i].c],
      tiles[route[i+1].r][route[i+1].c]
    );
  }

  tiles[5][0].kind='core';
  tiles[2][2].kind='crystal';
  tiles[0][5].kind='exit';

  const decoys=[
    ['N','S'],['E','W'],['N','E'],['E','S'],['S','W'],['W','N'],
    ['N'],['E'],['S'],['W']
  ];

  let di=0;
  tiles.flat().forEach(t=>{
    if(!t.required){
      t.base=[...decoys[di%decoys.length]];
      t.rot=(di*3+1)%4;
      di++;
    }
  });

  // Controlled scramble: the practice route only needs a small number of clicks.
  const rotations=[1,0,3,0,1,0,3,0,1,0,3,0,1,0,1];
  route.forEach((p,i)=>{
    tiles[p.r][p.c].rot=rotations[i]%4;
  });

  S.tiles=tiles;
  S.perfectMin=Math.max(
    1,
    route.reduce((sum,p)=>sum+clockwiseDistanceToSolved(tiles[p.r][p.c]),0)
  );
  S.min=S.perfectMin+3;
  S.num=0;

  document.body.classList.remove('theme-stable','theme-fractured','theme-cataclysm');
  document.body.classList.add('theme-unstable');

  const badge=document.getElementById('difficultyBadge');
  badge.textContent='PRACTICE';
  badge.className='badge diff-unstable';

  const board=document.getElementById('board');
  board.style.gridTemplateColumns='repeat(6,1fr)';

  document.getElementById('gridNum').textContent='Tutorial Grid';
  document.getElementById('moves').textContent='0';
  document.getElementById('par').textContent=S.min;
  document.getElementById('time').textContent='0:00';

  const phase=document.getElementById('phaseBanner');
  phase.textContent='Tutorial';
  phase.classList.remove('live');

  document.getElementById('giveUp')?.setAttribute('disabled','disabled');
  document.getElementById('new')?.setAttribute('disabled','disabled');

  render();
  applyCosmetics();
}

function startTutorialPractice(){
  hideTutorialCoach();
  setTutorialPageMode(false);

  S.tutorialPracticeLive=true;
  S.studying=true;
  S.studyRemaining=5;

  const board=document.getElementById('board');
  const overlay=document.getElementById('studyOverlay');
  const countdown=document.getElementById('studyCountdown');
  const phase=document.getElementById('phaseBanner');
  const hint=document.getElementById('tutorialPracticeHint');

  board?.classList.add('studying');
  overlay?.classList.remove('hidden');
  hint?.classList.remove('hidden');

  if(countdown) countdown.textContent='5';
  if(phase){
    phase.textContent='Practice Study 5s';
    phase.classList.remove('live');
  }

  S.studyTimer=setInterval(()=>{
    S.studyRemaining--;

    if(countdown) countdown.textContent=String(Math.max(0,S.studyRemaining));
    if(phase) phase.textContent=`Practice Study ${Math.max(0,S.studyRemaining)}s`;

    if(S.studyRemaining<=0){
      clearInterval(S.studyTimer);
      S.studying=false;
      board?.classList.remove('studying');
      overlay?.classList.add('hidden');

      if(phase){
        phase.textContent='Practice Live';
        phase.classList.add('live');
      }

      startClock();
    }
  },1000);
}

function finishTutorialPractice(){
  if(S.tutorialPracticeSolved) return;

  clearInterval(S.timer);
  clearInterval(S.studyTimer);

  S.tutorialPracticeSolved=true;
  S.tutorialPracticeLive=false;
  S.done=true;
  S.finished=Date.now();

  document.getElementById('tutorialPracticeHint')?.classList.add('hidden');

  const board=document.getElementById('board');
  board?.querySelectorAll('.tile').forEach(el=>{
    el.classList.add('on-complete');
  });

  overloadSound();

  // Resume tutorial immediately after the practice step.
  S.tutorialStep=TUTORIAL_STEPS.length;
  setTimeout(()=>{
    renderTutorialStep();
  },650);
}


async function fetchServerTutorialStatus(){
  try{
    const response=await authenticatedFetch('/api/player/tutorial');
    const data=await response.json().catch(()=>({}));

    if(!response.ok){
      throw new Error(data.error||response.statusText||'Could not check tutorial status.');
    }

    S.tutorialStatusResolved=true;
    S.tutorialServerComplete=Boolean(data.tutorialComplete);

    if(S.tutorialServerComplete){
      localStorage.setItem(TUTORIAL_COMPLETE_KEY,'1');
      localStorage.setItem('dg_tutorial_seen_v1','1');
    }else{
      localStorage.removeItem(TUTORIAL_COMPLETE_KEY);
    }

    return S.tutorialServerComplete;
  }catch(error){
    console.error('Server tutorial-status check failed:',error);
    S.tutorialStatusResolved=false;
    throw error;
  }
}

async function saveServerTutorialComplete(){
  const response=await authenticatedFetch('/api/player/tutorial/complete',{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:'{}'
  });

  const data=await response.json().catch(()=>({}));

  if(!response.ok){
    throw new Error(data.error||response.statusText||'Could not save tutorial completion.');
  }

  S.tutorialStatusResolved=true;
  S.tutorialServerComplete=true;
  localStorage.setItem(TUTORIAL_COMPLETE_KEY,'1');
  localStorage.setItem('dg_tutorial_seen_v1','1');

  return true;
}

function showTutorialProfileCheck(){
  clearInterval(S.timer);
  clearInterval(S.studyTimer);

  S.studying=true;
  S.done=false;

  document.getElementById('tutorialModal')?.classList.add('hidden');
  document.getElementById('tutorialPracticeHint')?.classList.add('hidden');
  document.getElementById('studyOverlay')?.classList.add('hidden');
  document.getElementById('board')?.classList.add('studying');

  const board=document.getElementById('board');
  if(board && !board.children.length){
    board.innerHTML='<div style="grid-column:1/-1;display:grid;place-items:center;min-height:220px;color:#cbb9e8;font-weight:800;text-align:center;padding:20px">Checking your Distortion Grid profile…</div>';
  }

  const phase=document.getElementById('phaseBanner');
  if(phase){
    phase.textContent='Checking Profile…';
    phase.classList.remove('live');
  }
}

function startInteractiveTutorial(){
  buildTutorialPracticeGrid();
  S.tutorialStep=0;
  renderTutorialStep();
}

async function completeInteractiveTutorial(){
  const readyButton=document.getElementById('tutorialNext');

  if(readyButton){
    readyButton.disabled=true;
    readyButton.textContent='SAVING…';
  }

  try{
    await saveServerTutorialComplete();
  }catch(error){
    console.error('Could not save tutorial completion:',error);

    if(readyButton){
      readyButton.disabled=false;
      readyButton.textContent='RETRY READY';
    }

    const text=document.getElementById('tutorialCoachText');
    if(text){
      text.textContent='I could not save your tutorial completion to Discord yet. Tap RETRY READY so your progress is remembered on every device.';
    }

    return;
  }

  clearInterval(S.timer);
  clearInterval(S.studyTimer);

  S.tutorialMode=false;
  S.tutorialPracticeLive=false;
  S.tutorialPracticeSolved=false;
  S.studying=false;
  S.done=false;
  S.start=null;
  S.finished=null;

  // Completely remove every tutorial layer before loading the official puzzle.
  hideTutorialCoach();
  clearTutorialHighlight();
  setTutorialPageMode(false);
  document.getElementById('tutorialModal')?.classList.add('hidden');
  document.getElementById('tutorialPracticeHint')?.classList.add('hidden');
  document.getElementById('studyOverlay')?.classList.add('hidden');
  document.getElementById('board')?.classList.remove('studying');

  const phase=document.getElementById('phaseBanner');
  if(phase){
    phase.classList.remove('live','incomplete');
  }

  document.getElementById('giveUp')?.removeAttribute('disabled');

  // Test controls stay hidden unless Admin Test Mode is actually enabled.
  updateTestModeUI();

  // This enters the normal server-checked daily flow.
  // Use a short frame delay so the tutorial DOM finishes hiding first.
  requestAnimationFrame(()=>{
    reset(false);
  });
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
  if(S.studying||S.start)return;
  S.start=Date.now();

  if(!document.getElementById('infoModal')?.classList.contains('hidden')){
    S.guidePaused=true;
    S.guidePauseStarted=Date.now();
  }

  S.timer=setInterval(clock,250);
  clock();
}
function clock(){
  if(!S.start)return;
  let sec=Math.floor(gameplayElapsedMs()/1000);
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
function turn(r,c){
  if(S.done||S.studying)return;
  if(S.tutorialMode && !S.tutorialPracticeLive)return;

  startClock();
  let t=S.tiles[r][c];
  t.rot=(t.rot+1)%4;
  S.moves++;
  render();

  if(!S.tutorialMode && !S.isTest){
    queueActiveAttemptSave();
  }

  if(solved()){
    if(S.tutorialMode) finishTutorialPractice();
    else finish();
  }
}
function stars(){return distortionScore().label}
function text(){
  return `🌌 DISTORTION GRID #${String(S.num).padStart(3,'0')}
${S.isDailyChampion?'👑 NEW DAILY CHAMPION':'✅ Stabilized'}
🔄 ${S.moves} moves (Par ${S.min})
⏱️ ${document.getElementById('time').textContent}
${distortionScore().label} — ${distortionScore().detail}

🟪🟪🟪🟪🟪
🟪✨✨✨🟪
🟪✨🌌✨🟪
🟪✨✨✨🟪
🟪🟪🟪🟪🟪

🔥 Daily Distortion complete!`
}

function secondsTaken(){
  if(!S.start) return 0;
  return Math.max(0,Math.floor(gameplayElapsedMs()/1000))
}
function formatSec(sec){return Math.floor(sec/60)+":"+String(sec%60).padStart(2,'0')}

function currentGuidePauseMs(){
  return S.guidePaused && S.guidePauseStarted
    ? Date.now()-S.guidePauseStarted
    : 0;
}

function gameplayElapsedMs(endTime=null){
  if(!S.start) return 0;
  const end=endTime ?? (S.done?S.finished:Date.now());
  return Math.max(0,end-S.start-S.guidePausedMs-currentGuidePauseMs());
}


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

let giveUpArmedUntil=0;

function resetGiveUpButton(){
  const btn=document.getElementById('giveUp');
  if(!btn) return;

  btn.textContent='Give Up';
  btn.classList.remove('confirming');
  giveUpArmedUntil=0;
}

function giveUp(){
  if(S.done || S.gaveUp) return;

  const btn=document.getElementById('giveUp');
  const now=Date.now();

  // Discord Activities can block native window.confirm(), so use an
  // in-app two-click confirmation instead.
  if(now>giveUpArmedUntil){
    giveUpArmedUntil=now+6000;

    if(btn){
      btn.textContent='CONFIRM GIVE UP';
      btn.classList.add('confirming');
    }

    setTimeout(()=>{
      if(Date.now()>giveUpArmedUntil && !S.done && !S.gaveUp){
        resetGiveUpButton();
      }
    },6100);

    return;
  }

  giveUpArmedUntil=0;

  if(btn){
    btn.disabled=true;
    btn.textContent='Giving Up…';
    btn.classList.remove('confirming');
  }

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
    saveGiveUpToServer(incompleteAttempt);
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

  async function sendAttempt(){
    let auth=getDiscordAuth();

    if(!auth?.access_token){
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
        scoreLabel:distortionScore().short,
        seconds,
        streak,
        rank,
        isChampion:S.isDailyChampion,
        isPerfect:S.moves===S.perfectMin,
        isTest:S.isTest,
        state:serializeOfficialBoardState()
      })
    });

    const data=await response.json().catch(()=>({}));

    if(!response.ok){
      const err=new Error(data.error||response.statusText||'Result post failed.');
      err.status=response.status;
      throw err;
    }

    return data;
  }

  try{
    if(status) status.textContent='Posting result to Discord…';

    let data;

    try{
      data=await sendAttempt();
    }catch(firstError){
      console.warn('First Discord result post failed; retrying once.',firstError);
      if(status) status.textContent='Retrying Discord post…';
      data=await sendAttempt();
    }

    if(status){
      status.textContent=data?.duplicate
        ? '✓ Result already posted to Discord'
        : '✓ Posted automatically to Discord';
    }

    return true;
  }catch(error){
    console.error('Could not post Distortion Grid result to Discord:',error);
    if(status){
      status.textContent=`⚠ Discord post failed: ${error?.message||'Unknown error'}`;
    }
    return false;
  }
}

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
  document.getElementById('rStars').textContent=distortionScore().label;
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
  
window.addEventListener('pagehide',()=>{
  saveActiveAttemptState({keepalive:true});
});

document.addEventListener('visibilitychange',()=>{
  if(document.visibilityState==='hidden'){
    saveActiveAttemptState({keepalive:true});
  }
});

document.getElementById('streak').textContent='🔥 '+st;

  const myRank=Math.max(
    1,
    rows.findIndex(r=>r.name===name && r.moves===S.moves && r.seconds===sec)+1
  );

  const score=distortionScore();
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

  // The official attempt is consumed immediately once completed.
  document.getElementById('giveUp')?.setAttribute('disabled','disabled');

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

  S.moves=0;S.start=null;S.done=false;S.finished=null;S.isTest=test;S.guidePaused=false;S.guidePauseStarted=null;S.guidePausedMs=0;S.lastPowered=new Set();S.lastPoweredCrystals=new Set();S.isDailyChampion=false;S.gaveUp=false;S.serverAttempt=null;

  const localTutorialComplete=localStorage.getItem(TUTORIAL_COMPLETE_KEY)==='1';

  // For a normal launch, PostgreSQL is the cross-device authority for onboarding.
  // Do not start the tutorial until Discord auth has resolved the player's profile.
  if(!test && !S.tutorialStatusResolved){
    if(localTutorialComplete){
      // Local completion lets the game continue quickly on a known device.
      // The server check after Discord auth will still confirm it.
      S.tutorialServerComplete=true;
    }else{
      showTutorialProfileCheck();
      return;
    }
  }

  const guidedTutorialComplete=
    S.tutorialServerComplete ||
    localStorage.getItem(TUTORIAL_COMPLETE_KEY)==='1';

  if(!test && !guidedTutorialComplete){
    const existingAttempt=getDailyAttempt();

    if(existingAttempt){
      showDailyLock(existingAttempt);
      return;
    }

    startInteractiveTutorial();
    return;
  }

  S.tutorialMode=false;

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
  resetGiveUpButton();
  updateRecordPanel();
  updateTestButton();
  updateTestModeUI();
  render();
  applyCosmetics();

  if(!test && enforceDailyAttemptLock()){
    return;
  }

  if(test){
    startStudyPhase();
  }else{
    prepareOfficialAttempt();
  }
}






document.getElementById('tutorialShowMe').onclick=()=>{
  const all=tutorialAllSteps();
  const step=all[S.tutorialStep];

  if(!step?.target) return;

  highlightTutorialTarget(step.target);
};

window.addEventListener('resize',()=>{
  if(!S.tutorialMode) return;

  const step=tutorialAllSteps()[S.tutorialStep];
  if(step?.target){
    const el=document.querySelector(step.target);
    if(el) positionTutorialCoachForTarget(el);
  }
});

document.getElementById('tutorialBack').onclick=()=>{
  if(S.tutorialPracticeLive)return;

  const practiceIndex=TUTORIAL_STEPS.length-1;

  if(S.tutorialStep===TUTORIAL_STEPS.length){
    S.tutorialStep=practiceIndex;
  }else{
    S.tutorialStep=Math.max(0,S.tutorialStep-1);
  }

  renderTutorialStep();
};

document.getElementById('tutorialNext').onclick=()=>{
  const all=tutorialAllSteps();
  const step=all[S.tutorialStep];

  if(step?.practiceStart){
    startTutorialPractice();
    return;
  }

  if(step?.ready){
    completeInteractiveTutorial();
    return;
  }

  S.tutorialStep=Math.min(all.length-1,S.tutorialStep+1);
  renderTutorialStep();
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

document.getElementById('adminResetTutorial').onclick=async()=>{
  const btn=document.getElementById('adminResetTutorial');
  btn.disabled=true;
  adminMessage('Resetting guided tutorial…');

  try{
    const response=await authenticatedFetch('/api/admin/tutorial',{
      method:'DELETE'
    });

    const data=await response.json().catch(()=>({}));

    if(!response.ok){
      throw new Error(data.error||response.statusText||'Could not reset tutorial.');
    }

    localStorage.removeItem('dg_tutorial_seen_v1');
    localStorage.removeItem(TUTORIAL_COMPLETE_KEY);
    S.tutorialStatusResolved=true;
    S.tutorialServerComplete=false;

    adminMessage('Guided tutorial reset for your Discord account. It will run on the next normal load.');
  }catch(error){
    console.error('Tutorial reset failed:',error);
    adminMessage(`Could not reset tutorial: ${error?.message||error}`);
  }finally{
    btn.disabled=false;
  }
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

let clearDiscordChannelArmedUntil=0;

document.getElementById('adminClearDiscordChannel').onclick=async()=>{
  const btn=document.getElementById('adminClearDiscordChannel');
  const now=Date.now();

  if(now>clearDiscordChannelArmedUntil){
    clearDiscordChannelArmedUntil=now+6000;
    btn.textContent='CONFIRM CLEAR DISCORD CHANNEL';
    adminMessage('Click again within 6 seconds to delete messages from the Distortion Grid Discord channel.');

    setTimeout(()=>{
      if(Date.now()>clearDiscordChannelArmedUntil){
        btn.textContent='Clear Discord Channel';
        clearDiscordChannelArmedUntil=0;
      }
    },6100);

    return;
  }

  clearDiscordChannelArmedUntil=0;
  btn.disabled=true;
  btn.textContent='Clearing…';
  adminMessage('Deleting messages from the Discord channel…');

  try{
    let auth=getDiscordAuth();

    if(!auth?.access_token){
      auth=await initDiscord();
    }

    if(!auth?.access_token){
      throw new Error('Discord authentication is not ready.');
    }

    const response=await fetch('/api/admin/clear-discord-channel',{
      method:'POST',
      headers:{
        'Authorization':`Bearer ${auth.access_token}`,
        'Content-Type':'application/json'
      },
      body:'{}'
    });

    const data=await response.json().catch(()=>({}));

    if(!response.ok){
      throw new Error(data.error||response.statusText||'Could not clear Discord channel.');
    }

    adminMessage(`Discord channel cleared. Deleted ${data.deleted||0} messages.`);
  }catch(error){
    console.error('Clear Discord channel failed:',error);
    adminMessage(`Could not clear Discord channel: ${error?.message||error}`);
  }finally{
    btn.disabled=false;
    btn.textContent='Clear Discord Channel';
  }
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

let resetEverythingArmedUntil=0;

document.getElementById('adminResetEverything').onclick=async()=>{
  const btn=document.getElementById('adminResetEverything');
  const now=Date.now();

  if(now>resetEverythingArmedUntil){
    resetEverythingArmedUntil=now+6000;
    btn.textContent='CONFIRM RESET EVERYTHING';
    btn.classList.add('admin-danger');
    adminMessage('Click RESET EVERYTHING again within 6 seconds to confirm.');

    setTimeout(()=>{
      if(Date.now()>resetEverythingArmedUntil){
        btn.textContent='Reset Everything';
        resetEverythingArmedUntil=0;
      }
    },6100);

    return;
  }

  resetEverythingArmedUntil=0;
  btn.disabled=true;
  btn.textContent='Resetting…';
  adminMessage('Clearing all Distortion Grid data…');

  // For the configured admin, also clear today's server-authoritative
  // official attempt so Reset Everything really gives you a clean test state.
  try{
    let auth=getDiscordAuth();

    if(!auth?.access_token){
      auth=await initDiscord();
    }

    if(auth?.access_token){
      const response=await fetch('/api/admin/today-attempt',{
        method:'DELETE',
        headers:{
          'Authorization':`Bearer ${auth.access_token}`
        }
      });

      if(!response.ok && response.status!==404){
        const data=await response.json().catch(()=>({}));
        console.warn('Server daily-attempt reset failed:',data.error||response.statusText);
      }
    }
  }catch(error){
    console.warn('Could not reset server daily attempt:',error);
  }

  // Clear every Distortion Grid key, including daily locks and Test Mode.
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

  // Clear any session-only state too.
  const sessionKeys=[];
  for(let i=0;i<sessionStorage.length;i++){
    const key=sessionStorage.key(i);
    if(key && (key.startsWith('dg_') || key.startsWith('distortion_'))){
      sessionKeys.push(key);
    }
  }
  sessionKeys.forEach(key=>sessionStorage.removeItem(key));

  // Restore only the prototype admin password.
  localStorage.setItem('dg_admin_password','distortion123');

  setTimeout(()=>{
    window.location.replace(window.location.href);
  },250);
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

function pauseForGuide(){
  // Study Phase deliberately continues. Only live gameplay time pauses.
  if(S.studying || S.done || !S.start || S.guidePaused) return;

  S.guidePaused=true;
  S.guidePauseStarted=Date.now();
  clock();
}

function resumeFromGuide(){
  if(!S.guidePaused) return;

  if(S.guidePauseStarted){
    S.guidePausedMs+=Date.now()-S.guidePauseStarted;
  }

  S.guidePaused=false;
  S.guidePauseStarted=null;
  clock();
}

function closeDistortionGuide(){
  document.getElementById('infoModal').classList.add('hidden');
  resumeFromGuide();
}

document.getElementById('infoBtn').onclick=()=>{
  pauseForGuide();
  document.getElementById('infoModal').classList.remove('hidden');
};

document.getElementById('closeInfo').onclick=closeDistortionGuide;
document.getElementById('infoModal').addEventListener('click',e=>{
  if(e.target.id==='infoModal') closeDistortionGuide();
});

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

function ensureDiscordStatusBadge(){
  let badge=document.getElementById('discordConnectionStatus');

  if(badge) return badge;

  badge=document.createElement('div');
  badge.id='discordConnectionStatus';
  badge.style.cssText=[
    'position:fixed',
    'left:12px',
    'top:12px',
    'z-index:9999',
    'padding:6px 9px',
    'border-radius:9px',
    'font:700 11px/1.2 system-ui,sans-serif',
    'background:#0d0a18e8',
    'border:1px solid #6b4d9b',
    'color:#d8cbff',
    'box-shadow:0 0 14px #0008',
    'max-width:min(360px,calc(100vw - 24px))',
    'white-space:normal',
    'pointer-events:none'
  ].join(';');

  badge.textContent='Discord: Connecting…';
  document.body.appendChild(badge);
  return badge;
}

function updateDiscordStatusBadge(detail){
  const badge=ensureDiscordStatusBadge();
  const user=detail?.user||getDiscordAuth()?.user;
  const error=detail?.error;

  if(user){
    const name=user.global_name||user.username||user.id;
    badge.textContent=`Discord: Connected as ${name}`;
    badge.style.borderColor='#35d07f';
    badge.style.color='#aef5ce';
    return;
  }

  if(error){
    badge.textContent=`Discord Login Error: ${error}`;
    badge.style.borderColor='#e85a7b';
    badge.style.color='#ffd0da';
    return;
  }

  badge.textContent='Discord: Connecting…';
}

ensureDiscordStatusBadge();

initDiscord().then(async auth=>{
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

  if(!isAdminTestMode()){
    showTutorialProfileCheck();

    // FIRST: today's official attempt is the strongest proof of player state.
    // This also recovers users who finished onboarding before player_profiles
    // was introduced.
    let serverAttempt=null;

    try{
      serverAttempt=await fetchServerDailyAttempt();
    }catch(error){
      console.warn('Initial daily-attempt lookup failed:',error);
    }

    if(serverAttempt){
      S.serverAttempt=serverAttempt;
      S.tutorialStatusResolved=true;
      S.tutorialServerComplete=true;
      localStorage.setItem(TUTORIAL_COMPLETE_KEY,'1');
      localStorage.setItem('dg_tutorial_seen_v1','1');

      // Backfill the profile table without blocking startup.
      saveServerTutorialComplete().catch(error=>{
        console.warn('Tutorial profile backfill failed:',error);
      });

      if(serverAttempt.status==='active'){
        // Generate today's deterministic board. prepareOfficialAttempt()
        // will receive the existing active row and restore rotations/timer.
        reset(false);
        return;
      }

      showDailyLock(serverAttempt);
      return;
    }

    // SECOND: no attempt today, so now determine whether onboarding is needed.
    let tutorialComplete=false;
    let tutorialError=null;

    for(let attempt=0;attempt<2;attempt++){
      try{
        tutorialComplete=await fetchServerTutorialStatus();
        tutorialError=null;
        break;
      }catch(error){
        tutorialError=error;
        if(attempt===0){
          await new Promise(resolve=>setTimeout(resolve,600));
        }
      }
    }

    if(tutorialError){
      console.error('Tutorial profile check failed after retry:',tutorialError);

      // If this device already knows onboarding was completed, use that as a
      // safe fallback rather than freezing on an empty board.
      if(localStorage.getItem(TUTORIAL_COMPLETE_KEY)==='1'){
        S.tutorialStatusResolved=true;
        S.tutorialServerComplete=true;
        reset(false);
        return;
      }

      const phase=document.getElementById('phaseBanner');
      if(phase){
        phase.textContent='Profile Error';
        phase.classList.remove('live');
      }

      // A brand-new player can still use onboarding rather than being stuck.
      S.tutorialStatusResolved=true;
      S.tutorialServerComplete=false;
      startInteractiveTutorial();
      return;
    }

    if(!tutorialComplete){
      startInteractiveTutorial();
      return;
    }

    if(S.tutorialMode){
      hideTutorialCoach();
      document.getElementById('tutorialPracticeHint')?.classList.add('hidden');
      S.tutorialMode=false;
    }

    // Tutorial is complete and there is no attempt yet today.
    reset(false);
  }
}).catch(err=>{
  console.error('Discord SDK authentication failed:',err);
  updateDiscordStatusBadge({stage:'error',error:err?.message||String(err)});
});
