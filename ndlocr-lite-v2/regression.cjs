const {chromium}=require('playwright');
const {spawn}=require('node:child_process');
const fs=require('node:fs/promises');
const path=require('node:path');
const assert=require('node:assert/strict');
const {PDFDocument,StandardFonts}=require('pdf-lib');
const AdmZip=require('adm-zip');
const OUT=path.resolve('ndlocr-regression');
const base=process.env.NDLOCR_TEST_URL||'http://127.0.0.1:8766/ndlocr-lite-v2/';
const upstream='https://raw.githubusercontent.com/ndl-lab/ndlocr-lite/1f3adc7af311af1ce4cbbd4d9089f30781d01313/resource/';
const sample='国立国会図書館\n日本語の文字認識を試します。\nNDLOCR Lite 2.0';
const reports=[];
const norm=s=>Array.from(s.normalize('NFC').replace(/\s/gu,''));
function cer(actual,expected){
 const a=norm(actual),b=norm(expected);let row=Array.from({length:b.length+1},(_,i)=>i);
 for(let i=0;i<a.length;i++){let next=[i+1];for(let j=0;j<b.length;j++)next.push(Math.min(next[j]+1,row[j+1]+1,row[j]+Number(a[i]!==b[j])));row=next;}
 return row[b.length]/Math.max(1,b.length);
}
let browser,page,server,network=[],pageErrors=[];
async function runOCR(){
 await page.locator('#run').click();
 await page.waitForFunction(()=>['done','error'].includes(document.querySelector('#status').dataset.state)&&!document.querySelector('#run').disabled,{},{timeout:180000});
 const log=await page.locator('#log').innerText();
 const actual=await page.locator('#result').inputValue();
 assert.equal(await page.locator('#status').getAttribute('data-state'),'done',log);
 return {actual,log};
}
async function image(name,{w=1000,h=420,lines=[],vertical=false,table=false}){
 const data=await page.evaluate(async ({w,h,lines,vertical,table})=>{
  await document.fonts.ready;
  const c=document.createElement('canvas');c.width=w;c.height=h;const x=c.getContext('2d');
  x.fillStyle='#fff';x.fillRect(0,0,w,h);x.fillStyle='#000';x.font='40px "Noto Sans CJK JP", sans-serif';x.textBaseline='top';
  if(table){x.strokeStyle='#111';x.lineWidth=3;for(let i=0;i<=3;i++){x.beginPath();x.moveTo(30,30+i*110);x.lineTo(930,30+i*110);x.stroke();}for(let i=0;i<=3;i++){x.beginPath();x.moveTo(30+i*300,30);x.lineTo(30+i*300,360);x.stroke();}}
  for(const l of lines){if(vertical){for(const [i,ch] of Array.from(l.text).entries())x.fillText(ch,l.x,l.y+i*48);}else x.fillText(l.text,l.x,l.y);}
  return c.toDataURL('image/png').split(',')[1];
 },{w,h,lines,vertical,table});
 const f=path.join(OUT,name+'.png');await fs.writeFile(f,Buffer.from(data,'base64'));return f;
}
async function load(file,mode='page',order='auto'){
 await page.locator('#file').setInputFiles(file);
 await page.waitForFunction(()=>document.querySelector('#status').dataset.state==='ready');
 await page.locator('#mode').selectOption(mode);await page.locator('#order').selectOption(order);
}
async function download(selector,name){
 const pending=page.waitForEvent('download',{timeout:15000});await page.locator(selector).click();const d=await pending;
 const file=path.join(OUT,name);await d.saveAs(file);return file;
}
async function json(name){return JSON.parse(await fs.readFile(await download('#save',name+'.json'),'utf8'));}
function validBoxes(j){
 assert.ok(j.lines.length);for(const b of j.lines){for(const k of ['x1','x2','y1','y2'])assert.ok(Number.isFinite(b[k]),k);assert.ok(b.x1>=0&&b.y1>=0&&b.x2<=j.width&&b.y2<=j.height&&b.x2>b.x1&&b.y2>b.y1,JSON.stringify(b));assert.equal(typeof b.text,'string');}
 assert.equal(j.text,j.lines.map(b=>b.text).join('\n'));
}
async function feature(id,fn,{requires=[],candidate=false}={}){
 const start=Date.now();let result={id,ms:0};network=[];pageErrors=[];
 try{
  const missing=[];for(const s of requires)if(!await page.locator(s).count())missing.push(s);
  if(requires.includes('#export-format')&&!missing.includes('#export-format')){const requiredFormats={'11-table-html':['html'],'12-pdf-multipage-searchable':['pdf'],'13-xml-tei-txt-markdown':['txt','xml','tei','markdown'],'14-text-daisy':['daisy']}[id]||[];for(const f of requiredFormats)if(!await page.locator('#export-format option[value="'+f+'"]').count())missing.push('export:'+f);}
  if(missing.length){result.status='PENDING';result.reason='UI contract missing: '+missing.join(', ');}
  else{result.detail=await fn();result.status='PASS';}
 }catch(e){result.status=candidate?'BASELINE_FAIL':'FAIL';result.reason=String(e.stack||e);}
 result.ms=Date.now()-start;result.pageErrors=[...pageErrors];result.network=[...network];reports.push(result);
 console.log(JSON.stringify(result));
 try{await page.screenshot({path:path.join(OUT,id+'.png'),fullPage:true});}catch(e){console.error('screenshot',String(e));}
 if(result.detail?.actual!==undefined)await fs.writeFile(path.join(OUT,id+'.txt'),result.detail.actual);
}
async function accuracy(file,expected,{mode='page',order='auto',max=0}={}){
 await load(file,mode,order);const out=await runOCR();const error=cer(out.actual,expected);
 assert.ok(error<=max,'CER '+error+' > '+max+'; actual='+JSON.stringify(out.actual)+' expected='+JSON.stringify(expected));
 return {...out,expected,cer:error};
}
async function makePDF(){
 const doc=await PDFDocument.create();const font=await doc.embedFont(StandardFonts.Helvetica);
 for(const text of ['FIRST PAGE OCR','SECOND PAGE OCR']){const p=doc.addPage([600,200]);p.drawText(text,{x:40,y:100,size:36,font});}
 const f=path.join(OUT,'two-pages.pdf');await fs.writeFile(f,await doc.save());return f;
}
async function exportFile(format,filename){
 await page.locator('#export-format').selectOption(format);return download('#export',filename);
}
async function main(){
 await fs.mkdir(OUT,{recursive:true});
 if(!process.env.NDLOCR_TEST_URL){server=spawn('python3',['-m','http.server','8766','--bind','127.0.0.1'],{stdio:'ignore'});}
 try{
  let ready=false;for(let i=0;i<60;i++){try{if((await fetch(base)).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,250));}assert.ok(ready,'test server unavailable');
  browser=await chromium.launch({headless:true});const ctx=await browser.newContext({acceptDownloads:true});page=await ctx.newPage();page.on('pageerror',e=>pageErrors.push(String(e)));page.on('request',r=>network.push({method:r.method(),url:r.url().split('?')[0]}));
  await page.goto(base);await page.locator('#run').waitFor();
  await feature('01-sample-exact',async()=>{
   await page.locator('#sample').click();await page.locator('#mode').selectOption('page');await page.locator('#ep').selectOption('wasm');await page.locator('#order').selectOption('auto');
   const out=await runOCR();assert.equal(out.actual,sample);assert.match(out.log,/det image input: 800 x 800/);assert.match(out.log,/rec image input: 24 x 768/);
   return {...out,cer:0};
  });
  await feature('02-json-boxes',async()=>{const j=await json('sample');validBoxes(j);assert.equal(j.lines.length,3);assert.equal(j.text,sample);assert.equal(j.requestedEP,'wasm');assert.ok(j.lines[0].y1<j.lines[1].y1&&j.lines[1].y1<j.lines[2].y1);return j;});
  await feature('03-single-line-english',async()=>accuracy(await image('english',{w:780,h:70,lines:[{text:'The quick brown fox jumps.',x:10,y:10}]}),'The quick brown fox jumps.',{mode:'line',max:.08}));
  await feature('04-single-line-japanese',async()=>accuracy(await image('japanese',{w:640,h:70,lines:[{text:'日本語の文字認識です。',x:10,y:10}]}),'日本語の文字認識です。',{mode:'line',max:0}));
  await feature('05-vertical-columns',async()=>{
   const out=await accuracy(await image('vertical',{w:430,h:530,vertical:true,lines:[{text:'春はあけぼの',x:300,y:30},{text:'夏は夜です',x:200,y:30},{text:'秋は夕暮れ',x:100,y:30}]}),'春はあけぼの夏は夜です秋は夕暮れ',{order:'vertical',max:.15});
   const j=await json('vertical');validBoxes(j);assert.ok(j.lines[0].x1>j.lines.at(-1).x1,'vertical right-to-left');return out;
  },{candidate:true});
  await feature('06-two-column-order',async()=>{
   const lines=[{text:'第一段の一行目',x:30,y:45},{text:'第一段の二行目',x:30,y:115},{text:'第二段の一行目',x:580,y:45},{text:'第二段の二行目',x:580,y:115}];
   return accuracy(await image('columns',{w:1120,h:350,lines}),lines.map(l=>l.text).join('\n'),{order:'horizontal',max:0});
  });
  for(const [id,file,expected,order] of [
    ['07-handwritten-horizontal','yokogaki2026-04-24-103617.png','つれづれなるままに日くらし硯にむかひて','horizontal'],
    ['08-handwritten-vertical','tategaki2026-04-24-094138.png','春はあけぼのやうやう白くなりゆく','vertical']
  ])await feature(id,async()=>{
   const response=await fetch(upstream+file);assert.ok(response.ok,'fixture HTTP '+response.status);const f=path.join(OUT,file);await fs.writeFile(f,Buffer.from(await response.arrayBuffer()));
   await load(f,'page',order);const out=await runOCR();const prefix=norm(out.actual).filter(c=>!/[、。,.]/u.test(c)).slice(0,norm(expected).length).join('');const error=cer(prefix,expected);
   assert.ok(error<=.35,'prefix CER '+error+'; '+out.actual);return {...out,expected,cer:error,metric:'prefix CER, exploratory'};
  },{candidate:true});
  await feature('09-crop',async()=>{
   const f=await image('crop',{w:900,h:240,lines:[{text:'不要な文字',x:40,y:20},{text:'選択範囲',x:40,y:150}]});await load(f);
   await page.locator('#crop').click();const rect=await page.locator('#preview').boundingBox();assert.ok(rect);await page.mouse.move(rect.x+10*rect.width/900,rect.y+130*rect.height/240);await page.mouse.down();await page.mouse.move(rect.x+330*rect.width/900,rect.y+220*rect.height/240,{steps:8});await page.mouse.up();const out=await runOCR();assert.equal(norm(out.actual).join(''),'選択範囲');const j=await json('crop-result');validBoxes(j);assert.ok(j.region.y1>100&&j.region.y2<240);assert.ok(j.lines.every(b=>b.y1>=j.region.y1&&b.y2<=j.region.y2&&b.x1>=j.region.x1&&b.x2<=j.region.x2));await page.locator('#crop-clear').click();assert.equal(await page.locator('#crop-info').innerText(),'画像全体');assert.equal(await page.locator('#save').isDisabled(),true);return {...out,region:j.region};
  },{requires:['#crop']});
  await feature('10-variants',async()=>{
   const f=await image('variants',{w:700,h:80,lines:[{text:'國學體會',x:15,y:15}]});await load(f,'line');await page.locator('#normalize-variants').uncheck();const original=await runOCR();assert.equal(norm(original.actual).join(''),'國學體會');await page.locator('#normalize-variants').check();const out=await runOCR();assert.equal(norm(out.actual).join(''),'国学体会');const j=await json('variants-result');assert.equal(j.normalizedVariants,true);assert.equal(norm(j.lines[0].rawText).join(''),'國學體會');assert.equal(norm(j.lines[0].text).join(''),'国学体会');await page.locator('#normalize-variants').uncheck();return {...out,original:original.actual};
  },{requires:['#normalize-variants']});
  await feature('11-table-html',async()=>{
   const values=[['品名','数量','価格'],['りんご','二','百円'],['みかん','三','二百円']];const lines=values.flatMap((row,i)=>row.map((text,j)=>({text,x:45+300*j,y:60+110*i})));
   await load(await image('table',{w:970,h:400,lines,table:true}));await page.locator('#table-structure').check();try{const out=await runOCR();assert.match(out.log,/TableCenterNet .*cells/);const j=await json('table-result');assert.ok(j.tableCells.length>=9,JSON.stringify(j.tableCells));
   const html=await fs.readFile(await exportFile('html','table.html'),'utf8');const cells=await page.evaluate(html=>Array.from(new DOMParser().parseFromString(html,'text/html').querySelectorAll('table tr')).map(tr=>Array.from(tr.querySelectorAll('td,th')).map(td=>td.textContent.trim())),html);
   assert.deepEqual(cells,values);return {cells};}finally{await page.locator('#table-structure').uncheck();}
  },{requires:['#table-structure','#export-format','#export']});
  await feature('12-pdf-multipage-searchable',async()=>{
   const f=await makePDF();await page.locator('#file').setInputFiles(f);await page.waitForFunction(()=>document.querySelector('#status').dataset.state==='ready');await runOCR();
   await page.locator('#page-next').click();await page.waitForFunction(()=>document.querySelector('#status').dataset.state==='done'&&document.querySelector('#page-info').textContent.startsWith('2 /'));assert.match(await page.locator('#result').inputValue(),/SECOND PAGE OCR/);await page.locator('#page-prev').click();await page.waitForFunction(()=>document.querySelector('#status').dataset.state==='done'&&document.querySelector('#page-info').textContent.startsWith('1 /'));assert.match(await page.locator('#result').inputValue(),/FIRST PAGE OCR/);
   const bytes=new Uint8Array(await fs.readFile(await exportFile('pdf','searchable.pdf')));const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs');const doc=await pdfjs.getDocument({data:bytes,useSystemFonts:true}).promise;
   assert.equal(doc.numPages,2);for(let i=1;i<=2;i++){const p=await doc.getPage(i);const content=await p.getTextContent();assert.match(content.items.map(x=>x.str).join(' '),i===1?/FIRST PAGE OCR/:/SECOND PAGE OCR/);}await doc.destroy();await page.locator('#sample').click();await page.waitForFunction(()=>document.querySelector('#status').dataset.state==='ready'&&!document.querySelector('#run').disabled);await runOCR();const jp=new Uint8Array(await fs.readFile(await exportFile('pdf','japanese-searchable.pdf')));const jd=await pdfjs.getDocument({data:jp,useSystemFonts:true}).promise;const text=(await (await jd.getPage(1)).getTextContent()).items.map(x=>x.str).join('');assert.ok(text.includes('国立国会図書館'),text);await jd.destroy();return {pages:2,japanese:true};
  },{requires:['#page-next','#page-prev','#export-format','#export']});
  await feature('13-xml-tei-txt-markdown',async()=>{
   await page.locator('#sample').click();await page.locator('#mode').selectOption('page');await runOCR();
   const outputs={};for(const format of ['txt','xml','tei','markdown']){const s=await fs.readFile(await exportFile(format,'output.'+format),'utf8');assert.ok(s.includes('国立国会図書館'),format);if(format==='xml'||format==='tei'){const parsed=await page.evaluate(s=>{const d=new DOMParser().parseFromString(s,'application/xml');return {error:!!d.querySelector('parsererror'),root:d.documentElement.localName,lines:d.querySelectorAll('LINE').length};},s);assert.equal(parsed.error,false);if(format==='tei')assert.equal(parsed.root,'TEI');else assert.ok(parsed.lines>=3);}outputs[format]=s.length;}return outputs;
  },{requires:['#export-format','#export']});
  await feature('14-text-daisy',async()=>{
   await page.locator('#sample').click();await page.locator('#mode').selectOption('page');await runOCR();const zip=new AdmZip(await exportFile('daisy','daisy.zip'));const entries=zip.getEntries().filter(x=>!x.isDirectory);const names=entries.map(x=>x.entryName);
   assert.ok(names.some(n=>/\.opf$/i.test(n)),'OPF');assert.ok(names.some(n=>/\.ncx$/i.test(n)),'NCX');assert.ok(names.some(n=>/\.smil$/i.test(n)),'SMIL');assert.ok(entries.some(x=>/\.(xml|xhtml|html)$/i.test(x.entryName)&&x.getData().toString('utf8').includes('国立国会図書館')),'DAISY text');
   return {names};
  },{requires:['#export-format','#export']});
  await feature('15-multi-image',async()=>{
   const a=await image('batch-a',{w:700,h:90,lines:[{text:'FIRST IMAGE',x:20,y:20}]}),b=await image('batch-b',{w:700,h:90,lines:[{text:'SECOND IMAGE',x:20,y:20}]});
   await page.locator('#file').setInputFiles([a,b]);await page.waitForFunction(()=>document.querySelector('#status').dataset.state==='ready');await page.locator('#mode').selectOption('page');await runOCR();
   assert.match(await page.locator('#result').inputValue(),/FIRST IMAGE/);await page.locator('#page-next').click();await page.waitForFunction(()=>document.querySelector('#status').dataset.state==='done'&&document.querySelector('#page-info').textContent.startsWith('2 /'));assert.match(await page.locator('#result').inputValue(),/SECOND IMAGE/);await page.locator('#page-prev').click();await page.waitForFunction(()=>document.querySelector('#status').dataset.state==='done'&&document.querySelector('#page-info').textContent.startsWith('1 /'));assert.match(await page.locator('#result').inputValue(),/FIRST IMAGE/);
  },{requires:['#page-next','#page-prev']});
  await feature('18-cascade-models',async()=>{
   await page.locator('#sample').click();await page.locator('#mode').selectOption('page');await page.locator('#order').selectOption('auto');await page.locator('#cascade').selectOption('cascade');
   try{const out=await runOCR(),j=await json('cascade');assert.equal(j.recognitionMode,'cascade');assert.equal(j.lines.length,3);assert.ok(cer(out.actual,sample)<=.08,JSON.stringify(out.actual));assert.ok(j.lines.every(b=>b.recognition.length>0));assert.ok(j.lines.some(b=>b.recognition[0].tier<100),'detector never selected short model');assert.match(out.log,/rec(30|50) image input:/);return {...out,tiers:j.lines.map(b=>b.recognition)};}finally{await page.locator('#cascade').selectOption('simple');}
  },{requires:['#cascade']});
  await feature('19-long-line',async()=>{
   const expected='日本語の文字認識を試します。'.repeat(9);
   const file=await image('long-line',{w:expected.length*42+40,h:70,lines:[{text:expected,x:10,y:10}]});
   const out=await accuracy(file,expected,{mode:'line',max:.12});const j=await json('long-line');assert.ok(j.lines[0].recognition.some(x=>x.part==='left'));assert.ok(j.lines[0].recognition.some(x=>x.part==='right'));return out;
  },{candidate:true});
  await feature('20-tcy',async()=>{
   const f=await image('tcy',{w:240,h:400,lines:[{text:'令',x:100,y:20},{text:'和',x:100,y:70},{text:'年',x:100,y:170},{text:'度',x:100,y:220},{text:'12',x:100,y:125}]});
   await load(f,'line','vertical');await page.locator('#enable-tcy').uncheck();const off=await runOCR();
   await page.locator('#enable-tcy').check();
   try{const on=await runOCR(),j=await json('tcy-result');assert.equal(j.tcy,true);assert.ok(cer(on.actual,'令和12年度')<=.20,JSON.stringify({off:off.actual,on:on.actual}));return {...on,off:off.actual};}finally{await page.locator('#enable-tcy').uncheck();}
  },{requires:['#enable-tcy'],candidate:true});
  await feature('16-cache-no-model-download',async()=>{
   await page.reload();await page.locator('#run').waitFor();await page.route('**/*.onnx',route=>route.abort());try{await page.locator('#sample').click();await page.locator('#mode').selectOption('page');const out=await runOCR();assert.equal(out.actual,sample);assert.equal(network.filter(r=>/\.onnx$/.test(r.url)).length,0);return out;}finally{await page.unroute('**/*.onnx');}
  });
  await feature('17-image-local-only',async()=>{
   const f=await image('private',{w:640,h:70,lines:[{text:'PRIVATE LOCAL OCR',x:10,y:10}]});await load(f,'line');const out=await runOCR();assert.match(out.actual,/PRIVATE LOCAL OCR/);assert.equal(network.filter(r=>!['GET','HEAD'].includes(r.method)).length,0,'unexpected outbound writes');return out;
  });
 }finally{
  await fs.writeFile(path.join(OUT,'report.json'),JSON.stringify({base,reports},null,2));await browser?.close();server?.kill();
 }
 const summary=Object.fromEntries(['PASS','FAIL','PENDING','BASELINE_FAIL'].map(s=>[s,reports.filter(r=>r.status===s).length]));console.log('SUMMARY',summary);
 if(summary.FAIL||(process.env.STRICT_FEATURES==='1'&&(summary.PENDING||summary.BASELINE_FAIL)))process.exitCode=1;
}
main().catch(e=>{console.error(e);process.exitCode=1;});
