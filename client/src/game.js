export const DIRS={N:[-1,0],E:[0,1],S:[1,0],W:[0,-1]};
export const OPP={N:'S',E:'W',S:'N',W:'E'};
export const ORDER=['N','E','S','W'];
export const DIFFICULTIES={
  Stable:{size:4,crystals:1,branches:2},
  Unstable:{size:5,crystals:1,branches:5},
  Fractured:{size:6,crystals:2,branches:8},
  Cataclysm:{size:7,crystals:3,branches:12}
};

export function hashString(str){
  let h=2166136261>>>0;
  for(let i=0;i<str.length;i++){h^=str.charCodeAt(i);h=Math.imul(h,16777619);}
  return h>>>0;
}

export function mulberry32(seed){
  return function(){
    let t=seed+=0x6D2B79F5;
    t=Math.imul(t^t>>>15,t|1);
    t^=t+Math.imul(t^t>>>7,t|61);
    return((t^t>>>14)>>>0)/4294967296;
  };
}

export function rotateDirs(dirs,steps){
  return dirs.map(d=>ORDER[(ORDER.indexOf(d)+steps)%4]);
}

export function generatePuzzle(seed,difficulty='Unstable'){
  const cfg=DIFFICULTIES[difficulty]||DIFFICULTIES.Unstable;
  const rand=mulberry32(seed);
  const size=cfg.size;
  const start={r:Math.floor(rand()*size),c:0};
  const end={r:Math.floor(rand()*size),c:size-1};
  let cur={...start};
  const path=[{...cur}],visited=new Set([`${cur.r},${cur.c}`]);

  while(cur.c<size-1){
    let options=[];
    if(cur.c<size-1) options.push({r:cur.r,c:cur.c+1});
    if(cur.r>0) options.push({r:cur.r-1,c:cur.c});
    if(cur.r<size-1) options.push({r:cur.r+1,c:cur.c});
    options=options.filter(p=>!visited.has(`${p.r},${p.c}`));
    if(!options.length) cur={r:cur.r,c:cur.c+1};
    else{
      const east=options.filter(p=>p.c>cur.c);
      cur=(east.length&&rand()<.72)?east[Math.floor(rand()*east.length)]:options[Math.floor(rand()*options.length)];
    }
    visited.add(`${cur.r},${cur.c}`);
    path.push({...cur});
  }

  while(cur.r!==end.r){
    cur={r:cur.r+(end.r>cur.r?1:-1),c:cur.c};
    if(!visited.has(`${cur.r},${cur.c}`)){visited.add(`${cur.r},${cur.c}`);path.push({...cur});}
  }

  const tiles=Array.from({length:size},(_,r)=>Array.from({length:size},(_,c)=>({r,c,base:[],rot:0,kind:'normal',on:false,required:false})));
  path.forEach(p=>tiles[p.r][p.c].required=true);

  function connect(a,b){
    const dr=b.r-a.r,dc=b.c-a.c;
    const d=dr===-1?'N':dr===1?'S':dc===1?'E':'W';
    if(!tiles[a.r][a.c].base.includes(d)) tiles[a.r][a.c].base.push(d);
    if(!tiles[b.r][b.c].base.includes(OPP[d])) tiles[b.r][b.c].base.push(OPP[d]);
  }

  for(let i=0;i<path.length-1;i++) connect(path[i],path[i+1]);

  tiles[start.r][start.c].kind='core';
  tiles[end.r][end.c].kind='exit';

  const crystals=[];
  for(let i=1;i<=cfg.crystals;i++){
    const idx=Math.max(1,Math.min(path.length-2,Math.floor(path.length*(i/(cfg.crystals+1)))));
    const cp=path[idx];
    if(!crystals.some(x=>x.r===cp.r&&x.c===cp.c)) crystals.push(cp);
  }
  crystals.forEach(cp=>tiles[cp.r][cp.c].kind='crystal');

  const pats=[['N','S'],['E','W'],['N','E'],['E','S'],['S','W'],['W','N']];
  let par=0;
  for(let r=0;r<size;r++)for(let c=0;c<size;c++){
    const t=tiles[r][c];
    if(!t.base.length){t.base=pats[Math.floor(rand()*pats.length)];t.kind='decoy';}
    t.rot=Math.floor(rand()*4);
    if(t.required) par+=(4-t.rot)%4;
  }

  return {tiles,size,par:Math.max(1,par),difficulty};
}
