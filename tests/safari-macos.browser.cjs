'use strict';
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const assert=require('node:assert/strict');
const {Builder,By}=require('selenium-webdriver');
const safari=require('selenium-webdriver/safari');
const root=path.resolve('dist');
const full=process.env.SAFARI_REAL_MODEL==='1';
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8',
 '.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.wasm':'application/wasm'};
const server=http.createServer((req,res)=>{
 try{
  let rel=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname);
  if(rel.endsWith('/'))rel+='index.html';
  const file=path.resolve(root,'.'+rel);
  if(!file.startsWith(root+path.sep))throw Error('path traversal');
  const st=fs.statSync(file);
  if(!st.isFile())throw Error('not a file');
  res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream',
    'content-length':st.size,'cache-control':'no-store'});
  if(req.method==='HEAD')return res.end();
  fs.createReadStream(file).pipe(res);
 }catch(e){res.writeHead(404);res.end(String(e));}
});
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function poll(driver,label,cb,ms=90000){
 const start=Date.now();
 while(Date.now()-start<ms){
  const value=await driver.executeScript(cb).catch(e=>({evalError:String(e)}));
  if(value?.evalError)throw Error(label+': '+value.evalError);
  if(value?.done)return value;
  await pause(1000);
 }
 throw Error(label+' timed out after '+ms+'ms');
}
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 let driver;
 let stage='launch';
 try{
  driver=await new Builder().forBrowser('safari').setSafariOptions(new safari.Options()).build();
  await driver.manage().setTimeouts({pageLoad:60000,script:360000,implicit:0});
  const base='http://127.0.0.1:'+server.address().port+'/translate/';
  console.log('TARGET',base,'mode',full?'PLaMo 0.8B':'tiny GGUF probe');
  stage='navigate';
  await driver.get(base);
  const env=await driver.executeScript('return {userAgent:navigator.userAgent,opfs:!!navigator.storage?.getDirectory,secure:isSecureContext,jsPi:!!WebAssembly.Suspending,mem64:(()=>{try{new WebAssembly.Memory({address:"i64",initial:1n});return true;}catch(e){return false;}})()}');
  console.log('MAC_SAFARI_ENV',JSON.stringify(env));
  if(!env.userAgent.includes('Safari'))throw Error('Browser is not Safari');
  if(!full){
   stage='module-probe';
   await driver.executeScript("window.__expectCompat=false;window.__browserErrors=[];window.addEventListener('error',e=>window.__browserErrors.push(String(e.message)));window.addEventListener('unhandledrejection',e=>window.__browserErrors.push(String(e.reason)));var script=document.createElement('script');script.type='module';script.src='/translate/wllama-probe.js';document.head.appendChild(script);");
   await poll(driver,'PLaMo probe module',()=>({done:!!window.__wllamaProbe,errors:window.__browserErrors}),45000);
   stage='tiny-model-inference';
   const data=await driver.executeAsyncScript("var done=arguments[0];Promise.resolve(window.__wllamaProbe).then(v=>done(v),e=>done({ok:false,error:String(e)}));");
   console.log('MAC_SAFARI_PROBE',JSON.stringify(data).slice(0,13000));
   assert.equal(data.ok,true,JSON.stringify(data.events).slice(-4000));
  }else{
   stage='model-load';
   await driver.findElement(By.id('backend')).sendKeys('CPU / WASM固定');
   await driver.findElement(By.id('load')).click();
   const loaded=await poll(driver,'PLaMo 0.8B model load',()=>{
    const node=document.querySelector('#status');
    return {done:['ready','error'].includes(node?.dataset.state),state:node?.dataset.state,message:node?.textContent,
      progress:document.querySelector('#progressText')?.textContent};
   },300000);
   console.log('MAC_SAFARI_MODEL',JSON.stringify(loaded));
   assert.equal(loaded.state,'ready',loaded.message);
   stage='translation';
   await driver.findElement(By.id('translate')).click();
   const translated=await poll(driver,'PLaMo 0.8B translate',()=>{
    const s=document.querySelector('#status');
    const output=document.querySelector('#result')?.value||'';
    return {done:s?.dataset.state==='error'||(s?.dataset.state==='ready'&&output.length>0),
      state:s?.dataset.state,message:s?.textContent,output:output.slice(0,240)};
   },360000);
   console.log('MAC_SAFARI_TRANSLATE',JSON.stringify(translated));
   assert.equal(translated.state,'ready',translated.message);
   assert.match(translated.output,/[ぁ-んァ-ン一-龯]/);
  }
  console.log('PASS native macOS Safari '+(full?'PLaMo 0.8B translation':'local runtime and tiny GGUF inference'));
 }catch(error){
  console.error('MAC_SAFARI_FAIL stage='+stage, error.stack||error);
  process.exitCode=1;
 }finally{
  if(driver){
   try{
    fs.mkdirSync('test-artifacts',{recursive:true});
    const png=await driver.takeScreenshot();
    fs.writeFileSync('test-artifacts/native-safari-'+(full?'real':'smoke')+'.png',Buffer.from(png,'base64'));
    const snap=await driver.executeScript("return {status:document.querySelector('#status')?.textContent,errors:window.__browserErrors||[],assets:performance.getEntriesByType('resource').filter(x=>x.name.includes('/compat/')||x.name.includes('jsdelivr')).map(x=>x.name)}").catch(e=>({error:String(e)}));
    console.log('MAC_SAFARI_DIAGNOSTICS',JSON.stringify(snap));
   }catch(e){console.error('Screenshot or diagnostic unavailable',String(e));}
   await driver.quit().catch(e=>console.error('Safari quit error',String(e)));
  }
  await new Promise(resolve=>server.close(resolve));
 }
})();
