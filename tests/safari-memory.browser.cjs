'use strict';
// macOS Safari RSS samples by process. RSS is NOT physical footprint: shared pages can be counted twice.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),cp=require('node:child_process');
const assert=require('node:assert/strict');
const {Builder,By}=require('selenium-webdriver'),safari=require('selenium-webdriver/safari');
const mode=process.env.SAFARI_MEMORY_MODE||'cpu';
if(!['cpu','gpu'].includes(mode))throw Error('Invalid mode');
const dir='test-artifacts/safari-memory',name='safari-memory-'+mode;
fs.mkdirSync(dir,{recursive:true});
const csv=path.join(dir,name+'.csv'),stagesFile=path.join(dir,name+'-stages.jsonl');
fs.writeFileSync(csv,'time_iso,elapsed_ms,stage,group,pid,ppid,rss_kb\n');
fs.writeFileSync(stagesFile,'');
const started=Date.now(),peak={};
let stage='start',nSamples=0,reading=false,timer;
function mark(label,detail={}){
 stage=label;
 const e={timestamp:new Date().toISOString(),elapsed_ms:Date.now()-started,stage,detail};
 fs.appendFileSync(stagesFile,JSON.stringify(e)+'\n');console.log('MEMORY_STAGE',JSON.stringify(e));
}
function group(command){
 if(/com\.apple\.WebKit\.WebContent|WebKit\.WebContent/.test(command))return 'WebContent';
 if(/com\.apple\.WebKit\.GPU|WebKit\.GPU/.test(command))return 'GPU';
 if(/com\.apple\.WebKit\.Networking|WebKit\.Networking/.test(command))return 'Networking';
 if(/\/Safari\.app\/Contents\/MacOS\/Safari(?:\s|$)/.test(command))return 'Safari';
 return null;
}
function sample(){
 if(reading)return;
 reading=true;
 try{
  const out=cp.execFileSync('/bin/ps',['-axo','pid=,ppid=,rss=,command='],{encoding:'utf8',timeout:5000,maxBuffer:8*1024*1024});
  const totals={};let batch='';
  for(const line of out.split('\n')){
   const m=line.match(/^\s*(\d+)\s+(\d+)\s+(\d+)\s+(.+)$/);
   if(!m)continue;
   const cls=group(m[4]);if(!cls)continue;
   batch+=[new Date().toISOString(),Date.now()-started,stage,cls,m[1],m[2],m[3]].join(',')+'\n';
   totals[cls]=(totals[cls]||0)+Number(m[3]);
  }
  fs.appendFileSync(csv,batch);nSamples++;
  for(const [cls,kb] of Object.entries(totals))peak[cls]=Math.max(peak[cls]||0,kb);
 }catch(e){console.error('MEMORY_SAMPLE_ERROR',String(e));}finally{reading=false;}
}
const root=path.resolve('dist');
const server=http.createServer((req,res)=>{
 try{
  let rel=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname);
  if(rel.endsWith('/'))rel+='index.html';
  const file=path.resolve(root,'.'+rel);
  if(!file.startsWith(root+path.sep))throw Error('outside dist');
  const st=fs.statSync(file);if(!st.isFile())throw Error('not a file');
  const ext=path.extname(file),mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.wasm':'application/wasm'};
  res.writeHead(200,{'content-type':mime[ext]||'application/octet-stream','content-length':st.size,'cache-control':'no-cache'});
  if(req.method==='HEAD')return res.end();
  fs.createReadStream(file).pipe(res);
 }catch(e){res.writeHead(404);res.end(String(e));}
});
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function poll(driver,label,fn,timeout=300000){
 const t=Date.now();
 while(Date.now()-t<timeout){const v=await driver.executeScript(fn);if(v?.done)return v;await pause(1000);}
 throw Error(label+' timed out');
}
(async()=>{
 await new Promise((r,j)=>server.once('error',j).listen(42843,'127.0.0.1',r));
 let driver,adapterInfo,translated;
 sample();timer=setInterval(sample,500);
 try{
  mark('safari-launch');
  driver=await new Builder().forBrowser('safari').setSafariOptions(new safari.Options()).build();
  await driver.manage().setTimeouts({pageLoad:60000,script:35000});
  mark('page-load');
  await driver.get('http://127.0.0.1:42843/translate/');
  adapterInfo=await driver.executeAsyncScript(
   "const done=arguments[0];Promise.race([(async()=>{if(!navigator.gpu)return {available:false,reason:'navigator.gpu absent'};const a=await navigator.gpu.requestAdapter();return a?{available:true,features:Array.from(a.features),limits:{maxStorageBufferBindingSize:a.limits.maxStorageBufferBindingSize}}:{available:false,reason:'adapter null'};})(),new Promise(r=>setTimeout(()=>r({available:false,reason:'adapter timeout'}),12000))]).then(done,e=>done({available:false,reason:String(e)}));");
  console.log('SAFARI_GPU_ADAPTER',JSON.stringify(adapterInfo));
  await driver.executeScript("window.__wllamaLogs=[];for(const key of ['log','error','warn','debug']){const old=console[key].bind(console);console[key]=(...args)=>{if(window.__wllamaLogs.length<800)window.__wllamaLogs.push(key+': '+args.map(String).join(' '));old(...args);};}document.getElementById('backend').value=arguments[0];",mode==='gpu'?'auto':'cpu');
  if(mode==='gpu'&&!adapterInfo.available){mark('gpu-unavailable',adapterInfo);return;}
  mark('model-load',{mode});
  await driver.findElement(By.id('load')).click();
  const loaded=await poll(driver,'PLaMo model load',()=>{
   const s=document.getElementById('status');return {done:['ready','error'].includes(s?.dataset.state),status:s?.dataset.state,message:s?.textContent,progress:document.getElementById('progressText')?.textContent};
  });
  console.log('SAFARI_MODEL_LOAD',JSON.stringify(loaded));
  assert.equal(loaded.status,'ready',loaded.message);
  mark('model-ready',loaded);
  await driver.findElement(By.id('translate')).click();
  mark('translation');
  translated=await poll(driver,'PLaMo translation',()=>{
   const s=document.getElementById('status'),output=document.getElementById('result')?.value||'';
   return {done:s?.dataset.state==='error'||(s?.dataset.state==='ready'&&output.length>0),status:s?.dataset.state,message:s?.textContent,output:output.slice(0,300)};
  },240000);
  console.log('SAFARI_TRANSLATION',JSON.stringify(translated));
  assert.equal(translated.status,'ready',translated.message);
  assert.match(translated.output,/[ぁ-んァ-ン一-龯]/);
  mark('translation-finished',translated);
  await pause(3000);
  const logs=await driver.executeScript('return window.__wllamaLogs||[]');
  const gpuLogs=logs.filter(x=>/ggml_webgpu|offload|GPU|shader|adapter|error/i.test(x)).slice(-100);
  console.log('SAFARI_GPU_LOGS',JSON.stringify(gpuLogs).slice(0,12000));
  fs.writeFileSync(path.join(dir,name+'-browser-logs.json'),JSON.stringify({adapterInfo,logs},null,2));
  mark('model-exit');
  await driver.findElement(By.id('unload')).click();
  await pause(2500);
  console.log('PASS_SAFARI_MEMORY_PROFILE',mode);
 }catch(e){console.error('SAFARI_MEMORY_PROFILE_FAIL',mode,e.stack||e);mark('failure',{error:String(e)});process.exitCode=1;}
 finally{
  if(driver){
   try{fs.writeFileSync(path.join(dir,name+'.png'),Buffer.from(await driver.takeScreenshot(),'base64'));}catch(e){console.error('Screenshot error',String(e));}
   await driver.quit().catch(e=>console.error('Safari quit error',String(e)));
  }
  mark('safari-closed');await pause(1300);
  clearInterval(timer);sample();
  const summary={mode,samples:nSamples,peak_rss_kb_by_process_group:peak,adapter:adapterInfo||null,
   translated:translated||null,unit:'macOS RSS; may double-count shared memory; not iPhone Jetsam limit'};
  fs.writeFileSync(path.join(dir,name+'-summary.json'),JSON.stringify(summary,null,2));
  console.log('SAFARI_MEMORY_SUMMARY',JSON.stringify(summary));
  await new Promise(r=>server.close(r));
 }
})().catch(e=>{console.error(e);process.exitCode=1;});
