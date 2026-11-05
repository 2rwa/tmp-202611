'use strict';
const fs=require('node:fs');
const path=require('node:path');
const esbuild=require('esbuild');
const mock=process.argv.includes('--mock');
const out=path.resolve('dist/translate');
fs.mkdirSync(out,{recursive:true});
for(const file of ['index.html','style.css']) fs.copyFileSync(path.resolve('translate',file),path.join(out,file));
const plugins=mock?[{name:'fake-inference-only-for-browser-regression',setup(build){
 build.onResolve({filter:new RegExp('^@wllama/wllama$')},()=>({path:path.resolve('tests/wllama-stub.mjs')}));
}}]:[];
(async()=>{
 await esbuild.build({entryPoints:['translate/app.js'],outfile:path.join(out,'app.js'),bundle:true,platform:'browser',format:'esm',target:'es2022',plugins,logLevel:'warning'});
 if(!mock){
  const src=path.resolve('node_modules/@wllama/wllama/esm/wasm/wllama.wasm');
  if(!fs.existsSync(src)) throw Error('wllama binary not found: '+src);
  fs.mkdirSync(path.join(out,'wasm'),{recursive:true});
  fs.copyFileSync(src,path.join(out,'wasm/wllama.wasm'));
  console.log('Real inference bundle, WASM bytes:',fs.statSync(src).size);
 }else{
  console.log('Mock inference bundle (UI tests only).');
 }
})().catch(e=>{console.error(e);process.exitCode=1;});
