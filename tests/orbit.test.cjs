'use strict';
const assert=require('node:assert/strict');
const F=require('../orbit/physics.js');
let count=0;
function check(name,fn){fn();count++;console.log('PASS '+name);}
const close=(a,b,t=.002)=>assert.ok(Math.abs(a-b)<=t,'expected '+a+' ~= '+b);
const magnitude=v=>Math.hypot(v.vx,v.vy);
const radial=(a,d)=>({x:F.C.x+Math.cos(a)*d,y:F.C.y+Math.sin(a)*d});
const outbound=(a,s)=>({vx:Math.cos(a)*s,vy:Math.sin(a)*s});
function make(){const e=F.createGame(20261104);e.start();return e;}
check('deterministic target generation: three moving shapes',()=>{
 const a=F.spawnTargets(1,20261104),b=F.spawnTargets(1,20261104);
 assert.deepEqual(a,b);assert.equal(a.length,16);
 assert.equal(new Set(a.map(t=>t.kind)).size,3);
 for(const t of a){assert.ok(Math.hypot(t.vx,t.vy)>12);assert.ok(Math.hypot(t.x-F.C.x,t.y-F.C.y)<170);}
});
check('circular boundary reflects, preserves speed and never loses life',()=>{
 const e=make(),b=e.world.ball,s=e.speed(),p=radial(-Math.PI/2,F.ARENA-F.BALL_R-1);
 e.injectBall(p.x,p.y,0,-s);e.tick(.05);
 assert.ok(e.world.wallHits>=1);assert.ok(b.vy>0);
 close(magnitude(b),s);assert.ok(Math.hypot(b.x-F.C.x,b.y-F.C.y)<=F.ARENA-b.r+.001);
 assert.equal(e.world.lives,3);
});
check('normal reflection and oblique angle are calculated, not randomized',()=>{
 const v=F.reflect(180,240,0,1);
 close(v.x,180);close(v.y,-240);close(Math.hypot(v.x,v.y),300);
 const normal=F.norm(1,1),p=F.reflect(280,90,normal.x,normal.y);
 close(p.x,-90);close(p.y,-280);
});
check('paddle inner/front face reflects inward at all orientations and sane offsets',()=>{
 const s=F.speedAt(1),inner=F.PADDLE_R-F.PADDLE_THICK/2-F.BALL_R;
 for(let i=0;i<24;i++){
  const a=i*F.TAU/24,e=make();e.setPaddleAngle(a);e.world.energy=0;
  const theta=a+(i%3-1)*.11,p=radial(theta,inner-4),v=outbound(theta,s);
  e.injectBall(p.x,p.y,v.vx,v.vy);e.tick(.05);
  assert.equal(e.world.frontHits,1,'front hit '+i);
  assert.equal(e.world.energy,F.ENERGY_MAX,'front must recharge '+i);
  assert.equal(e.world.lives,3);
  close(magnitude(e.world.ball),s,.01);
  const pos=e.world.ball;assert.ok(Math.hypot(pos.x-F.C.x,pos.y-F.C.y)<inner+1);
 }
});
check('missed front face cannot kill the ball while the wall reflects it',()=>{
 const e=make(),a=0,s=e.speed(),p=radial(a,230);
 e.injectBall(p.x,p.y,s,0);e.tick(.05);
 assert.equal(e.world.lives,3);
 assert.equal(e.world.wallHits,1);
 assert.equal(e.world.rearHits,0);
});
check('paddle rear face now reflects, fully charges and never deducts LIFE',()=>{
 const e=make(),a=Math.PI/2,p=radial(a,F.PADDLE_R+F.PADDLE_THICK/2+F.BALL_R+4);
 e.world.energy=0;
 e.injectBall(p.x,p.y,0,-e.speed());e.tick(.02);
 assert.equal(e.world.rearHits,1);assert.equal(e.world.lives,3);
 assert.equal(e.world.state,'playing');assert.equal(e.world.energy,F.ENERGY_MAX);
 assert.ok(e.world.ball.vy>0,'rear contact must reflect outward');
 close(magnitude(e.world.ball),e.speed());
});
check('rear collision outside paddle angular span causes neither charge nor damage',()=>{
 const e=make(),p=radial(0,F.PADDLE_R+F.PADDLE_THICK/2+F.BALL_R+4);
 e.world.energy=0;e.injectBall(p.x,p.y,-e.speed(),0);e.tick(.05);
 assert.equal(e.world.lives,3);assert.equal(e.world.rearHits,0);
 assert.equal(e.world.energy,0);
});
check('three powered target hits exhaust energy and require paddle recharge',()=>{
 const e=make(),s=e.speed(),t={id:10,kind:'circle',x:400,y:300,r:13,vx:0,vy:0,rotation:0,spin:0,hp:1},
 far={id:11,kind:'circle',x:530,y:320,r:12,vx:0,vy:0,rotation:0,spin:0,hp:1};
 for(let k=1;k<=3;k++){
  e.world.targets=[{...t,id:k}, {...far}];
  e.injectBall(400,270,0,s);e.tick(.05);
  assert.equal(e.world.chargedHits,k);
  assert.equal(e.world.destroyed,k);
  assert.equal(e.world.lives,3);
  assert.equal(e.world.energy,Math.max(0,100-F.ENERGY_COST*k));
 }
 assert.equal(e.world.energy,0);
 const previousScore=e.world.score;
 e.world.targets=[{...t}, {...far}];
 e.injectBall(400,270,0,s);e.tick(.05);
 assert.equal(e.world.energy,0);
 assert.equal(e.world.lives,2);
 assert.equal(e.world.destroyed,3,'empty ball must never destroy targets');
 assert.equal(e.world.targets[0].hp,1);
 assert.equal(e.world.score,previousScore,'empty collision must award no score');
 assert.ok(e.world.ball.vy<0,'empty collision still reflects');
 assert.equal(e.world.state,'playing','empty ball continues moving after losing a LIFE');
 e.setPaddleAngle(Math.PI/2);
 e.injectBall(400,488,0,s);e.tick(.05);
 assert.equal(e.world.energy,100,'paddle should refill empty ball');
 e.injectBall(400,270,0,s);e.tick(.05);
 assert.equal(e.world.destroyed,4,'recharged ball can damage again');
 assert.equal(e.world.energy,100-F.ENERGY_COST);
 assert.equal(e.world.lives,2);
});
check('empty collision has damage grace and three separated hits end game',()=>{
 const e=make(),s=e.speed();
 const t={id:20,kind:'circle',x:400,y:300,r:13,vx:0,vy:0,rotation:0,spin:0,hp:2};
 e.world.targets=[t];e.world.energy=0;
 function hit(){e.injectBall(400,270,0,s);e.tick(.05);}
 hit();assert.equal(e.world.lives,2);assert.equal(e.world.unsafeHits,1);
 hit();assert.equal(e.world.lives,2,'cooldown prevents double penalty');
 assert.equal(e.world.targets[0].hp,2);
 e.world.damageCooldown=0;hit();
 assert.equal(e.world.lives,1);assert.equal(e.world.state,'playing');
 e.world.damageCooldown=0;hit();
 assert.equal(e.world.lives,0);assert.equal(e.world.state,'gameover');
 assert.equal(e.world.targets[0].hp,2);
 assert.ok(e.world.events.some(x=>x.type==='gameover'));
 e.start();assert.equal(e.world.state,'playing');assert.equal(e.world.lives,3);
 assert.equal(e.world.energy,100);
});
check('drifting targets remain within their assigned inner zone',()=>{
 const e=make();const t=e.world.targets[0],initial={x:t.x,y:t.y};
 for(let i=0;i<1000;i++)e.tick(1/120);
 assert.ok(Math.hypot(t.x-initial.x,t.y-initial.y)>1);
 for(const b of e.world.targets)assert.ok(Math.hypot(b.x-F.C.x,b.y-F.C.y)<F.ARENA-50);
});
check('target circle collision really destroys object and scores points',()=>{
 const e=make();e.world.targets=[{id:0,kind:'circle',x:F.C.x,y:F.C.y,r:13,vx:0,vy:0,rotation:0,spin:0,hp:1}];
 e.injectBall(F.C.x,F.C.y-30,0,e.speed());e.tick(.05);
 assert.equal(e.world.destroyed,1);assert.equal(e.world.targets.length,0);
 assert.equal(e.world.state,'levelclear');assert.ok(e.world.score>=120);
 assert.equal(e.world.energy,100-F.ENERGY_COST);
});
check('level clear progresses to a more crowded, faster stage',()=>{
 const e=make();e.clearTargets();e.start();
 assert.equal(e.world.level,2);assert.equal(e.world.state,'playing');
 assert.equal(e.world.targets.length,19);close(magnitude(e.world.ball),F.speedAt(2));
 assert.equal(e.world.energy,F.ENERGY_MAX);
});
check('playable deterministic simulation: speed bounded, target hits and proper transitions',()=>{
 const e=make();const s=e.speed();
 let maxSpeed=0,wall=0;
 for(let i=0;i<90*120;i++){
  if(e.world.state!=='playing'){if(e.world.state==='gameover')break;e.start();}
  const b=e.world.ball;
  // A deterministic human-like controller follows the current ball bearing.
  const bearing=Math.atan2(b.y-F.C.y,b.x-F.C.x);
  if(i%3===0)e.setPaddleAngle(bearing,1/30);
  e.tick(1/90);
  maxSpeed=Math.max(maxSpeed,magnitude(e.world.ball));wall=e.world.wallHits;
  assert.ok(Number.isFinite(b.x)&&Number.isFinite(b.y));
  assert.ok(Math.hypot(b.x-F.C.x,b.y-F.C.y)<F.ARENA+1,'ball escaped circle');
  assert.ok(maxSpeed<=Math.max(s,e.speed())+.01,'speed jumped');
  assert.ok(e.world.energy>=0&&e.world.energy<=F.ENERGY_MAX);
 }
 console.log('SIMULATION score='+e.world.score+' destroyed='+e.world.destroyed+' wallHits='+wall+' frontHits='+e.world.frontHits+' rearHits='+e.world.rearHits+' state='+e.world.state);
 assert.ok(e.world.frontHits>=1,'tracking controller should interact with the paddle');
 assert.ok(e.world.destroyed>=1,'game should be possible to score on moving targets');
});
console.log('ALL '+count+' ORBIT PHYSICS AND GAMEPLAY TESTS PASSED');
