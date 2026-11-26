// Browser document import/export. No user files leave the browser.
import {tableHTML,escapeHTML} from './table-logic.mjs';
const pdfjsBase='https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/';
let pdfjsPromise,libPromise,fontkitPromise,fontPromise;
const xmlEscape=s=>escapeHTML(String(s??'').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/gu,''));
const xmlHead='<?xml version="1.0" encoding="UTF-8"?>\n';
export async function openPDF(file){
 if(!pdfjsPromise)pdfjsPromise=import(pdfjsBase+'build/pdf.mjs');
 const pdfjs=await pdfjsPromise;pdfjs.GlobalWorkerOptions.workerSrc=pdfjsBase+'build/pdf.worker.mjs';
 return pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer()),cMapUrl:pdfjsBase+'cmaps/',cMapPacked:true,standardFontDataUrl:pdfjsBase+'standard_fonts/',isEvalSupported:false}).promise;
}
let tiffPromise;
function loadGlobal(url,key){
 if(globalThis[key])return Promise.resolve(globalThis[key]);
 return new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=url;s.onload=()=>globalThis[key]?resolve(globalThis[key]):reject(Error(key+' unavailable'));s.onerror=()=>{s.remove();reject(Error(key+' download failed'));};document.head.append(s);});
}
async function tiffDecoder(){
 if(!tiffPromise)tiffPromise=(async()=>{
  await loadGlobal('https://cdn.jsdelivr.net/npm/pako@1.0.11/dist/pako.min.js','pako');
  return loadGlobal('https://cdn.jsdelivr.net/npm/utif@3.1.0/UTIF.js','UTIF');
 })().catch(e=>{tiffPromise=null;throw e;});
 return tiffPromise;
}
export async function openTIFF(file){
 if(file.size>256*1024*1024)throw Error('TIFFは256MB以下にしてください');
 const buffer=await file.arrayBuffer(),v=new DataView(buffer);
 if(v.byteLength<8)throw Error('TIFF header truncated');
 const marker=v.getUint16(0),le=marker===0x4949;
 if((!le&&marker!==0x4d4d)||v.getUint16(2,le)!==42)throw Error('通常TIFFのみ対応（BigTIFFは未対応）');
 // Check the main IFD chain before invoking the decoder.
 let off=v.getUint32(4,le),seen=new Set();
 while(off){
  if(seen.has(off)||off+2>v.byteLength||seen.size>=200)throw Error('Invalid or oversized TIFF page directory');
  seen.add(off);const end=off+2+v.getUint16(off,le)*12;
  if(end+4>v.byteLength)throw Error('Truncated TIFF page directory');
  off=v.getUint32(end,le);
 }
 const utif=await tiffDecoder(),ifds=utif.decode(buffer);
 const pages=ifds.filter(x=>x.t256?.[0]&&x.t257?.[0]&&(x.t273||x.t324)&&!((x.t254?.[0]||0)&1));
 if(!pages.length||pages.length>200)throw Error('TIFFの画像ページがありません、または200ページを超えています');
 for(const p of pages){const w=p.t256[0],h=p.t257[0];if(!Number.isSafeInteger(w)||!Number.isSafeInteger(h)||w<1||h<1||w*h>40000000)throw Error('TIFFは1ページ4000万画素以下にしてください');}
 return {buffer,pages,utif};
}
function renderTIFF(entry,target){
 const {buffer,pages,utif}=entry.tiff,p=pages[entry.number-1],w=p.t256[0],h=p.t257[0],orientation=p.t274?.[0]||1;
 try{
  utif.decodeImage(buffer,p, pages);
  if(!p.data)throw Error('TIFF pixel decode failed');
  const rgba=utif.toRGBA8(p);
  if(rgba.length!==w*h*4)throw Error('TIFF RGBA length mismatch');
  const c=document.createElement('canvas');c.width=w;c.height=h;c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(rgba),w,h),0,0);
  target.width=orientation>=5&&orientation<=8?h:w;target.height=orientation>=5&&orientation<=8?w:h;
  const g=target.getContext('2d');g.fillStyle='white';g.fillRect(0,0,target.width,target.height);
  const transforms={2:[-1,0,0,1,w,0],3:[-1,0,0,-1,w,h],4:[1,0,0,-1,0,h],5:[0,1,1,0,0,0],6:[0,1,-1,0,h,0],7:[0,-1,-1,0,h,w],8:[0,-1,1,0,0,w]};
  g.save();if(transforms[orientation])g.transform(...transforms[orientation]);g.drawImage(c,0,0);g.restore();c.width=1;c.height=1;
 }finally{delete p.data;}
}
let jpxPromise;
export function jpxHeader(bytes){
 const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),end=v.byteLength;
 if(end<42)throw Error('JPEG 2000 header truncated');
 let start=0,stop=end;
 if(v.getUint16(0)!==0xff4f){
  if(v.getUint32(0)!==12||v.getUint32(4)!==0x6a502020||v.getUint32(8)!==0x0d0a870a)throw Error('Invalid JP2 signature');
  let pos=0,found=false;
  while(pos+8<=end){
   let len=v.getUint32(pos),head=8;const type=v.getUint32(pos+4);
   if(len===1){if(pos+16>end)throw Error('JP2 XLBox truncated');len=v.getUint32(pos+8)*4294967296+v.getUint32(pos+12);head=16;}
   if(len===0)len=end-pos;
   if(!Number.isSafeInteger(len)||len<head||pos+len>end)throw Error('Invalid JP2 box length');
   if(type===0x6a703263){if(found)throw Error('Multiple JP2 codestreams unsupported');start=pos+head;stop=pos+len;found=true;}
   pos+=len;
  }
  if(!found)throw Error('JP2 codestream missing');
 }
 if(start+42>stop||v.getUint16(start)!==0xff4f||v.getUint16(start+2)!==0xff51)throw Error('JPEG 2000 SIZ missing');
 const p=start+4,len=v.getUint16(p),w=v.getUint32(p+4),h=v.getUint32(p+8),x=v.getUint32(p+12),y=v.getUint32(p+16),tw=v.getUint32(p+20),th=v.getUint32(p+24),tx=v.getUint32(p+28),ty=v.getUint32(p+32),n=v.getUint16(p+36);
 if(len!==38+3*n||p+len>stop)throw Error('Invalid JPEG 2000 SIZ length');
 if(x||y||tx||ty||!w||!h||!tw||!th||w*h>40000000||Math.ceil(w/tw)*Math.ceil(h/th)>4096)throw Error('JPEG 2000 dimensions or origin unsupported');
 if(n!==1&&n!==3)throw Error('JPEG 2000: grayscale/RGB only');
 for(let i=0;i<n;i++){const c=p+38+3*i;if(v.getUint8(c)!==7||v.getUint8(c+1)!==1||v.getUint8(c+2)!==1)throw Error('JPEG 2000: unsigned 8-bit full-resolution components only');}
 return {start,stop,width:w,height:h,components:n};
}
async function renderJPX(file,target){
 if(file.size>256*1024*1024)throw Error('JPEG 2000は256MB以下にしてください');
 const bytes=new Uint8Array(await file.arrayBuffer()),header=jpxHeader(bytes);
 if(!jpxPromise)jpxPromise=import('https://cdn.jsdelivr.net/npm/jpeg2000@1.1.1/+esm').catch(e=>{jpxPromise=null;throw e;});
 const mod=await jpxPromise,JpxImage=mod.JpxImage||mod.default?.JpxImage;
 if(typeof JpxImage!=='function')throw Error('JPEG 2000 decoder missing');
 const jpx=new JpxImage();jpx.failOnCorruptedImage=true;jpx.parse(bytes.subarray(header.start,header.stop));
 const {width:w,height:h,components:n}=header;
 if(jpx.width!==w||jpx.height!==h||jpx.componentsCount!==n||!jpx.tiles?.length)throw Error('JPEG 2000 decoded dimensions mismatch');
 target.width=w;target.height=h;const g=target.getContext('2d');g.fillStyle='white';g.fillRect(0,0,w,h);
 let total=0;const occupied=[];
 for(const t of jpx.tiles){
  const {left,top,width,height,items}=t;
  if(![left,top,width,height].every(Number.isInteger)||left<0||top<0||width<1||height<1||left+width>w||top+height>h||items.length!==width*height*n)throw Error('Invalid JPEG 2000 tile');
  if(occupied.some(r=>left<r.left+r.width&&left+width>r.left&&top<r.top+r.height&&top+height>r.top))throw Error('Overlapping JPEG 2000 tiles');
  occupied.push({left,top,width,height});total+=width*height;
  const rgba=new Uint8ClampedArray(width*height*4);
  for(let i=0,j=0,k=0;i<width*height;i++,j+=n,k+=4){rgba[k]=items[j];rgba[k+1]=items[j+(n===3?1:0)];rgba[k+2]=items[j+(n===3?2:0)];rgba[k+3]=255;}
  g.putImageData(new ImageData(rgba,width,height),left,top);
 }
 if(total!==w*h)throw Error('Incomplete JPEG 2000 tile coverage');
}
export async function renderInput(entry,target){
 const g=target.getContext('2d');
 if(entry.kind==='jpx'){await renderJPX(entry.file,target);
 }else if(entry.kind==='tiff'){renderTIFF(entry,target);
 }else if(entry.kind==='pdf'){
  const p=await entry.doc.getPage(entry.number),base=p.getViewport({scale:1}),scale=Math.min(2.5,Math.sqrt(40000000/(base.width*base.height))),v=p.getViewport({scale});
  target.width=Math.ceil(v.width);target.height=Math.ceil(v.height);
  try{await p.render({canvasContext:g,viewport:v,background:'white'}).promise;}finally{p.cleanup();}
 }else if(entry.kind==='sample'){
  target.width=900;target.height=280;g.fillStyle='white';g.fillRect(0,0,900,280);g.fillStyle='black';g.font='42px sans-serif';g.fillText('国立国会図書館',35,85);g.fillText('日本語の文字認識を試します。',35,155);g.fillText('NDLOCR Lite 2.0',35,225);
 }else{
  const im=await createImageBitmap(entry.file);
  try{if(im.width*im.height>40000000)throw Error('画像は4000万画素以下にしてください');target.width=im.width;target.height=im.height;g.fillStyle='white';g.fillRect(0,0,target.width,target.height);g.drawImage(im,0,0);}finally{im.close();}
 }
}
const name=(p,i)=>p.name||'page-'+(i+1);
export function exportDocument(pages,fmt){
 const text=pages.map(p=>p.text).join('\n\f\n');
 if(fmt==='txt')return text;
 if(fmt==='markdown')return pages.map((p,i)=>(pages.length>1?'## '+name(p,i)+'\n\n':'')+p.text+'\n'+(p.tableCells?.length?'\n'+tableHTML(p.tableCells):'')).join('\n\n');
 if(fmt==='html')return '<!doctype html><html lang="ja"><meta charset="utf-8"><title>NDLOCR result</title><style>table{border-collapse:collapse}td{border:1px solid #888;padding:6px}</style>'+pages.map((p,i)=>'<section><h2>'+escapeHTML(name(p,i))+'</h2>'+(p.tableCells?.length?tableHTML(p.tableCells):'<pre>'+escapeHTML(p.text)+'</pre>')+'</section>').join('')+'</html>';
 if(fmt==='xml')return xmlHead+'<OCRDATASET>'+pages.map((p,i)=>'<PAGE IMAGENAME="'+xmlEscape(name(p,i))+'" WIDTH="'+p.width+'" HEIGHT="'+p.height+'">'+p.lines.map((l,j)=>'<LINE TYPE="本文" X="'+l.x1+'" Y="'+l.y1+'" WIDTH="'+(l.x2-l.x1)+'" HEIGHT="'+(l.y2-l.y1)+'" ORDER="'+(j+1)+'" STRING="'+xmlEscape(l.text)+'"'+(Number.isFinite(l.score)?' CONF="'+l.score+'"':'')+'/>').join('')+'</PAGE>').join('')+'</OCRDATASET>';
 if(fmt==='tei'){
  const surfaces=pages.map((p,i)=>'<surface xml:id="p'+(i+1)+'" ulx="0" uly="0" lrx="'+p.width+'" lry="'+p.height+'"><graphic url="'+xmlEscape(encodeURIComponent(name(p,i)))+'" width="'+p.width+'px" height="'+p.height+'px"/>'+p.lines.map((l,j)=>'<zone xml:id="p'+(i+1)+'l'+(j+1)+'" ulx="'+l.x1+'" uly="'+l.y1+'" lrx="'+l.x2+'" lry="'+l.y2+'"/>').join('')+'</surface>').join('');
  const body=pages.map((p,i)=>'<pb n="'+(i+1)+'" facs="#p'+(i+1)+'"/>'+p.lines.map((l,j)=>'<lb n="'+(j+1)+'" facs="#p'+(i+1)+'l'+(j+1)+'"/>'+xmlEscape(l.text)).join('')).join('');
  return xmlHead+'<TEI xmlns="http://www.tei-c.org/ns/1.0"><teiHeader><fileDesc><titleStmt><title>NDLOCR-Lite transcription</title></titleStmt><publicationStmt><p>Unpublished OCR result</p></publicationStmt><sourceDesc><p>Local input images</p></sourceDesc></fileDesc></teiHeader><facsimile>'+surfaces+'</facsimile><text><body><p>'+body+'</p></body></text></TEI>';
 }
 throw Error('Unsupported export: '+fmt);
}
function loadFontkit(){
 if(globalThis.fontkit)return Promise.resolve(globalThis.fontkit);
 if(!fontkitPromise)fontkitPromise=new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='https://cdn.jsdelivr.net/npm/@pdf-lib/fontkit@1.1.1/dist/fontkit.umd.min.js';s.onload=()=>globalThis.fontkit?resolve(globalThis.fontkit):reject(Error('fontkit global missing'));s.onerror=()=>reject(Error('fontkit download failed'));document.head.append(s);}).catch(e=>{fontkitPromise=null;throw e;});
 return fontkitPromise;
}
async function getJapaneseFont(){
 if(!fontPromise)fontPromise=fetch('https://raw.githubusercontent.com/notofonts/noto-cjk/f8d157532fbfaeda587e826d4cd5b21a49186f7c/Sans/OTF/Japanese/NotoSansCJKjp-Regular.otf').then(r=>{if(!r.ok)throw Error('Japanese PDF font HTTP '+r.status);return r.arrayBuffer();}).catch(e=>{fontPromise=null;throw e;});
 return fontPromise;
}
export async function searchablePDF(entries,pages,onProgress=()=>{}){
 if(entries.length!==pages.length||pages.some(p=>!p))throw Error('全ページのOCRを実行してください');
 if(!libPromise)libPromise=import('https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.esm.min.js');
 const {PDFDocument,StandardFonts}=await libPromise,doc=await PDFDocument.create();
 const unicode=pages.some(p=>/[^\x20-\x7e\n\r\t]/u.test(p.text));
 let font;if(unicode){doc.registerFontkit(await loadFontkit());font=await doc.embedFont(await getJapaneseFont(),{subset:true});}else font=await doc.embedFont(StandardFonts.Helvetica);
 const c=document.createElement('canvas');
 for(let i=0;i<pages.length;i++){
  onProgress(i+1,pages.length);await renderInput(entries[i],c);const p=pages[i];
  if(c.width!==p.width||c.height!==p.height)throw Error('ページ寸法がOCR時と異なります');
  const scale=Math.min(1,14400/Math.max(c.width,c.height)),w=c.width*scale,h=c.height*scale,page=doc.addPage([w,h]);
  const blob=await new Promise((resolve,reject)=>c.toBlob(b=>b?resolve(b):reject(Error('PDF page image encoding failed')),'image/png'));
  const img=await doc.embedPng(await blob.arrayBuffer());page.drawImage(img,{x:0,y:0,width:w,height:h});
  for(const l of p.lines){
   const t=l.text.replace(/[\u0000-\u001F\u007F]/g,'');if(!t)continue;
   const bw=(l.x2-l.x1)*scale,bh=(l.y2-l.y1)*scale,vertical=bh>bw*.8;
   // Keep the OCR layer invisible. For vertical lines, place a rotated text
   // run in the line's box; glyph-by-glyph Japanese vertical layout is pending.
   const size=Math.max(.2,Math.min(vertical?bw:bh,(vertical?bh:bw)/Math.max(.001,font.widthOfTextAtSize(t,1))));
   if(vertical){const lib=await libPromise;page.drawText(t,{x:l.x1*scale,y:h-l.y1*scale,size,font,opacity:0,rotate:lib.degrees(-90)});}
   else page.drawText(t,{x:l.x1*scale,y:h-l.y2*scale+Math.max(0,(bh-size)*.3),size,font,opacity:0});
  }
 }
 c.width=1;c.height=1;return doc.save();
}
