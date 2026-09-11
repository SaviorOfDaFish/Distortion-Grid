import './styles.css';
import {generatePuzzle,hashString,rotateDirs,DIRS,OPP} from './game.js';
import {zapSound,overloadSound,setSoundEnabled,isSoundEnabled} from './audio.js';
import {initDiscord} from './discord.js';

const app=document.querySelector('#app');
const difficulties=['Stable','Unstable','Fractured','Cataclysm'];
let state={puzzle:null,moves:0,studying:true,startedAt:null,finishedAt:null,lastPowered:new Set(),studyTimer:null,timerId:null,testIndex:0};

function todayKey(){
  const d=new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function currentDirs(t){return rotateDirs(t.base,t.rot);}

function shell(){
  app.innerHTML=`
    <div class="app-shell">
      <header class="topbar">
        <div><div class="eyebrow">MONSTER HUNT • DAILY PUZZLE</div><h1>Distortion Grid</h1></div>
        <div class="meta"><div id="gridNum">Grid #---</div><div id="difficultyBadge" class="badge">---</div></div>
      </header>
      <section class="hero">
        <div class="hero-row">
          <div><div class="eyebrow">TODAY'S DISTORTION</div><h2>Stabilize the Grid</h2></div>
          <div class="icon-actions">
            <button class="icon-btn" id="soundBtn">🔊</button>
            <button class="icon-btn" id="infoBtn">ⓘ</button>
          </div>
        </div>
        <div class="competition">
          <div class="champion"><div class="label">👑 Daily Champion</div><div class="value">Shared leaderboard comes next</div></div>
          <div class="stats">
            <div class="stat"><span>Moves</span><b id="moves">0</b></div>
            <div class="stat"><span>Par</span><b id="par">—</b></div>
            <div class="stat"><span>Time</span><b id="time">0:00</b></div>
            <div class="stat"><span>Streak</span><b>🔥 0</b></div>
            <div class="stat"><span>Phase</span><b id="phase">Study</b></div>
          </div>
        </div>
      </section>
      <div class="board-shell"><div id="board" class="board"></div></div>
      <div class="footer-row">
        <div class="key"><span>✦ Core</span><span>◆ Crystal</span><span>◈ Goal</span><span>━ Path</span></div>
        <button class="small-btn" id="testBtn">Test Difficulty</button>
      </div>
    </div>
  `;

  document.querySelector('#soundBtn').onclick=()=>{
    setSoundEnabled(!isSoundEnabled());
    document.querySelector('#soundBtn').textContent=isSoundEnabled()?'🔊':'🔇';
  };
  document.querySelector('#testBtn').onclick=()=>{
    state.testIndex=(state.testIndex+1)%difficulties.length;
    loadPuzzle(difficulties[state.testIndex],true);
  };
}

function renderBoard(){
  const board=document.querySelector('#board');
  board.innerHTML='';
  board.style.gridTemplateColumns=`repeat(${state.puzzle.size},1fr)`;

  state.puzzle.tiles.flat().forEach(t=>{
    const btn=document.createElement('button');
    btn.className='tile';
    btn.dataset.r=t.r;btn.dataset.c=t.c;

    for(const d of currentDirs(t)){
      const seg=document.createElement('div');
      seg.className='seg '+((d==='N'||d==='S')?'v':'h');
      if(d==='N'){seg.style.bottom='50%';seg.style.top='0'}
      if(d==='S'){seg.style.top='50%';seg.style.bottom='0'}
      if(d==='W'){seg.style.right='50%';seg.style.left='0'}
      if(d==='E'){seg.style.left='50%';seg.style.right='0'}
      btn.appendChild(seg);
    }

    const node=document.createElement('div');
    node.className='node';btn.appendChild(node);

    if(['core','crystal','exit'].includes(t.kind)){
      const icon=document.createElement('div');
      icon.className='icon';
      icon.textContent=t.kind==='core'?'✦':t.kind==='crystal'?'◆':'◈';
      btn.appendChild(icon);
    }

    btn.onclick=()=>rotateTile(t.r,t.c);
    board.appendChild(btn);
  });
  flow();
}

function flow(){
  state.puzzle.tiles.flat().forEach(t=>t.on=false);
  const core=state.puzzle.tiles.flat().find(t=>t.kind==='core');
  const q=[core];core.on=true;

  while(q.length){
    const t=q.shift();
    for(const d of currentDirs(t)){
      const [dr,dc]=DIRS[d],nr=t.r+dr,nc=t.c+dc;
      if(nr<0||nr>=state.puzzle.size||nc<0||nc>=state.puzzle.size)continue;
      const nt=state.puzzle.tiles[nr][nc];
      if(!currentDirs(nt).includes(OPP[d]))continue;
      if(!nt.on){nt.on=true;q.push(nt);}
    }
  }

  const powered=new Set(state.puzzle.tiles.flat().filter(t=>t.on).map(t=>`${t.r},${t.c}`));
  if(!state.studying&&state.startedAt){
    [...powered].filter(k=>!state.lastPowered.has(k)).slice(0,6).forEach((_,i)=>setTimeout(zapSound,i*22));
  }
  state.lastPowered=powered;

  document.querySelectorAll('.tile').forEach(el=>{
    const t=state.puzzle.tiles[+el.dataset.r][+el.dataset.c];
    if(t.on){
      el.querySelectorAll('.seg').forEach(s=>s.classList.add('on'));
      el.querySelector('.node')?.classList.add('on');
    }
  });
}

function solved(){
  flow();
  const exit=state.puzzle.tiles.flat().find(t=>t.kind==='exit');
  const crystals=state.puzzle.tiles.flat().filter(t=>t.kind==='crystal');
  return exit.on&&crystals.every(c=>c.on);
}

function rotateTile(r,c){
  if(state.studying||state.finishedAt)return;
  state.puzzle.tiles[r][c].rot=(state.puzzle.tiles[r][c].rot+1)%4;
  state.moves++;
  document.querySelector('#moves').textContent=state.moves;
  renderBoard();
  if(solved())finish();
}

function startStudy(seconds=15){
  clearInterval(state.studyTimer);clearInterval(state.timerId);
  state.moves=0;state.studying=true;state.startedAt=null;state.finishedAt=null;state.lastPowered=new Set();
  let remaining=seconds;
  document.querySelector('#moves').textContent='0';
  document.querySelector('#time').textContent='0:00';
  document.querySelector('#phase').textContent=`Study ${remaining}s`;
  renderBoard();

  state.studyTimer=setInterval(()=>{
    remaining--;
    document.querySelector('#phase').textContent=`Study ${remaining}s`;
    if(remaining<=0){
      clearInterval(state.studyTimer);
      state.studying=false;
      state.startedAt=Date.now();
      document.querySelector('#phase').textContent='Live';
      state.timerId=setInterval(()=>{
        const s=Math.floor((Date.now()-state.startedAt)/1000);
        document.querySelector('#time').textContent=`${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`;
      },250);
    }
  },1000);
}

function finish(){
  state.finishedAt=Date.now();
  clearInterval(state.timerId);
  overloadSound();
  document.querySelector('#phase').textContent='Done';
  alert(`Distortion stabilized in ${state.moves} moves!`);
}

function loadPuzzle(difficulty='Unstable',test=false){
  const seed=hashString(`${todayKey()}-${difficulty}-${test?Date.now():'daily'}`);
  state.puzzle=generatePuzzle(seed,difficulty);
  document.querySelector('#gridNum').textContent=`Grid #${String(seed%999+1).padStart(3,'0')}`;
  document.querySelector('#difficultyBadge').textContent=difficulty.toUpperCase();
  document.querySelector('#par').textContent=state.puzzle.par;
  startStudy(15);
}

async function boot(){
  shell();
  try{await initDiscord();}catch(e){console.warn('Discord SDK not ready yet',e);}
  loadPuzzle('Unstable');
}
boot();
