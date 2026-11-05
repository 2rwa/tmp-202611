import {Wllama} from '@wllama/wllama';
import {MODEL_FILE,MODEL_REPO,STOP_TOKENS,buildPFML3,parseGlossary} from './prompt.mjs';
import {getRuntimeAssets,needsAppleWebKitFallback} from './runtime-assets.mjs';
const el=id=>document.getElementById(id);
const refs={};
for(const id of ['status','load','unload','translate','copy','swap','source','result','sourceLang','targetLang','form','context','glossary','backend','progress','progressText','stats']) refs[id]=el(id);
let model=null,working=false,ready=false,backend='';
const runtimeErrors=[];
const logger={
 debug:(...args)=>console.debug(...args),
 log:(...args)=>console.log(...args),
 warn:(...args)=>console.warn(...args),
 error:(...args)=>{runtimeErrors.push(args.map(String).join(' '));console.error(...args);}
};
const announce=(state,message)=>{refs.status.dataset.state=state;refs.status.textContent=message;};
function buttons(){
 refs.load.disabled=working||ready;
 refs.unload.disabled=working||!ready;
 refs.translate.disabled=working||!ready||!refs.source.value.trim();
 refs.copy.disabled=!refs.result.value;
 refs.swap.disabled=working;
 refs.backend.disabled=working||ready;
}
function report(error){
 const message=String(error?.message||error);
 const unsupported=runtimeErrors.some(m=>m.includes("unknown tokenizer: 'plamo3'"));
 announce('error',unsupported
  ? "読み込み不可: PLaMo 3用トークナイザー(plamo3)に現在の推論ランタイムが未対応です。最新版ランタイムの検証中です"
  : 'エラー: '+message);
 console.error(error);
}
function syncDirection(){refs.targetLang.value=refs.sourceLang.value==='en'?'ja':'en';refs.form.disabled=refs.targetLang.value!=='ja';}
refs.sourceLang.addEventListener('change',()=>{syncDirection();buttons();});
refs.source.addEventListener('input',buttons);
refs.swap.addEventListener('click',()=>{
 const old=refs.sourceLang.value;
 refs.sourceLang.value=refs.targetLang.value;refs.targetLang.value=old;
 const prior=refs.source.value;refs.source.value=refs.result.value;refs.result.value=prior;
 refs.form.disabled=refs.targetLang.value!=='ja';buttons();
});
refs.copy.addEventListener('click',async()=>{
 try{await navigator.clipboard.writeText(refs.result.value);announce('ready','コピーしました');}catch(error){report(error);}
});
refs.load.addEventListener('click',async()=>{
 if(working||ready)return;
 working=true;runtimeErrors.length=0;buttons();
 const gpu=refs.backend.value==='auto'&&Boolean(navigator.gpu);
 backend=gpu?'WebGPU要求':'WASM / CPU';
 announce('loading','モデルを取得・初期化中（約570 MB / '+backend+'）');
 try{
  const assets=getRuntimeAssets(import.meta.url);
  model=new Wllama({default:assets.default},{allowOffline:true,logger});
  // Safari/iPhone without JSPI or Memory64 needs a matching locally built 32-bit runtime.
  model.setCompat(assets.compat);
  await model.loadModelFromHF({repo:MODEL_REPO,file:MODEL_FILE},{
   n_ctx:2048,n_threads:1,n_gpu_layers:gpu?99:0,useCache:true,
   progressCallback:({loaded:bytes,total})=>{
    if(total>0){const percent=Math.min(100,Math.round(bytes/total*100));refs.progress.value=percent;refs.progressText.textContent=percent+'%';}
   }
  });
  ready=true;refs.progress.value=100;refs.progressText.textContent='準備完了';
  announce('ready','モデル読み込み完了（'+backend+'）。翻訳できます');
 }catch(error){
  report(error);if(model){try{await model.exit();}catch(inner){console.warn(inner);}model=null;}
 }finally{working=false;buttons();}
});
refs.unload.addEventListener('click',async()=>{
 if(working||!model)return;working=true;buttons();
 try{await model.exit();model=null;ready=false;refs.progress.value=0;refs.progressText.textContent='待機中';announce('idle','メモリを解放しました');}
 catch(error){report(error);}finally{working=false;buttons();}
});
refs.translate.addEventListener('click',async()=>{
 if(working||!ready||!model)return;working=true;buttons();
 const started=performance.now();
 try{
  const prompt=buildPFML3({source:refs.source.value,sourceLang:refs.sourceLang.value,targetLang:refs.targetLang.value,context:refs.context.value,glossary:parseGlossary(refs.glossary.value),form:refs.form.value});
  refs.result.value='';refs.stats.textContent='翻訳中';announce('translating','端末内で翻訳しています');
  const response=await model.createCompletion({prompt,temperature:0,max_tokens:512,stop:STOP_TOKENS,stream:false});
  const text=response?.choices?.[0]?.text?.trim();
  if(!text)throw Error('訳文が空でした');
  refs.result.value=text;
  const limit=response.choices[0].finish_reason==='length';
  refs.stats.textContent=((performance.now()-started)/1000).toFixed(2)+' 秒 / '+backend+(limit?' / 出力上限':'');
  announce('ready',limit?'翻訳完了（途中で切れた可能性あり）':'翻訳完了');
 }catch(error){refs.stats.textContent='失敗';report(error);}
 finally{working=false;buttons();}
});
syncDirection();buttons();announce('idle','モデル未読込');
