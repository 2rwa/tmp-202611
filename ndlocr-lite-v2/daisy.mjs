// Minimal text-only DAISY 3 (ANSI/NISO Z39.86-2005) package.
import {escapeHTML} from './table-logic.mjs';
const esc=s=>escapeHTML(String(s??'').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/gu,''));
const head='<?xml version="1.0" encoding="UTF-8"?>\n';
export function daisyFiles(pages,{title='NDLOCR-Lite OCR',uid='urn:uuid:'+crypto.randomUUID(),date=new Date().toISOString().slice(0,10)}={}){
 if(!pages.length||pages.some(p=>!p))throw Error('全ページのOCRが必要です');
 const files={},manifest=[],spine=[],nav=[],pageList=[];
 for(const [i,p] of pages.entries()){
  const n=i+1,book='page-'+n+'.xml',smil='page-'+n+'.smil',label='ページ '+n,phrases=[{id:'heading',text:label}];
  for(const line of p.lines){
   for(const s of (line.text.match(/[^。！？!?]+[。！？!?]*|[。！？!?]+/gu)||[])){if(s.trim())phrases.push({id:'s'+phrases.length,text:s});}
  }
  const sent=x=>'<sent id="'+x.id+'" smilref="'+smil+'#par-'+x.id+'">'+esc(x.text)+'</sent>';
  files[book]=head+'<?xml-stylesheet href="style.css" type="text/css"?>\n<!DOCTYPE dtbook PUBLIC "-//NISO//DTD dtbook 2005-3//EN" "https://www.daisy.org/z3986/2005/dtbook-2005-3.dtd">\n<dtbook xmlns="http://www.daisy.org/z3986/2005/dtbook/" version="2005-3" xml:lang="ja"><head><meta name="dc:Title" content="'+esc(title)+'"/><meta name="dtb:uid" content="'+esc(uid)+'"/></head><book><bodymatter><level1><h1>'+sent(phrases[0])+'</h1><pagenum id="page-number" page="normal" smilref="'+smil+'#par-page-number">'+n+'</pagenum>'+phrases.slice(1).map(x=>'<p>'+sent(x)+'</p>').join('')+'</level1></bodymatter></book></dtbook>';
  const par=x=>'<par id="par-'+x.id+'"><text src="'+book+'#'+x.id+'"/></par>';
  files[smil]=head+'<!DOCTYPE smil PUBLIC "-//NISO//DTD dtbsmil 2005-1//EN" "https://www.daisy.org/z3986/2005/dtbsmil-2005-2.dtd">\n<smil xmlns="http://www.w3.org/2001/SMIL20/"><head><meta name="dtb:uid" content="'+esc(uid)+'"/><meta name="dtb:totalElapsedTime" content="0:00:00.000"/></head><body><seq id="seq1">'+par(phrases[0])+par({id:'page-number'})+phrases.slice(1).map(par).join('')+'</seq></body></smil>';
  manifest.push('<item id="dtbook'+n+'" href="'+book+'" media-type="application/x-dtbook+xml"/>','<item id="smil'+n+'" href="'+smil+'" media-type="application/smil"/>');
  spine.push('<itemref idref="smil'+n+'"/>');
  nav.push('<navPoint id="nav'+n+'" playOrder="'+(2*n-1)+'"><navLabel><text>'+label+'</text></navLabel><content src="'+smil+'#par-heading"/></navPoint>');
  pageList.push('<pageTarget id="page'+n+'" type="normal" value="'+n+'" playOrder="'+(2*n)+'"><navLabel><text>'+n+'</text></navLabel><content src="'+smil+'#par-page-number"/></pageTarget>');
 }
 files['navigation.ncx']=head+'<!DOCTYPE ncx PUBLIC "-//NISO//DTD ncx 2005-1//EN" "https://www.daisy.org/z3986/2005/ncx-2005-1.dtd">\n<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1" xml:lang="ja"><head><meta name="dtb:uid" content="'+esc(uid)+'"/><meta name="dtb:depth" content="1"/><meta name="dtb:totalPageCount" content="'+pages.length+'"/><meta name="dtb:maxPageNumber" content="'+pages.length+'"/></head><docTitle><text>'+esc(title)+'</text></docTitle><navMap>'+nav.join('')+'</navMap><pageList id="pages"><navLabel><text>Pages</text></navLabel>'+pageList.join('')+'</pageList></ncx>';
 files['package.opf']=head+'<!DOCTYPE package PUBLIC "+//ISBN 0-9673008-1-9//DTD OEB 1.2 Package//EN" "http://openebook.org/dtds/oeb-1.2/oebpkg12.dtd">\n<package xmlns="http://openebook.org/namespaces/oeb-package/1.0/" unique-identifier="uid"><metadata><dc-metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:Title>'+esc(title)+'</dc:Title><dc:Identifier id="uid" scheme="DTB">'+esc(uid)+'</dc:Identifier><dc:Language>ja</dc:Language><dc:Publisher>NDLOCR browser lab</dc:Publisher><dc:Date>'+esc(date)+'</dc:Date><dc:Format>ANSI/NISO Z39.86-2005</dc:Format></dc-metadata><x-metadata><meta name="dtb:multimediaContent" content="text"/><meta name="dtb:multimediaType" content="textNCX"/><meta name="dtb:totalTime" content="0:00:00.000"/><meta name="dtb:producer" content="NDLOCR browser lab"/><meta name="dtb:producedDate" content="'+esc(date)+'"/></x-metadata></metadata><manifest><item id="opf" href="package.opf" media-type="text/xml"/><item id="ncx" href="navigation.ncx" media-type="application/x-dtbncx+xml"/><item id="css" href="style.css" media-type="text/css"/>'+manifest.join('')+'</manifest><spine>'+spine.join('')+'</spine></package>';
 files['style.css']='dtbook,book,bodymatter,level1,h1,p,pagenum{display:block}bodymatter{margin:1em}pagenum{color:#666}sent{display:inline}';
 return files;
}
// ZIP store method (UTF-8 names), no dependency or network access.
function crc32(bytes){let c=0xffffffff;for(const x of bytes){c^=x;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}return (c^0xffffffff)>>>0;}
export function zipStore(files){
 const enc=new TextEncoder(),parts=[],central=[];let offset=0,centralSize=0;
 for(const [name,value] of Object.entries(files)){
  const n=enc.encode(name),b=enc.encode(value),crc=crc32(b),a=new Uint8Array(30+n.length),d=new DataView(a.buffer);
  d.setUint32(0,0x04034b50,true);d.setUint16(4,20,true);d.setUint16(6,0x800,true);d.setUint16(12,0x21,true);d.setUint32(14,crc,true);d.setUint32(18,b.length,true);d.setUint32(22,b.length,true);d.setUint16(26,n.length,true);a.set(n,30);
  const c=new Uint8Array(46+n.length),v=new DataView(c.buffer);v.setUint32(0,0x02014b50,true);v.setUint16(4,20,true);v.setUint16(6,20,true);v.setUint16(8,0x800,true);v.setUint16(14,0x21,true);v.setUint32(16,crc,true);v.setUint32(20,b.length,true);v.setUint32(24,b.length,true);v.setUint16(28,n.length,true);v.setUint32(42,offset,true);c.set(n,46);
  parts.push(a,b);central.push(c);offset+=a.length+b.length;centralSize+=c.length;
 }
 const end=new Uint8Array(22),d=new DataView(end.buffer);d.setUint32(0,0x06054b50,true);d.setUint16(8,central.length,true);d.setUint16(10,central.length,true);d.setUint32(12,centralSize,true);d.setUint32(16,offset,true);
 return new Blob([...parts,...central,end],{type:'application/zip'});
}
export const exportDaisy=(pages,options)=>zipStore(daisyFiles(pages,options));
