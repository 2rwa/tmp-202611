export class Wllama {
 constructor(paths){if(!paths.default.includes('wllama.wasm'))throw Error('bad WASM path');}
 setCompat(config){
  if(!config.worker.endsWith('/compat/wllama.js')||!config.wasm.endsWith('/compat/wllama.wasm')||config.worker.includes('jsdelivr'))throw Error('wrong Safari compat assets');
 }
 async loadModelFromHF(model,options){
  if(model.repo!=='pfnet/plamo-3-translate-0.8b-GGUF')throw Error('unexpected model');
  if(!model.file.endsWith('-Q4_K_M.gguf'))throw Error('unexpected GGUF');
  options.progressCallback({loaded:100,total:100});
 }
 async createCompletion(options){
  if(!options.prompt.startsWith('<|plamo:tag|>dataset<|plamo:msg|>translation'))throw Error('not PFML3');
  return {choices:[{text:options.prompt.includes('<|plamo:val|>en<|plamo:msg|>')&&options.prompt.includes('<|plamo:tag|>output<|plamo:key|>lang<|plamo:val|>en')?'Browser inference works.':'ブラウザ内の翻訳が動作しています。',finish_reason:'stop'}]};
 }
 async exit(){}
}
