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
export async function renderInput(entry,target){
 const g=target.getContext('2d');
 if(entry.kind==='pdf'){
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
