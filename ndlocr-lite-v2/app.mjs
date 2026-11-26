import {exportDaisy} from './daisy.mjs';
import {openPDF,openTIFF,renderInput,exportDocument,searchablePDF} from './document-io.mjs';
import {decodeTable,assignTableLines,tableHTML,escapeHTML,ruledAxes,interiorCell,shortCellCandidates} from './table-logic.mjs';
import {recognizeCascade,readingOrder,inclusionFromCSV,cropRect,cropPoint,suppressLines,inkBounds,tcySegments,codepoints,splitWideLine} from './ocr-logic.mjs';
// Experimental JS port of preprocessing and decoding in NDL's NDLOCR-Lite 2.0.0 (CC BY 4.0).
const $=id=>document.getElementById(id);
const revision='1f3adc7af311af1ce4cbbd4d9089f30781d01313';
const raw='https://raw.githubusercontent.com/ndl-lab/ndlocr-lite/'+revision+'/src/';
const params=new URLSearchParams(location.search);
const ortVersion=/^\d+\.\d+\.\d+$/.test(params.get('ort')||'')?params.get('ort'):'1.31.1';
const optimization=['disabled','basic','extended','all'].includes(params.get('opt'))?params.get('opt'):'all';
const cdn='https://cdn.jsdelivr.net/npm/onnxruntime-web@'+ortVersion+'/dist/';
const modelEP=key=>activeEP==='webgpu'||(activeEP==='webgpu-rec'&&key.startsWith('rec'))||(activeEP==='webgpu-det'&&key==='det')?['webgpu','wasm']:['wasm'];
$('runtime-info').textContent='ORT Web '+ortVersion+' / graph '+optimization;
const specs={
 table:{file:'tablecenternet_s_800_v3.onnx',sha:'fc26e20e0ece97be0d03b495481c33a3982f268966920297061b8c90215cdefa'},
 det:{file:'deim-s-1024x1024-261124.onnx',sha:'f9a41c8453dd687f370bee199fd6d47ecf583cc14f1d839a0b416db39b356e8c'},
 rec30:{file:'parseq-ndl-24x256-30-tiny-499epoch-261124.onnx',sha:'063ec5b3201bce79d56c3ad73b5726cf76ec6a82f42e11a89466ae683755296c'},
 rec50:{file:'parseq-ndl-24x384-50-tiny-278epoch-261124.onnx',sha:'d3dd9e7733aeff5c9f50687c7da6e8d01915a0bf07cfbefe1d9ac58241c61471'},
 rec:{file:'parseq-ndl-24x768-100-tiny-153epoch-261124.onnx',sha:'06462b0dbd5b0b8508545c8c3d485cf20dbf4ffa652fe145e69c9e7457080602'}
};
const source=document.createElement('canvas'), preview=$('preview');
let ort, charset, activeEP, sessions={}, lastResult=null;
const modelShapes=new WeakMap();
let entries=[],pageResults=[],pageSelections=[],pageIndex=0,documentBusy=false;
let selection=null,dragStart=null,cropActive=false,inclusion=null,inclusionPromise=null;
const fullRegion=()=>({x1:0,y1:0,x2:source.width,y2:source.height});
async function getInclusion(){if(inclusion)return inclusion;if(!inclusionPromise)inclusionPromise=(async()=>{const r=await fetch(raw+'config/character_inclusion_mapping.csv');if(!r.ok)throw Error('character inclusion HTTP '+r.status);const m=inclusionFromCSV(await r.text());log('character inclusion: '+m.size+' mappings');return inclusion=m;})().finally(()=>{inclusionPromise=null;});return inclusionPromise;}
function clearResult(){lastResult=null;$('result').value='';$('save').disabled=true;$('export').disabled=true;$('table-preview').replaceChildren();$('line-editor').replaceChildren();$('cell-editor').replaceChildren();$('editor-panel').hidden=true;}
function paintSelection(r=selection){const ctx=preview.getContext('2d');ctx.drawImage(source,0,0);if(!r)return;ctx.fillStyle='rgba(0,0,0,.35)';ctx.fillRect(0,0,source.width,r.y1);ctx.fillRect(0,r.y2,source.width,source.height-r.y2);ctx.fillRect(0,r.y1,r.x1,r.y2-r.y1);ctx.fillRect(r.x2,r.y1,source.width-r.x2,r.y2-r.y1);ctx.strokeStyle='#0284c7';ctx.lineWidth=Math.max(2,source.width/500);ctx.strokeRect(r.x1,r.y1,r.x2-r.x1,r.y2-r.y1);}
function cropState(on){cropActive=on;$('crop').setAttribute('aria-pressed',String(on));preview.style.cursor=on?'crosshair':'';preview.style.touchAction=on?'none':'';}
const regionLabel=r=>r?`範囲: ${r.x1},${r.y1} / ${r.x2-r.x1} × ${r.y2-r.y1}`:'画像全体';
function updateSelection(r){selection=r;pageSelections[pageIndex]=r;pageResults[pageIndex]=null;clearResult();paintSelection();$('crop-info').textContent=regionLabel(r);status('画像準備完了','ready');}
$('crop').onclick=()=>{cropState(!cropActive);if(cropActive)paintSelection();};
$('crop-clear').onclick=()=>{cropState(false);updateSelection(null);};
const pointer=e=>{const r=preview.getBoundingClientRect(),s=getComputedStyle(preview);const l=parseFloat(s.borderLeftWidth)||0,t=parseFloat(s.borderTopWidth)||0,rr=parseFloat(s.borderRightWidth)||0,b=parseFloat(s.borderBottomWidth)||0;return cropPoint(e.clientX,e.clientY,{left:r.left+l,top:r.top+t,width:r.width-l-rr,height:r.height-t-b},source.width,source.height);};
preview.addEventListener('pointerdown',e=>{if(!cropActive||$('run').disabled||!e.isPrimary)return;dragStart=pointer(e);preview.setPointerCapture(e.pointerId);e.preventDefault();});
preview.addEventListener('pointermove',e=>{if(dragStart&&e.isPrimary)paintSelection(cropRect(dragStart,pointer(e),source.width,source.height));});
preview.addEventListener('pointerup',e=>{if(!dragStart||!e.isPrimary)return;const r=cropRect(dragStart,pointer(e),source.width,source.height);dragStart=null;cropState(false);if(r)updateSelection(r);else paintSelection();});
preview.addEventListener('pointercancel',()=>{dragStart=null;paintSelection();});
const log=msg=>{$('log').textContent+=msg+'\n';};
function status(msg,state='running'){$('status').textContent=msg;$('status').dataset.state=state;}
const time=()=>performance.now();
const yieldUI=()=>new Promise(resolve=>setTimeout(resolve,0));
const canvas=(w,h)=>Object.assign(document.createElement('canvas'),{width:w,height:h});
const controlIDs=['file','sample','mode','ep','order','cascade','crop','crop-clear','normalize-variants','enable-tcy','table-structure','export-format','run','page-prev','page-next'];
function updateNavigation(){
 $('page-info').textContent=(entries.length?pageIndex+1:0)+' / '+entries.length;
 $('page-prev').disabled=documentBusy||pageIndex<=0;
 $('page-next').disabled=documentBusy||pageIndex>=entries.length-1;
 $('run').disabled=documentBusy||!entries.length;
 $('save').disabled=documentBusy||!lastResult;
 $('export').disabled=documentBusy||!entries.length||pageResults.length!==entries.length||!pageResults.every(Boolean);
}
function busy(on){documentBusy=on;for(const id of controlIDs)$(id).disabled=on;for(const e of document.querySelectorAll('#editor-panel textarea,#editor-panel button'))e.disabled=on;updateNavigation();}
function showSource(){
 preview.width=source.width;preview.height=source.height;cropState(false);dragStart=null;
 selection=pageSelections[pageIndex]||null;clearResult();paintSelection();
 $('crop-info').textContent=regionLabel(selection);
 const result=pageResults[pageIndex];
 if(result){lastResult=result;$('result').value=result.text;drawBoxes(result.lines);if(result.tableCells?.length)drawTable(result.tableCells);renderEditors();status('完了: '+result.lines.length+' 行 / '+result.elapsedMs+' ms','done');}
 else status('画像準備完了','ready');
 updateNavigation();
}
async function showPage(i){if(i<0||i>=entries.length)throw Error('Invalid page index');pageIndex=i;status('ページ '+(i+1)+' 読み込み中');await renderInput(entries[i],source);showSource();}
async function resetEntries(next){
 const docs=new Set(entries.filter(x=>x.kind==='pdf').map(x=>x.doc));entries=next;pageResults=next.map(()=>null);pageSelections=next.map(()=>null);pageIndex=0;clearResult();
 for(const d of docs)await d.destroy();
 await showPage(0);
}
async function drawSample(){if(documentBusy)return;busy(true);try{await resetEntries([{kind:'sample',name:'sample.png'}]);}catch(e){status(String(e),'error');}finally{busy(false);}}
$('sample').onclick=drawSample;
$('file').onchange=async e=>{
 if(documentBusy||!e.target.files.length)return;const files=Array.from(e.target.files),next=[],opened=[];busy(true);status('文書読み込み中');
 try{
  for(const f of files){
   if(f.type==='application/pdf'||/\.pdf$/i.test(f.name)){const d=await openPDF(f);opened.push(d);for(let i=1;i<=d.numPages;i++)next.push({kind:'pdf',doc:d,number:i,name:f.name+'#'+i});}
   else if(f.type==='image/tiff'||/\.tiff?$/i.test(f.name)){const tiff=await openTIFF(f);for(let i=1;i<=tiff.pages.length;i++)next.push({kind:'tiff',tiff,number:i,name:f.name+'#'+i});}
   else if(/\.(jp2|j2k|j2c|jpc)$/i.test(f.name)||['image/jp2','image/j2k','image/jpc'].includes(f.type))next.push({kind:'jpx',file:f,name:f.name});
   else next.push({kind:'image',file:f,name:f.name});
  }
  if(next.length>200)throw Error('一度に200ページまで処理できます');
  await resetEntries(next);
 }catch(e){for(const d of opened)if(!entries.some(x=>x.doc===d))await d.destroy().catch(()=>{});status(String(e),'error');}
 finally{busy(false);}
};
async function navigate(i){if(documentBusy)return;busy(true);try{await showPage(i);}catch(e){status(String(e),'error');}finally{busy(false);}}
$('page-prev').onclick=()=>navigate(pageIndex-1);
$('page-next').onclick=()=>navigate(pageIndex+1);
async function runtime(ep){
 if(ort&&activeEP===ep&&charset)return;
 for(const s of Object.values(sessions))await s.release();
 sessions={};
 if(!ort){ort=await import(cdn+'ort.webgpu.min.mjs');ort.env.wasm.wasmPaths=cdn;ort.env.wasm.numThreads=1;ort.env.wasm.proxy=false;}
 if(ep!=='wasm'&&(!navigator.gpu||!await navigator.gpu.requestAdapter()))throw Error('WebGPU adapter がありません。WASMを選択してください。');
 activeEP=ep;
 if(!charset){
  const r=await fetch(raw+'config/NDLmoji.yaml');if(!r.ok)throw Error('charset HTTP '+r.status);
  const m=(await r.text()).match(/^\s*charset_train:\s*(".*")\s*$/m);
  if(!m)throw Error('charset_train not found');
  charset=Array.from(JSON.parse(m[1]));
  log('charset: '+charset.length+' Unicode code points');
 }
}
async function digest(buf){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',buf)),x=>x.toString(16).padStart(2,'0')).join('');}
// Read only the input shape from the ONNX protobuf. ORT Web 1.22 does not
// consistently expose input metadata across backends; never infer from filenames.
function* protoFields(bytes){
 let p=0;
 function varint(){let n=0,m=1;for(let i=0;i<10&&p<bytes.length;i++){const b=bytes[p++];n+=(b&127)*m;if(!(b&128))return n;m*=128;}throw Error('Invalid ONNX protobuf varint');}
 while(p<bytes.length){
  const tag=varint(),field=Math.floor(tag/8),wire=tag%8;let value;
  if(!field)throw Error('Invalid ONNX protobuf field');
  if(wire===0)value=varint();
  else if(wire===2){const len=varint();if(!Number.isSafeInteger(len)||len<0||p+len>bytes.length)throw Error('Invalid ONNX protobuf length');value=bytes.subarray(p,p+len);p+=len;}
  else if(wire===1||wire===5){p+=wire===1?8:4;if(p>bytes.length)throw Error('Truncated ONNX protobuf');continue;}
  else throw Error('Unsupported ONNX protobuf wire '+wire);
  yield {field,wire,value};
 }
}
function protoGet(bytes,field,wire=2){if(!bytes)return;for(const item of protoFields(bytes))if(item.field===field&&item.wire===wire)return item.value;}
function imageShapeFromONNX(buffer,inputName){
 const graph=protoGet(new Uint8Array(buffer),7);
 if(!graph)throw Error('ONNX graph missing');
 const decoder=new TextDecoder();
 for(const item of protoFields(graph)){
  if(item.field!==11||item.wire!==2)continue;
  const name=protoGet(item.value,1);if(!name||decoder.decode(name)!==inputName)continue;
  const shape=protoGet(protoGet(protoGet(item.value,2),1),2);
  if(!shape)throw Error('ONNX input shape missing: '+inputName);
  const dims=Array.from(protoFields(shape)).filter(x=>x.field===1&&x.wire===2).map(x=>protoGet(x.value,1,0));
  if(dims.length!==4||dims[1]!==3||!dims.slice(2).every(n=>Number.isSafeInteger(n)&&n>0))throw Error('Unsupported ONNX image shape: '+dims);
  return {height:dims[2],width:dims[3]};
 }
 throw Error('ONNX input not found: '+inputName);
}
async function model(key){
 if(sessions[key]){const s=sessions[key],shape=modelShapes.get(s);log(key+' image input: '+shape.height+' x '+shape.width+' (session reused)');return s;}
 const spec=specs[key], url=raw+'model/'+spec.file;
 status('モデル取得: '+spec.file);
 let cache;try{cache=await caches.open('ndlocr-v2-'+revision);}catch{}
 let bytes;
 const hit=cache&&await cache.match(url);
 if(hit){bytes=await hit.arrayBuffer();if(await digest(bytes)!==spec.sha){await cache.delete(url);bytes=null;}}
 if(!bytes){
  const r=await fetch(url);if(!r.ok)throw Error('model HTTP '+r.status+' '+spec.file);
  const stream=r.body?.getReader();if(stream){let parts=[],total=0;for(;;){const {value,done}=await stream.read();if(done)break;parts.push(value);total+=value.length;status('取得中 '+spec.file+' '+(total/1e6).toFixed(1)+' MB');}bytes=await new Blob(parts).arrayBuffer();}else bytes=await r.arrayBuffer();
  if(await digest(bytes)!==spec.sha)throw Error('SHA-256 mismatch: '+spec.file);
  if(cache)try{await cache.put(url,new Response(bytes));}catch(e){log('cache: '+e.message);}
 }
 const t=time();status('ONNX 初期化: '+key);await yieldUI();
 log(key+' providers requested: '+modelEP(key).join(',')+'; ORT '+ortVersion+'; graph '+optimization);const s=await ort.InferenceSession.create(bytes,{executionProviders:modelEP(key),graphOptimizationLevel:optimization});
 const shape=imageShapeFromONNX(bytes,s.inputNames[0]);modelShapes.set(s,shape);log(key+' image input: '+shape.height+' x '+shape.width);
 sessions[key]=s;log(key+' session '+Math.round(time()-t)+' ms; inputs '+s.inputNames.join(', ')+'; outputs '+s.outputNames.join(', '));return s;
}
function tensor(c,transform){const w=c.width,h=c.height,n=w*h,data=c.getContext('2d',{willReadFrequently:true}).getImageData(0,0,w,h).data,out=new Float32Array(3*n);for(let k=0;k<3;k++)for(let i=0;i<n;i++)out[k*n+i]=transform(data[i*4],data[i*4+1],data[i*4+2],k);return new ort.Tensor('float32',out,[1,3,h,w]);}
const mean=[.485,.456,.406],sd=[.229,.224,.225];
async function detect(s,region=fullRegion()){
 const {height:ih,width:iw}=modelShapes.get(s);
 const rw=region.x2-region.x1,rh=region.y2-region.y1,side=Math.max(rw,rh),c=canvas(iw,ih),ctx=c.getContext('2d');
 ctx.fillStyle='black';ctx.fillRect(0,0,iw,ih);ctx.drawImage(source,region.x1,region.y1,rw,rh,0,0,iw*rw/side,ih*rh/side);
 const x=tensor(c,(r,g,b,k)=>(([r,g,b][k]/255)-mean[k])/sd[k]);
 const size=new ort.Tensor('int64',BigInt64Array.from([BigInt(ih),BigInt(iw)]),[1,2]);
 const t=time();const out=await s.run({[s.inputNames[0]]:x,[s.inputNames[1]]:size});
 const o=s.outputNames.map(n=>out[n]);if(![3,4,6].includes(o.length))throw Error('Unexpected DEIM outputs: '+o.length);
 const [labels,coords,scores,counts,styles]=o;log('DEIM '+Math.round(time()-t)+' ms; shapes '+o.map(v=>v.dims.join('x')).join(', '));
 const arr=[];const clamp=(v,max,dim)=>Math.max(0,Math.min(max,Math.trunc(v*side/dim)));
 if(coords.data.length!==scores.data.length*4||labels.data.length!==scores.data.length)throw Error('Unexpected detection tensor shape');
 for(let i=0;i<scores.data.length;i++){
  const score=Number(scores.data[i]),cls=Number(labels.data[i])-1;if(score<=.25||![1,2,3,4,5,16].includes(cls))continue;
  const a=coords.data.subarray(i*4,i*4+4),x1=region.x1+clamp(a[0],rw,iw),y1=region.y1+clamp(a[1],rh,ih),x2=region.x1+clamp(a[2],rw,iw),y2=region.y1+clamp(a[3],rh,ih);
  if(x2>x1&&y2>y1)arr.push({x1,y1,x2,y2,score,cls,count:counts?Number(counts.data[i]):100,style:styles?Number(styles.data[i]):0});
 }
 for(const v of o)v.dispose();x.dispose();size.dispose();
 return suppressLines(arr);
}
async function recognize(s,b,{forceHorizontal=false,padAspect=0,referenceHeight=0,details=false}={}){
 const {height:ih,width:iw}=modelShapes.get(s);
 const w=b.x2-b.x1,h=b.y2-b.y1,c=canvas(iw,ih),ctx=c.getContext('2d');
 if(!forceHorizontal&&h>w*.8){ctx.translate(0,ih);ctx.rotate(-Math.PI/2);ctx.drawImage(source,b.x1,b.y1,w,h,0,0,ih,iw);}
 else if(padAspect){ctx.fillStyle='white';ctx.fillRect(0,0,iw,ih);const ph=Math.max(h,referenceHeight),pw=Math.max(w,ph*padAspect);ctx.drawImage(source,b.x1,b.y1,w,h,iw*(pw-w)*.1/pw,ih*(ph-h)*.5/ph,iw*w/pw,ih*h/ph);}
 else ctx.drawImage(source,b.x1,b.y1,w,h,0,0,iw,ih);
 // Python PARSeq preprocess reverses the input RGB channels.
 const x=tensor(c,(r,g,b,k)=>[b,g,r][k]/127.5-1);
 const o=await s.run({[s.inputNames[0]]:x});const y=o[s.outputNames[0]],dims=y.dims;
 if(dims.length!==3||dims[0]!==1||dims[2]!==charset.length+1)throw Error('Unexpected PARSeq logits / charset: '+dims+' / '+charset.length);
 let str='',confidence=0,steps=0;for(let i=0;i<dims[1];i++){let best=0,score=-Infinity;for(let j=0;j<dims[2];j++){const v=y.data[i*dims[2]+j];if(v>score){score=v;best=j;}}if(details){let sum=0;for(let j=0;j<dims[2];j++)sum+=Math.exp(y.data[i*dims[2]+j]-score);confidence-=Math.log(sum);steps++;}if(best===0)break;str+=charset[best-1];}
 for(const v of Object.values(o))v.dispose();x.dispose();str=str.replace(/ ([、。])/g,'$1').replace(/([、。]) /g,'$1');return details?{text:str,confidence:Math.exp(confidence/Math.max(1,steps))}:str;
}
function regionPixels(b){return source.getContext('2d',{willReadFrequently:true}).getImageData(b.x1,b.y1,b.x2-b.x1,b.y2-b.y1).data;}
function trimLine(b){const r=inkBounds(regionPixels(b),b.x2-b.x1,b.y2-b.y1);return r?{...b,x1:b.x1+r.x1,y1:b.y1+r.y1,x2:b.x1+r.x2,y2:b.y1+r.y2}:b;}
async function readTCY(s,b){const original=await recognize(s,b);if(!$('enable-tcy').checked||b.y2-b.y1<=b.x2-b.x1||!original)return original;const segments=tcySegments(regionPixels(b),b.x2-b.x1,b.y2-b.y1);if(!segments.length)return original;let result='';for(const seg of segments)result+=await recognize(s,{...b,y1:b.y1+seg.y1,y2:b.y1+seg.y2},{forceHorizontal:seg.horizontal});log('TCY candidates '+segments.filter(x=>x.horizontal).length+'; original '+codepoints(original)+' -> '+codepoints(result));return codepoints(result)>codepoints(original)?result:original;}
async function inferTable(region,lines){
 const s=await model('table'),{height:ih,width:iw}=modelShapes.get(s),rw=region.x2-region.x1,rh=region.y2-region.y1,scale=iw/Math.max(rw,rh),c=canvas(iw,ih),ctx=c.getContext('2d');
 ctx.fillStyle='black';ctx.fillRect(0,0,iw,ih);ctx.drawImage(source,region.x1,region.y1,rw,rh,(iw-rw*scale)/2,(ih-rh*scale)/2,rw*scale,rh*scale);
 const mean=[.40789654,.44719302,.47026115],std=[.28863828,.27408164,.27809835];
 const x=tensor(c,(r,g,b,k)=>(([b,g,r][k]/255)-mean[k])/std[k]);
 let out;const started=time();
 try{out=await s.run({[s.inputNames[0]]:x});const cells=assignTableLines(decodeTable(out,region),lines);log('TableCenterNet '+Math.round(time()-started)+' ms; cells '+cells.length+'; outputs '+Object.keys(out).join(', '));return cells;}
 finally{x.dispose();if(out)for(const v of Object.values(out))v.dispose();}
}
async function refineTableCells(cells,mapper,region){
 const axes=ruledAxes(regionPixels(region),region.x2-region.x1,region.y2-region.y1);
 const work=[];
 for(const c of cells){
  const b=interiorCell(c,axes,region);if(!b)continue;
  const ink=inkBounds(regionPixels(b),b.x2-b.x1,b.y2-b.y1);if(!ink)continue;
  const tight={x1:b.x1+ink.x1,y1:b.y1+ink.y1,x2:b.x1+ink.x2,y2:b.y1+ink.y2};
  const h=tight.y2-tight.y1,w=tight.x2-tight.x1;
  const span=c.lines.map(l=>(l.y1+l.y2)/2);if(span.length&&Math.max(...span)-Math.min(...span)>h*.55&&w>h*1.6)continue;
  if(h>(c.y2-c.y1)*.75)continue;
  work.push({c,tight,h,w});
 }
 const heights=work.filter(x=>x.w>x.h*1.8).map(x=>x.h).sort((a,b)=>a-b),ref=heights[Math.floor(heights.length/2)]||0;
 for(const {c,tight,h,w} of work){
  const aspects=shortCellCandidates(tight,ref);if(!aspects.length)continue;
  const candidates=[];
  for(const tier of ['rec30','rec']){const s=await model(tier);for(const padAspect of [0,...aspects,10]){const r=await recognize(s,tight,{forceHorizontal:true,padAspect,referenceHeight:ref,details:true});if(r.text.trim())candidates.push({...r,padAspect,tier});}}
  // Select only plausible one-glyph output when the cropped geometry suggests
  // an isolated glyph. Preserve existing plausible text unless confidence
  // and consensus justify replacement. Log candidates for later inspection.
  const good=candidates.filter(r=>Array.from(r.text.trim()).length===1);
  good.sort((a,b)=>b.confidence-a.confidence);
  c.refinement={crop:tight,referenceHeight:ref,candidates};
  log('cell '+c.startRow+','+c.startCol+' candidate '+JSON.stringify(c.refinement));
  if(good.length&&(!c.text.trim()||Array.from(c.text.trim()).length>1||good[0].text===c.text||good.filter(x=>x.text===good[0].text).length>=2)){
   c.rawText=c.text;c.text=mapper?mapper.apply(good[0].text):good[0].text;c.refined=true;
  }
 }
 return cells;
}
async function recognizeWide(box,read,simple){
 const w=box.x2-box.x1,h=box.y2-box.y1;
 if(w/h<75)return recognizeCascade(box,read,{simple});
 const parts=splitWideLine(regionPixels(box),w,h);if(!parts.length)return recognizeCascade(box,read,{simple});
 let text='',trace=[];
 for(let i=0;i<parts.length;i++){
  const p=parts[i],r=await recognizeCascade({...box,x1:box.x1+p.x1,x2:box.x1+p.x2,count:1},read,{simple:true});
  text+=r.text;trace.push(...r.trace.map(t=>({...t,part:i===0?'left':i===parts.length-1?'right':'middle',segment:i+1})));
 }
 return {text,trace};
}
function drawTable(cells){const ctx=preview.getContext('2d');ctx.strokeStyle='#0891b2';ctx.lineWidth=Math.max(2,source.width/500);for(const cell of cells){ctx.beginPath();cell.corners.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();ctx.stroke();}$('table-preview').innerHTML=cells.length?tableHTML(cells):'<p>表セルが検出されませんでした。</p>';}
function updateEditedResult(){
 if(!lastResult)return;
 lastResult.text=lastResult.lines.map(l=>l.text).join('\n');
 $('result').value=lastResult.text;
 lastResult.edited=lastResult.lines.some(l=>l.edited)||lastResult.tableCells.some(c=>c.edited);
 if(lastResult.tableCells.length)drawTable(lastResult.tableCells);
 $('edit-status').textContent=lastResult.edited?'訂正済み（出力に反映）':'未訂正';
}
function renderEditors(){
 const panel=$('editor-panel'),lineRoot=$('line-editor'),cellRoot=$('cell-editor');
 lineRoot.replaceChildren();cellRoot.replaceChildren();panel.hidden=!lastResult;if(!lastResult)return;
 const result=lastResult;
 function add(root,item,label,kind,index){
  const wrap=document.createElement('label');wrap.className='edit-row';
  const caption=document.createElement('span');caption.textContent=label;
  const input=document.createElement('textarea');input.rows=2;input.value=item.text;input.dataset.kind=kind;input.dataset.index=String(index);input.setAttribute('aria-label',label);input.disabled=documentBusy;
  const original=item.originalText??item.text;
  input.addEventListener('input',()=>{
   if(documentBusy||lastResult!==result)return;
   item.originalText??=original;item.text=input.value.replace(/\r\n?/g,'\n');item.edited=item.text!==item.originalText;
   if(kind==='line'){
    for(const cell of result.tableCells){if(cell.edited||!cell.lines.includes(item))continue;cell.text=cell.lines.map(l=>l.text).join('\n');}
   }
   updateEditedResult();
   if(kind==='line')for(const box of cellRoot.querySelectorAll('textarea'))box.value=result.tableCells[Number(box.dataset.index)].text;
  });
  const reset=document.createElement('button');reset.type='button';reset.textContent='元に戻す';reset.disabled=documentBusy;
  reset.addEventListener('click',()=>{input.value=original;input.dispatchEvent(new Event('input',{bubbles:true}));});
  wrap.append(caption,input,reset);root.append(wrap);
 }
 result.lines.forEach((l,i)=>add(lineRoot,l,'行 '+(i+1),'line',i));
 result.tableCells.forEach((c,i)=>add(cellRoot,c,'表 '+c.startRow+'行 '+c.startCol+'列','cell',i));
 $('cell-editor-heading').hidden=!result.tableCells.length;
 $('edit-status').textContent=result.edited?'訂正済み（出力に反映）':'未訂正';
}
function drawBoxes(boxes){paintSelection();const ctx=preview.getContext('2d');ctx.strokeStyle='#e11d48';ctx.fillStyle='#e11d48';ctx.lineWidth=Math.max(2,source.width/500);ctx.font=Math.max(14,source.width/60)+'px sans-serif';for(const [i,b] of boxes.entries()){ctx.strokeRect(b.x1,b.y1,b.x2-b.x1,b.y2-b.y1);ctx.fillText(String(i+1),b.x1,Math.max(15,b.y1));}}
async function runPage(){
 $('log').textContent='';clearResult();cropState(false);const t=time();
 try{
  const ep=$('ep').value,mode=$('mode').value;status('ONNX Runtime 初期化');await runtime(ep);const region=selection||fullRegion(),normalize=$('normalize-variants').checked,mapper=normalize?await getInclusion():null;let boxes;
  if(mode==='page'){const det=await model('det');status('行検出中');await yieldUI();boxes=readingOrder(await detect(det,region),$('order').value);}
  else boxes=[trimLine({...region})];
  drawBoxes(boxes);log('lines: '+boxes.length);
  if(!boxes.length)throw Error('文字行が検出されません。1行画像モードも試してください。');
  const rt=time(),simple=$('cascade').value==='simple';
  const read=async(tier,b)=>readTCY(await model(tier===100?'rec':'rec'+tier),b);
  for(let i=0;i<boxes.length;i++){status('文字認識 '+(i+1)+' / '+boxes.length);await yieldUI();const result=await recognizeWide(boxes[i],read,simple);boxes[i].rawText=result.text;boxes[i].text=mapper?mapper.apply(result.text):result.text;boxes[i].recognition=result.trace;log('line '+(i+1)+' cascade '+result.trace.map(x=>x.tier+(x.part?':'+x.part:'')+'('+x.length+')').join(' -> '));$('result').value=boxes.slice(0,i+1).map(b=>b.text).join('\n');}
  let cells=[];if($('table-structure').checked){status('表構造認識中');await yieldUI();cells=await inferTable(region,boxes);await refineTableCells(cells,mapper,region);drawTable(cells);}
  const total=Math.round(time()-t);log('PARSeq '+Math.round(time()-rt)+' ms; total '+total+' ms; requested EP '+ep);
  lastResult={version:'2.0.0',name:entries[pageIndex].name,page:pageIndex+1,revision,requestedEP:ep,ortVersion,optimization,mode,recognitionMode:simple?'simple':'cascade',normalizedVariants:normalize,tcy:$('enable-tcy').checked,region,width:source.width,height:source.height,elapsedMs:total,tableCells:cells,lines:boxes,text:$('result').value};
  pageResults[pageIndex]=lastResult;renderEditors();status('完了: '+boxes.length+' 行 / '+total+' ms','done');return lastResult;
 }catch(e){log(e.stack||String(e));status(String(e),'error');throw e;}
}
$('run').onclick=async()=>{
 if(documentBusy||!entries.length)return;busy(true);const origin=pageIndex;
 try{for(let i=0;i<entries.length;i++){if(i!==pageIndex)await showPage(i);pageResults[i]=null;await runPage();}if(entries.length>1)await showPage(origin);}
 catch(e){status(String(e),'error');}finally{busy(false);}
};
$('copy').onclick=async()=>{try{await navigator.clipboard.writeText($('result').value);}catch(e){log(String(e));}};
$('save').onclick=()=>{if(!lastResult)return;const url=URL.createObjectURL(new Blob([JSON.stringify(lastResult,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='ndlocr-v2.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
drawSample();

$('export').onclick=async()=>{
 if(documentBusy||!pageResults.length||!pageResults.every(Boolean))return;
 const fmt=$('export-format').value;busy(true);
 try{
  const content=fmt==='daisy'?exportDaisy(pageResults):fmt==='pdf'?await searchablePDF(entries,pageResults,(i,n)=>status('PDF出力 '+i+' / '+n)):exportDocument(pageResults,fmt);
  const mime={daisy:'application/zip',pdf:'application/pdf',xml:'application/xml;charset=utf-8',tei:'application/xml;charset=utf-8',html:'text/html;charset=utf-8',markdown:'text/markdown;charset=utf-8',txt:'text/plain;charset=utf-8'}[fmt];
  const url=URL.createObjectURL(new Blob([content],{type:mime}));const a=document.createElement('a');a.href=url;a.download='ndlocr-result.'+(fmt==='daisy'?'zip':fmt);a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  status('出力完了: '+fmt,'done');
 }catch(e){log(String(e));status(String(e),'error');}finally{busy(false);}
};
