'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync('games/v4-speed.html','utf8');
assert.match(html,/<canvas[^>]*id="game"/);
for(const id of ['score','best','level','lives','start','pause','reset'])assert.ok(html.includes('id="'+id+'"'));
const m=html.match(/<script>([\s\S]*?)<\/script>/);
assert.ok(m,'inline game script');
const hook='restart();globalThis.__test={ball,paddle,get bricks(){return bricks},get state(){return state},get level(){return level},levelSpeed,collideBallPaddle,closestEllipsePoint,triangleVertices,getTriangleBrickCollision,getBrickCollision,reflect,restart,start,update,draw};requestAnimationFrame(frame);';
const src=m[1].replace(/restart\(\);\s*requestAnimationFrame\(frame\);/,hook);
assert.notEqual(src,m[1],'harness injected');
const listeners={};
const noop=()=>{};
const grad=()=>({addColorStop:noop});
const ctx=new Proxy({}, {get:(o,k)=>k==='createRadialGradient'||k==='createLinearGradient'?grad:noop,set:(o,k,v)=>{o[k]=v;return true}});
const canvas={width:800,height:520,getContext:()=>ctx,getBoundingClientRect:()=>({left:0,width:800}),addEventListener:(name,fn)=>listeners['canvas:'+name]=fn,setPointerCapture:noop};
const hud={};
for(const id of ['score','best','level','lives','start','pause','reset'])hud[id]={textContent:'',addEventListener:(name,fn)=>listeners[id+':'+name]=fn};
const storage=new Map();
const env={console,Math,localStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v)},document:{querySelector:()=>canvas,getElementById:id=>hud[id]},window:{addEventListener:(name,fn)=>listeners['window:'+name]=fn},requestAnimationFrame:noop};
vm.runInNewContext(src,env,{filename:'brick-breaker-inline.js'});
const g=env.__test;
assert.ok(g);
let passed=0;
function testCase(name,run){run();passed++;console.log('PASS '+name)}
const approx=(a,b,t=.001)=>assert.ok(Math.abs(a-b)<t,'expected '+a+' ~= '+b);
const speed=()=>Math.hypot(g.ball.vx,g.ball.vy);
testCase('screen + canvas draw',()=>{assert.equal(g.state,'ready');assert.equal(Number(hud.level.textContent),1);g.draw();});
testCase('small scattered blocks, circles triangles squares',()=>{assert.ok(g.bricks.length>30);const names=new Set(g.bricks.map(b=>b.shape));for(const shape of ['circle','triangle','rect'])assert.ok(names.has(shape));for(const b of g.bricks)assert.ok(b.w>=23&&b.w<=30);const rotations=new Set(g.bricks.filter(b=>b.shape==='triangle').map(b=>b.rotation));assert.ok(rotations.size>=4);});
testCase('deterministic layout + launch speed',()=>{const layout=JSON.stringify(g.bricks);g.restart();assert.equal(JSON.stringify(g.bricks),layout);approx(speed(),350);});
testCase('normal reflection is specular',()=>{const v=g.reflect(120,240,0,-1);approx(v.vx,120);approx(v.vy,-240);approx(Math.hypot(v.vx,v.vy),Math.hypot(120,240));});
testCase('central paddle hit reflects up',()=>{g.restart();const p=g.paddle;g.ball.x=p.x+p.rx;g.ball.y=p.y-5;g.ball.vx=0;g.ball.vy=350;assert.equal(g.collideBallPaddle(0),true);assert.ok(g.ball.vy<0);approx(speed(),350);});
testCase('ellipse contact never embeds ball or increases speed',()=>{g.restart();const p=g.paddle,cx=p.x+p.rx,cy=p.y+p.ry;let hits=0;for(let i=1;i<300;i++){const a=Math.PI*i/300;g.ball.x=cx+p.rx*Math.cos(a);g.ball.y=cy-p.ry*Math.sin(a)-3;g.ball.vx=45;g.ball.vy=Math.sqrt(350*350-45*45);if(!g.collideBallPaddle(1050*Math.cos(a)))continue;hits++;approx(speed(),350);const cp=g.closestEllipsePoint(g.ball.x-cx,g.ball.y-cy,p.rx,p.ry);assert.equal(cp.inside,false);assert.ok(Math.hypot(g.ball.x-cx-cp.x,g.ball.y-cy-cp.y)>=g.ball.r-.1);}assert.ok(hits>80);});
testCase('triangles detect collision in all eight orientations',()=>{for(let i=0;i<8;i++){const b={x:200,y:110,w:28,h:28,rotation:i*Math.PI/4,shape:'triangle'};const [a,c,d]=g.triangleVertices(b);const mx=(c.x+d.x)/2,my=(c.y+d.y)/2;const gcx=(a.x+c.x+d.x)/3,gcy=(a.y+c.y+d.y)/3;let nx=my-gcy,ny=gcx-mx;const n=Math.hypot(nx,ny);nx/=n;ny/=n;g.ball.x=mx+nx*(g.ball.r-.4);g.ball.y=my+ny*(g.ball.r-.4);assert.ok(g.getTriangleBrickCollision(b));}});
testCase('all shapes have real geometry collisions',()=>{for(const shape of ['circle','rect','triangle']){const b={x:220,y:130,w:25,h:25,shape,rotation:Math.PI/4};g.ball.x=232;g.ball.y=130;assert.ok(g.getBrickCollision(b),shape);}});
testCase('UI buttons update state and visible label',()=>{g.restart();listeners['start:click']();assert.equal(g.state,'playing');listeners['pause:click']();assert.equal(g.state,'paused');assert.equal(hud.pause.textContent,'再開');listeners['pause:click']();assert.equal(g.state,'playing');listeners['reset:click']();assert.equal(g.state,'ready');});
testCase('simulation stays within fixed level speed',()=>{g.restart();g.start();for(let i=0;i<500;i++){g.update(1/120);g.draw();assert.ok(speed()<=350.001);if(g.state!=='playing')break;}});
console.log('ALL '+passed+' REGRESSION TESTS PASSED');

testCase('gallery contains four playable links',()=>{
  const gallery=fs.readFileSync('index.html','utf8');
  for(const name of ['v1-classic','v2-shapes','v3-reflections','v4-speed']){
    const path='games/'+name+'.html';
    assert.ok(gallery.includes('href="'+path+'"'),'missing menu link '+path);
    assert.ok(fs.existsSync(path),'missing playable page '+path);
  }
});
testCase('all archived pages are standalone and have valid JavaScript',()=>{
  const sources=new Set();
  for(const name of ['v1-classic','v2-shapes','v3-reflections','v4-speed']){
    const path='games/'+name+'.html',page=fs.readFileSync(path,'utf8');
    assert.match(page,/<canvas[^>]+id="game"/);
    assert.match(page,/<\/html>\s*$/i);
    const match=page.match(/<script>([\s\S]*?)<\/script>/);
    assert.ok(match,'missing script in '+path);
    new vm.Script(match[1],{filename:path});
    sources.add(page);
  }
  assert.equal(sources.size,4,'archived versions should be distinct');
});
console.log('GALLERY + ARCHIVE VALIDATION COMPLETE');
