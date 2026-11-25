// Mac/real-GPU benchmark. Do not force SwiftShader here.
const {chromium}=require('playwright');
const {spawn}=require('node:child_process');
const fs=require('node:fs/promises');
const assert=require('node:assert/strict');
const version=process.env.ORT_VERSION||'1.22.0',opt=process.env.ORT_OPT||'all',patch=process.env.DET_PATCH==='1';
const url='http://127.0.0.1:8768/ndlocr-lite-v2/?ort='+version+'&opt='+opt+(patch?'&detpatch=1':'');
const expected='国立国会図書館\n日本語の文字認識を試します。\nNDLOCR Lite 2.0';
const median=a=>[...a].sort((x,y)=>x-y)[Math.floor(a.length/2)];
const results=[];let browser,server;
(async()=>{
 await fs.mkdir('ndlocr-mac-proof',{recursive:true});server=spawn('python3',['-m','http.server','8768','--bind','127.0.0.1'],{stdio:'ignore'});
 try{
  let ready=false;for(let i=0;i<50;i++){try{if((await fetch(url)).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,200));}assert.ok(ready);
  browser=await chromium.launch({channel:process.env.CHROME_CHANNEL||'chrome',headless:process.env.HEADLESS!=='0',args:['--enable-unsafe-webgpu']});
  console.log('Browser',browser.version(),'platform',process.platform,process.arch,'ORT',version,'opt',opt,'patch',patch);
  for(const ep of ['wasm','webgpu-rec','webgpu-det','webgpu']){
   let item={ep,version,opt,patch,platform:process.platform,arch:process.arch,browser:browser.version(),runs:[]};
   const ctx=await browser.newContext();
   await ctx.addInitScript(()=>{
    window.gpuCounts={dispatch:0,submit:0,errors:[],devices:[]};
    for(const [p,m,k] of [[globalThis.GPUComputePassEncoder?.prototype,'dispatchWorkgroups','dispatch'],[globalThis.GPUComputePassEncoder?.prototype,'dispatchWorkgroupsIndirect','dispatch'],[globalThis.GPUQueue?.prototype,'submit','submit']])if(p&&typeof p[m]==='function'){const f=p[m];p[m]=function(...args){window.gpuCounts[k]++;return f.apply(this,args);};}
    const p=globalThis.GPUAdapter?.prototype;if(p){const f=p.requestDevice;p.requestDevice=async function(...args){const d=await f.apply(this,args);window.gpuCounts.devices.push({vendor:this.info?.vendor,description:this.info?.description,architecture:this.info?.architecture,isFallbackAdapter:this.info?.isFallbackAdapter??this.isFallbackAdapter??null});d.addEventListener('uncapturederror',e=>window.gpuCounts.errors.push(e.error.message));d.lost.then(x=>{if(x.reason!=='destroyed')window.gpuCounts.errors.push('device lost '+x.message);});return d;};}
   });
   const page=await ctx.newPage();const messages=[];page.on('pageerror',e=>messages.push(String(e)));page.on('console',m=>{if(['warning','error'].includes(m.type()))messages.push(m.text());});
   try{
    await page.goto(url);await page.locator('#run').waitFor();
    item.adapter=await page.evaluate(async()=>{const a=await navigator.gpu?.requestAdapter();if(!a)return null;return {vendor:a.info?.vendor,architecture:a.info?.architecture,description:a.info?.description,isFallbackAdapter:a.info?.isFallbackAdapter??a.isFallbackAdapter??null};});
    await page.locator('#ep').selectOption(ep);
    for(let i=0;i<4;i++){
     const before=await page.evaluate(()=>({...window.gpuCounts}));
     const t=performance.now();await page.locator('#run').click();await page.waitForFunction(()=>['done','error'].includes(document.querySelector('#status').dataset.state),{},{timeout:600000});
     const actual=await page.locator('#result').inputValue(),state=await page.locator('#status').getAttribute('data-state'),log=await page.locator('#log').innerText(),gpu=await page.evaluate(()=>window.gpuCounts);
     const total=Number(log.match(/total (\d+) ms/)?.[1]||0),det=Number(log.match(/DEIM (\d+) ms/)?.[1]||0),rec=Number(log.match(/PARSeq (\d+) ms/)?.[1]||0);
     const row={i,cold:i===0,state,actual,wallMs:Math.round(performance.now()-t),totalMs:total,detMs:det,recMs:rec,gpuDispatch:gpu.dispatch-before.dispatch,gpuSubmit:gpu.submit-before.submit,log};
     item.runs.push(row);console.log(JSON.stringify({ep,...row}));
     assert.equal(state,'done',log);assert.equal(actual,expected);assert.ok(total>0);if(ep!=='wasm')assert.ok(row.gpuDispatch>0&&row.gpuSubmit>0,'no GPU dispatch on this run');
     assert.deepEqual(gpu.errors,[]);
    }
    const gpu=await page.evaluate(()=>window.gpuCounts);item.devices=gpu.devices;
    // Accept only explicitly identified non-software Apple hardware; unknown
    // or virtual adapter is not hardware speed evidence.
    item.hardwareVerified=ep!=='wasm'&&process.platform==='darwin'&&gpu.devices.length>0&&gpu.devices.every(d=>/apple/i.test([d.vendor,d.description,d.architecture].join(' '))&&d.isFallbackAdapter!==true&&!/swiftshader|software/i.test([d.vendor,d.description,d.architecture].join(' ')));
    item.medianMs=median(item.runs.slice(1).map(x=>x.totalMs));item.pass=true;
   }catch(e){item.pass=false;item.error=String(e);try{item.log=await page.locator('#log').innerText();item.gpu=await page.evaluate(()=>window.gpuCounts);}catch{}}
   item.messages=messages.slice(-40);results.push(item);await page.screenshot({path:'ndlocr-mac-proof/'+ep+'.png',fullPage:true}).catch(()=>{});await ctx.close();
  }
 }finally{
  const cpu=results.find(x=>x.ep==='wasm'&&x.pass);
  for(const r of results)if(cpu&&r.pass&&r.ep!=='wasm'){r.speedup=cpu.medianMs/r.medianMs;r.accelerated=r.hardwareVerified&&r.speedup>=1.5;}
  const report={results,success:results.some(r=>r.accelerated===true),target:'Apple GPU, exact OCR, >=1.5x median warm end-to-end vs WASM'};
  await fs.writeFile('ndlocr-mac-proof/report.json',JSON.stringify(report,null,2));console.log('MAC_GPU_SUMMARY',JSON.stringify(results.map(({ep,pass,hardwareVerified,medianMs,speedup,accelerated,error})=>({ep,pass,hardwareVerified,medianMs,speedup,accelerated,error}))));
  await browser?.close();server?.kill();if(!report.success)process.exitCode=1;
 }
})().catch(e=>{console.error(e);process.exitCode=1;});
