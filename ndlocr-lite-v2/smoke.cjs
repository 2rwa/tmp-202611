const {chromium}=require('playwright');
const {spawn}=require('node:child_process');
const assert=require('node:assert/strict');
(async()=>{
 const server=spawn('python3',['-m','http.server','8765','--bind','127.0.0.1'],{stdio:'ignore'});let browser;
 try{
  for(let i=0;i<50;i++){try{if((await fetch('http://127.0.0.1:8765/ndlocr-lite-v2/')).ok)break;}catch{}await new Promise(r=>setTimeout(r,200));}
  browser=await chromium.launch({headless:true});const page=await browser.newPage();
  page.on('pageerror',e=>console.error('PAGE ERROR',e));await page.goto('http://127.0.0.1:8765/ndlocr-lite-v2/');
  await page.locator('#run').click();await page.waitForFunction(()=>['done','error'].includes(document.querySelector('#status').dataset.state),{},{timeout:600000});
  const state=await page.locator('#status').innerText(),log=await page.locator('#log').innerText(),text=await page.locator('#result').inputValue();
  console.log(state,log,JSON.stringify(text));assert.equal(await page.locator('#status').getAttribute('data-state'),'done');assert.ok(text.trim().length>0,'empty OCR');assert.match(text,/国立|図書館|日本語|NDLOCR/i);
  await page.screenshot({path:'ndlocr-smoke.png',fullPage:true});
 }finally{await browser?.close();server.kill();}
})().catch(e=>{console.error(e);process.exitCode=1;});