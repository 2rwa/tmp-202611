'use strict';
const {chromium}=require('playwright');
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
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage();
  page.on('console',m=>{if(m.type()==='error'||m.text().includes('wllama-probe'))console.log('BROWSER '+m.type()+': '+m.text());});
  page.on('pageerror',e=>console.error('PAGE ERROR:',e.stack));
  const port=server.address().port;
  await page.goto('http://127.0.0.1:'+port+'/translate/');
  await page.addScriptTag({url:'/translate/wllama-probe.js',type:'module'});
  const result=await page.evaluate(async()=>await globalThis.__wllamaProbe);
  console.log('Probe result',JSON.stringify(result).slice(0,12000));
  assert.equal(result.ok,true,result.error+'\n'+result.stack);
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>server.close());
