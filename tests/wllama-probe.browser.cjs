'use strict';
const {chromium,webkit,devices}=require('playwright');
const mobile=process.env.MOBILE_WEBKIT==='1';
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const assert=require('node:assert/strict');
const root=path.resolve('dist');
const server=http.createServer((req,res)=>{
 let pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
 if(pathname.endsWith('/'))pathname+='index.html';
 const file=path.resolve(root,'.'+pathname);
 if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
 try{
  const data=fs.readFileSync(file);
  const ext=path.extname(file);
  res.writeHead(200,{'content-type':ext==='.wasm'?'application/wasm':ext==='.js'?'text/javascript':ext==='.html'?'text/html':'application/octet-stream'});
  res.end(data);
 }catch(e){res.writeHead(404);res.end(String(e));}
});
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await (mobile?webkit:chromium).launch({headless:true});
 try{
  const page=await browser.newPage(mobile?{...devices['iPhone 13']}:{});
  const cdnRequests=[];
  page.on('request',req=>{if(req.url().includes('cdn.jsdelivr.net'))cdnRequests.push(req.url());});
  await page.route('https://cdn.jsdelivr.net/**',route=>route.abort());
  page.setDefaultTimeout(120000);
  page.on('console',m=>{if(m.type()==='error'||m.text().includes('wllama-probe'))console.log('BROWSER '+m.type()+': '+m.text());});
  page.on('pageerror',e=>console.error('PAGE ERROR:',e.stack));
  const port=server.address().port;
  await page.goto('http://127.0.0.1:'+port+'/translate/');
  await page.evaluate(value=>{globalThis.__expectCompat=value;},mobile);
  await page.addScriptTag({url:'/translate/wllama-probe.js',type:'module'});
  await page.waitForFunction(() => typeof globalThis.__wllamaProbe !== 'undefined', undefined, {timeout:30000});
  const result=await page.evaluate(async()=>await globalThis.__wllamaProbe);
  console.log('Browser engine:',mobile?'WebKit / iPhone device profile':'Chromium');
  console.log('Probe result',JSON.stringify(result).slice(0,12000));
  assert.deepEqual(cdnRequests,[], 'A same-origin compat runtime must not request jsDelivr');
  assert.equal(result.ok,true,result.error+'\n'+result.stack);
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>server.close());
