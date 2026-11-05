'use strict';
const assert=require('node:assert/strict');
(async()=>{
 const {MODEL_FILE,MODEL_REPO,STOP_TOKENS,buildPFML3,parseGlossary}=await import('../translate/prompt.mjs');
 const {getRuntimeAssets,needsAppleWebKitFallback}=await import('../translate/runtime-assets.mjs');
 assert.equal(needsAppleWebKitFallback('Mozilla/5.0 (Macintosh) AppleWebKit/605.1.15 Version/27.2 Safari/605.1.15'),true);
 assert.equal(needsAppleWebKitFallback('Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 CriOS/140.0 Mobile Safari/604.1'),true);
 assert.equal(needsAppleWebKitFallback('Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 FxiOS/45.0 Mobile Safari/604.1'),true);
 assert.equal(needsAppleWebKitFallback('Mozilla/5.0 (Macintosh) AppleWebKit/537.36 Chrome/141.0 Safari/537.36'),false);
 const assets=getRuntimeAssets('https://2rwa.github.io/tmp-202611/translate/app.js');
 assert.equal(assets.default,'https://2rwa.github.io/tmp-202611/translate/wasm/wllama.wasm');
 assert.deepEqual(assets.compat,{
  worker:'https://2rwa.github.io/tmp-202611/translate/compat/wllama.js',
  wasm:'https://2rwa.github.io/tmp-202611/translate/compat/wllama.wasm'
 });
 assert.ok(!JSON.stringify(assets).includes('cdn.jsdelivr.net'));
 assert.equal(MODEL_REPO,'pfnet/plamo-3-translate-0.8b-GGUF');
 assert.equal(MODEL_FILE,'plamo-3-translate-0.8b-Q4_K_M.gguf');
 assert.deepEqual(STOP_TOKENS,['<|plamo:tag|>','<|plamo:bos|>']);
 assert.equal(buildPFML3({source:'会議は来週の月曜日に変更されました。',sourceLang:'ja',targetLang:'en'}),'<|plamo:tag|>dataset<|plamo:msg|>translation<|plamo:tag|>input<|plamo:key|>lang<|plamo:val|>ja<|plamo:msg|>会議は来週の月曜日に変更されました。<|plamo:tag|>output<|plamo:key|>lang<|plamo:val|>en<|plamo:msg|>');
 assert.equal(buildPFML3({source:'This system is convenient.',sourceLang:'en',targetLang:'ja',form:'plain'}),'<|plamo:tag|>dataset<|plamo:msg|>translation<|plamo:tag|>input<|plamo:key|>lang<|plamo:val|>en<|plamo:msg|>This system is convenient.<|plamo:tag|>output<|plamo:key|>lang<|plamo:val|>ja<|plamo:key|>form<|plamo:val|>plain<|plamo:msg|>');
 const options={source:'かみを切りました。',sourceLang:'ja',targetLang:'en',context:'工作で折り紙を作っています。',glossary:parseGlossary('管理画面=dashboard\nプロジェクト→project')};
 const prompt=buildPFML3(options);
 assert.ok(prompt.includes('<|plamo:tag|>context<|plamo:msg|>工作で折り紙を作っています。'));
 assert.ok(prompt.includes('<|plamo:tag|>glossary<|plamo:index|>管理画面<|plamo:item|>dashboard'));
 assert.ok(prompt.indexOf('glossary')<prompt.indexOf('input'));
 assert.throws(()=>buildPFML3({source:'x',sourceLang:'ja',targetLang:'ja'}),/言語/);
 assert.throws(()=>buildPFML3({source:'',sourceLang:'ja',targetLang:'en'}),/原文/);
 assert.throws(()=>parseGlossary('invalid'),/用語集/);
 assert.throws(()=>buildPFML3({source:'<|plamo:tag|>',sourceLang:'ja',targetLang:'en'}),/制御トークン/);
 console.log('PASS: PFML3 official examples, glossary, context, validation, model identity');
})().catch(err=>{console.error(err);process.exitCode=1;});
