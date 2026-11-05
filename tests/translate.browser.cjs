'use strict';
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const real=process.env.REAL_MODEL==='1';
const root=path.resolve('dist');
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.wasm':'application/wasm'};
const server=http.createServer((req,res)=>{
 try{
  let name=decodeURIComponent(new URL(req.url,'http://local').pathname);
  if (name.endsWith('/')) name += 'index.html';
  const file=path.resolve(root,'.'+name);
  if(!file.startsWith(root+path.sep))throw Error('outside root');
  const body=fs.readFileSync(file);
  res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream','cache-control':'no-store'});res.end(body);
 }catch(error){res.writeHead(404);res.end(String(error));}
});
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const port=server.address().port;
 const browser=await chromium.launch({headless:true,args:[
  '--enable-unsafe-webgpu','--enable-features=Vulkan','--use-vulkan=swiftshader',
  '--disable-vulkan-fallback-to-gl-for-testing','--use-webgpu-adapter=swiftshader',
  '--enable-webgpu-developer-features','--enable-dawn-features=allow_unsafe_apis',
  '--use-gpu-in-tests','--enable-unsafe-swiftshader'
 ]});
 try{
  const page=await browser.newPage();
  page.on('console',m=>{if(m.type()==='error')console.error('browser console:',m.text());});
  page.on('pageerror',e=>console.error('browser script:',e.message));
  await page.goto('http://127.0.0.1:'+port+'/translate/');
  await page.waitForSelector('#status[data-state="idle"]');
  assert.match(await page.title(),/PLaMo 3/);
  assert.equal(await page.locator('#translate').isDisabled(),true);
  const gpu=await page.evaluate(async()=>{
   if(!navigator.gpu)return 'unavailable';
   try{
    const adapter=await navigator.gpu.requestAdapter();
    if(!adapter)return 'adapter-unavailable';
    const device=await adapter.requestDevice();
    const src='@group(0) @binding(0) var<storage, read_write> values: array<u32>; @compute @workgroup_size(1) fn main(){ values[0] = 7u; }';
    const shader=device.createShaderModule({code:src});
    const messages=await shader.getCompilationInfo();
    if(messages.messages.some(m=>m.type==='error'))throw Error('WGSL compilation');
    const pipeline=await device.createComputePipelineAsync({layout:'auto',compute:{module:shader,entryPoint:'main'}});
    const data=device.createBuffer({size:4,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC});
    const read=device.createBuffer({size:4,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});
    const group=device.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:data}}]});
    device.pushErrorScope('validation');
    const encoder=device.createCommandEncoder();const pass=encoder.beginComputePass();
    pass.setPipeline(pipeline);pass.setBindGroup(0,group);pass.dispatchWorkgroups(1);pass.end();
    encoder.copyBufferToBuffer(data,0,read,0,4);device.queue.submit([encoder.finish()]);
    await device.queue.onSubmittedWorkDone();
    const error=await device.popErrorScope();if(error)throw Error(error.message);
    await read.mapAsync(GPUMapMode.READ);const value=new Uint32Array(read.getMappedRange())[0];read.unmap();device.destroy();
    if(value!==7)throw Error('readback='+value);
    return 'ok';
   }catch(error){return 'environment-or-device-error: '+error.message;}
  });
  console.log('WebGPU SwiftShader offscreen compute probe:',gpu);
  if(real)await page.selectOption('#backend','cpu');
  await page.click('#load');
  await page.waitForSelector('#status[data-state="ready"]',{timeout:real?480000:15000});
  assert.equal(await page.locator('#translate').isEnabled(),true);
  await page.click('#translate');
  await page.waitForFunction(()=>document.querySelector('#status').dataset.state==='ready' && document.querySelector('#result').value.length>0,undefined,{timeout:real?480000:30000});
  const translated=await page.locator('#result').inputValue();
  console.log('Translation output:',translated.slice(0,160));
  assert.match(translated,/[ぁ-んァ-ン一-龯]/);
  if(!real){
   await page.click('#swap');
   assert.equal(await page.locator('#targetLang').inputValue(),'en');
   await page.locator('#glossary').fill('管理画面=dashboard');
   await page.click('#translate');
   await page.waitForFunction(()=>document.querySelector('#result').value.includes('Browser inference works.'),undefined,{timeout:15000});
   await page.click('#unload');
   await page.waitForSelector('#status[data-state="idle"]');
   assert.equal(await page.locator('#translate').isDisabled(),true);
  }
  fs.mkdirSync('test-artifacts',{recursive:true});
  await page.screenshot({path:'test-artifacts/plamo-'+(real?'real':'ui')+'.png',fullPage:true});
  console.log('PASS: '+(real?'PLaMo 0.8B real CPU inference':'browser UI state/translation and unload')+'; WebGPU probe='+gpu);
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>server.close());
