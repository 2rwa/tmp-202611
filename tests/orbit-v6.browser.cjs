'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path'),{pathToFileURL}=require('node:url');
const {chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:1120,height:900},acceptDownloads:true});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 fs.mkdirSync('test-artifacts',{recursive:true});
 const local=p=>pathToFileURL(path.resolve(p)).href;
 await page.goto(local('games/v6-orbit.html')+'?test=1');
 await page.locator('#arena').waitFor();
 const state=await page.evaluate(()=>window.__orbitV6Test?.inspect());
 assert.equal(state.level,1);assert.equal(state.state,'ready');
 assert.equal(await page.locator('#status').innerText(),'READY');
 assert.equal(await page.locator('#combo').innerText(),'×0');
 await page.locator('#start').click();
 await page.keyboard.press('Space');
 assert.equal((await page.evaluate(()=>window.__orbitV6Test.inspect())).state,'paused');
 await page.keyboard.press('Space');
 assert.equal((await page.evaluate(()=>window.__orbitV6Test.inspect())).state,'playing');
 console.log('PASS start, pause/resume and v6 HUD');
 const level6=await page.evaluate(()=>{window.__orbitV6Test.setStage(6);return window.__orbitV6Test.inspect();});
 assert.equal(level6.shell,'circle');
 assert.ok(level6.targets.some(t=>t.variant==='inflate'));
 const level9=await page.evaluate(()=>{window.__orbitV6Test.setStage(9);return window.__orbitV6Test.inspect();});
 assert.ok(level9.targets.some(t=>t.variant==='split'));
 const stage12=await page.evaluate(()=>{window.__orbitV6Test.setStage(12);return window.__orbitV6Test.inspect();});
 assert.equal(stage12.shell,'star');
 await page.screenshot({path:'test-artifacts/orbit-v6-star.png'});
 const stage13=await page.evaluate(()=>{window.__orbitV6Test.setStage(13);return window.__orbitV6Test.inspect();});
 assert.equal(stage13.shell,'square');
 await page.screenshot({path:'test-artifacts/orbit-v6-square.png'});
 const stage15=await page.evaluate(()=>{window.__orbitV6Test.setStage(15);return window.__orbitV6Test.inspect();});
 assert.equal(stage15.shell,'morph');
 console.log('PASS stage-specific target variants and outer shapes render');
 await page.locator('#fullscreen').click();
 await page.waitForFunction(()=>!!document.fullscreenElement||document.body.classList.contains('v6-immersive'));
 const full=await page.evaluate(()=>!!document.fullscreenElement||document.body.classList.contains('v6-immersive'));
 assert.ok(full,'fullscreen or supported immersive fallback');
 assert.equal(await page.locator('#fullscreen').getAttribute('aria-pressed'),'true');
 await page.locator('#fullscreen-exit').click();
 await page.waitForFunction(()=>!document.fullscreenElement&&!document.body.classList.contains('v6-immersive'));
 const exited=await page.evaluate(()=>!document.fullscreenElement&&!document.body.classList.contains('v6-immersive'));
 assert.ok(exited,'in-arena close button must exit fullscreen');
 console.log('PASS fullscreen toggle');
 await page.locator('#copy-link').click();
 assert.ok((await page.locator('#share-status').innerText()).includes('リンク'));
 const qr=await page.locator('.qr-content img').getAttribute('src');
 assert.ok(qr.includes('v6-orbit.html'));
 assert.equal(await page.locator('.star-link').getAttribute('href'),'https://github.com/2rwa/tmp-202611');
 console.log('PASS link sharing, QR and GitHub Star destination');
 const combo=await page.evaluate(()=>{
  const a=window.__orbitV6Test;a.setStage(4);
  for(let i=0;i<4;i++){
   a.setTargets([
    {id:i,kind:'circle',x:400,y:300,r:14,vx:0,vy:0,rotation:0,spin:0,hp:1},
    {id:999,kind:'square',x:550,y:320,r:12,vx:0,vy:0,rotation:0,spin:0,hp:1}]);
   a.setEnergy(100);a.injectBall(400,268,0,a.inspect().expectedSpeed);a.tick(.05);
  }
  return a.inspect();
 });
 assert.equal(combo.combo,4);assert.equal(combo.lives,4);
 assert.ok(combo.lifeBonusClaimed);
 assert.equal(await page.locator('#combo').innerText(),'×4');
 console.log('PASS combo score and once-per-stage LIFE +1');
 const end=await page.evaluate(()=>{
  const a=window.__orbitV6Test;
  for(let i=0;i<4;i++){a.skipCooldown();a.loseLife();}
  return a.inspect();
 });
 assert.equal(end.state,'gameover');
 assert.equal(await page.locator('#result').isVisible(),true);
 await page.screenshot({path:'test-artifacts/orbit-v6-gameover.png'});
 assert.equal(await page.locator('#final-stage').innerText(),'4');
 assert.equal(await page.locator('#final-score').innerText(),end.score.toLocaleString('ja-JP'));
 const capture=await page.evaluate(()=>{
  const out=window.__orbitV6Test.captureDataURL();
  let downloaded=null;
  const original=HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click=function(){downloaded={href:this.href,file:this.download};};
  document.getElementById('capture').click();
  HTMLAnchorElement.prototype.click=original;
  return {preview:out,downloaded};
 });
 assert.ok(capture.preview.startsWith('data:image/png;base64,'));
 assert.ok(capture.preview.length>20000);
 fs.writeFileSync('test-artifacts/orbit-v6-record.png',Buffer.from(capture.preview.split(',')[1],'base64'));
 assert.ok(capture.downloaded?.file.includes('stage-4-score-'));
 assert.ok(capture.downloaded.href.startsWith('data:image/png;base64,'));
 console.log('PASS GAME OVER final stage/score and result PNG capture');
 assert.deepEqual(errors,[]);
 console.log('ALL ORBIT V6 CHROMIUM BROWSER TESTS PASSED');
 await browser.close();
})().catch(e=>{console.error(e.stack||e);process.exit(1);});
