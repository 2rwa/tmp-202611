'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium}=require('playwright');

(async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1100,height:850}});
  // A blocked third-party script must not remove the usable Star link.
  await page.route('https://buttons.github.io/**', route=>route.abort());
  await page.route('https://github.com/2rwa/tmp-202611**',route=>
   route.fulfill({status:200,contentType:'text/html',body:'<h1 id="github-target">Repository</h1>'})
  );
  fs.mkdirSync('test-artifacts',{recursive:true});
  for(const file of ['index.html','translate/index.html']){
   const html=fs.readFileSync(file,'utf8');
   assert.ok(html.includes('https://buttons.github.io/buttons.js'),file+': GitHub Buttons script missing');
   await page.goto(pathToFileURL(path.resolve(file)).href,{waitUntil:'domcontentloaded'});
   const star=page.locator('a.github-button');
   assert.equal(await star.count(),1,file+': one Star button required');
   assert.equal(await star.getAttribute('href'),'https://github.com/2rwa/tmp-202611');
   assert.equal(await star.getAttribute('data-show-count'),'true');
   assert.equal(await star.isVisible(),true,file+': fallback Star link not visible');
   await star.scrollIntoViewIfNeeded();
   await page.screenshot({path:'test-artifacts/github-star-'+(file.startsWith('translate')?'translate':'index')+'.png'});
   await star.click();
   await page.waitForURL('https://github.com/2rwa/tmp-202611');
   assert.equal(await page.locator('#github-target').innerText(),'Repository');
   console.log('PASS: '+file+' Star counter markup, accessible fallback, click target');
  }
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
