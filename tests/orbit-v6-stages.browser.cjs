'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const {chromium}=require('playwright');
const root=process.cwd();
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8'};
const server=http.createServer((req,res)=>{
 const pathname=new URL(req.url,'http://127.0.0.1').pathname;
 const file=path.resolve(root,'.'+decodeURIComponent(pathname));
 if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
 fs.readFile(file,(error,body)=>{
  if(error){res.writeHead(404).end();return;}
  res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream'});
  res.end(body);
 });
});
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const address=server.address();
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 try{
  const page=await browser.newPage({viewport:{width:1120,height:850}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const url='http://127.0.0.1:'+address.port+'/games/v6-orbit.html?test=1';
  await page.goto(url);
  await page.evaluate(()=>localStorage.removeItem('orbitBreakerV6CompletedStage'));
  await page.reload();
  await page.locator('#stage-picker-open').click();
  assert.ok(await page.locator('#stage-picker').isVisible());
  assert.ok(await page.locator('[data-stage="1"]').isEnabled());
  assert.ok(await page.locator('[data-stage="2"]').isDisabled());
  assert.equal(await page.locator('[data-stage="1"] small').innerText(),'NEXT');
  await page.keyboard.press('Escape');
  assert.ok(await page.locator('#stage-picker').isHidden());
  console.log('PASS initial stage picker locks unearned stages and supports Escape');

  await page.evaluate(()=>{const a=window.__orbitV6Test;a.play();a.clearTargets();});
  assert.equal(await page.evaluate(()=>localStorage.getItem('orbitBreakerV6CompletedStage')),'1');
  await page.locator('#stage-picker-open').click();
  assert.equal(await page.locator('[data-stage="1"] small').innerText(),'✓ CLEAR');
  assert.ok(await page.locator('[data-stage="2"]').isEnabled());
  assert.ok(await page.locator('[data-stage="3"]').isDisabled());
  await page.locator('[data-stage="2"]').click();
  let g=await page.evaluate(()=>window.__orbitV6Test.inspect());
  assert.equal(g.level,2);assert.equal(g.startStage,2);assert.equal(g.state,'playing');
  assert.equal(g.score,0);assert.equal(g.lives,3);
  assert.ok(await page.locator('#stage-picker').isHidden());
  await page.locator('#reset').click();
  g=await page.evaluate(()=>window.__orbitV6Test.inspect());
  assert.equal(g.level,2);assert.equal(g.state,'ready');
  await page.locator('#start').click();
  await page.evaluate(()=>{
   const a=window.__orbitV6Test;
   for(let i=0;i<3;i++){a.skipCooldown();a.loseLife();}
  });
  assert.equal((await page.evaluate(()=>window.__orbitV6Test.inspect())).state,'gameover');
  await page.locator('#start').click();
  g=await page.evaluate(()=>window.__orbitV6Test.inspect());
  assert.equal(g.level,2);assert.equal(g.state,'playing');assert.equal(g.lives,3);
  assert.equal(g.score,0);
  console.log('PASS completing stage 1 unlocks stage 2; new run, reset and retry all use selected stage');

  await page.reload();
  await page.locator('#stage-picker-open').click();
  assert.ok(await page.locator('[data-stage="2"]').isEnabled());
  assert.ok(await page.locator('[data-stage="3"]').isDisabled());
  await page.locator('[data-stage="2"]').click();
  await page.evaluate(()=>window.__orbitV6Test.clearTargets());
  assert.equal(await page.evaluate(()=>localStorage.getItem('orbitBreakerV6CompletedStage')),'2');
  await page.reload();
  await page.locator('#stage-picker-open').click();
  for(let i=1;i<=3;i++)assert.ok(await page.locator('[data-stage="'+i+'"]').isEnabled());
  assert.ok(await page.locator('[data-stage="4"]').isDisabled());
  await page.locator('[data-stage="1"]').click();
  assert.equal((await page.evaluate(()=>window.__orbitV6Test.inspect())).level,1);
  await page.locator('#stage-picker-open').click();
  assert.equal((await page.evaluate(()=>window.__orbitV6Test.inspect())).state,'paused');
  await page.keyboard.press('Space');
  assert.equal((await page.evaluate(()=>window.__orbitV6Test.inspect())).state,'paused');
  await page.locator('[data-stage="3"]').click();
  assert.equal((await page.evaluate(()=>window.__orbitV6Test.inspect())).level,3);
  console.log('PASS cleared stages persist across reload, remain replayable, and picker pauses active play');

  await page.locator('#fullscreen').click();
  await page.waitForFunction(()=>window.__orbitV6Test.inspect().viewport.full);
  await page.locator('#stage-picker-open').click();
  assert.ok(await page.locator('#stage-picker').isVisible());
  assert.ok(await page.locator('[data-stage="2"]').isEnabled());
  await page.locator('[data-stage="2"]').click();
  assert.equal((await page.evaluate(()=>window.__orbitV6Test.inspect())).level,2);
  await page.locator('#fullscreen-exit').click();
  await page.waitForFunction(()=>!window.__orbitV6Test.inspect().viewport.full);
  assert.deepEqual(errors,[]);
  console.log('PASS fullscreen stage selection remains accessible');
  console.log('ALL ORBIT V6 STAGE SELECTOR CHROMIUM TESTS PASSED');
 }finally{
  await browser.close();
 }
})().catch(e=>{console.error(e.stack||e);process.exitCode=1}).finally(()=>server.close());
