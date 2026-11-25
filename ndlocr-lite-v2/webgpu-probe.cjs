const {chromium}=require('playwright');
const {spawn}=require('node:child_process');
const fs=require('node:fs/promises');
const assert=require('node:assert/strict');
const version=process.env.ORT_VERSION||'1.22.0',opt=process.env.ORT_OPT||'all';
const url='http://127.0.0.1:8767/ndlocr-lite-v2/?ort='+version+'&opt='+opt;
const expected='国立国会図書館\n日本語の文字認識を試します。\nNDLOCR Lite 2.0';
const flags=['--enable-unsafe-webgpu','--enable-features=Vulkan','--use-vulkan=swiftshader','--disable-vulkan-fallback-to-gl-for-testing','--use-webgpu-adapter=swiftshader','--enable-webgpu-developer-features','--enable-dawn-features=allow_unsafe_apis','--disable-dawn-features=use_dxc','--use-gpu-in-tests','--enable-unsafe-swiftshader'];
const results=[];let browser,server;
(async()=>{
 await fs.mkdir('ndlocr-gpu-proof',{recursive:true});
 server=spawn('python3',['-m','http.server','8767','--bind','127.0.0.1'],{stdio:'ignore'});
 try{
  for(let i=0;i<50;i++){try{if((await fetch(url)).ok)break;}catch{}await new Promise(r=>setTimeout(r,200));}
  browser=await chromium.launch({headless:true,args:flags});console.log('Chromium',browser.version(),'ORT',version,'optimization',opt);
  for(const [id,ep,mode] of [['parseq','webgpu-rec','line'],['deim','webgpu-det','page'],['mixed','webgpu','page']]){
   const ctx=await browser.newContext();
   await ctx.addInitScript(()=>{
    window.gpuCounts={dispatch:0,submit:0,errors:[]};
    for(const [proto,method,key] of [[globalThis.GPUComputePassEncoder?.prototype,'dispatchWorkgroups','dispatch'],[globalThis.GPUComputePassEncoder?.prototype,'dispatchWorkgroupsIndirect','dispatch'],[globalThis.GPUQueue?.prototype,'submit','submit']]){
     if(!proto||typeof proto[method]!=='function')continue;const original=proto[method];proto[method]=function(...args){window.gpuCounts[key]++;return original.apply(this,args);};
    }
    const p=globalThis.GPUAdapter?.prototype;if(p){const request=p.requestDevice;p.requestDevice=async function(...args){const d=await request.apply(this,args);d.addEventListener('uncapturederror',e=>window.gpuCounts.errors.push(e.error.message));d.lost.then(x=>{if(x.reason!=='destroyed')window.gpuCounts.errors.push('device lost '+x.message);});return d;};}
   });
   const page=await ctx.newPage();const messages=[];page.on('console',m=>{if(m.type()==='warning'||m.type()==='error')messages.push(m.text());});page.on('pageerror',e=>messages.push(String(e)));
   let item={id,ep,mode,version,opt};
   try{
    await page.goto(url);await page.locator('#run').waitFor();
    const adapter=await page.evaluate(async()=>{const a=await navigator.gpu?.requestAdapter();if(!a)return null;return {vendor:a.info?.vendor,architecture:a.info?.architecture,device:a.info?.device,description:a.info?.description,maxBufferSize:a.limits.maxBufferSize};});
    item.adapter=adapter;assert.ok(adapter,'WebGPU adapter unavailable');
    if(mode==='line'){const data=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=500;c.height=75;const g=c.getContext('2d');g.fillStyle='white';g.fillRect(0,0,c.width,c.height);g.fillStyle='black';g.font='42px sans-serif';g.fillText('国立国会図書館',10,52);return c.toDataURL().split(',')[1];});await page.locator('#file').setInputFiles({name:'line.png',mimeType:'image/png',buffer:Buffer.from(data,'base64')});await page.waitForFunction(()=>document.querySelector('#status').dataset.state==='ready');}
    await page.locator('#mode').selectOption(mode);await page.locator('#ep').selectOption(ep);await page.locator('#run').click();
    await page.waitForFunction(()=>['done','error'].includes(document.querySelector('#status').dataset.state),{},{timeout:900000});
    item.state=await page.locator('#status').getAttribute('data-state');item.status=await page.locator('#status').innerText();item.actual=await page.locator('#result').inputValue();item.log=await page.locator('#log').innerText();item.gpu=await page.evaluate(()=>window.gpuCounts);
    assert.equal(item.state,'done',item.status);assert.equal(item.actual,mode==='line'?'国立国会図書館':expected);assert.ok(item.gpu.dispatch>0&&item.gpu.submit>0,'no actual GPU compute dispatch');assert.deepEqual(item.gpu.errors,[]);item.pass=true;
   }catch(e){item.pass=false;item.error=String(e);try{item.log=await page.locator('#log').innerText({timeout:3000});item.gpu=await page.evaluate(()=>window.gpuCounts);}catch{}}
   item.messages=messages.slice(-60);results.push(item);console.log(JSON.stringify(item));await page.screenshot({path:'ndlocr-gpu-proof/'+id+'.png',fullPage:true}).catch(()=>{});await ctx.close();
  }
 }finally{await fs.writeFile('ndlocr-gpu-proof/report.json',JSON.stringify(results,null,2));await browser?.close();server?.kill();}
 if(results.length!==3||results.some(r=>!r.pass))process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});
