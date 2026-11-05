import { Wllama } from '@wllama/wllama';

globalThis.__wllamaProbe = (async () => {
  const events = [];
  const mark = (stage, info = '') => {
    events.push({stage, info: String(info)});
    console.info('[wllama-probe]', stage, info);
  };
  const w = new Wllama({default: new URL('./wasm/wllama.wasm', import.meta.url).href},
    {allowOffline: false});
  try {
    mark('init');
    await w.loadModelFromHF({repo:'ggml-org/models',file:'tinyllamas/stories15M-q4_0.gguf'},{
      n_ctx:256, n_threads:1, n_gpu_layers:0, n_batch:64,
      progressCallback: ({loaded, total}) => {
        if (total && loaded >= total) mark('download-complete', total);
      }
    });
    mark('model-loaded');
    const res = await w.createCompletion({prompt:'Once upon a time',temperature:0,max_tokens:8});
    const answer = res?.choices?.[0]?.text ?? '';
    if(!answer)throw Error('empty completion');
    mark('completion',answer);
    return {ok:true,events};
  } catch (error) {
    mark('error',error?.stack ?? error);
    return {ok:false,events,error:String(error?.message ?? error),stack:String(error?.stack ?? '')};
  } finally {
    await w.exit().catch(error => mark('exit-error', error));
  }
})();
