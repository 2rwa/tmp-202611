(function(root){
'use strict';
const F=root.OrbitPhysics,R=root.OrbitRender;
const canvas=document.getElementById('arena'),renderer=R.createRenderer(canvas);
const ui={score:document.getElementById('score'),best:document.getElementById('best'),level:document.getElementById('level'),lives:document.getElementById('lives'),remaining:document.getElementById('remaining'),status:document.getElementById('status'),start:document.getElementById('start'),pause:document.getElementById('pause'),reset:document.getElementById('reset')};
const engine=F.createGame(20261104),world=engine.world;
let best=0,prev=0,left=false,right=false,pointer=null,pointerHeld=false;
try{best=Number(localStorage.getItem('orbitBreakerBest')||0)}catch(_){}
function snapshot(){
 return{state:world.state,score:world.score,best,level:world.level,lives:world.lives,
  remaining:world.targets.length,frontHits:world.frontHits,rearHits:world.rearHits,wallHits:world.wallHits,
  speed:Math.hypot(world.ball.vx,world.ball.vy),expectedSpeed:engine.speed(),paddleAngle:world.paddleAngle,
  ball:{...world.ball},elapsed:world.elapsed,events:world.events.slice()};
}
function updateHud(){
 if(world.score>best){best=world.score;try{localStorage.setItem('orbitBreakerBest',String(best))}catch(_){}}
 ui.score.textContent=world.score.toLocaleString('ja-JP');
 ui.best.textContent=best.toLocaleString('ja-JP');
 ui.level.textContent=world.level;
 ui.lives.textContent='♥'.repeat(world.lives)||'—';
 ui.remaining.textContent=world.targets.length;
 ui.status.textContent=world.state==='playing'?'PLAYING':world.state==='ready'?'READY':world.state==='paused'?'PAUSED':world.state==='levelclear'?'CLEAR':'GAME OVER';
 ui.start.textContent=world.state==='playing'?'プレイ中':world.state==='levelclear'?'次のステージ':world.state==='gameover'?'もう一度':world.state==='paused'?'再開':'スタート';
 ui.pause.textContent=world.state==='paused'?'再開':'一時停止';
}
function begin(){
 engine.start();updateHud();renderer.draw(world);
}
function toggle(){engine.pause();updateHud();renderer.draw(world);}
function reset(){engine.reset();updateHud();renderer.draw(world);}
function canvasAngle(e){
 const rect=canvas.getBoundingClientRect();
 const x=(e.clientX-rect.left)/rect.width*canvas.width-F.C.x;
 const y=(e.clientY-rect.top)/rect.height*canvas.height-F.C.y;
 if(Math.hypot(x,y)<34)return null;
 return Math.atan2(y,x);
}
function setAngleFromEvent(e){
 const a=canvasAngle(e);
 if(a!==null){pointer=a;engine.setPaddleAngle(a,.016);renderer.draw(world);}
}
canvas.addEventListener('pointermove',e=>{
 if(e.pointerType==='mouse'||pointerHeld)setAngleFromEvent(e);
});
canvas.addEventListener('pointerdown',e=>{
 pointerHeld=true;setAngleFromEvent(e);
 try{canvas.setPointerCapture(e.pointerId)}catch(_){}
 if(world.state!=='playing')begin();
});
canvas.addEventListener('pointerup',()=>{pointerHeld=false});
canvas.addEventListener('pointercancel',()=>{pointerHeld=false});
canvas.addEventListener('pointerleave',e=>{if(e.pointerType==='mouse')pointer=null});
const handled=new Set(['ArrowLeft','ArrowRight','KeyA','KeyD','Space','KeyP','KeyR']);
root.addEventListener('keydown',e=>{
 if(handled.has(e.code))e.preventDefault();
 if(e.code==='ArrowLeft'||e.code==='KeyA'){left=true;pointer=null;}
 if(e.code==='ArrowRight'||e.code==='KeyD'){right=true;pointer=null;}
 if(e.repeat&&(e.code==='Space'||e.code==='KeyP'||e.code==='KeyR'))return;
 if(e.code==='Space'){if(world.state==='playing')toggle();else begin();}
 if(e.code==='KeyP'){if(world.state==='playing'||world.state==='paused')toggle();}
 if(e.code==='KeyR')reset();
});
root.addEventListener('keyup',e=>{
 if(e.code==='ArrowLeft'||e.code==='KeyA')left=false;
 if(e.code==='ArrowRight'||e.code==='KeyD')right=false;
});
root.addEventListener('blur',()=>{left=false;right=false;pointerHeld=false;if(world.state==='playing'){engine.pause();updateHud();}});
ui.start.addEventListener('click',begin);
ui.pause.addEventListener('click',toggle);
ui.reset.addEventListener('click',reset);
function frame(time){
 const dt=prev?Math.min(.04,(time-prev)/1000):1/60;prev=time;
 if((left||right)&&!(left&&right)){
  const direction=(right?1:0)-(left?1:0);
  engine.setPaddleAngle(world.paddleAngle+direction*2.8*dt,dt);
 }else if(pointer!==null){
  // Mouse orientation is already applied by pointer events.
  world.paddleOmega*=.65;
 }else world.paddleOmega*=.75;
 engine.tick(dt);updateHud();renderer.draw(world);
 requestAnimationFrame(frame);
}
if(root.location&&new URLSearchParams(root.location.search).has('test')){
 root.__orbitTest=Object.freeze({
  inspect:snapshot,
  play:begin,pause:toggle,reset,
  setAngle:a=>{engine.setPaddleAngle(a,.016);updateHud();renderer.draw(world);},
  injectBall:(x,y,vx,vy)=>{engine.injectBall(x,y,vx,vy);renderer.draw(world);},
  clearTargets:()=>{engine.clearTargets();updateHud();renderer.draw(world);},
  tick:dt=>{engine.tick(dt);updateHud();renderer.draw(world);},
  loseLife:()=>{engine.loseLife();updateHud();renderer.draw(world);}
 });
}
updateHud();renderer.draw(world);requestAnimationFrame(frame);
})(globalThis);
