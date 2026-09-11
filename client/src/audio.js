let audioCtx=null;
let soundOn=true;

export function setSoundEnabled(v){soundOn=!!v;}
export function isSoundEnabled(){return soundOn;}

function getCtx(){
  if(!soundOn)return null;
  try{
    if(!audioCtx)audioCtx=new(window.AudioContext||window.webkitAudioContext)();
    if(audioCtx.state==='suspended')audioCtx.resume();
    return audioCtx;
  }catch{return null;}
}

export function zapSound(){
  const c=getCtx();if(!c)return;
  const now=c.currentTime,osc=c.createOscillator(),gain=c.createGain();
  osc.type='sawtooth';
  osc.frequency.setValueAtTime(760,now);
  osc.frequency.exponentialRampToValueAtTime(190,now+.085);
  gain.gain.setValueAtTime(.0001,now);
  gain.gain.exponentialRampToValueAtTime(.05,now+.006);
  gain.gain.exponentialRampToValueAtTime(.0001,now+.09);
  osc.connect(gain);gain.connect(c.destination);
  osc.start(now);osc.stop(now+.1);
}

export function overloadSound(){
  const c=getCtx();if(!c)return;
  const now=c.currentTime,osc=c.createOscillator(),gain=c.createGain();
  osc.type='sawtooth';
  osc.frequency.setValueAtTime(115,now);
  osc.frequency.exponentialRampToValueAtTime(48,now+.6);
  gain.gain.setValueAtTime(.0001,now);
  gain.gain.exponentialRampToValueAtTime(.11,now+.02);
  gain.gain.exponentialRampToValueAtTime(.0001,now+.65);
  osc.connect(gain);gain.connect(c.destination);
  osc.start(now);osc.stop(now+.7);
}
