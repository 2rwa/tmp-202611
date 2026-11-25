// Experimental JS port of preprocessing and decoding in NDL's NDLOCR-Lite 2.0.0 (CC BY 4.0).
const $=id=>document.getElementById(id);
const revision='1f3adc7af311af1ce4cbbd4d9089f30781d01313';
const raw='https://raw.githubusercontent.com/ndl-lab/ndlocr-lite/'+revision+'/src/';
const cdn='https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0/dist/';
const specs={
 det:{file:'deim-s-1024x1024-261124.onnx',sha:'f9a41c8453dd687f370bee199fd6d47ecf583cc14f1d839a0b416db39b356e8c'},
 rec:{file:'parseq-ndl-24x768-100-tiny-153epoch-261124.onnx',sha:'06462b0dbd5b0b8508545c8c3d485cf20dbf4ffa652fe145e69c9e7457080602'}
};
const source=document.createElement('canvas'), preview=$('preview');
let ort, charset, activeEP, sessions={}, lastResult=null;
const modelShapes=new WeakMap();
const log=msg=>{$('log').textContent+=msg+'\n';};
function status(msg,state='running'){$('status').textContent=msg;$('status').dataset.state=state;}
const time=()=>performance.now();
const yieldUI=()=>new Promise(resolve=>setTimeout(resolve,0));
const canvas=(w,h)=>Object.assign(document.createElement('canvas'),{width:w,height:h});
function showSource(){preview.width=source.width;preview.height=source.height;preview.getContext('2d').drawImage(source,0,0);$('run').disabled=false;status('画像準備完了','ready');}
function drawSample(){source.width=900;source.height=280;const ctx=source.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,900,280);ctx.fillStyle='black';ctx.font='42px sans-serif';ctx.fillText('国立国会図書館',35,85);ctx.fillText('日本語の文字認識を試します。',35,155);ctx.fillText('NDLOCR Lite 2.0',35,225);showSource();}
$('sample').onclick=drawSample;
$('file').onchange=async e=>{try{const f=e.target.files[0];if(!f)return;const im=await createImageBitmap(f);if(im.width*im.height>40000000){im.close();throw Error('画像は4000万画素以下にしてください');}source.width=im.width;source.height=im.height;const ctx=source.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,source.width,source.height);ctx.drawImage(im,0,0);im.close();showSource();}catch(e){status(String(e),'error');}};
async function runtime(ep){
 if(ort&&activeEP===ep)return;
 for(const s of Object.values(sessions))await s.release();
 sessions={};
 if(!ort){ort=await import(cdn+'ort.webgpu.min.mjs');ort.env.wasm.wasmPaths=cdn;ort.env.wasm.numThreads=1;ort.env.wasm.proxy=false;}
 if(ep==='webgpu'&&(!navigator.gpu||!await navigator.gpu.requestAdapter()))throw Error('WebGPU adapter がありません。WASMを選択してください。');
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
 const s=await ort.InferenceSession.create(bytes,{executionProviders:activeEP==='webgpu'?['webgpu','wasm']:['wasm'],graphOptimizationLevel:'all'});
 const shape=imageShapeFromONNX(bytes,s.inputNames[0]);modelShapes.set(s,shape);log(key+' image input: '+shape.height+' x '+shape.width);
 sessions[key]=s;log(key+' session '+Math.round(time()-t)+' ms; inputs '+s.inputNames.join(', ')+'; outputs '+s.outputNames.join(', '));return s;
}
function tensor(c,transform){const w=c.width,h=c.height,n=w*h,data=c.getContext('2d',{willReadFrequently:true}).getImageData(0,0,w,h).data,out=new Float32Array(3*n);for(let k=0;k<3;k++)for(let i=0;i<n;i++)out[k*n+i]=transform(data[i*4],data[i*4+1],data[i*4+2],k);return new ort.Tensor('float32',out,[1,3,h,w]);}
const mean=[.485,.456,.406],sd=[.229,.224,.225];
function suppress(boxes){const area=b=>(b.x2-b.x1)*(b.y2-b.y1);const kept=[];for(const b of [...boxes].sort((a,b)=>area(b)-area(a))){if(kept.some(a=>a.cls===b.cls&&area(a)>area(b)&&Math.max(0,Math.min(a.x2,b.x2)-Math.max(a.x1,b.x1))*Math.max(0,Math.min(a.y2,b.y2)-Math.max(a.y1,b.y1))/area(b)>=.9))continue;kept.push(b);}return kept;}
async function detect(s){
 const {height:ih,width:iw}=modelShapes.get(s);
 const side=Math.max(source.width,source.height),c=canvas(iw,ih),ctx=c.getContext('2d');
 ctx.fillStyle='black';ctx.fillRect(0,0,iw,ih);ctx.drawImage(source,0,0,iw*source.width/side,ih*source.height/side);
 const x=tensor(c,(r,g,b,k)=>(([r,g,b][k]/255)-mean[k])/sd[k]);
 const size=new ort.Tensor('int64',BigInt64Array.from([BigInt(ih),BigInt(iw)]),[1,2]);
 const t=time();const out=await s.run({[s.inputNames[0]]:x,[s.inputNames[1]]:size});
 const o=s.outputNames.map(n=>out[n]);if(![3,4,6].includes(o.length))throw Error('Unexpected DEIM outputs: '+o.length);
 const [labels,coords,scores,counts,styles]=o;log('DEIM '+Math.round(time()-t)+' ms; shapes '+o.map(v=>v.dims.join('x')).join(', '));
 const arr=[];const clamp=(v,max,dim)=>Math.max(0,Math.min(max,Math.trunc(v*side/dim)));
 if(coords.data.length!==scores.data.length*4||labels.data.length!==scores.data.length)throw Error('Unexpected detection tensor shape');
 for(let i=0;i<scores.data.length;i++){
  const score=Number(scores.data[i]),cls=Number(labels.data[i])-1;if(score<=.25||![1,2,3,4,5,16].includes(cls))continue;
  const a=coords.data.subarray(i*4,i*4+4),x1=clamp(a[0],source.width,iw),y1=clamp(a[1],source.height,ih),x2=clamp(a[2],source.width,iw),y2=clamp(a[3],source.height,ih);
  if(x2>x1&&y2>y1)arr.push({x1,y1,x2,y2,score,cls,count:counts?Number(counts.data[i]):100,style:styles?Number(styles.data[i]):0});
 }
 for(const v of o)v.dispose();x.dispose();size.dispose();
 return suppress(arr);
}
function sortLines(boxes,order){if(order==='auto')order=boxes.filter(b=>b.y2-b.y1>(b.x2-b.x1)*.8).length>boxes.length/2?'vertical':'horizontal';return [...boxes].sort(order==='vertical'?(a,b)=>b.x2-a.x2||a.y1-b.y1:(a,b)=>a.y1-b.y1||a.x1-b.x1);}
async function recognize(s,b){
 const {height:ih,width:iw}=modelShapes.get(s);
 const w=b.x2-b.x1,h=b.y2-b.y1,c=canvas(iw,ih),ctx=c.getContext('2d');
 if(h>w*.8){ctx.translate(0,ih);ctx.rotate(-Math.PI/2);ctx.drawImage(source,b.x1,b.y1,w,h,0,0,ih,iw);}
 else ctx.drawImage(source,b.x1,b.y1,w,h,0,0,iw,ih);
 // Python PARSeq preprocess reverses the input RGB channels.
 const x=tensor(c,(r,g,b,k)=>[b,g,r][k]/127.5-1);
 const o=await s.run({[s.inputNames[0]]:x});const y=o[s.outputNames[0]],dims=y.dims;
 if(dims.length!==3||dims[0]!==1||dims[2]!==charset.length+1)throw Error('Unexpected PARSeq logits / charset: '+dims+' / '+charset.length);
 let str='';for(let i=0;i<dims[1];i++){let best=0,score=-Infinity;for(let j=0;j<dims[2];j++){const v=y.data[i*dims[2]+j];if(v>score){score=v;best=j;}}if(best===0)break;str+=charset[best-1];}
 for(const v of Object.values(o))v.dispose();x.dispose();return str.replace(/ ([、。])/g,'$1').replace(/([、。]) /g,'$1');
}
function drawBoxes(boxes){const ctx=preview.getContext('2d');ctx.drawImage(source,0,0);ctx.strokeStyle='#e11d48';ctx.fillStyle='#e11d48';ctx.lineWidth=Math.max(2,source.width/500);ctx.font=Math.max(14,source.width/60)+'px sans-serif';for(const [i,b] of boxes.entries()){ctx.strokeRect(b.x1,b.y1,b.x2-b.x1,b.y2-b.y1);ctx.fillText(String(i+1),b.x1,Math.max(15,b.y1));}}
$('run').onclick=async()=>{
 const controls=['file','sample','mode','ep','order','run'].map($);controls.forEach(el=>el.disabled=true);$('log').textContent='';$('result').value='';lastResult=null;const t=time();
 try{
  const ep=$('ep').value,mode=$('mode').value;status('ONNX Runtime 初期化');await runtime(ep);let boxes;
  if(mode==='page'){const det=await model('det');status('行検出中');await yieldUI();boxes=sortLines(await detect(det),$('order').value);}
  else boxes=[{x1:0,y1:0,x2:source.width,y2:source.height}];
  drawBoxes(boxes);log('lines: '+boxes.length);
  if(!boxes.length)throw Error('文字行が検出されません。1行画像モードも試してください。');
  const rec=await model('rec'),rt=time();
  for(let i=0;i<boxes.length;i++){status('文字認識 '+(i+1)+' / '+boxes.length);await yieldUI();boxes[i].text=await recognize(rec,boxes[i]);$('result').value=boxes.slice(0,i+1).map(b=>b.text).join('\n');}
  const total=Math.round(time()-t);log('PARSeq '+Math.round(time()-rt)+' ms; total '+total+' ms; requested EP '+ep);
  lastResult={version:'2.0.0',revision,requestedEP:ep,mode,width:source.width,height:source.height,elapsedMs:total,lines:boxes,text:$('result').value};
  status('完了: '+boxes.length+' 行 / '+total+' ms','done');
 }catch(e){log(e.stack||String(e));status(String(e),'error');}finally{controls.forEach(el=>el.disabled=false);}
};
$('copy').onclick=async()=>{try{await navigator.clipboard.writeText($('result').value);}catch(e){log(String(e));}};
$('save').onclick=()=>{if(!lastResult)return;const url=URL.createObjectURL(new Blob([JSON.stringify(lastResult,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='ndlocr-v2.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
drawSample();
