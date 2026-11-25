import {decodeTable,assignTableLines,tableHTML,escapeHTML} from './table-logic.mjs';
import {recognizeCascade,readingOrder,inclusionFromCSV,cropRect,cropPoint,suppressLines,inkBounds,tcySegments,codepoints,modelGPUProof} from './ocr-logic.mjs';
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
const modelShapes=new WeakMap(),modelKeys=new WeakMap();
let benchmarkBusy=false,runBusy=false,benchmarkReport=null,runMetrics=null;
const gpuTrace={dispatch:0,submit:0,devices:[],errors:[],hooks:[]};
function instrumentGPU(){
 for(const [proto,method,key] of [[globalThis.GPUComputePassEncoder?.prototype,'dispatchWorkgroups','dispatch'],[globalThis.GPUComputePassEncoder?.prototype,'dispatchWorkgroupsIndirect','dispatch'],[globalThis.GPUQueue?.prototype,'submit','submit']]){
  if(!proto||typeof proto[method]!=='function')continue;
  const f=proto[method];try{proto[method]=function(...args){gpuTrace[key]++;return f.apply(this,args);};if(proto[method]!==f)gpuTrace.hooks.push(method);}catch{}
 }
 const p=globalThis.GPUAdapter?.prototype;if(p&&typeof p.requestDevice==='function'){
  const f=p.requestDevice;try{p.requestDevice=async function(...args){const d=await f.apply(this,args),i=this.info||{};gpuTrace.devices.push({vendor:i.vendor||'',architecture:i.architecture||'',description:i.description||'',isFallbackAdapter:i.isFallbackAdapter??this.isFallbackAdapter??null});d.addEventListener('uncapturederror',e=>gpuTrace.errors.push(e.error.message));d.lost.then(x=>{if(x.reason!=='destroyed')gpuTrace.errors.push('device lost '+x.message);});return d;};if(p.requestDevice!==f)gpuTrace.hooks.push('requestDevice');}catch{}
 }
}
instrumentGPU();
async function runModel(session,feeds){
 const t=time(),before=gpuTrace.dispatch,sub=gpuTrace.submit,key=modelKeys.get(session)||'unknown';
 try{return await session.run(feeds);}finally{if(runMetrics){const m=runMetrics.models[key]||={ms:0,calls:0,gpuCalls:0,dispatch:0,submit:0};m.ms+=time()-t;m.calls++;const d=gpuTrace.dispatch-before,q=gpuTrace.submit-sub;m.dispatch+=d;m.submit+=q;if(d>0&&q>0)m.gpuCalls++;}}
}

let selection=null,dragStart=null,cropActive=false,inclusion=null,inclusionPromise=null;
const fullRegion=()=>({x1:0,y1:0,x2:source.width,y2:source.height});
async function getInclusion(){if(inclusion)return inclusion;if(!inclusionPromise)inclusionPromise=(async()=>{const r=await fetch(raw+'config/character_inclusion_mapping.csv');if(!r.ok)throw Error('character inclusion HTTP '+r.status);const m=inclusionFromCSV(await r.text());log('character inclusion: '+m.size+' mappings');return inclusion=m;})().finally(()=>{inclusionPromise=null;});return inclusionPromise;}
function clearResult(){lastResult=null;$('result').value='';$('save').disabled=true;$('export').disabled=true;$('table-preview').replaceChildren();}
function paintSelection(r=selection){const ctx=preview.getContext('2d');ctx.drawImage(source,0,0);if(!r)return;ctx.fillStyle='rgba(0,0,0,.35)';ctx.fillRect(0,0,source.width,r.y1);ctx.fillRect(0,r.y2,source.width,source.height-r.y2);ctx.fillRect(0,r.y1,r.x1,r.y2-r.y1);ctx.fillRect(r.x2,r.y1,source.width-r.x2,r.y2-r.y1);ctx.strokeStyle='#0284c7';ctx.lineWidth=Math.max(2,source.width/500);ctx.strokeRect(r.x1,r.y1,r.x2-r.x1,r.y2-r.y1);}
function cropState(on){cropActive=on;$('crop').setAttribute('aria-pressed',String(on));preview.style.cursor=on?'crosshair':'';preview.style.touchAction=on?'none':'';}
function updateSelection(r){selection=r;clearResult();paintSelection();$('crop-info').textContent=r?`範囲: ${r.x1},${r.y1} / ${r.x2-r.x1} × ${r.y2-r.y1}`:'画像全体';status('画像準備完了','ready');}
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
function showSource(){preview.width=source.width;preview.height=source.height;cropState(false);dragStart=null;updateSelection(null);$('run').disabled=false;}
function drawSample(){source.width=900;source.height=280;const ctx=source.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,900,280);ctx.fillStyle='black';ctx.font='42px sans-serif';ctx.fillText('国立国会図書館',35,85);ctx.fillText('日本語の文字認識を試します。',35,155);ctx.fillText('NDLOCR Lite 2.0',35,225);showSource();}
$('sample').onclick=drawSample;
$('file').onchange=async e=>{try{const f=e.target.files[0];if(!f)return;const im=await createImageBitmap(f);if(im.width*im.height>40000000){im.close();throw Error('画像は4000万画素以下にしてください');}source.width=im.width;source.height=im.height;const ctx=source.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,source.width,source.height);ctx.drawImage(im,0,0);im.close();showSource();}catch(e){status(String(e),'error');}};
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
 if(sessions[key])return sessions[key];
 let spec=specs[key],url=raw+'model/'+spec.file;
 if(key==='det'&&params.get('detpatch')==='1'){
  const r=await fetch('./det-patch.json');if(!r.ok)throw Error('Patched model manifest HTTP '+r.status);
  const m=await r.json();if(!m.cpuParity||m.sourceSha256!==spec.sha||!(/^[a-f0-9]{64}$/.test(m.sha256)))throw Error('Unverified detector patch');
  spec={file:'det-patched.onnx',sha:m.sha256};url=new URL('./det-patched.onnx',location.href).href;log('using CPU-parity-validated integral MatMul patch');
 }
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
 const shape=imageShapeFromONNX(bytes,s.inputNames[0]);modelShapes.set(s,shape);modelKeys.set(s,key);log(key+' image input: '+shape.height+' x '+shape.width);
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
 const t=time();const out=await runModel(s,{[s.inputNames[0]]:x,[s.inputNames[1]]:size});
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
async function recognize(s,b,{forceHorizontal=false}={}){
 const {height:ih,width:iw}=modelShapes.get(s);
 const w=b.x2-b.x1,h=b.y2-b.y1,c=canvas(iw,ih),ctx=c.getContext('2d');
 if(!forceHorizontal&&h>w*.8){ctx.translate(0,ih);ctx.rotate(-Math.PI/2);ctx.drawImage(source,b.x1,b.y1,w,h,0,0,ih,iw);}
 else ctx.drawImage(source,b.x1,b.y1,w,h,0,0,iw,ih);
 // Python PARSeq preprocess reverses the input RGB channels.
 const x=tensor(c,(r,g,b,k)=>[b,g,r][k]/127.5-1);
 const o=await runModel(s,{[s.inputNames[0]]:x});const y=o[s.outputNames[0]],dims=y.dims;
 if(dims.length!==3||dims[0]!==1||dims[2]!==charset.length+1)throw Error('Unexpected PARSeq logits / charset: '+dims+' / '+charset.length);
 let str='';for(let i=0;i<dims[1];i++){let best=0,score=-Infinity;for(let j=0;j<dims[2];j++){const v=y.data[i*dims[2]+j];if(v>score){score=v;best=j;}}if(best===0)break;str+=charset[best-1];}
 for(const v of Object.values(o))v.dispose();x.dispose();return str.replace(/ ([、。])/g,'$1').replace(/([、。]) /g,'$1');
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
 try{out=await runModel(s,{[s.inputNames[0]]:x});const cells=assignTableLines(decodeTable(out,region),lines);log('TableCenterNet '+Math.round(time()-started)+' ms; cells '+cells.length+'; outputs '+Object.keys(out).join(', '));return cells;}
 finally{x.dispose();if(out)for(const v of Object.values(out))v.dispose();}
}
function drawTable(cells){const ctx=preview.getContext('2d');ctx.strokeStyle='#0891b2';ctx.lineWidth=Math.max(2,source.width/500);for(const cell of cells){ctx.beginPath();cell.corners.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();ctx.stroke();}$('table-preview').innerHTML=cells.length?tableHTML(cells):'<p>表セルが検出されませんでした。</p>';}
function drawBoxes(boxes){paintSelection();const ctx=preview.getContext('2d');ctx.strokeStyle='#e11d48';ctx.fillStyle='#e11d48';ctx.lineWidth=Math.max(2,source.width/500);ctx.font=Math.max(14,source.width/60)+'px sans-serif';for(const [i,b] of boxes.entries()){ctx.strokeRect(b.x1,b.y1,b.x2-b.x1,b.y2-b.y1);ctx.fillText(String(i+1),b.x1,Math.max(15,b.y1));}}
async function runOCR(){
 if(runBusy)return null;runBusy=true;runMetrics={models:{}};
 const controls=['file','sample','mode','ep','order','cascade','crop','crop-clear','normalize-variants','enable-tcy','table-structure','export-format','benchmark','bench-count','bench-plan','run'].map($);controls.forEach(el=>el.disabled=true);$('log').textContent='';clearResult();cropState(false);const t=time();
 try{
  const ep=$('ep').value,mode=$('mode').value;status('ONNX Runtime 初期化');await runtime(ep);const region=selection||fullRegion(),normalize=$('normalize-variants').checked,mapper=normalize?await getInclusion():null;let boxes;
  if(mode==='page'){const det=await model('det');status('行検出中');await yieldUI();boxes=readingOrder(await detect(det,region),$('order').value);}
  else boxes=[trimLine({...region})];
  drawBoxes(boxes);log('lines: '+boxes.length);
  if(!boxes.length)throw Error('文字行が検出されません。1行画像モードも試してください。');
  const rt=time(),simple=$('cascade').value==='simple';
  const read=async(tier,b)=>readTCY(await model(tier===100?'rec':'rec'+tier),b);
  for(let i=0;i<boxes.length;i++){status('文字認識 '+(i+1)+' / '+boxes.length);await yieldUI();const result=await recognizeCascade(boxes[i],read,{simple});boxes[i].rawText=result.text;boxes[i].text=mapper?mapper.apply(result.text):result.text;boxes[i].recognition=result.trace;log('line '+(i+1)+' cascade '+result.trace.map(x=>x.tier+(x.part?':'+x.part:'')+'('+x.length+')').join(' -> '));$('result').value=boxes.slice(0,i+1).map(b=>b.text).join('\n');}
  let cells=[];if($('table-structure').checked){status('表構造認識中');await yieldUI();cells=await inferTable(region,boxes);drawTable(cells);}
  const total=Math.round(time()-t);log('PARSeq '+Math.round(time()-rt)+' ms; total '+total+' ms; requested EP '+ep);
  lastResult={version:'2.0.0',revision,requestedEP:ep,ortVersion,optimization,mode,recognitionMode:simple?'simple':'cascade',normalizedVariants:normalize,tcy:$('enable-tcy').checked,region,width:source.width,height:source.height,elapsedMs:total,metrics:runMetrics,tableCells:cells,lines:boxes,text:$('result').value};
  $('save').disabled=false;$('export').disabled=false;status('完了: '+boxes.length+' 行 / '+total+' ms','done');
 return lastResult;
 }catch(e){log(e.stack||String(e));status(String(e),'error');return null;}finally{runBusy=false;controls.forEach(el=>el.disabled=benchmarkBusy);}
}
$('run').onclick=()=>runOCR();
$('copy').onclick=async()=>{try{await navigator.clipboard.writeText($('result').value);}catch(e){log(String(e));}};
$('save').onclick=()=>{if(!lastResult)return;const url=URL.createObjectURL(new Blob([JSON.stringify(lastResult,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='ndlocr-v2.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
drawSample();

$('export').onclick=()=>{
 if(!lastResult)return;
 const fmt=$('export-format').value;
 const content=fmt==='html'?'<!doctype html><html lang="ja"><meta charset="utf-8"><title>NDLOCR result</title><style>table{border-collapse:collapse}td{border:1px solid #888;padding:6px}</style>'+ (lastResult.tableCells.length?tableHTML(lastResult.tableCells):'<pre>'+escapeHTML(lastResult.text)+'</pre>')+'</html>':lastResult.text;
 const url=URL.createObjectURL(new Blob([content],{type:fmt==='html'?'text/html;charset=utf-8':'text/plain;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='ndlocr-result.'+fmt;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
};

const median=values=>{const s=[...values].sort((a,b)=>a-b),n=s.length;return n?(s[Math.floor((n-1)/2)]+s[Math.floor(n/2)])/2:null;};
function renderBench(rows){
 const body=$('bench-results');body.replaceChildren();
 for(const r of rows){
  const tr=document.createElement('tr'),f=x=>Number.isFinite(x)?Math.round(x).toLocaleString():'—';
  for(const v of [r.ep,r.recognizer||'—',r.state,f(r.coldMs),f(r.warmMs),f(r.detMs),f(r.recMs),f(r.dispatch),r.speedup?(r.speedup.toFixed(2)+'×'+(r.speedupVerified?'':'（未確認）')):'—',r.matches===null?'—':r.matches?'一致':'不一致']){
   const td=document.createElement('td');td.textContent=v;tr.append(td);
  }
  body.append(tr);
 }
}
async function runBenchmark(){
 if(runBusy||benchmarkBusy)return;benchmarkBusy=true;benchmarkReport=null;$('bench-save').disabled=true;$('bench-copy').disabled=true;
 const ids=['file','sample','mode','ep','order','cascade','crop','crop-clear','normalize-variants','enable-tcy','table-structure','export-format','benchmark','bench-count','bench-plan','run'],controls=ids.map($);
 const epBefore=$('ep').value,modeBefore=$('mode').value,tableBefore=$('table-structure').checked,cascadeBefore=$('cascade').value,plan=$('bench-plan').value;
 controls.forEach(e=>e.disabled=true);$('mode').value='page';$('table-structure').checked=false;cropState(false);
 const rows=[],count=Number($('bench-count').value),baseline={text:null,ms:null};
 const info={plan,browser:navigator.userAgent,ortVersion,optimization,detPatch:params.get('detpatch')==='1',image:{width:source.width,height:source.height,region:selection||fullRegion()},recognizer:$('cascade').value,order:$('order').value,tcy:$('enable-tcy').checked,normalized:$('normalize-variants').checked,warmRuns:count,startedAt:new Date().toISOString()};
 try{
  const configs=plan==='cascade-compare'?[['wasm','simple'],['webgpu-det','simple'],['webgpu-det','cascade'],['webgpu','cascade'],['webgpu','simple']]:['wasm','webgpu-rec','webgpu-det','webgpu'].map(ep=>[ep,cascadeBefore]);
  for(const [ep,recognizer] of configs){
   const row={ep,recognizer,state:'計測中',coldMs:null,warmMs:null,detMs:null,recMs:null,dispatch:null,speedup:null,matches:null,runs:[]};rows.push(row);renderBench(rows);
   $('ep').value=ep;$('cascade').value=recognizer;
   // Release prior sessions so each first run is a separate initialization sample.
   for(const s of Object.values(sessions))await s.release();sessions={};activeEP=null;
   const deviceStart=gpuTrace.devices.length,errorStart=gpuTrace.errors.length;
   for(let i=0;i<=count;i++){
    $('bench-status').textContent=ep+' / '+recognizer+' '+(i===0?'初回（集計外）':i+' / '+count);
    const before=gpuTrace.dispatch,sub=gpuTrace.submit,t=time(),r=await runOCR(),wall=time()-t;
    if(!r){row.state='エラー';row.error=$('status').textContent;row.log=$('log').textContent;break;}
    const models=r.metrics.models,det=models.det?.ms||0,rec=Object.entries(models).filter(([k])=>k.startsWith('rec')).reduce((n,[,m])=>n+m.ms,0);
    if(ep==='wasm'&&i===0)baseline.text=r.text;
    row.runs.push({cold:i===0,elapsedMs:r.elapsedMs,wallMs:wall,detMs:det,recMs:rec,dispatch:gpuTrace.dispatch-before,submit:gpuTrace.submit-sub,models,tierCalls:Object.fromEntries(Object.entries(models).filter(([k])=>k.startsWith('rec')).map(([k,m])=>[k,m.calls])),modelGPUProof:modelGPUProof(ep,models),matches:baseline.text===null?null:r.text===baseline.text,lines:r.lines.length,characters:Array.from(r.text).length});
   }
   row.devices=gpuTrace.devices.slice(deviceStart);row.gpuErrors=gpuTrace.errors.slice(errorStart);
   row.coldMs=row.runs[0]?.elapsedMs??null;
   const warm=row.runs.filter(x=>!x.cold);
   if(warm.length===count&&row.state!=='エラー'){
    row.warmMs=median(warm.map(x=>x.elapsedMs));row.detMs=median(warm.map(x=>x.detMs));row.recMs=median(warm.map(x=>x.recMs));row.dispatch=median(warm.map(x=>x.dispatch));
    row.matches=baseline.text===null?null:warm.every(x=>x.matches===true);
    row.gpuVerified=ep!=='wasm'&&warm.every(x=>x.modelGPUProof.verified)&&row.gpuErrors.length===0;
    row.appleGPU=row.gpuVerified&&row.devices.length>0&&row.devices.every(d=>/apple/i.test([d.vendor,d.architecture,d.description].join(' '))&&d.isFallbackAdapter!==true&&!/swiftshader|software/i.test([d.vendor,d.architecture,d.description].join(' ')));
    if(ep==='wasm')baseline.ms=row.warmMs;
    const hybrid=rows.find(x=>x.ep==='webgpu-det'&&x.recognizer==='simple'&&x.warmMs&&x.gpuVerified&&x.matches===true);
    row.speedupVsHybrid100=hybrid&&row.warmMs?hybrid.warmMs/row.warmMs:null;
    if(ep!=='wasm'&&baseline.ms&&row.warmMs)row.speedup=baseline.ms/row.warmMs;
    row.state=row.matches===false?'認識結果不一致':ep==='wasm'?'完了':row.gpuVerified?'モデル別GPU確認':'GPU未確認';
    row.speedupVerified=row.gpuVerified&&row.matches===true&&Number.isFinite(row.speedup);
   }
   renderBench(rows);
  }
 }catch(e){$('bench-status').textContent=String(e);rows.push({ep:'benchmark',state:'エラー',error:String(e)});}
 finally{
  benchmarkReport={...info,completedAt:new Date().toISOString(),gpuHooks:[...gpuTrace.hooks],rows};
  $('bench-status').textContent='計測終了。失敗条件も含めてJSONに保存できます。';
  $('ep').value=epBefore;$('mode').value=modeBefore;$('cascade').value=cascadeBefore;$('table-structure').checked=tableBefore;
  benchmarkBusy=false;controls.forEach(e=>e.disabled=false);$('bench-save').disabled=false;$('bench-copy').disabled=false;
 }
}
$('benchmark').onclick=runBenchmark;
$('bench-save').onclick=()=>{if(!benchmarkReport)return;const url=URL.createObjectURL(new Blob([JSON.stringify(benchmarkReport,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='ndlocr-gpu-benchmark.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
$('bench-copy').onclick=async()=>{if(!benchmarkReport)return;try{await navigator.clipboard.writeText(JSON.stringify(benchmarkReport,null,2));$('bench-status').textContent='JSONをコピーしました';}catch(e){$('bench-status').textContent=String(e);}};
