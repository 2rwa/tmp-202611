'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:1120,height:960},deviceScaleFactor:1});
 const errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 const open=f=>pathToFileURL(path.resolve(f)).href;
 fs.mkdirSync('test-artifacts',{recursive:true});
 await page.goto(open('index.html'));
 await page.locator('a.tile[href="games/v5-orbit.html"]').waitFor();
 assert.equal(await page.locator('a.tile[href^="games/"]').count(),5,'index must list exactly five games');
 await page.screenshot({path:'test-artifacts/orbit-gallery.png'});
 console.log('PASS gallery has five clickable entries');
 for(const name of ['v1-classic','v2-shapes','v3-reflections','v4-speed']){
   await page.goto(open('games/'+name+'.html'));
   await page.locator('canvas').waitFor();
   await page.waitForTimeout(65);
   assert.equal(await page.locator('canvas').count(),1);
 }
 assert.deepEqual(errors,[], 'archived games must open in Chromium without page errors');
 console.log('PASS historical four games load without runtime exceptions');
 await page.goto(open('games/v5-orbit.html')+'?test=1');
 await page.locator('#arena').waitFor();
 const report=await page.evaluate(()=>window.__orbitTest?.inspect());
 assert.ok(report&&report.remaining>=13,'new orbit engine must initialize');
 assert.equal(report.state,'ready');
 assert.ok(await page.locator('#status').innerText()==='READY');
 const lit=await page.evaluate(()=>{
  const canvas=document.querySelector('canvas');
  const ctx=canvas.getContext('2d');
  let count=0;for(let y=80;y<530;y+=35)for(let x=140;x<660;x+=35){
   const data=ctx.getImageData(x,y,1,1).data;
   if(data[0]+data[1]+data[2]>45)count++;
  }
  return count;
 });
 assert.ok(lit>40,'canvas should render real pixels, got '+lit);
 await page.screenshot({path:'test-artifacts/orbit-ready.png'});
 console.log('PASS actual Canvas pixels and READY HUD render in browser');
 await page.locator('#start').click();
 await page.waitForTimeout(250);
 assert.equal((await page.evaluate(()=>window.__orbitTest.inspect())).state,'playing');
 assert.equal(await page.locator('#status').innerText(),'PLAYING');
 await page.keyboard.down('ArrowRight');
 const angle1=await page.evaluate(()=>window.__orbitTest.inspect().paddleAngle);
 await page.waitForTimeout(170);
 await page.keyboard.up('ArrowRight');
 const angle2=await page.evaluate(()=>window.__orbitTest.inspect().paddleAngle);
 assert.ok(Math.abs(angle2-angle1)>.2,'keyboard should rotate paddle');
 await page.keyboard.press('Space');
 assert.equal((await page.evaluate(()=>window.__orbitTest.inspect())).state,'paused');
 await page.keyboard.press('Space');
 assert.equal((await page.evaluate(()=>window.__orbitTest.inspect())).state,'playing');
 console.log('PASS real start, keyboard rotation, pause and resume');
 const result=await page.evaluate(()=>{
   const api=window.__orbitTest;
   api.setAngle(Math.PI/2);
   const prev=api.inspect().frontHits,speed=api.inspect().expectedSpeed;
   api.injectBall(400,300+188,0,speed);
   api.tick(.04);
   const a=api.inspect();
   return {prev,front:a.frontHits,state:a.state,speed:a.speed,expected:a.expectedSpeed};
 });
 assert.equal(result.front,result.prev+1,'front should reflect');
 assert.equal(result.state,'playing');
 assert.ok(Math.abs(result.speed-result.expected)<.002);
 console.log('PASS front collision reflects without speed gain in real browser');
 for(let i=0;i<3;i++){
  const r=await page.evaluate(()=>{
    const api=window.__orbitTest;
    if(api.inspect().state!=='playing')api.play();
    api.setAngle(Math.PI/2);
    const speed=api.inspect().expectedSpeed;
    api.injectBall(400,531,0,-speed);
    api.tick(.04);
    return api.inspect();
  });
  assert.equal(r.rearHits,i+1);
  assert.equal(r.lives,2-i);
  assert.equal(r.state,i===2?'gameover':'ready');
 }
 assert.equal(await page.locator('#status').innerText(),'GAME OVER');
 await page.screenshot({path:'test-artifacts/orbit-gameover.png'});
 console.log('PASS three backside collisions show real GAME OVER in HUD and canvas');
 await page.locator('#reset').click();
 assert.equal(await page.locator('#status').innerText(),'READY');
 assert.equal(await page.locator('#lives').innerText(),'♥♥♥');
 await page.locator('#start').click();
 await page.evaluate(()=>window.__orbitTest.clearTargets());
 assert.equal(await page.locator('#status').innerText(),'CLEAR');
 await page.locator('#start').click();
 assert.equal(await page.locator('#level').innerText(),'2');
 assert.equal(await page.locator('#status').innerText(),'PLAYING');
 console.log('PASS reset and stage advance update visible UI');
 assert.deepEqual(errors,[],'No browser exceptions allowed');
 console.log('ALL ORBIT CHROMIUM GAMEPLAY TESTS PASSED');
 await browser.close();
})().catch(e=>{console.error(e.stack||e);process.exit(1);});
