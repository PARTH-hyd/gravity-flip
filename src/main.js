// ============================================================
// GRAVITY FLIP — FULL UPGRADE
// Twist: Color Switching + Slow Motion ability
// Progression: Coins, Skins, Daily Reward
// Power-ups: Shield, Slow-mo, Double Score, Magnet
// Difficulty: Gradual speed + new obstacles per level
// ============================================================

const W = 480, H = 280;
const GROUND = H - 40, CEIL = 40;
const PW = 22, PH = 22, PX = 70;

let canvas, ctx;
let best      = parseInt(localStorage.getItem('gf_best') || '0');
let coins     = parseInt(localStorage.getItem('gf_coins') || '0');
let skinIdx   = parseInt(localStorage.getItem('gf_skin') || '0');
let vol       = parseFloat(localStorage.getItem('gf_vol') ?? '1');
let sfxOn     = localStorage.getItem('gf_sfx') !== 'false';
let lastDaily = localStorage.getItem('gf_daily') || '';
let unlockedSkins = JSON.parse(localStorage.getItem('gf_unlocked') || '[0]');

const SKINS = [
  { name:'Default', cost:0,   body:['#7FE0C0','#1D9E75'], flip:['#CEC8F8','#7F77DD'] },
  { name:'Inferno', cost:200, body:['#FFB347','#E24B4A'], flip:['#FFD080','#EF9F27'] },
  { name:'Neon',    cost:350, body:['#00FFCC','#0088AA'], flip:['#FF00FF','#AA00CC'] },
  { name:'Ghost',   cost:500, body:['#CCCCFF','#8888BB'], flip:['#FFFFFF','#AAAACC'] },
  { name:'Shadow',  cost:700, body:['#444466','#222233'], flip:['#666699','#333366'] },
];

let player, obstacles, coinPickups, powerupPickups, particles;
let score, speed, frame, state, flipCount = 0;
let shakeTimer = 0, shakeAmt = 0;
let slowTimer  = 0;
let shieldOn   = false;
let dblScore   = false, dblTimer = 0;
let magnetOn   = false, magnetTimer = 0;
let settingsOpen = false, shopOpen = false;
let homeAnim = 0, levelFlash = 0;
let currentLevel = 1;
let deathAnim = { active:false, timer:0, scale:0, vigAlpha:0, btnY:0, btnAlpha:0 };
let playerColorIdx = 0; // 0=normal 1=alt (color-switch mechanic)
let bgMusicTimer = 0;

// ---- AUDIO ----
let audioCtx = null;
let audioBus = null;
function getAudio(){
  if(!audioCtx){
    const AudioCtor = window.AudioContext || window.webkitAudioContext;
    if(!AudioCtor) return null;
    audioCtx = new AudioCtor();
    audioBus = audioCtx.createGain();
    audioBus.gain.value = 0.9;
    audioBus.connect(audioCtx.destination);
  }
  return audioCtx;
}
async function unlockAudio(){
  const ac = getAudio();
  if(!ac) return null;
  if(ac.state === 'suspended'){
    try{ await ac.resume(); }catch(e){}
  }
  return ac.state === 'running' ? ac : null;
}
function playTone(freq,type,dur,gain=0.25,delay=0){
  if(!sfxOn || vol <= 0) return;
  try{
    const ac = getAudio();
    if(!ac || ac.state !== 'running') return;
    const start = ac.currentTime + delay;
    const peak = Math.max(0.0001, gain * vol);
    const attack = Math.min(0.02, dur * 0.35);
    const end = start + dur;
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.connect(g);
    g.connect(audioBus || ac.destination);
    o.type = type;
    o.frequency.setValueAtTime(freq, start);
    g.gain.setValueAtTime(0.0001, start);
    g.gain.linearRampToValueAtTime(peak, start + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, end);
    o.start(start);
    o.stop(end + 0.02);
  }catch(e){}
}
function playFlipSound(){ playTone(300+playerColorIdx*150,'sine',0.12,0.2); }
function playColorSound(){ playTone(playerColorIdx===0?520:320,'square',0.08,0.15); }
function playCoinSound(){ playTone(880,'sine',0.08,0.15); }
function playPowerupSound(){ playTone(660,'sine',0.15,0.2); playTone(880,'sine',0.15,0.2,0.08); }
function playDeathSound(){
  [200,150,100].forEach((f,i)=>playTone(f,'sawtooth',0.25,0.18,i*0.08));
}
function playBGMusic(){
  [261,329,392,329,261,220,261,293].forEach((f,i)=>playTone(f,'triangle',0.18,0.04,i*0.18));
}
function tickBGMusic(){
  if(state!=='running') return;
  bgMusicTimer--;
  if(bgMusicTimer<=0){ playBGMusic(); bgMusicTimer=145; }
}

// ---- PARALLAX ----
const layers=[
  {objs:[],speed:0.2,type:'mountains'},
  {objs:[],speed:0.5,type:'buildings'},
  {objs:[],speed:0.9,type:'wires'},
];
function initLayers(){
  layers[0].objs=Array.from({length:6},(_,i)=>({x:i*90,w:60+Math.random()*40,h:30+Math.random()*40}));
  layers[1].objs=Array.from({length:8},(_,i)=>({x:i*70,w:18+Math.random()*20,h:20+Math.random()*50}));
  layers[2].objs=Array.from({length:4},(_,i)=>({x:i*120,y:CEIL+20+Math.random()*60}));
}
function updateLayers(){
  for(const l of layers){
    for(const o of l.objs){
      o.x-=speed*l.speed;
      if(o.x+(o.w||120)<0){
        o.x+=l.type==='wires'?480:600;
        if(o.h!==undefined) o.h=20+Math.random()*(l.type==='mountains'?40:50);
        if(o.w!==undefined) o.w=(l.type==='mountains'?60:18)+Math.random()*(l.type==='mountains'?40:20);
        if(l.type==='wires') o.y=CEIL+20+Math.random()*60;
      }
    }
  }
}
function drawLayers(){
  const sky=ctx.createLinearGradient(0,0,0,H);
  sky.addColorStop(0,'#0a0a1a');sky.addColorStop(1,'#0f1a2e');
  ctx.fillStyle=sky;ctx.fillRect(0,0,W,H);
  ctx.fillStyle='#1a1a3a';
  for(const o of layers[0].objs){ctx.beginPath();ctx.moveTo(o.x,GROUND);ctx.lineTo(o.x+o.w/2,GROUND-o.h);ctx.lineTo(o.x+o.w,GROUND);ctx.fill();}
  for(const o of layers[1].objs){
    ctx.fillStyle='#1e2a4a';ctx.fillRect(o.x,GROUND-o.h,o.w,o.h);
    ctx.fillStyle='rgba(255,220,100,0.15)';
    for(let wy=GROUND-o.h+6;wy<GROUND-4;wy+=10){ctx.fillRect(o.x+3,wy,4,5);if(o.w>24)ctx.fillRect(o.x+o.w-8,wy,4,5);}
  }
  ctx.strokeStyle='rgba(100,140,200,0.25)';ctx.lineWidth=1;
  for(const o of layers[2].objs){ctx.beginPath();ctx.moveTo(o.x,o.y);ctx.bezierCurveTo(o.x+40,o.y+12,o.x+80,o.y+12,o.x+120,o.y);ctx.stroke();}
  const gGrad=ctx.createLinearGradient(0,GROUND,0,H);
  gGrad.addColorStop(0,'#1D9E75');gGrad.addColorStop(1,'#0a5a40');
  ctx.fillStyle=gGrad;ctx.fillRect(0,GROUND,W,H-GROUND);
  const cGrad=ctx.createLinearGradient(0,0,0,CEIL);
  cGrad.addColorStop(0,'#4a3a8a');cGrad.addColorStop(1,'#7F77DD');
  ctx.fillStyle=cGrad;ctx.fillRect(0,0,W,CEIL);
  ctx.strokeStyle='rgba(127,119,221,0.4)';ctx.lineWidth=1.5;
  ctx.beginPath();ctx.moveTo(0,CEIL);ctx.lineTo(W,CEIL);ctx.stroke();
  ctx.strokeStyle='rgba(29,158,117,0.4)';
  ctx.beginPath();ctx.moveTo(0,GROUND);ctx.lineTo(W,GROUND);ctx.stroke();
}

// ---- PLAYER ----
function getSkin(){ return SKINS[skinIdx]; }
function initPlayer(){
  return{x:PX,y:GROUND-PH,vy:0,grav:1,flipped:false,rotation:0,
    flipStartRot:0,flipTargetRot:0,flipProgress:1,
    scaleX:1,scaleY:1,trail:[],runCycle:0};
}
function cubicBezier(t){
  const t2=t*t,t3=t2*t;
  return 3*0.17*t*(1-t)*(1-t)+3*0.83*t2*(1-t)+t3+t*(1-t)*(1-t)*0+t2*(1-t)*1+t3*1;
}
function cubicBezierSpring(t){
  return 1.2*(t<0.8?cubicBezier(t/0.8):1)-0.2*Math.max(0,1-(t-0.8)/0.2);
}
function updatePlayer(){
  if(player.flipProgress<1){
    player.flipProgress=Math.min(1,player.flipProgress+1/12);
    const eased=cubicBezier(player.flipProgress);
    player.rotation=player.flipStartRot+(player.flipTargetRot-player.flipStartRot)*eased;
    if(player.flipProgress>=1) player.rotation=player.flipTargetRot;
    speed=Math.min(speed+0.04,2.8+Math.floor(score/300)*0.45+0.3);
  }
  const gravMult=player.vy*player.grav<0?0.38:0.52;
  player.vy+=player.grav*gravMult;
  player.vy=Math.max(-11,Math.min(11,player.vy));
  player.y+=player.vy;
  player.runCycle+=0.18;
  const absVy=Math.abs(player.vy);
  if(absVy>3){player.scaleY+=(1+absVy*0.04-player.scaleY)*0.2;player.scaleX+=(1-absVy*0.02-player.scaleX)*0.2;}
  else{player.scaleY+=(1-player.scaleY)*0.2;player.scaleX+=(1-player.scaleX)*0.2;}
  if(player.y+PH>=GROUND){
    player.y=GROUND-PH;
    if(Math.abs(player.vy)>3){player.scaleX=1.4;player.scaleY=0.6;spawnDust(player.x+PW/2,GROUND,false);if(Math.abs(player.vy)>6)triggerShake(2);}
    player.vy=0;
  }
  if(player.y<=CEIL){
    player.y=CEIL;
    if(Math.abs(player.vy)>3){player.scaleX=1.4;player.scaleY=0.6;spawnDust(player.x+PW/2,CEIL+PH,true);}
    player.vy=0;
  }
  player.trail.unshift({x:player.x+PW/2,y:player.y+PH/2,vy:player.vy});
  if(player.trail.length>16) player.trail.pop();
}
function drawPlayer(){
  const skin=getSkin();
  const col=playerColorIdx===0?skin.body:skin.flip;
  for(let i=player.trail.length-1;i>=0;i--){
    const t=player.trail[i];
    ctx.globalAlpha=(1-i/player.trail.length)*0.22;
    ctx.fillStyle=col[1];
    const ts=1-i/player.trail.length;
    ctx.beginPath();ctx.ellipse(t.x,t.y,PW/2*ts,PH/2*ts*0.7,0,0,Math.PI*2);ctx.fill();
  }
  ctx.globalAlpha=1;
  // Shield aura
  if(shieldOn){
    ctx.save();
    ctx.globalAlpha=0.35+Math.sin(frame*0.15)*0.15;
    ctx.strokeStyle='#00FFCC';ctx.lineWidth=3;
    ctx.beginPath();ctx.arc(player.x+PW/2,player.y+PH/2,PW,0,Math.PI*2);ctx.stroke();
    ctx.globalAlpha=1;ctx.restore();
  }
  // Slow-mo aura
  if(slowTimer>0){
    ctx.save();
    ctx.globalAlpha=0.25;
    ctx.strokeStyle='#AFA9EC';ctx.lineWidth=2;
    ctx.setLineDash([3,3]);
    ctx.beginPath();ctx.arc(player.x+PW/2,player.y+PH/2,PW+4,0,Math.PI*2);ctx.stroke();
    ctx.setLineDash([]);ctx.globalAlpha=1;ctx.restore();
  }
  ctx.save();
  ctx.translate(player.x+PW/2,player.y+PH/2);
  ctx.rotate(player.rotation);
  ctx.scale(player.scaleX,player.scaleY);
  const bodyGrad=ctx.createLinearGradient(-PW/2,-PH/2,PW/2,PH/2);
  bodyGrad.addColorStop(0,col[0]);bodyGrad.addColorStop(1,col[1]);
  ctx.fillStyle=bodyGrad;rr(ctx,-PW/2,-PH/2,PW,PH,5);ctx.fill();
  ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(-4,-3,4,0,Math.PI*2);ctx.fill();
  ctx.fillStyle='#0f0f1a';ctx.beginPath();ctx.arc(-3,-3,2.2,0,Math.PI*2);ctx.fill();
  ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(-2.2,-3.8,0.8,0,Math.PI*2);ctx.fill();
  const legSwing=Math.sin(player.runCycle)*5;
  ctx.strokeStyle=col[1];ctx.lineWidth=3;ctx.lineCap='round';
  ctx.beginPath();ctx.moveTo(-4,PH/2-2);ctx.lineTo(-4+legSwing,PH/2+5);ctx.stroke();
  ctx.beginPath();ctx.moveTo(4,PH/2-2);ctx.lineTo(4-legSwing,PH/2+5);ctx.stroke();
  ctx.restore();
}

// ---- PARTICLES ----
function spawnDust(x,y,fromCeil){
  for(let i=0;i<8;i++) particles.push({x,y,vx:(Math.random()-0.5)*4,vy:fromCeil?Math.random()*3:-Math.random()*3,life:1,r:2+Math.random()*3,color:fromCeil?'#7F77DD':'#1D9E75',type:'dust'});
}
function spawnFlipParticles(x,y){
  const col=getSkin();const c=playerColorIdx===0?col.body[0]:col.flip[0];
  for(let i=0;i<12;i++){const a=(i/12)*Math.PI*2;particles.push({x,y,vx:Math.cos(a)*(2+Math.random()*3),vy:Math.sin(a)*(2+Math.random()*3),life:1,r:2+Math.random()*3,color:c,type:'spark'});}
}
function spawnDeathParticles(x,y){
  for(let i=0;i<28;i++) particles.push({x,y,vx:(Math.random()-0.5)*12,vy:(Math.random()-0.5)*12,life:1,r:3+Math.random()*5,color:['#E24B4A','#EF9F27','#fff','#FF6B6B'][Math.floor(Math.random()*4)],type:'death'});
}
function spawnCoinParticles(x,y){
  for(let i=0;i<6;i++) particles.push({x,y,vx:(Math.random()-0.5)*4,vy:-Math.random()*3-1,life:1,r:2+Math.random()*2,color:'#EF9F27',type:'coin'});
}
function updateParticles(){
  for(const p of particles){p.x+=p.vx;p.y+=p.vy;p.vy+=p.type==='dust'?0.15:0.08;p.vx*=0.92;p.life-=p.type==='death'?0.04:0.06;p.r*=0.95;}
  particles=particles.filter(p=>p.life>0);
}
function drawParticles(){
  for(const p of particles){
    ctx.globalAlpha=p.life*0.85;ctx.fillStyle=p.color;
    if(p.type==='spark'){ctx.save();ctx.translate(p.x,p.y);ctx.rotate(Math.atan2(p.vy,p.vx));ctx.beginPath();ctx.ellipse(0,0,p.r*1.5,p.r*0.5,0,0,Math.PI*2);ctx.fill();ctx.restore();}
    else{ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,Math.PI*2);ctx.fill();}
  }
  ctx.globalAlpha=1;
}

function makeRect(x,y,w,h){ return {x,y,w,h}; }
function expandRect(rect,pad){ return makeRect(rect.x-pad,rect.y-pad,rect.w+pad*2,rect.h+pad*2); }
function rectsOverlap(a,b){
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}
function getPickupRect(x,y,size){ return makeRect(x-size/2,y-size/2,size,size); }
function getObstacleSpawnRect(o){
  if(o.type==='spike'){
    const y=o.side==='floor'?GROUND-o.h:CEIL;
    return makeRect(o.x,y,32,o.h);
  }
  if(o.type==='moving'){
    const travel=(o.amp||0)+14;
    return makeRect(o.baseX-travel,o.cy-o.h/2-10,o.w+travel*2,o.h+20);
  }
  const y=o.fromTop?CEIL:GROUND-o.h;
  return makeRect(o.x,y,o.w,o.h);
}
function pickupSpawnBlocked(x,y,size){
  const pickupRect=expandRect(getPickupRect(x,y,size),8);
  for(const o of obstacles){
    if(rectsOverlap(pickupRect,expandRect(getObstacleSpawnRect(o),10))) return true;
  }
  for(const c of coinPickups){
    if(c.collected) continue;
    if(rectsOverlap(pickupRect,expandRect(getPickupRect(c.x,c.y,c.r*2),12))) return true;
  }
  for(const p of powerupPickups){
    if(p.collected) continue;
    if(rectsOverlap(pickupRect,expandRect(getPickupRect(p.x,p.y,20),12))) return true;
  }
  return false;
}
function findPickupSpawn(preferredX,size,yMin,yMax){
  for(let attempt=0;attempt<24;attempt++){
    const x=preferredX+Math.random()*90;
    const y=yMin+Math.random()*(yMax-yMin);
    if(!pickupSpawnBlocked(x,y,size)) return {x,y};
  }
  return null;
}

// ---- COINS ----
function spawnCoin(x){
  const spawn=findPickupSpawn(x,16,CEIL+26,GROUND-26);
  if(!spawn) return;
  coinPickups.push({x:spawn.x,y:spawn.y,r:6,pulse:Math.random()*Math.PI*2,collected:false});
}
function updateCoins(){
  for(const c of coinPickups){
    c.x-=speed*(slowTimer>0?0.4:1);
    c.pulse+=0.08;
    if(magnetOn){
      const dx=player.x+PW/2-c.x,dy=player.y+PH/2-c.y;
      const dist=Math.sqrt(dx*dx+dy*dy);
      if(dist<80){c.x+=dx*0.06;c.y+=dy*0.06;}
    }
    if(!c.collected){
      const dx=player.x+PW/2-c.x,dy=player.y+PH/2-c.y;
      if(Math.sqrt(dx*dx+dy*dy)<c.r+PW/2){
        c.collected=true;
        const earn=dblScore?2:1;
        coins+=earn;localStorage.setItem('gf_coins',coins);
        score+=50*earn;
        playCoinSound();
        spawnCoinParticles(c.x,c.y);
      }
    }
  }
  coinPickups=coinPickups.filter(c=>c.x>-20&&!c.collected);
  if(coinPickups.length<2&&Math.random()<0.012) spawnCoin(W+30);
}
function drawCoins(){
  for(const c of coinPickups){
    const glow=0.7+Math.sin(c.pulse)*0.3;
    ctx.save();
    ctx.shadowColor='#EF9F27';ctx.shadowBlur=8*glow;
    ctx.fillStyle='#EF9F27';
    ctx.beginPath();ctx.arc(c.x,c.y,c.r,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#FFD080';
    ctx.beginPath();ctx.arc(c.x-1.5,c.y-1.5,c.r*0.45,0,Math.PI*2);ctx.fill();
    ctx.restore();
  }
}

// ---- POWER-UPS ----
const POWERUP_TYPES=['shield','slowmo','double','magnet'];
const POWERUP_COLORS={shield:'#00FFCC',slowmo:'#AFA9EC',double:'#E24B4A',magnet:'#EF9F27'};
const POWERUP_LABELS={shield:'🛡',slowmo:'⏱',double:'×2',magnet:'🧲'};

function spawnPowerup(x){
  const type=POWERUP_TYPES[Math.floor(Math.random()*POWERUP_TYPES.length)];
  const spawn=findPickupSpawn(x,24,CEIL+30,GROUND-30);
  if(!spawn) return;
  powerupPickups.push({x:spawn.x,y:spawn.y,type,pulse:Math.random()*Math.PI*2,collected:false});
}
function updatePowerups(){
  for(const p of powerupPickups){
    p.x-=speed*(slowTimer>0?0.4:1);
    p.pulse+=0.06;
    if(!p.collected){
      const dx=player.x+PW/2-p.x,dy=player.y+PH/2-p.y;
      if(Math.sqrt(dx*dx+dy*dy)<14){
        p.collected=true;
        activatePowerup(p.type);
      }
    }
  }
  powerupPickups=powerupPickups.filter(p=>p.x>-20&&!p.collected);
  if(powerupPickups.length<1&&Math.random()<0.004) spawnPowerup(W+30);
}
function activatePowerup(type){
  playPowerupSound();
  if(type==='shield'){shieldOn=true;setTimeout(()=>shieldOn=false,6000);}
  if(type==='slowmo'){slowTimer=300;}
  if(type==='double'){dblScore=true;dblTimer=400;}
  if(type==='magnet'){magnetOn=true;magnetTimer=400;}
  spawnFlipParticles(player.x+PW/2,player.y+PH/2);
}
function drawPowerups(){
  for(const p of powerupPickups){
    const glow=0.6+Math.sin(p.pulse)*0.4;
    ctx.save();
    ctx.shadowColor=POWERUP_COLORS[p.type];ctx.shadowBlur=10*glow;
    ctx.fillStyle=POWERUP_COLORS[p.type]+'44';
    rr(ctx,p.x-10,p.y-10,20,20,5);ctx.fill();
    ctx.strokeStyle=POWERUP_COLORS[p.type];ctx.lineWidth=1.5;
    rr(ctx,p.x-10,p.y-10,20,20,5);ctx.stroke();
    ctx.fillStyle='#fff';ctx.font='11px sans-serif';ctx.textAlign='center';
    ctx.fillText(POWERUP_LABELS[p.type],p.x,p.y+4);
    ctx.restore();
  }
  ctx.textAlign='left';
}
function updatePowerupTimers(){
  if(slowTimer>0) slowTimer--;
  if(dblTimer>0){dblTimer--;if(dblTimer<=0) dblScore=false;}
  if(magnetTimer>0){magnetTimer--;if(magnetTimer<=0) magnetOn=false;}
}

// ---- OBSTACLES ----
function spawnObstacle(x){
  const roll=Math.random(),fromTop=Math.random()<0.5,h=38+Math.random()*50;
  // introduce types gradually by level
  if(currentLevel>=4&&roll<0.18){const side=Math.random()<0.5?'floor':'ceil';obstacles.push({type:'spike',x,side,w:32,h:14,pulse:Math.random()*Math.PI*2,colorReq:Math.floor(Math.random()*2)});}
  else if(currentLevel>=3&&roll<0.35){const cy=CEIL+40+Math.random()*(GROUND-CEIL-80);obstacles.push({type:'moving',x,baseX:x,cy,w:30,h:16,amp:28+Math.random()*24,phase:Math.random()*Math.PI*2,pulse:0,colorReq:Math.floor(Math.random()*2)});}
  else if(currentLevel>=5&&roll<0.50){obstacles.push({type:'disappearing',x,fromTop,h,w:26,timer:0,visible:true,pulse:0,colorReq:Math.floor(Math.random()*2)});}
  else{obstacles.push({type:'standard',x,fromTop,h,w:26,pulse:Math.random()*Math.PI*2,colorReq:Math.floor(Math.random()*2)});}
}
function updateObstacles(){
  const spd=slowTimer>0?speed*0.4:speed;
  for(const o of obstacles){
    o.pulse=(o.pulse||0)+0.08;
    if(o.type==='moving'){o.phase+=0.035;o.x=o.baseX+Math.sin(o.phase)*o.amp;o.baseX-=spd;}
    else if(o.type==='disappearing'){o.timer+=1/60;o.visible=Math.sin(o.timer*Math.PI)>0;o.alpha=Math.abs(Math.sin(o.timer*Math.PI));o.x-=spd;}
    else{o.x-=spd;}
  }
  obstacles=obstacles.filter(o=>(o.type==='moving'?o.baseX:o.x)>-80);
  const last=obstacles[obstacles.length-1];
  if(!last||(last.type==='moving'?last.baseX:last.x)<W-180-Math.random()*80) spawnObstacle(W+40);
}
function drawObstacles(){
  for(const o of obstacles){
    const glow=0.5+Math.sin(o.pulse||0)*0.3;
    // color-match tint: obstacles are tinted based on colorReq
    const colorMatch = o.colorReq === playerColorIdx;
    ctx.save();
    if(o.type==='spike'){
      ctx.shadowColor='#FF4444';ctx.shadowBlur=8+glow*5;
      ctx.fillStyle=colorMatch?'#E24B4A':'#FF8888';
      const sy=o.side==='floor'?GROUND:CEIL,dir=o.side==='floor'?-1:1;
      for(let i=0;i<4;i++){ctx.beginPath();ctx.moveTo(o.x+i*8,sy);ctx.lineTo(o.x+i*8+4,sy+dir*o.h);ctx.lineTo(o.x+i*8+8,sy);ctx.fill();}
    } else if(o.type==='moving'){
      ctx.shadowColor='#EF9F27';ctx.shadowBlur=10+glow*6;
      const mg=ctx.createLinearGradient(o.x,0,o.x+o.w,0);
      mg.addColorStop(0,'#EF9F27');mg.addColorStop(0.5,'#FFD080');mg.addColorStop(1,'#EF9F27');
      ctx.fillStyle=mg;rr(ctx,o.x,o.cy-o.h/2,o.w,o.h,4);ctx.fill();
      ctx.fillStyle='rgba(255,255,255,0.3)';
      ctx.beginPath();ctx.moveTo(o.x+2,o.cy);ctx.lineTo(o.x+8,o.cy-4);ctx.lineTo(o.x+8,o.cy+4);ctx.fill();
      ctx.beginPath();ctx.moveTo(o.x+o.w-2,o.cy);ctx.lineTo(o.x+o.w-8,o.cy-4);ctx.lineTo(o.x+o.w-8,o.cy+4);ctx.fill();
    } else if(o.type==='disappearing'){
      ctx.globalAlpha=(o.alpha||1)*0.9;ctx.shadowColor='#AFA9EC';ctx.shadowBlur=8+glow*4;
      const dg=ctx.createLinearGradient(o.x,0,o.x+o.w,0);
      dg.addColorStop(0,'#7F77DD');dg.addColorStop(0.5,'#CEC8F8');dg.addColorStop(1,'#7F77DD');
      ctx.fillStyle=dg;
      if(o.fromTop){rrBottom(ctx,o.x,CEIL,o.w,o.h,5);ctx.fill();}
      else{rrTop(ctx,o.x,GROUND-o.h,o.w,o.h,5);ctx.fill();}
    } else {
      const col=o.fromTop?'#E24B4A':'#EF9F27';
      ctx.shadowColor=col;ctx.shadowBlur=8+glow*6;
      const sg=ctx.createLinearGradient(o.x,0,o.x+o.w,0);
      sg.addColorStop(0,col);sg.addColorStop(0.5,o.fromTop?'#FF8080':'#FFD080');sg.addColorStop(1,col);
      ctx.fillStyle=sg;
      if(o.fromTop){rrBottom(ctx,o.x,CEIL,o.w,o.h,5);ctx.fill();}
      else{rrTop(ctx,o.x,GROUND-o.h,o.w,o.h,5);ctx.fill();}
      ctx.globalAlpha=0.2;ctx.fillStyle='#fff';ctx.fillRect(o.x+4,o.fromTop?CEIL:GROUND-o.h,4,o.h);
    }
    // Color indicator dot on obstacle
    if(currentLevel>=2){
      ctx.globalAlpha=0.9;
      ctx.fillStyle=o.colorReq===0?SKINS[skinIdx].body[1]:SKINS[skinIdx].flip[1];
      ctx.beginPath();
      const dotX=o.type==='moving'?o.x+o.w/2:o.x+o.w/2;
      const dotY=o.type==='moving'?o.cy-o.h/2-6:o.fromTop?CEIL+o.h+6:GROUND-o.h-6;
      ctx.arc(dotX,dotY,3,0,Math.PI*2);ctx.fill();
    }
    ctx.restore();ctx.globalAlpha=1;
  }
}

// ---- COLLISION ----
function collides(p,o){
  if(o.type==='disappearing'&&!o.visible) return false;
  // color-match mechanic: if player color matches obstacle colorReq, pass through (from level 2)
  if(currentLevel>=2&&o.colorReq===playerColorIdx) return false;
  const px1=p.x+4,py1=p.y+4,px2=p.x+PW-4,py2=p.y+PH-4;
  if(o.type==='spike'){if(px2<o.x||px1>o.x+32)return false;if(o.side==='floor'&&py2>GROUND-o.h)return true;if(o.side==='ceil'&&py1<CEIL+o.h)return true;return false;}
  if(o.type==='moving'){if(px2<o.x||px1>o.x+o.w)return false;if(py2>o.cy-o.h/2&&py1<o.cy+o.h/2)return true;return false;}
  if(px2<o.x||px1>o.x+o.w)return false;
  if(o.fromTop&&py1<CEIL+o.h)return true;
  if(!o.fromTop&&py2>GROUND-o.h)return true;
  return false;
}

// ---- LEVEL SYSTEM ----
function checkLevel(){
  const newLevel=Math.min(10,1+Math.floor(score/800));
  if(newLevel>currentLevel){
    currentLevel=newLevel;
    levelFlash=120;
    playTone(660,'sine',0.3,0.3);
    playTone(880,'sine',0.3,0.25);
  }
}

// ---- DEATH ANIM ----
function startDeathAnim(){deathAnim={active:true,timer:0,scale:0,vigAlpha:0,btnY:30,btnAlpha:0};}
function updateDeathAnim(){
  if(!deathAnim.active)return;
  deathAnim.timer+=1/60;const t=deathAnim.timer;
  deathAnim.vigAlpha=t<0.3?t/0.3*0.7:0.4+Math.sin(t*4)*0.15;
  if(t<0.4){deathAnim.scale=cubicBezierSpring(t/0.4);}
  else{deathAnim.scale=1.0+Math.sin((t-0.4)*8)*0.02*Math.exp(-(t-0.4)*3);}
  if(t>0.5){const bt=Math.min(1,(t-0.5)/0.3);deathAnim.btnY=30*(1-bt);deathAnim.btnAlpha=bt;}
}
function drawDeathScreen(){
  if(!deathAnim.active)return;
  const vig=ctx.createRadialGradient(W/2,H/2,H*0.2,W/2,H/2,H*0.85);
  vig.addColorStop(0,'rgba(0,0,0,0)');
  vig.addColorStop(1,`rgba(180,20,20,${deathAnim.vigAlpha})`);
  ctx.fillStyle=vig;ctx.fillRect(0,0,W,H);
  ctx.fillStyle='rgba(10,10,26,0.92)';
  rr(ctx,W/2-135,H/2-62,270,130,14);ctx.fill();
  ctx.save();
  ctx.translate(W/2,H/2-24);ctx.scale(deathAnim.scale,deathAnim.scale);
  ctx.fillStyle='#E24B4A';ctx.font='700 24px Orbitron,sans-serif';ctx.textAlign='center';
  ctx.fillText('Game Over!',0,0);ctx.restore();
  ctx.fillStyle='#fff';ctx.font='500 12px Orbitron,sans-serif';ctx.textAlign='center';
  ctx.fillText('Score  '+Math.floor(score/10)+'    Best  '+Math.floor(best/10),W/2,H/2+4);
  ctx.fillStyle='#EF9F27';ctx.font='400 11px Orbitron,sans-serif';
  ctx.fillText('Coins  '+coins,W/2,H/2+18);
  if(deathAnim.btnAlpha>0){
    ctx.globalAlpha=deathAnim.btnAlpha;
    const by=H/2+36+deathAnim.btnY;
    ctx.fillStyle='rgba(127,119,221,0.25)';rr(ctx,W/2-100,by-15,90,30,8);ctx.fill();
    ctx.strokeStyle='rgba(127,119,221,0.8)';ctx.lineWidth=1;rr(ctx,W/2-100,by-15,90,30,8);ctx.stroke();
    ctx.fillStyle='#fff';ctx.font='500 12px Orbitron,sans-serif';ctx.textAlign='center';
    ctx.fillText('Retry',W/2-55,by+5);
    ctx.fillStyle='rgba(228,75,74,0.2)';rr(ctx,W/2+10,by-15,90,30,8);ctx.fill();
    ctx.strokeStyle='rgba(228,75,74,0.7)';ctx.lineWidth=1;rr(ctx,W/2+10,by-15,90,30,8);ctx.stroke();
    ctx.fillStyle='#ff8080';ctx.font='500 12px Orbitron,sans-serif';ctx.textAlign='center';
    ctx.fillText('Exit',W/2+55,by+5);
    ctx.globalAlpha=1;
  }
  ctx.textAlign='left';
}

// ---- SCREEN SHAKE ----
function triggerShake(amt){shakeTimer=8;shakeAmt=amt;}
function applyShake(){if(shakeTimer>0){ctx.translate((Math.random()-0.5)*shakeAmt,(Math.random()-0.5)*shakeAmt);shakeTimer--;}}

// ---- UI LAYOUT ----
function inRect(mx,my,rect){return mx>rect.x&&mx<rect.x+rect.w&&my>rect.y&&my<rect.y+rect.h;}
function getHomeLayout(){
  const bonusOffset = dailyRewardMsg > 0 ? 14 : 0;
  const bestVisible = best > 0;
  const bestRectY = H/2 - 8 + bonusOffset;
  const playTop = bestVisible ? bestRectY + 34 : H/2 + 12 + bonusOffset;
  return {
    bestRect: {x:W/2-58,y:bestRectY,w:116,h:20},
    playRect: {x:W/2-60,y:playTop,w:120,h:36},
    shopRect: {x:W/2-106,y:playTop+54,w:96,h:28},
    settingsRect: {x:W/2+10,y:playTop+54,w:96,h:28},
  };
}
function getSettingsLayout(){
  const panel = {x:W/2-128,y:32,w:256,h:216};
  return {
    panel,
    titleY: panel.y + 26,
    soundLabelY: panel.y + 58,
    toggle: {x:W/2-22,y:panel.y + 68,w:44,h:20},
    toggleValueY: panel.y + 92,
    volumeLabelY: panel.y + 114,
    slider: {x:W/2-72,y:panel.y + 122,w:144,h:8},
    bestY: panel.y + 154,
    resetRect: {x:W/2-56,y:panel.y + 164,w:112,h:22},
    closeRect: {x:W/2-36,y:panel.y + 192,w:72,h:24},
  };
}
function getShopLayout(){
  const panel = {x:18,y:18,w:444,h:244};
  const cardW = 76, cardH = 84, gap = 8;
  const totalW = SKINS.length * cardW + Math.max(0, SKINS.length - 1) * gap;
  const startX = Math.round((W - totalW) / 2);
  return {
    panel,
    cards: SKINS.map((_,i)=>({x:startX+i*(cardW+gap),y:86,w:cardW,h:cardH})),
    closeRect: {x:W/2-36,y:220,w:72,h:24},
  };
}
function getHudLayout(){
  return {
    scoreX: 14,
    bestX: W - 14,
    levelRect: {x:W/2-54,y:8,w:108,h:18},
    swapRect: {x:W-98,y:H-38,w:84,h:26},
    powerupsY: H - 12,
  };
}

// ---- SETTINGS ----
function drawSettings(){
  const layout = getSettingsLayout();
  const {panel, toggle, slider, resetRect, closeRect} = layout;
  ctx.fillStyle='rgba(0,0,0,0.78)';ctx.fillRect(0,0,W,H);
  ctx.fillStyle='rgba(10,10,26,0.97)';rr(ctx,panel.x,panel.y,panel.w,panel.h,16);ctx.fill();
  ctx.strokeStyle='rgba(127,119,221,0.5)';ctx.lineWidth=1;rr(ctx,panel.x,panel.y,panel.w,panel.h,16);ctx.stroke();
  ctx.fillStyle='#fff';ctx.font='700 16px Orbitron,sans-serif';ctx.textAlign='center';
  ctx.fillText('Settings',W/2,layout.titleY);
  ctx.fillStyle='rgba(255,255,255,0.55)';ctx.font='400 11px Orbitron,sans-serif';
  ctx.fillText('Sound Effects',W/2,layout.soundLabelY);
  ctx.fillStyle=sfxOn?'rgba(29,158,117,0.5)':'rgba(100,100,120,0.4)';rr(ctx,toggle.x,toggle.y,toggle.w,toggle.h,10);ctx.fill();
  ctx.strokeStyle=sfxOn?'#1D9E75':'#555';ctx.lineWidth=1;rr(ctx,toggle.x,toggle.y,toggle.w,toggle.h,10);ctx.stroke();
  const knobX=sfxOn?toggle.x+toggle.w-10:toggle.x+10;
  ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(knobX,toggle.y+10,8,0,Math.PI*2);ctx.fill();
  ctx.fillStyle=sfxOn?'#1D9E75':'#888';ctx.font='700 8px Orbitron,sans-serif';ctx.textAlign='center';
  ctx.fillText(sfxOn?'On':'Off',W/2,layout.toggleValueY);
  ctx.fillStyle='rgba(255,255,255,0.55)';ctx.font='400 11px Orbitron,sans-serif';
  ctx.fillText('Volume',W/2,layout.volumeLabelY);
  ctx.fillStyle='rgba(255,255,255,0.1)';rr(ctx,slider.x,slider.y,slider.w,slider.h,4);ctx.fill();
  ctx.fillStyle='#7F77DD';rr(ctx,slider.x,slider.y,slider.w*vol,slider.h,4);ctx.fill();
  ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(slider.x+slider.w*vol,slider.y+slider.h/2,7,0,Math.PI*2);ctx.fill();
  ctx.fillStyle='rgba(255,255,255,0.35)';ctx.font='400 10px Orbitron,sans-serif';ctx.textAlign='center';
  ctx.fillText('Best Score: '+Math.floor(best/10),W/2,layout.bestY);
  ctx.fillStyle='rgba(228,75,74,0.2)';rr(ctx,resetRect.x,resetRect.y,resetRect.w,resetRect.h,6);ctx.fill();
  ctx.strokeStyle='rgba(228,75,74,0.5)';ctx.lineWidth=1;rr(ctx,resetRect.x,resetRect.y,resetRect.w,resetRect.h,6);ctx.stroke();
  ctx.fillStyle='#ff8080';ctx.font='400 10px Orbitron,sans-serif';ctx.textAlign='center';
  ctx.fillText('Reset Best',W/2,resetRect.y+15);
  ctx.fillStyle='rgba(255,255,255,0.15)';rr(ctx,closeRect.x,closeRect.y,closeRect.w,closeRect.h,6);ctx.fill();
  ctx.strokeStyle='rgba(255,255,255,0.3)';ctx.lineWidth=1;rr(ctx,closeRect.x,closeRect.y,closeRect.w,closeRect.h,6);ctx.stroke();
  ctx.fillStyle='#fff';ctx.font='500 11px Orbitron,sans-serif';ctx.textAlign='center';
  ctx.fillText('Close',W/2,closeRect.y+15);
  ctx.textAlign='left';
}
function handleSettingsClick(mx,my){
  const layout = getSettingsLayout();
  if(inRect(mx,my,layout.toggle)){sfxOn=!sfxOn;localStorage.setItem('gf_sfx',sfxOn);if(sfxOn)playTone(440,'sine',0.1,0.2);return;}
  if(mx>layout.slider.x-10&&mx<layout.slider.x+layout.slider.w+10&&my>layout.slider.y-10&&my<layout.slider.y+layout.slider.h+10){
    vol=Math.max(0,Math.min(1,(mx-layout.slider.x)/layout.slider.w));localStorage.setItem('gf_vol',vol);playTone(440,'sine',0.1,0.2);return;
  }
  if(inRect(mx,my,layout.resetRect)){best=0;localStorage.setItem('gf_best',0);playTone(300,'sine',0.1,0.1);return;}
  if(inRect(mx,my,layout.closeRect)){settingsOpen=false;return;}
}

// ---- SHOP ----
function drawShop(){
  const layout = getShopLayout();
  const {panel, closeRect} = layout;
  ctx.fillStyle='rgba(0,0,0,0.82)';ctx.fillRect(0,0,W,H);
  ctx.fillStyle='rgba(10,10,26,0.97)';rr(ctx,panel.x,panel.y,panel.w,panel.h,16);ctx.fill();
  ctx.strokeStyle='rgba(239,159,39,0.4)';ctx.lineWidth=1;rr(ctx,panel.x,panel.y,panel.w,panel.h,16);ctx.stroke();
  ctx.fillStyle='#EF9F27';ctx.font='700 15px Orbitron,sans-serif';ctx.textAlign='center';
  ctx.fillText('Shop',W/2,42);
  ctx.fillStyle='rgba(239,159,39,0.8)';ctx.font='500 11px Orbitron,sans-serif';
  ctx.fillText('Coins: '+coins,W/2,58);
  SKINS.forEach((s,i)=>{
    const card = layout.cards[i];
    const sx=card.x,sy=card.y;
    const owned=unlockedSkins.includes(i);
    const selected=skinIdx===i;
    ctx.fillStyle=selected?'rgba(127,119,221,0.35)':owned?'rgba(255,255,255,0.08)':'rgba(0,0,0,0.3)';
    rr(ctx,sx,sy,card.w,card.h,8);ctx.fill();
    ctx.strokeStyle=selected?'#7F77DD':owned?'rgba(255,255,255,0.2)':'rgba(255,255,255,0.08)';
    ctx.lineWidth=selected?2:1;rr(ctx,sx,sy,card.w,card.h,8);ctx.stroke();
    const bodyGrad=ctx.createLinearGradient(sx+24,sy+10,sx+54,sy+40);
    bodyGrad.addColorStop(0,s.body[0]);bodyGrad.addColorStop(1,s.body[1]);
    ctx.fillStyle=bodyGrad;rr(ctx,sx+24,sy+10,30,28,5);ctx.fill();
    ctx.fillStyle='#fff';ctx.font='700 9px Orbitron,sans-serif';ctx.textAlign='center';
    ctx.fillText(s.name,sx+39,sy+50);
    if(!owned){
      ctx.fillStyle='#EF9F27';ctx.font='400 9px Orbitron,sans-serif';
      ctx.fillText(s.cost+'🪙',sx+39,sy+63);
    } else if(selected){
      ctx.fillStyle='#7F77DD';ctx.font='700 9px Orbitron,sans-serif';
      ctx.fillText('Active',sx+39,sy+63);
    } else {
      ctx.fillStyle='#1D9E75';ctx.font='400 9px Orbitron,sans-serif';
      ctx.fillText('Owned',sx+39,sy+63);
    }
  });
  ctx.fillStyle='rgba(255,255,255,0.15)';rr(ctx,closeRect.x,closeRect.y,closeRect.w,closeRect.h,6);ctx.fill();
  ctx.strokeStyle='rgba(255,255,255,0.3)';ctx.lineWidth=1;rr(ctx,closeRect.x,closeRect.y,closeRect.w,closeRect.h,6);ctx.stroke();
  ctx.fillStyle='#fff';ctx.font='500 11px Orbitron,sans-serif';ctx.textAlign='center';
  ctx.fillText('Close',W/2,closeRect.y+15);
  ctx.textAlign='left';
}
function handleShopClick(mx,my){
  const layout = getShopLayout();
  SKINS.forEach((s,i)=>{
    if(inRect(mx,my,layout.cards[i])){
      if(unlockedSkins.includes(i)){skinIdx=i;localStorage.setItem('gf_skin',i);playTone(440,'sine',0.1,0.2);}
      else if(coins>=s.cost){coins-=s.cost;localStorage.setItem('gf_coins',coins);unlockedSkins.push(i);localStorage.setItem('gf_unlocked',JSON.stringify(unlockedSkins));skinIdx=i;localStorage.setItem('gf_skin',i);playPowerupSound();}
      else{playTone(200,'sawtooth',0.1,0.1);}
    }
  });
  if(inRect(mx,my,layout.closeRect)){shopOpen=false;}
}

// ---- DAILY REWARD ----
function checkDailyReward(){
  const today=new Date().toDateString();
  if(lastDaily!==today){
    lastDaily=today;localStorage.setItem('gf_daily',today);
    const reward=50;coins+=reward;localStorage.setItem('gf_coins',coins);
    return reward;
  }
  return 0;
}

// ---- HOME SCREEN ----
let dailyRewardMsg = 0;
let dailyAmount = 0;
function drawHomeScreen(){
  const layout = getHomeLayout();
  homeAnim+=0.02;
  drawLayers();
  ctx.fillStyle='rgba(10,10,26,0.72)';ctx.fillRect(0,0,W,H);
  ctx.save();
  ctx.shadowColor='#7F77DD';ctx.shadowBlur=18+Math.sin(homeAnim)*6;
  ctx.fillStyle='#fff';ctx.font='700 28px Orbitron,sans-serif';ctx.textAlign='center';
  ctx.fillText('GRAVITY FLIP',W/2,H/2-58);ctx.restore();
  ctx.fillStyle='rgba(127,119,221,0.7)';ctx.font='400 10px Orbitron,sans-serif';ctx.textAlign='center';
  ctx.fillText('Dodge · Flip · Survive',W/2,H/2-38);
  // Coins display
  ctx.fillStyle='rgba(239,159,39,0.9)';ctx.font='700 11px Orbitron,sans-serif';ctx.textAlign='center';
  ctx.fillText('🪙 '+coins,W/2,H/2-20);
  // Daily reward
  if(dailyRewardMsg>0){
    ctx.globalAlpha=Math.min(1,dailyRewardMsg/30);
    ctx.fillStyle='#EF9F27';ctx.font='700 11px Orbitron,sans-serif';ctx.textAlign='center';
    ctx.fillText('+'+dailyAmount+' Daily Reward!',W/2,H/2);
    ctx.globalAlpha=1;dailyRewardMsg--;
  }
  if(best>0){
    ctx.fillStyle='rgba(239,159,39,0.15)';rr(ctx,layout.bestRect.x,layout.bestRect.y,layout.bestRect.w,layout.bestRect.h,6);ctx.fill();
    ctx.fillStyle='#EF9F27';ctx.font='400 10px Orbitron,sans-serif';ctx.textAlign='center';
    ctx.fillText('Best  '+Math.floor(best/10),W/2,layout.bestRect.y+14);
  }
  const pulse=1+Math.sin(homeAnim*2)*0.04;
  ctx.save();ctx.translate(layout.playRect.x+layout.playRect.w/2,layout.playRect.y+layout.playRect.h/2);ctx.scale(pulse,pulse);
  ctx.fillStyle='rgba(29,158,117,0.3)';rr(ctx,-layout.playRect.w/2,-layout.playRect.h/2,layout.playRect.w,layout.playRect.h,10);ctx.fill();
  ctx.strokeStyle='#1D9E75';ctx.lineWidth=1.5;rr(ctx,-layout.playRect.w/2,-layout.playRect.h/2,layout.playRect.w,layout.playRect.h,10);ctx.stroke();
  ctx.fillStyle='#fff';ctx.font='700 14px Orbitron,sans-serif';ctx.textAlign='center';
  ctx.fillText('▶  Play',0,6);ctx.restore();
  // Shop button
  ctx.fillStyle='rgba(239,159,39,0.2)';rr(ctx,layout.shopRect.x,layout.shopRect.y,layout.shopRect.w,layout.shopRect.h,8);ctx.fill();
  ctx.strokeStyle='rgba(239,159,39,0.5)';ctx.lineWidth=1;rr(ctx,layout.shopRect.x,layout.shopRect.y,layout.shopRect.w,layout.shopRect.h,8);ctx.stroke();
  ctx.fillStyle='rgba(255,255,255,0.85)';ctx.font='500 11px Orbitron,sans-serif';ctx.textAlign='center';
  ctx.fillText('🛒  Shop',layout.shopRect.x+layout.shopRect.w/2,layout.shopRect.y+18);
  // Settings button
  ctx.fillStyle='rgba(127,119,221,0.2)';rr(ctx,layout.settingsRect.x,layout.settingsRect.y,layout.settingsRect.w,layout.settingsRect.h,8);ctx.fill();
  ctx.strokeStyle='rgba(127,119,221,0.5)';ctx.lineWidth=1;rr(ctx,layout.settingsRect.x,layout.settingsRect.y,layout.settingsRect.w,layout.settingsRect.h,8);ctx.stroke();
  ctx.fillStyle='rgba(255,255,255,0.85)';ctx.font='500 11px Orbitron,sans-serif';ctx.textAlign='center';
  ctx.fillText('⚙  Settings',layout.settingsRect.x+layout.settingsRect.w/2,layout.settingsRect.y+18);
  ctx.textAlign='left';
}
function handleHomeClick(mx,my){
  const layout = getHomeLayout();
  if(inRect(mx,my,layout.playRect)){playTone(440,'sine',0.12,0.3);setState('running');return;}
  if(inRect(mx,my,layout.shopRect)){playTone(350,'sine',0.1,0.2);shopOpen=true;return;}
  if(inRect(mx,my,layout.settingsRect)){playTone(350,'sine',0.1,0.2);settingsOpen=true;return;}
}

// ---- HUD ----
function drawHUD(){
  const layout = getHudLayout();
  if(score>best){best=score;localStorage.setItem('gf_best',best);}
  ctx.save();
  ctx.font='700 10px Orbitron,sans-serif';
  ctx.fillStyle='rgba(255,255,255,0.4)';ctx.textAlign='left';ctx.fillText('Score',layout.scoreX,20);
  ctx.font='700 18px Orbitron,sans-serif';ctx.fillStyle='#fff';ctx.fillText(Math.floor(score/10),layout.scoreX,36);
  ctx.font='700 10px Orbitron,sans-serif';ctx.fillStyle='rgba(255,255,255,0.4)';ctx.textAlign='right';ctx.fillText('Best',layout.bestX,20);
  ctx.font='700 18px Orbitron,sans-serif';ctx.fillStyle='#EF9F27';ctx.fillText(Math.floor(best/10),layout.bestX,36);
  ctx.font='700 10px Orbitron,sans-serif';ctx.fillStyle='#EF9F27';ctx.textAlign='right';ctx.fillText('🪙 '+coins,layout.bestX,52);
  ctx.fillStyle='rgba(255,255,255,0.08)';rr(ctx,layout.levelRect.x,layout.levelRect.y,layout.levelRect.w,layout.levelRect.h,9);ctx.fill();
  ctx.strokeStyle='rgba(255,255,255,0.12)';ctx.lineWidth=1;rr(ctx,layout.levelRect.x,layout.levelRect.y,layout.levelRect.w,layout.levelRect.h,9);ctx.stroke();
  ctx.font='700 9px Orbitron,sans-serif';ctx.fillStyle='rgba(255,255,255,0.75)';ctx.textAlign='center';
  ctx.fillText('Lv.'+currentLevel+'  '+speed.toFixed(1)+'x',W/2,21);
  let px=14,py=layout.powerupsY;
  if(shieldOn){ctx.fillStyle='#00FFCC';ctx.font='10px sans-serif';ctx.textAlign='left';ctx.fillText('🛡',px,py);px+=18;}
  if(slowTimer>0){ctx.fillStyle='#AFA9EC';ctx.font='10px sans-serif';ctx.textAlign='left';ctx.fillText('⏱',px,py);px+=18;}
  if(dblScore){ctx.fillStyle='#E24B4A';ctx.font='10px sans-serif';ctx.textAlign='left';ctx.fillText('×2',px,py);px+=20;}
  if(magnetOn){ctx.fillStyle='#EF9F27';ctx.font='10px sans-serif';ctx.textAlign='left';ctx.fillText('🧲',px,py);}
  if(levelFlash>0){
    ctx.globalAlpha=Math.min(1,levelFlash/30)*0.9;
    ctx.fillStyle='#fff';ctx.font='700 18px Orbitron,sans-serif';ctx.textAlign='center';
    ctx.fillText('Level '+currentLevel+'!',W/2,H/2);
    ctx.globalAlpha=1;levelFlash--;
  }
  ctx.restore();
}

// ---- COLOR SWITCH BUTTON ----
function drawColorBtn(){
  const {swapRect} = getHudLayout();
  const col=playerColorIdx===0?getSkin().body[1]:getSkin().flip[1];
  ctx.save();
  ctx.globalAlpha=0.85;
  ctx.fillStyle=col+'33';rr(ctx,swapRect.x,swapRect.y,swapRect.w,swapRect.h,6);ctx.fill();
  ctx.strokeStyle=col;ctx.lineWidth=1;rr(ctx,swapRect.x,swapRect.y,swapRect.w,swapRect.h,6);ctx.stroke();
  ctx.fillStyle='#fff';ctx.font='700 9px Orbitron,sans-serif';ctx.textAlign='center';
  ctx.fillText('Swap',swapRect.x+28,swapRect.y+17);
  ctx.fillStyle=col;ctx.beginPath();ctx.arc(swapRect.x+swapRect.w-16,swapRect.y+swapRect.h/2,7,0,Math.PI*2);ctx.fill();
  ctx.fillStyle='#0a0a1a';ctx.font='700 8px Orbitron,sans-serif';
  ctx.fillText(playerColorIdx===0?'A':'B',swapRect.x+swapRect.w-16,swapRect.y+16);
  ctx.restore();
  ctx.textAlign='left';
}

// ---- INPUT ----
function getCanvasXY(e){
  const rect=canvas.getBoundingClientRect();
  return{mx:(e.clientX-rect.left)*(W/rect.width),my:(e.clientY-rect.top)*(H/rect.height)};
}
async function onFlip(e){
  await unlockAudio();
  const{mx,my}=e?getCanvasXY(e):{mx:-1,my:-1};
  if(settingsOpen){handleSettingsClick(mx,my);return;}
  if(shopOpen){handleShopClick(mx,my);return;}
  if(state==='home'){handleHomeClick(mx,my);return;}
  if(state==='dead'){
    if(deathAnim.btnAlpha>0.5){
      const by=H/2+36+deathAnim.btnY;
      if(mx>W/2+10&&mx<W/2+100&&my>by-15&&my<by+15){exitGame();return;}
    }
    setState('home');return;
  }
  if(state==='running'){
    const {swapRect} = getHudLayout();
    if(inRect(mx,my,swapRect)){
      playerColorIdx=playerColorIdx===0?1:0;
      playColorSound();
      return;
    }
    // Gravity flip
    player.grav*=-1;player.vy=player.grav*-7;
    player.flipped=!player.flipped;
    player.scaleX=0.7;player.scaleY=1.4;
    flipCount++;
    const cleanStart=((flipCount-1)%2)*Math.PI;
    const cleanTarget=(flipCount%2)*Math.PI;
    player.flipStartRot=cleanStart;player.flipTargetRot=cleanTarget;
    player.flipProgress=0;player.rotation=cleanStart;
    spawnFlipParticles(player.x+PW/2,player.y+PH/2);
    playFlipSound();
  }
}
async function onKeyDown(e){
  if(e.code==='Space'){e.preventDefault();await onFlip(null);}
  if(e.code==='KeyC'&&state==='running'){await unlockAudio();playerColorIdx=playerColorIdx===0?1:0;playColorSound();}
  if(e.code==='Escape'){settingsOpen=!settingsOpen;shopOpen=false;}
}

// ---- EXIT ----
function exitGame(){
  if(window.Capacitor?.Plugins?.App){window.Capacitor.Plugins.App.exitApp();return;}
  document.body.innerHTML='<div style="background:#0a0a1a;color:#fff;width:100vw;height:100vh;display:flex;align-items:center;justify-content:center;font-family:sans-serif;font-size:18px;letter-spacing:2px;">Thanks For Playing!</div>';
}

// ---- STATE ----
function setState(s){
  state=s;
  if(s==='running'){
    player=initPlayer();obstacles=[];coinPickups=[];powerupPickups=[];particles=[];
    score=0;speed=2.8;frame=0;shakeTimer=0;shakeAmt=0;flipCount=0;
    currentLevel=1;levelFlash=0;slowTimer=0;shieldOn=false;dblScore=false;dblTimer=0;magnetOn=false;magnetTimer=0;
    playerColorIdx=0;bgMusicTimer=0;
    deathAnim={active:false,timer:0,scale:0,vigAlpha:0,btnY:0,btnAlpha:0};
    initLayers();spawnObstacle(W+60);
  }
}

// ---- MAIN LOOP ----
function update(){
  if(state==='dead'){updateDeathAnim();updateParticles();return;}
  if(state==='home'||settingsOpen||shopOpen) return;
  if(state!=='running') return;
  frame++;score++;
  speed=2.8+Math.floor(score/300)*0.45;
  checkLevel();
  updateLayers();updatePlayer();updateObstacles();updateCoins();updatePowerups();updateParticles();updatePowerupTimers();
  tickBGMusic();
  for(const o of obstacles){
    if(collides(player,o)){
      if(shieldOn){shieldOn=false;triggerShake(3);spawnFlipParticles(player.x+PW/2,player.y+PH/2);playTone(300,'sine',0.2,0.3);return;}
      spawnDeathParticles(player.x+PW/2,player.y+PH/2);
      triggerShake(6);state='dead';startDeathAnim();
      if(score>best){best=score;localStorage.setItem('gf_best',best);}
      playDeathSound();return;
    }
  }
}
function draw(){
  if(state==='home'){drawHomeScreen();}
  else{
    ctx.save();applyShake();
    drawLayers();drawObstacles();drawCoins();drawPowerups();drawParticles();drawPlayer();
    ctx.restore();
    if(state==='running'){drawHUD();drawColorBtn();}
    if(state==='dead'){drawHUD();drawDeathScreen();}
  }
  if(settingsOpen) drawSettings();
  if(shopOpen) drawShop();
}
function loop(){update();draw();requestAnimationFrame(loop);}

// ---- HELPERS ----
function rr(ctx,x,y,w,h,r){ctx.beginPath();ctx.moveTo(x+r,y);ctx.lineTo(x+w-r,y);ctx.quadraticCurveTo(x+w,y,x+w,y+r);ctx.lineTo(x+w,y+h-r);ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);ctx.lineTo(x+r,y+h);ctx.quadraticCurveTo(x,y+h,x,y+h-r);ctx.lineTo(x,y+r);ctx.quadraticCurveTo(x,y,x+r,y);ctx.closePath();}
function rrBottom(ctx,x,y,w,h,r){ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+w,y);ctx.lineTo(x+w,y+h-r);ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);ctx.lineTo(x+r,y+h);ctx.quadraticCurveTo(x,y+h,x,y+h-r);ctx.lineTo(x,y);ctx.closePath();}
function rrTop(ctx,x,y,w,h,r){ctx.beginPath();ctx.moveTo(x+r,y);ctx.lineTo(x+w-r,y);ctx.quadraticCurveTo(x+w,y,x+w,y+r);ctx.lineTo(x+w,y+h);ctx.lineTo(x,y+h);ctx.lineTo(x,y+r);ctx.quadraticCurveTo(x,y,x+r,y);ctx.closePath();}

// ---- INIT ----
function init(){
  canvas=document.getElementById('gf-canvas');
  ctx=canvas.getContext('2d');
  function resize(){
    const dpr=window.devicePixelRatio||1;
    const scaleX=window.innerWidth/W,scaleY=window.innerHeight/H;
    const scale=Math.min(scaleX,scaleY);
    canvas.width=Math.round(W*scale*dpr);canvas.height=Math.round(H*scale*dpr);
    canvas.style.width=Math.round(W*scale)+'px';canvas.style.height=Math.round(H*scale)+'px';
    ctx.setTransform(1,0,0,1,0,0);ctx.scale(dpr*scale,dpr*scale);
  }
  resize();window.addEventListener('resize',resize);
  canvas.addEventListener('click',onFlip);
  canvas.addEventListener('touchstart',e=>{
    e.preventDefault();
    const t=e.touches[0];
    onFlip({type:'click',clientX:t.clientX,clientY:t.clientY});
  },{passive:false});
  document.addEventListener('keydown',onKeyDown);
  document.addEventListener('backbutton',()=>{
    if(settingsOpen){settingsOpen=false;return;}
    if(shopOpen){shopOpen=false;return;}
    if(state==='running'){state='dead';startDeathAnim();playDeathSound();return;}
    if(state==='home'){exitGame();return;}
    setState('home');
  });
  // Check daily reward
  const dr=checkDailyReward();
  if(dr>0){dailyAmount=dr;dailyRewardMsg=180;}
  state='home';initLayers();loop();
}
init();
