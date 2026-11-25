const {chromium}=require('playwright');
const {spawn}=require('node:child_process');
const fs=require('node:fs/promises');
const assert=require('node:assert/strict');
(async()=>{
 await fs.mkdir('benchmark-ui-proof',{recursive:true});
 const server=spawn('python3',['-m','http.server','8769','--bind','127.0.0.1'],{stdio:'ignore'});let browser;
 try{
  const url='http://127.0.0.1:8769/ndlocr-lite-v2/';
  for(let i=0;i<50;i++){try{if((await fetch(url)).ok)break;}catch{}await new Promise(r=>setTimeout(r,200));}
  browser=await chromium.launch({headless:true,args:['--disable-gpu']});const ctx=await browser.newContext({acceptDownloads:true});
  await ctx.addInitScript(()=>Object.defineProperty(navigator,'gpu',{value:undefined,configurable:true}));
  const page=await ctx.newPage();await page.goto(url);assert.equal(await page.locator('#ep').inputValue(),'webgpu-det');await page.locator('#bench-plan').selectOption('cascade-compare');await page.locator('#benchmark').click();
  await page.waitForFunction(()=>!document.querySelector('#bench-save').disabled,{},{timeout:600000});
  const pending=page.waitForEvent('download');await page.locator('#bench-save').click();const d=await pending;await d.saveAs('benchmark-ui-proof/report.json');
  const report=JSON.parse(await fs.readFile('benchmark-ui-proof/report.json','utf8'));assert.equal(report.plan,'cascade-compare');assert.equal(report.rows.length,5);assert.deepEqual(report.rows.map(r=>[r.ep,r.recognizer]),[['wasm','simple'],['webgpu-det','simple'],['webgpu-det','cascade'],['webgpu','cascade'],['webgpu','simple']]);
  const cpu=report.rows[0];assert.equal(cpu.ep,'wasm');assert.equal(cpu.runs.length,4);assert.ok(cpu.warmMs>0);assert.ok(cpu.detMs>0);assert.ok(cpu.recMs>0);assert.equal(cpu.matches,true);
  for(const row of report.rows.slice(1)){assert.equal(row.state,'エラー');assert.match(row.error,/WebGPU adapter/);}
  assert.equal(await page.locator('#bench-results tr').count(),5);assert.equal(await page.locator('#cascade').inputValue(),'simple');assert.equal(await page.locator('#run').isEnabled(),true);
  await page.screenshot({path:'benchmark-ui-proof/ui.png',fullPage:true});console.log(JSON.stringify(report));
 }finally{await browser?.close();server.kill();}
})().catch(e=>{console.error(e);process.exitCode=1;});
