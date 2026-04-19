const W = 480;
const H = 280;
const GROUND = H - 40, CEIL = 40;
const PW = 22, PH = 22;
const PX = 70;

let canvas, ctx;
let best = parseInt(localStorage.getItem('gf_best') || '0');
let player, obstacles, particles, score, speed, frame, state;
let shakeTimer, shakeAmt;
let deathAnim = { active: false, timer: 0, scale: 0, vigAlpha: 0, btnY: 0, btnAlpha: 0 };

const layers = [
  { objs: [], speed: 0.2, type: 'mountains' },
  { objs: [], speed: 0.5, type: 'buildings' },
  { objs: [], speed: 0.9, type: 'wires' },
];

function initLayers() {
  layers[0].objs = Array.from({length:6},(_,i)=>({x:i*90,w:60+Math.random()*40,h:30+Math.random()*40}));
  layers[1].objs = Array.from({length:8},(_,i)=>({x:i*70,w:18+Math.random()*20,h:20+Math.random()*50}));
  layers[2].objs = Array.from({length:4},(_,i)=>({x:i*120,y:CEIL+20+Math.random()*60}));
}

function updateLayers() {
  for (const l of layers) {
    for (const o of l.objs) {
      o.x -= speed * l.speed;
      if (o.x + (o.w||120) < 0) {
        o.x += l.type==='wires' ? 480 : 600;
        if (o.h!==undefined) o.h = 20 + Math.random()*(l.type==='mountains'?40:50);
        if (o.w!==undefined) o.w = (l.type==='mountains'?60:18)+Math.random()*(l.type==='mountains'?40:20);
        if (l.type==='wires') o.y = CEIL+20+Math.random()*60;
      }
    }
  }
}

function drawLayers() {
  const sky = ctx.createLinearGradient(0,0,0,H);
  sky.addColorStop(0,'#0a0a1a'); sky.addColorStop(1,'#0f1a2e');
  ctx.fillStyle=sky; ctx.fillRect(0,0,W,H);

  ctx.fillStyle='#1a1a3a';
  for (const o of layers[0].objs) {
    ctx.beginPath(); ctx.moveTo(o.x,GROUND); ctx.lineTo(o.x+o.w/2,GROUND-o.h); ctx.lineTo(o.x+o.w,GROUND); ctx.fill();
  }

  for (const o of layers[1].objs) {
    ctx.fillStyle='#1e2a4a'; ctx.fillRect(o.x,GROUND-o.h,o.w,o.h);
    ctx.fillStyle='rgba(255,220,100,0.15)';
    for (let wy=GROUND-o.h+6;wy<GROUND-4;wy+=10) {
      ctx.fillRect(o.x+3,wy,4,5);
      if(o.w>24) ctx.fillRect(o.x+o.w-8,wy,4,5);
    }
  }

  ctx.strokeStyle='rgba(100,140,200,0.25)'; ctx.lineWidth=1;
  for (const o of layers[2].objs) {
    ctx.beginPath(); ctx.moveTo(o.x,o.y); ctx.bezierCurveTo(o.x+40,o.y+12,o.x+80,o.y+12,o.x+120,o.y); ctx.stroke();
  }

  const gGrad=ctx.createLinearGradient(0,GROUND,0,H);
  gGrad.addColorStop(0,'#1D9E75'); gGrad.addColorStop(1,'#0a5a40');
  ctx.fillStyle=gGrad; ctx.fillRect(0,GROUND,W,H-GROUND);

  const cGrad=ctx.createLinearGradient(0,0,0,CEIL);
  cGrad.addColorStop(0,'#4a3a8a'); cGrad.addColorStop(1,'#7F77DD');
  ctx.fillStyle=cGrad; ctx.fillRect(0,0,W,CEIL);

  ctx.strokeStyle='rgba(127,119,221,0.4)'; ctx.lineWidth=1.5;
  ctx.beginPath(); ctx.moveTo(0,CEIL); ctx.lineTo(W,CEIL); ctx.stroke();
  ctx.strokeStyle='rgba(29,158,117,0.4)';
  ctx.beginPath(); ctx.moveTo(0,GROUND); ctx.lineTo(W,GROUND); ctx.stroke();
}

// --- PLAYER ---
function initPlayer() {
  return {
    x:PX, y:GROUND-PH, vy:0, grav:1,
    flipped:false,
    rotation:0,
    flipStartRot:0, flipTargetRot:0, flipProgress:1,
    scaleX:1, scaleY:1,
    trail:[], runCycle:0
  };
}

function cubicBezier(t) {
  const t2=t*t, t3=t2*t;
  return 3*0.17*t*(1-t)*(1-t) + 3*0.83*t2*(1-t) + t3
       + t*(1-t)*(1-t)*0 + t2*(1-t)*1 + t3*1;
}

function cubicBezierSpring(t) {
  return 1.2 * (t<0.8 ? cubicBezier(t/0.8) : 1) - 0.2*Math.max(0,1-(t-0.8)/0.2);
}

function updatePlayer() {
  // FIX 3: Smooth flip in 12 frames, rotation stays clean
  if (player.flipProgress < 1) {
    player.flipProgress = Math.min(1, player.flipProgress + 1/12);
    const eased = cubicBezier(player.flipProgress);
    player.rotation = player.flipStartRot + (player.flipTargetRot - player.flipStartRot) * eased;
    if (player.flipProgress >= 1) {
      // Snap to exact clean value when done — prevents drift
      player.rotation = player.flipTargetRot;
    }
    speed = Math.min(speed + 0.04, 2.8 + Math.floor(score/300)*0.45 + 0.3);
  }

  const gravMult = player.vy * player.grav < 0 ? 0.38 : 0.52;
  player.vy += player.grav * gravMult;
  player.vy = Math.max(-11, Math.min(11, player.vy));
  player.y += player.vy;
  player.runCycle += 0.18;

  const absVy = Math.abs(player.vy);
  if (absVy > 3) {
    player.scaleY += (1 + absVy*0.04 - player.scaleY)*0.2;
    player.scaleX += (1 - absVy*0.02 - player.scaleX)*0.2;
  } else {
    player.scaleY += (1 - player.scaleY)*0.2;
    player.scaleX += (1 - player.scaleX)*0.2;
  }

  if (player.y+PH >= GROUND) {
    player.y = GROUND-PH;
    if (Math.abs(player.vy)>3) {
      player.scaleX=1.4; player.scaleY=0.6;
      spawnDust(player.x+PW/2,GROUND,false);
      if(Math.abs(player.vy)>6) triggerShake(2);
    }
    player.vy=0;
  }
  if (player.y <= CEIL) {
    player.y=CEIL;
    if (Math.abs(player.vy)>3) {
      player.scaleX=1.4; player.scaleY=0.6;
      spawnDust(player.x+PW/2,CEIL+PH,true);
    }
    player.vy=0;
  }

  player.trail.unshift({x:player.x+PW/2, y:player.y+PH/2, vy:player.vy});
  if (player.trail.length>16) player.trail.pop();
}

function drawPlayer() {
  for (let i=player.trail.length-1;i>=0;i--) {
    const t=player.trail[i];
    ctx.globalAlpha=(1-i/player.trail.length)*0.22;
    ctx.fillStyle=player.flipped?'#7F77DD':'#1D9E75';
    const ts=1-i/player.trail.length;
    ctx.beginPath(); ctx.ellipse(t.x,t.y,PW/2*ts,PH/2*ts*0.7,0,0,Math.PI*2); ctx.fill();
  }
  ctx.globalAlpha=1;

  ctx.save();
  ctx.translate(player.x+PW/2, player.y+PH/2);
  ctx.rotate(player.rotation);
  ctx.scale(player.scaleX, player.scaleY);

  const bodyGrad=ctx.createLinearGradient(-PW/2,-PH/2,PW/2,PH/2);
  bodyGrad.addColorStop(0,player.flipped?'#CEC8F8':'#7FE0C0');
  bodyGrad.addColorStop(1,player.flipped?'#7F77DD':'#1D9E75');
  ctx.fillStyle=bodyGrad; rr(ctx,-PW/2,-PH/2,PW,PH,5); ctx.fill();

  ctx.fillStyle='#fff'; ctx.beginPath(); ctx.arc(-4,-3,4,0,Math.PI*2); ctx.fill();
  ctx.fillStyle='#0f0f1a'; ctx.beginPath(); ctx.arc(-3,-3,2.2,0,Math.PI*2); ctx.fill();
  ctx.fillStyle='#fff'; ctx.beginPath(); ctx.arc(-2.2,-3.8,0.8,0,Math.PI*2); ctx.fill();

  const legSwing=Math.sin(player.runCycle)*5;
  ctx.strokeStyle=player.flipped?'#7F77DD':'#1D9E75';
  ctx.lineWidth=3; ctx.lineCap='round';
  ctx.beginPath(); ctx.moveTo(-4,PH/2-2); ctx.lineTo(-4+legSwing,PH/2+5); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(4,PH/2-2); ctx.lineTo(4-legSwing,PH/2+5); ctx.stroke();
  ctx.restore();
}

// --- PARTICLES ---
function spawnDust(x,y,fromCeil) {
  for(let i=0;i<8;i++) particles.push({x,y,vx:(Math.random()-0.5)*4,vy:fromCeil?Math.random()*3:-Math.random()*3,life:1,r:2+Math.random()*3,color:fromCeil?'#7F77DD':'#1D9E75',type:'dust'});
}
function spawnFlipParticles(x,y,flipped) {
  for(let i=0;i<12;i++){const a=(i/12)*Math.PI*2; particles.push({x,y,vx:Math.cos(a)*(2+Math.random()*3),vy:Math.sin(a)*(2+Math.random()*3),life:1,r:2+Math.random()*3,color:flipped?'#AFA9EC':'#5DCAA5',type:'spark'});}
}
function spawnDeathParticles(x,y) {
  for(let i=0;i<28;i++) particles.push({x,y,vx:(Math.random()-0.5)*12,vy:(Math.random()-0.5)*12,life:1,r:3+Math.random()*5,color:['#E24B4A','#EF9F27','#fff','#FF6B6B'][Math.floor(Math.random()*4)],type:'death'});
}
function updateParticles() {
  for(const p of particles){p.x+=p.vx;p.y+=p.vy;p.vy+=p.type==='dust'?0.15:0.08;p.vx*=0.92;p.life-=p.type==='death'?0.04:0.06;p.r*=0.95;}
  particles=particles.filter(p=>p.life>0);
}
function drawParticles() {
  for(const p of particles){
    ctx.globalAlpha=p.life*0.85; ctx.fillStyle=p.color;
    if(p.type==='spark'){ctx.save();ctx.translate(p.x,p.y);ctx.rotate(Math.atan2(p.vy,p.vx));ctx.beginPath();ctx.ellipse(0,0,p.r*1.5,p.r*0.5,0,0,Math.PI*2);ctx.fill();ctx.restore();}
    else{ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,Math.PI*2);ctx.fill();}
  }
  ctx.globalAlpha=1;
}

// --- OBSTACLES ---
function spawnObstacle(x) {
  const roll = Math.random();
  const fromTop = Math.random()<0.5;
  const h = 38+Math.random()*50;

  if (score > 600 && roll < 0.2) {
    const side = Math.random()<0.5 ? 'floor' : 'ceil';
    obstacles.push({type:'spike', x, side, w:32, h:14, pulse:Math.random()*Math.PI*2});
  } else if (score > 400 && roll < 0.38) {
    const cy = CEIL + 40 + Math.random()*(GROUND-CEIL-80);
    obstacles.push({type:'moving', x, baseX:x, cy, w:30, h:16, amp:28+Math.random()*24, phase:Math.random()*Math.PI*2, pulse:0});
  } else if (score > 800 && roll < 0.55) {
    obstacles.push({type:'disappearing', x, fromTop, h, w:26, timer:0, visible:true, pulse:0});
  } else {
    obstacles.push({type:'standard', x, fromTop, h, w:26, pulse:Math.random()*Math.PI*2});
  }
}

function updateObstacles() {
  for (const o of obstacles) {
    o.pulse = (o.pulse||0) + 0.08;
    if (o.type==='moving') {
      o.phase += 0.035;
      o.x = o.baseX + Math.sin(o.phase) * o.amp;
      o.baseX -= speed;
    } else if (o.type==='disappearing') {
      o.timer += 1/60;
      o.visible = Math.sin(o.timer * Math.PI) > 0;
      o.alpha = Math.abs(Math.sin(o.timer * Math.PI));
      o.x -= speed;
    } else {
      o.x -= speed;
    }
  }
  obstacles = obstacles.filter(o=>(o.type==='moving'?o.baseX:o.x)>-80);
  const last=obstacles[obstacles.length-1];
  if (!last||(last.type==='moving'?last.baseX:last.x)<W-180-Math.random()*80) spawnObstacle(W+40);
}

function drawObstacles() {
  for (const o of obstacles) {
    const glow=0.5+Math.sin(o.pulse||0)*0.3;
    ctx.save();
    if (o.type==='spike') {
      ctx.shadowColor='#FF4444'; ctx.shadowBlur=8+glow*5;
      ctx.fillStyle='#E24B4A';
      const sy = o.side==='floor' ? GROUND : CEIL;
      const dir = o.side==='floor' ? -1 : 1;
      for(let i=0;i<4;i++){
        ctx.beginPath();
        ctx.moveTo(o.x+i*8, sy);
        ctx.lineTo(o.x+i*8+4, sy+dir*o.h);
        ctx.lineTo(o.x+i*8+8, sy);
        ctx.fill();
      }
    } else if (o.type==='moving') {
      ctx.shadowColor='#EF9F27'; ctx.shadowBlur=10+glow*6;
      const mg=ctx.createLinearGradient(o.x,0,o.x+o.w,0);
      mg.addColorStop(0,'#EF9F27'); mg.addColorStop(0.5,'#FFD080'); mg.addColorStop(1,'#EF9F27');
      ctx.fillStyle=mg;
      rr(ctx,o.x,o.cy-o.h/2,o.w,o.h,4); ctx.fill();
      ctx.fillStyle='rgba(255,255,255,0.3)';
      ctx.beginPath(); ctx.moveTo(o.x+2,o.cy); ctx.lineTo(o.x+8,o.cy-4); ctx.lineTo(o.x+8,o.cy+4); ctx.fill();
      ctx.beginPath(); ctx.moveTo(o.x+o.w-2,o.cy); ctx.lineTo(o.x+o.w-8,o.cy-4); ctx.lineTo(o.x+o.w-8,o.cy+4); ctx.fill();
    } else if (o.type==='disappearing') {
      ctx.globalAlpha=(o.alpha||1)*0.9;
      ctx.shadowColor='#AFA9EC'; ctx.shadowBlur=8+glow*4;
      const dg=ctx.createLinearGradient(o.x,0,o.x+o.w,0);
      dg.addColorStop(0,'#7F77DD'); dg.addColorStop(0.5,'#CEC8F8'); dg.addColorStop(1,'#7F77DD');
      ctx.fillStyle=dg;
      if(o.fromTop){rrBottom(ctx,o.x,CEIL,o.w,o.h,5);ctx.fill();}
      else{rrTop(ctx,o.x,GROUND-o.h,o.w,o.h,5);ctx.fill();}
    } else {
      const col=o.fromTop?'#E24B4A':'#EF9F27';
      ctx.shadowColor=col; ctx.shadowBlur=8+glow*6;
      const sg=ctx.createLinearGradient(o.x,0,o.x+o.w,0);
      sg.addColorStop(0,col); sg.addColorStop(0.5,o.fromTop?'#FF8080':'#FFD080'); sg.addColorStop(1,col);
      ctx.fillStyle=sg;
      if(o.fromTop){rrBottom(ctx,o.x,CEIL,o.w,o.h,5);ctx.fill();}
      else{rrTop(ctx,o.x,GROUND-o.h,o.w,o.h,5);ctx.fill();}
      ctx.globalAlpha=0.2; ctx.fillStyle='#fff'; ctx.fillRect(o.x+4,o.fromTop?CEIL:GROUND-o.h,4,o.h);
    }
    ctx.restore();
    ctx.globalAlpha=1;
  }
}

// --- COLLISION ---
function collides(p, o) {
  if (o.type==='disappearing' && !o.visible) return false;
  const px1=p.x+4, py1=p.y+4, px2=p.x+PW-4, py2=p.y+PH-4;
  if (o.type==='spike') {
    if (px2<o.x||px1>o.x+32) return false;
    if (o.side==='floor' && py2>GROUND-o.h) return true;
    if (o.side==='ceil' && py1<CEIL+o.h) return true;
    return false;
  }
  if (o.type==='moving') {
    if (px2<o.x||px1>o.x+o.w) return false;
    if (py2>o.cy-o.h/2 && py1<o.cy+o.h/2) return true;
    return false;
  }
  if (px2<o.x||px1>o.x+o.w) return false;
  if (o.fromTop && py1<CEIL+o.h) return true;
  if (!o.fromTop && py2>GROUND-o.h) return true;
  return false;
}

// --- DEATH ANIMATION ---
function startDeathAnim() {
  deathAnim = { active:true, timer:0, scale:0, vigAlpha:0, btnY:30, btnAlpha:0 };
}

function updateDeathAnim() {
  if (!deathAnim.active) return;
  deathAnim.timer += 1/60;
  const t = deathAnim.timer;
  deathAnim.vigAlpha = t < 0.3 ? t/0.3*0.7 : 0.4 + Math.sin(t*4)*0.15;
  if (t < 0.4) {
    deathAnim.scale = cubicBezierSpring(t/0.4);
  } else {
    deathAnim.scale = 1.0 + Math.sin((t-0.4)*8)*0.02*Math.exp(-(t-0.4)*3);
  }
  if (t > 0.5) {
    const bt = Math.min(1,(t-0.5)/0.3);
    deathAnim.btnY = 30*(1-bt);
    deathAnim.btnAlpha = bt;
  }
}

function drawDeathScreen() {
  if (!deathAnim.active) return;

  const vig = ctx.createRadialGradient(W/2,H/2,H*0.2,W/2,H/2,H*0.85);
  vig.addColorStop(0,'rgba(0,0,0,0)');
  vig.addColorStop(1,`rgba(180,20,20,${deathAnim.vigAlpha})`);
  ctx.fillStyle=vig; ctx.fillRect(0,0,W,H);

  ctx.fillStyle='rgba(10,10,26,0.88)';
  rr(ctx,W/2-130,H/2-58,260,120,14); ctx.fill();

  ctx.save();
  ctx.translate(W/2, H/2-22);
  ctx.scale(deathAnim.scale, deathAnim.scale);
  ctx.fillStyle='#E24B4A';
  ctx.font='700 24px Orbitron, sans-serif';
  ctx.textAlign='center';
  ctx.fillText('Game over!', 0, 0);
  ctx.restore();

  ctx.fillStyle='#fff';
  ctx.font='500 13px Orbitron, sans-serif';
  ctx.textAlign='center';
  ctx.fillText('Score- '+Math.floor(score/10)+'    Best- '+Math.floor(best/10), W/2, H/2+8);

  if (deathAnim.btnAlpha > 0) {
    ctx.globalAlpha = deathAnim.btnAlpha;
    const by = H/2 + 34 + deathAnim.btnY;

    // Retry button
    ctx.fillStyle='rgba(127,119,221,0.25)';
    rr(ctx, W/2-100, by-15, 90, 30, 8); ctx.fill();
    ctx.strokeStyle='rgba(127,119,221,0.8)'; ctx.lineWidth=1;
    rr(ctx, W/2-100, by-15, 90, 30, 8); ctx.stroke();
    ctx.fillStyle='#fff';
    ctx.font='500 12px Orbitron, sans-serif';
    ctx.textAlign='center';
    ctx.fillText('Retry?', W/2-55, by+5);

    // Exit button
    ctx.fillStyle='rgba(228,75,74,0.2)';
    rr(ctx, W/2+10, by-15, 90, 30, 8); ctx.fill();
    ctx.strokeStyle='rgba(228,75,74,0.7)'; ctx.lineWidth=1;
    rr(ctx, W/2+10, by-15, 90, 30, 8); ctx.stroke();
    ctx.fillStyle='#ff8080';
    ctx.font='500 12px Orbitron, sans-serif';
    ctx.textAlign='center';
    ctx.fillText('Exit', W/2+55, by+5);

    ctx.globalAlpha=1;
  }
  ctx.textAlign='left';
}

// --- SCREEN SHAKE ---
function triggerShake(amt) { shakeTimer=8; shakeAmt=amt; }
function applyShake() {
  if(shakeTimer>0){ ctx.translate((Math.random()-0.5)*shakeAmt,(Math.random()-0.5)*shakeAmt); shakeTimer--; }
}

// --- FLIP ---
// FIX 3: rotation uses a flip counter so spamming never causes drift
let flipCount = 0;

function onFlip(e) {
  if (state==='idle') { setState('running'); return; }

  if (state==='dead') {
    if (e && e.type==='click') {
      const rect = canvas.getBoundingClientRect();
      const scaleX = W / rect.width;
      const scaleY = H / rect.height;
      const mx = (e.clientX - rect.left) * scaleX;
      const my = (e.clientY - rect.top) * scaleY;
      const by = H/2 + 34 + deathAnim.btnY;
      // Exit button hit test
      if (mx > W/2+10 && mx < W/2+100 && my > by-15 && my < by+15) {
        document.body.innerHTML = '<div style="background:#0a0a1a;color:#fff;width:100vw;height:100vh;display:flex;align-items:center;justify-content:center;font-family:sans-serif;font-size:20px;letter-spacing:2px;">Thanks for playing!</div>';
        return;
      }
    }
    setState('idle'); setState('running');
    return;
  }

  if (state==='running') {
    player.grav *= -1;
    player.vy = player.grav * -7;
    player.flipped = !player.flipped;
    player.scaleX=0.7; player.scaleY=1.4;

    // FIX 3: increment flip counter, derive clean target from parity
    flipCount++;
    const cleanStart = ((flipCount - 1) % 2) * Math.PI;
    const cleanTarget = (flipCount % 2) * Math.PI;
    player.flipStartRot = cleanStart;
    player.flipTargetRot = cleanTarget;
    player.flipProgress = 0;
    // Snap rotation to clean start immediately
    player.rotation = cleanStart;

    spawnFlipParticles(player.x+PW/2, player.y+PH/2, player.flipped);
  }
}

// --- STATE ---
function setState(s) {
  state=s;
  if (s==='idle') {
    player=initPlayer(); obstacles=[]; particles=[];
    score=0; speed=2.8; frame=0;
    shakeTimer=0; shakeAmt=0; flipCount=0;
    deathAnim={active:false,timer:0,scale:0,vigAlpha:0,btnY:0,btnAlpha:0};
    initLayers(); spawnObstacle(W+60);
  }
}

// --- HUD (drawn inside canvas) ---
function drawHUD() {
  if(score>best){
    best=score;
    localStorage.setItem('gf_best', best);
  }

  ctx.save();
  // Score left
  ctx.font='700 10px Orbitron, sans-serif';
  ctx.fillStyle='rgba(255,255,255,0.4)';
  ctx.textAlign='left';
  ctx.fillText('SCORE', 14, 20);
  ctx.font='700 18px Orbitron, sans-serif';
  ctx.fillStyle='#ffffff';
  ctx.fillText(Math.floor(score/10), 14, 36);

  // Best right
  ctx.font='700 10px Orbitron, sans-serif';
  ctx.fillStyle='rgba(255,255,255,0.4)';
  ctx.textAlign='right';
  ctx.fillText('BEST', W-14, 20);
  ctx.font='700 18px Orbitron, sans-serif';
  ctx.fillStyle='#EF9F27';
  ctx.fillText(Math.floor(best/10), W-14, 36);

  // Speed center
  ctx.font='700 9px Orbitron, sans-serif';
  ctx.fillStyle='rgba(255,255,255,0.2)';
  ctx.textAlign='center';
  ctx.fillText(speed.toFixed(1)+'x', W/2, 18);

  ctx.restore();
}

function drawIdleScreen() {
  ctx.fillStyle='rgba(10,10,26,0.82)';
  rr(ctx,W/2-120,H/2-48,240,96,14); ctx.fill();
  ctx.fillStyle='#fff';
  ctx.font='700 22px Orbitron, sans-serif';
  ctx.textAlign='center';
  ctx.fillText('Gravity Flip', W/2, H/2-16);
  ctx.fillStyle='rgba(255,255,255,0.5)';
  ctx.font='400 12px Orbitron, sans-serif';
  ctx.fillText('Tap · Click · Space to start', W/2, H/2+10);
  ctx.fillStyle='rgba(127,119,221,0.6)';
  ctx.font='400 10px Orbitron, sans-serif';
  ctx.fillText('Dodge spikes·Moving bars·Phantom blocks', W/2, H/2+30);
  ctx.textAlign='left';
}

// --- MAIN LOOP ---
function update() {
  if (state==='dead') { updateDeathAnim(); updateParticles(); return; }
  if (state!=='running') return;
  frame++; score++;
  speed = 2.8 + Math.floor(score/300)*0.45;
  updateLayers(); updatePlayer(); updateObstacles(); updateParticles();
  for (const o of obstacles) {
    if (collides(player,o)) {
      spawnDeathParticles(player.x+PW/2, player.y+PH/2);
      triggerShake(6); state='dead'; startDeathAnim();
      if(score>best){ best=score; localStorage.setItem('gf_best',best); }
      return;
    }
  }
}

function draw() {
  ctx.save(); applyShake();
  drawLayers(); drawObstacles(); drawParticles(); drawPlayer();
  ctx.restore();
  if (state==='running') drawHUD();
  if (state==='idle') drawIdleScreen();
  if (state==='dead') { drawHUD(); drawDeathScreen(); }
}

function loop() { update(); draw(); requestAnimationFrame(loop); }

// --- HELPERS ---
function rr(ctx,x,y,w,h,r){ctx.beginPath();ctx.moveTo(x+r,y);ctx.lineTo(x+w-r,y);ctx.quadraticCurveTo(x+w,y,x+w,y+r);ctx.lineTo(x+w,y+h-r);ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);ctx.lineTo(x+r,y+h);ctx.quadraticCurveTo(x,y+h,x,y+h-r);ctx.lineTo(x,y+r);ctx.quadraticCurveTo(x,y,x+r,y);ctx.closePath();}
function rrBottom(ctx,x,y,w,h,r){ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+w,y);ctx.lineTo(x+w,y+h-r);ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);ctx.lineTo(x+r,y+h);ctx.quadraticCurveTo(x,y+h,x,y+h-r);ctx.lineTo(x,y);ctx.closePath();}
function rrTop(ctx,x,y,w,h,r){ctx.beginPath();ctx.moveTo(x+r,y);ctx.lineTo(x+w-r,y);ctx.quadraticCurveTo(x+w,y,x+w,y+r);ctx.lineTo(x+w,y+h);ctx.lineTo(x,y+h);ctx.lineTo(x,y+r);ctx.quadraticCurveTo(x,y,x+r,y);ctx.closePath();}

// --- INIT ---
// FIX 1: devicePixelRatio scaling for crisp graphics
function init() {
  canvas = document.getElementById('gf-canvas');
  ctx = canvas.getContext('2d');

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    const scaleX = window.innerWidth / W;
    const scaleY = window.innerHeight / H;
    const scale = Math.min(scaleX, scaleY);
    canvas.width = Math.round(W * scale * dpr);
    canvas.height = Math.round(H * scale * dpr);
    canvas.style.width = Math.round(W * scale) + 'px';
    canvas.style.height = Math.round(H * scale) + 'px';
    ctx.setTransform(1,0,0,1,0,0);
    ctx.scale(dpr * scale, dpr * scale);
  }

  resize();
  window.addEventListener('resize', resize);
  canvas.addEventListener('click', onFlip);
  canvas.addEventListener('touchstart', e=>{e.preventDefault(); onFlip(e.touches[0]);},{passive:false});
  document.addEventListener('keydown', e=>{if(e.code==='Space'){e.preventDefault();onFlip(null);}});
  setState('idle');
  loop();
}

init();