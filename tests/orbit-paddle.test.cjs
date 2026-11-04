'use strict';
const assert=require('node:assert/strict');
const F=require('../orbit/physics.js');
const make=()=>{const e=F.createGame(20261104);e.start();return e;};
const target=(id,y=486)=>({id,kind:'triangle',x:400,y,r:15,vx:0,vy:30,rotation:0,spin:0,hp:1});
let count=0;
function check(name,fn){fn();count++;console.log('PASS '+name);}
check('object reaches paddle through natural drift and costs one LIFE',()=>{
 const e=make(),t=target(1,480);
 t.kind='circle';t.r=14;t.vy=44;
 e.world.targets=[t];e.injectBall(400,150,e.speed(),0);e.world.energy=0;
 for(let i=0;i<100&&!e.world.paddleObjectHits;i++)e.tick(1/120);
 assert.equal(e.world.paddleObjectHits,1);
 assert.equal(e.world.lives,2);
 assert.equal(e.world.state,'playing');
 assert.equal(t.hp,1);
 assert.ok(t.vy<0,'target must physically bounce off the paddle');
 assert.ok(Math.hypot(t.x-F.C.x,t.y-F.C.y)<F.PADDLE_R-10);
 assert.equal(e.world.energy,0,'object contact never charges ball');
});
check('moving paddle into a nearby object also costs one LIFE',()=>{
 const e=make(),t={...target(2,300),kind:'square',x:596,y:300,r:16,vx:0,vy:12};
 e.world.targets=[t];e.injectBall(400,150,e.speed(),0);
 e.tick(.01);assert.equal(e.world.lives,3);
 e.setPaddleAngle(0,.016);e.tick(.01);
 assert.equal(e.world.lives,2);assert.equal(e.world.paddleObjectHits,1);
 assert.equal(t.hp,1);
 for(let i=0;i<35;i++)e.tick(.01);
 assert.equal(e.world.lives,2,'same object cannot chain-hit within grace');
});
check('empty or full ball energy has no bearing on paddle-object damage',()=>{
 for(const energy of [0,100]){
  const e=make();
  e.world.energy=energy;
  e.world.targets=[target(10+energy)];
  e.injectBall(400,155,e.speed(),0);
  e.tick(.04);
  assert.equal(e.world.lives,2);
  assert.equal(e.world.paddleObjectHits,1);
  assert.equal(e.world.energy,energy);
 }
});
check('three separated paddle-object impacts trigger GAME OVER and restart',()=>{
 const e=make();e.injectBall(400,155,e.speed(),0);
 for(let i=0;i<3;i++){
  e.world.damageCooldown=0;
  e.world.targets=[target(i)];
  e.tick(.04);
  assert.equal(e.world.paddleObjectHits,i+1);
  assert.equal(e.world.lives,2-i);
  assert.equal(e.world.state,i===2?'gameover':'playing');
 }
 assert.ok(e.world.events.some(x=>x.type==='gameover'));
 e.start();assert.equal(e.world.lives,3);assert.equal(e.world.state,'playing');
 assert.equal(e.world.paddleObjectHits,0);
});
check('targets still respect the circular field but enter the paddle lane',()=>{
 const e=make(),t=target(99,490);
 e.world.targets=[t];e.injectBall(400,140,e.speed(),0);
 e.setPaddleAngle(0);
 for(let i=0;i<400;i++)e.tick(1/120);
 assert.ok(Math.hypot(t.x-F.C.x,t.y-F.C.y)<=F.PADDLE_R+1);
 assert.equal(e.world.paddleObjectHits,0);
});
console.log('ALL '+count+' PADDLE-OBJECT DANGER TESTS PASSED');
