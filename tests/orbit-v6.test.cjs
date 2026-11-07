'use strict';
const assert=require('node:assert/strict');
require('../orbit/v6-specials.js');
const V=globalThis.OrbitV6Extras,F=require('../orbit/v6-physics.js'),Old=require('../orbit/physics.js');
const near=(a,b,t=1e-5)=>assert.ok(Math.abs(a-b)<=t,`${a} vs ${b}`);
let checks=0;
function check(name,fn){fn();checks++;console.log('PASS '+name);}
const make=level=>{const e=F.createGame(20261104);e.start();if(level>1){e.world.level=level;e.newLevel();}return e;};
const target=(id,variant)=>({id,kind:'circle',variant,x:400,y:300,r:14,vx:0,vy:0,rotation:0,spin:0,hp:variant==='inflate'?3:1,maxHp:3,splitDepth:0});
const far=()=>({id:999,kind:'square',x:555,y:315,r:10,vx:0,vy:0,rotation:0,spin:0,hp:1});
function hit(e,t,id){
 e.world.targets=[{...t,id},far()];
 e.world.energy=100;
 e.injectBall(400,268,0,e.speed());
 e.tick(.05);
}
check('stages 1 through 3 preserve v5 speeds, counts, targets, paddle width',()=>{
 for(let level=1;level<=3;level++){
  near(F.speedAt(level),Old.speedAt(level));
  near(F.paddleHalfAt(level),Old.PADDLE_HALF);
  assert.deepEqual(F.spawnTargets(level,20261104),Old.spawnTargets(level,20261104));
 }
});
check('stage 4 reduces speed, target count and drift, widens paddle',()=>{
 const t=F.spawnTargets(4,20261104),old=Old.spawnTargets(4,20261104);
 assert.ok(F.speedAt(4)<Old.speedAt(4));
 assert.equal(t.length,18);assert.ok(t.length<old.length);
 assert.ok(F.paddleHalfAt(4)>Old.PADDLE_HALF);
 assert.ok(Math.max(...t.map(v=>Math.hypot(v.vx,v.vy)))<24+20);
});
check('inflating target appears at stage 6 and grows after powered impacts',()=>{
 assert.ok(!F.spawnTargets(5,20261104).some(t=>t.variant==='inflate'));
 const specials=F.spawnTargets(6,20261104).filter(t=>t.variant==='inflate');
 assert.ok(specials.length>=1&&specials.every(t=>t.hp===3));
 const e=make(6),t=target(5,'inflate');e.world.targets=[t,far()];
 for(let n=0;n<3;n++){
  e.world.energy=100;
  e.injectBall(400,268,0,e.speed());e.tick(.05);
  if(n===0)assert.ok(t.r>14,'radius grows on first impact');
  if(n===1)assert.ok(t.r>17,'radius grows on second impact');
 }
 assert.ok(!e.world.targets.includes(t));assert.ok(e.world.events.some(v=>v.type==='explode'));
});
check('stage 9 split target creates two smaller children',()=>{
 assert.ok(F.spawnTargets(9,20261104).some(t=>t.variant==='split'));
 const e=make(9),t=target(1,'split');e.world.targets=[t,far()];
 e.injectBall(400,268,0,e.speed());e.tick(.05);
 const kids=e.world.targets.filter(v=>v.variant==='split-child');
 assert.equal(kids.length,2);assert.ok(kids.every(v=>v.r<t.r&&v.hp===1));
 assert.ok(e.world.events.some(v=>v.type==='split'));
});
check('combo multiplier grows and stage 4 life bonus triggers only once',()=>{
 const e=make(4),t=target(10);
 for(let i=0;i<5;i++)hit(e,t,i);
 assert.equal(e.world.combo,5);assert.equal(e.world.bestCombo,5);
 assert.equal(e.world.lives,4);assert.ok(e.world.bonusClaimed);
 assert.equal(e.world.events.filter(v=>v.type==='life-bonus').length,1);
 assert.ok(e.world.score>20*e.world.level*5);
 e.world.targets=[];for(let i=0;i<100;i++)e.tick(.05);
 assert.equal(e.world.combo,0,'combo expires after four idle seconds');
 e.world.level=5;e.newLevel();assert.equal(e.world.combo,0);
 assert.equal(e.world.bonusClaimed,false);
 const early=make(3);for(let i=0;i<4;i++)hit(early,t,i);
 assert.equal(early.world.lives,3,'initial three stages have unchanged life difficulty');
});
check('stage 12 star, 13 square, 15 dynamic circle/star collision surfaces',()=>{
 assert.equal(V.stageShape(12),'star');assert.equal(V.stageShape(13),'square');
 assert.equal(V.stageShape(15),'morph');
 near(V.outerRadius(15,0,-Math.PI/2),F.ARENA);
 assert.ok(Math.abs(V.outerRadius(15,5,-Math.PI/2)-F.ARENA)>2);
 assert.ok(V.outerRadius(13,0,Math.PI/4)>V.outerRadius(13,0,0)+60);
 for(const level of [12,13,15]){
  const e=make(level);e.world.targets=[];
  const theta=-Math.PI/2,r=V.outerRadius(level,0,theta)-F.BALL_R-4,s=e.speed();
  e.injectBall(400,F.C.y-r,0,-s);
  e.tick(.045);
  assert.ok(e.world.wallHits>=1,'wall should reflect for '+level);
  assert.ok(e.world.ball.vy>0,'wall should reverse northward velocity '+level);
  near(Math.hypot(e.world.ball.vx,e.world.ball.vy),s,.002);
 }
});
check('late-game shrink starts below ten, eases continuously, and never rebounds after split',()=>{
 const e=make(4),g=e.world;
 g.targets=Array.from({length:10},(_,i)=>({...target(i),x:365+i*6,y:300,vx:0,vy:0}));
 g.energy=0;for(let k=0;k<12;k++)e.tick(.05);
 near(g.arenaScale,1);
 g.targets.pop();
 e.tick(.05);
 assert.ok(g.arenaScale<1&&g.arenaScale>.99,'first shrink frame must be subtle');
 for(let k=0;k<120;k++)e.tick(.05);
 assert.ok(g.arenaScale<.973&&g.arenaScale>.965,'nine targets approaches 97%');
 const before=g.arenaScale;
 g.targets=g.targets.slice(0,1);
 for(let k=0;k<130;k++)e.tick(.05);
 assert.ok(g.arenaScale<.735&&g.arenaScale>.729,'one target approaches 73%');
 assert.ok(g.arenaScale<before);
 g.targets=Array.from({length:12},(_,i)=>({...target(i),x:380,y:300}));
 for(let k=0;k<40;k++)e.tick(.05);
 assert.ok(g.arenaScale<=.735,'more targets must never reverse shrinking');
 e.newLevel();
 near(g.arenaScale,1);near(g.shrinkGoal,1);
});
check('shrunk circle, star, square and morph still reflect the ball and reposition paddle',()=>{
 for(const level of [2,4,12,13,15]){
  const e=make(level),g=e.world;
  g.targets=[{...target(44),x:400,y:300,vx:0,vy:0}];g.energy=0;
  for(let i=0;i<140;i++)e.tick(.05);
  assert.ok(g.arenaScale<.74,'shrink target reached '+level);
  const radius=V.outerRadius(level,g.elapsed,-Math.PI/2,g.arenaScale);
  const s=e.speed(),p={x:400,y:F.C.y-radius+F.BALL_R+5};
  e.injectBall(p.x,p.y,0,-s);g.targets=[];e.tick(.045);
  assert.ok(g.wallHits>=1,'wall reflection level '+level);
  near(Math.hypot(g.ball.vx,g.ball.vy),s,.01);
  assert.ok(Math.hypot(g.ball.x-F.C.x,g.ball.y-F.C.y)<radius+2,'ball must remain inside shell');
  const paddleRadius=F.PADDLE_R*g.arenaScale;
  e.setPaddleAngle(Math.PI/2);
  e.injectBall(400,300+paddleRadius-F.PADDLE_THICK/2-F.BALL_R-4,0,s);
  g.energy=0;const prev=g.frontHits;e.tick(.045);
  assert.equal(g.frontHits,prev+1,'shrunk paddle must recharge level '+level);
  assert.equal(g.energy,F.ENERGY_MAX);
 }
});
console.log('ALL '+checks+' ORBIT V6 PHYSICS TESTS PASSED');
