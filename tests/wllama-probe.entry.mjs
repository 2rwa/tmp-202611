import { Wllama } from '@wllama/wllama';
import { getRuntimeAssets } from '../translate/runtime-assets.mjs';

globalThis.__wllamaProbe = (async () => {
  const events = [];
  const mark = (stage, info = '') => {
    events.push({stage, info: String(info)});
    console.info('[wllama-probe]', stage, info);
  };
  let w = null;
  try {
    const capabilities = {
      userAgent:navigator.userAgent,
      secureContext:isSecureContext,
      storage:!!navigator.storage,
      opfs:typeof navigator.storage?.getDirectory === 'function',
      indexedDB:typeof indexedDB !== 'undefined',
      jspi:typeof WebAssembly.Suspending !== 'undefined',
      memory64:(() => {
        try { new WebAssembly.Memory({address:'i64',initial:1n});return true; }
        catch { return false; }
      })()
    };
    mark('capabilities',JSON.stringify(capabilities));
    const assets=getRuntimeAssets(import.meta.url);
    // Record file accessibility independent of wllama's model cache initialization.
    for(const [label,url] of [
      ['normal-wasm',assets.default],
      ['compat-worker',assets.compat.worker],
      ['compat-wasm',assets.compat.wasm]
    ]){
      const resp=await fetch(url,{method:'HEAD'});
      mark('asset-'+label,resp.status+' '+url);
      if(!resp.ok)throw Error('Missing asset: '+label+' HTTP '+resp.status);
    }
    mark('construct');
    w=new Wllama({default:assets.default},{allowOffline:false});
    w.setCompat(assets.compat);
    const resources=w.getWorkerResources();
    mark('resources',JSON.stringify(resources));
    if(globalThis.__expectCompat && !resources.compat) {
      throw Error('Expected Safari compatibility mode but native runtime selected');
    }
    if(resources.compat &&
       (!resources.jsPath.endsWith('/compat/wllama.js') ||
        !resources.wasmPath.endsWith('/compat/wllama.wasm'))) {
      throw Error('Compatibility worker or WASM did not use local assets');
    }
    mark('load-small-gguf');
    await w.loadModelFromHF({repo:'ggml-org/models',file:'tinyllamas/stories15M-q4_0.gguf'},{
      n_ctx:256,n_threads:1,n_gpu_layers:0,n_batch:64,
      progressCallback:({loaded,total})=>{
        if(total && loaded>=total)mark('download-complete',total);
      }
    });
    mark('model-loaded');
    const res=await w.createCompletion({prompt:'Once upon a time',temperature:0,max_tokens:8});
    const answer=res?.choices?.[0]?.text??'';
    if(!answer)throw Error('Empty completion');
    mark('completion',answer);
    return {ok:true,events};
  }catch(error){
    mark('error',error?.stack??error);
    return {ok:false,events,error:String(error?.message??error),stack:String(error?.stack??'')};
  }finally{
    if(w)await w.exit().catch(error=>mark('exit-error',error));
  }
})();
