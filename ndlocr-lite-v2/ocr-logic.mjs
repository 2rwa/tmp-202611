// Browser adaptation of NDL process_cascade (CC BY 4.0).
// Reading order is a whitespace-based approximation, not the official algorithm.
export const codepoints=s=>Array.from(s).length;
export function firstTier(count){return count===3?30:count===2?50:100;}
export async function recognizeCascade(box,read,{simple=false}={}){
 const trace=[];let tier=simple?100:firstTier(box.count),text;
 for(;;){text=await read(tier,box);trace.push({tier,length:codepoints(text)});
  if(tier===30&&codepoints(text)>=25){tier=50;continue;}
  if(tier===50&&codepoints(text)>=45){tier=100;continue;}
  break;
 }
 const w=box.x2-box.x1,h=box.y2-box.y1;
 if(tier===100&&codepoints(text)>=98&&w>h&&w>=2){
  const mid=box.x1+Math.floor(w/2);
  const left=await read(100,{...box,x2:mid}),right=await read(100,{...box,x1:mid});
  trace.push({tier:100,part:'left',length:codepoints(left)},{tier:100,part:'right',length:codepoints(right)});
  text=left+right;
 }
 return {text,trace};
}
const width=b=>b.x2-b.x1,height=b=>b.y2-b.y1;
const median=a=>{const s=[...a].sort((a,b)=>a-b);return s[Math.floor(s.length/2)]||1;};
function gaps(boxes,axis){
 const lo=axis==='x'?'x1':'y1',hi=axis==='x'?'x2':'y2',s=[...boxes].sort((a,b)=>a[lo]-b[lo]),result=[];
 let edge=s[0][hi];
 for(let i=1;i<s.length;i++){if(s[i][lo]>edge)result.push({gap:s[i][lo]-edge,left:s.slice(0,i),right:s.slice(i)});edge=Math.max(edge,s[i][hi]);}
 return result;
}
export function readingOrder(boxes,order='auto'){
 if(!boxes.length)return [];
 if(order==='auto')order=boxes.filter(b=>height(b)>width(b)*.8).length>boxes.length/2?'vertical':'horizontal';
 const vertical=order==='vertical',primary=vertical?'x':'y',secondary=vertical?'y':'x';
 const lineSize=median(boxes.map(b=>vertical?width(b):height(b)));
 function visit(items,depth=0){
  if(items.length<2)return [...items];
  const best=a=>a.sort((x,y)=>y.gap-x.gap)[0];
  const cross=best(gaps(items,secondary)),along=best(gaps(items,primary));
  const cut=cross&&cross.gap>=lineSize*.8&&(!along||cross.gap>=along.gap*1.35)?{...cross,axis:secondary}:along?{...along,axis:primary}:null;
  if(cut&&depth<64){const a=visit(cut.left,depth+1),b=visit(cut.right,depth+1);return vertical&&cut.axis==='x'?[...b,...a]:[...a,...b];}
  return [...items].sort(vertical?(a,b)=>b.x2-a.x2||a.y1-b.y1:(a,b)=>a.y1-b.y1||a.x1-b.x1);
 }
 return visit(boxes);
}

// Python character_inclusion.py: longest multicodepoint mappings first,
// then a single translation pass; do not recursively normalize replacements.
export function inclusionFromCSV(csv){
 const rows=[];let row=[],field='',quoted=false;
 for(let i=0;i<csv.length;i++){
  const c=csv[i];
  if(quoted){if(c==='"'){if(csv[i+1]==='"'){field+='"';i++;}else quoted=false;}else field+=c;}
  else if(c==='"'&&field==='')quoted=true;
  else if(c===','){row.push(field);field='';}
  else if(c==='\n'||c==='\r'){if(c==='\r'&&csv[i+1]==='\n')i++;row.push(field);if(row.some(x=>x!==''))rows.push(row);row=[];field='';}
  else field+=c;
 }
 if(quoted)throw Error('Unterminated CSV field');
 if(row.length||field){row.push(field);rows.push(row);}
 const header=rows.shift();if(!header||header.length!==4||!['source','target','source_codepoints','target_codepoints'].every(x=>header.includes(x)))throw Error('Unexpected inclusion CSV columns');
 const from=header.indexOf('source'),to=header.indexOf('target'),single=new Map(),multi=new Map(),seen=new Set();
 for(const r of rows){if(r.length!==4||!r[from]||seen.has(r[from]))throw Error('Invalid or duplicate inclusion mapping');seen.add(r[from]);(codepoints(r[from])===1?single:multi).set(r[from],r[to]);}
 const escape=s=>s.replace(/[.*+?^$\{\}()|[\]\\]/g,'\\$&');
 const pattern=multi.size?new RegExp([...multi.keys()].sort((a,b)=>codepoints(b)-codepoints(a)).map(escape).join('|'),'gu'):null;
 return {size:seen.size,apply(text){if(pattern)text=text.replace(pattern,s=>multi.get(s));return Array.from(text,c=>single.has(c)?single.get(c):c).join('');}};
}
export function cropRect(a,b,width,height){
 const clamp=(v,max)=>Math.max(0,Math.min(max,v));
 const x1=clamp(Math.floor(Math.min(a.x,b.x)),width),y1=clamp(Math.floor(Math.min(a.y,b.y)),height),x2=clamp(Math.ceil(Math.max(a.x,b.x)),width),y2=clamp(Math.ceil(Math.max(a.y,b.y)),height);
 return x2-x1>=4&&y2-y1>=4?{x1,y1,x2,y2}:null;
}
export function cropPoint(clientX,clientY,rect,width,height){
 return {x:(clientX-rect.left)*width/rect.width,y:(clientY-rect.top)*height/rect.height};
}

// Line classes can overlap across labels. Keep the strongest of substantially
// coincident, similarly oriented lines. Never compare text strings alone.
export function suppressLines(boxes){
 const area=b=>width(b)*height(b),intersection=(a,b)=>Math.max(0,Math.min(a.x2,b.x2)-Math.max(a.x1,b.x1))*Math.max(0,Math.min(a.y2,b.y2)-Math.max(a.y1,b.y1));
 const vertical=b=>height(b)>width(b)*.8;
 const kept=[];
 for(const b of [...boxes].sort((a,b)=>(b.score??0)-(a.score??0)||area(b)-area(a))){
  if(kept.some(a=>{const i=intersection(a,b),min=Math.min(area(a),area(b)),max=Math.max(area(a),area(b));return min>0&&vertical(a)===vertical(b)&&i/min>=.80&&min/max>=.50;}))continue;
  kept.push(b);
 }
 return kept;
}
// Tight ink bounds for a user-supplied single line, assuming light or dark
// fairly uniform margins. Estimate background from border pixels.
export function inkBounds(data,w,h){
 if(!w||!h)return null;
 const gray=i=>(data[i*4]+data[i*4+1]+data[i*4+2])/3;
 const edge=[];for(let x=0;x<w;x++){edge.push(gray(x),gray((h-1)*w+x));}for(let y=0;y<h;y++){edge.push(gray(y*w),gray(y*w+w-1));}
 const bg=median(edge),threshold=45;let x1=w,y1=h,x2=0,y2=0,n=0;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(Math.abs(gray(y*w+x)-bg)>threshold){x1=Math.min(x1,x);x2=Math.max(x2,x+1);y1=Math.min(y1,y);y2=Math.max(y2,y+1);n++;}
 if(n<4||n>w*h*.8)return null;
 const pad=Math.max(1,Math.round(Math.min(x2-x1,y2-y1)*.035));
 return {x1:Math.max(0,x1-pad),y1:Math.max(0,y1-pad),x2:Math.min(w,x2+pad),y2:Math.min(h,y2+pad)};
}
// TCY candidate segmentation follows the upstream projection heuristic.
// Returns groups in top-to-bottom order and leaves recognition to the caller.
export function tcySegments(data,w,h){
 if(w<30||h<=w)return [];
 const gray=new Float32Array(w*h);let sum=0;
 for(let i=0;i<gray.length;i++){gray[i]=(data[i*4]+data[i*4+1]+data[i*4+2])/3;sum+=gray[i];}
 const threshold=sum/gray.length,blocks=[];
 for(let y=0;y<h;y++){let ink=false;for(let x=0;x<w;x++)if(gray[y*w+x]<threshold){ink=true;break;}
  if(ink){const last=blocks.at(-1);if(last&&y-last[1]<5)last[1]=y+1;else blocks.push([y,y+1]);}}
 const flags=blocks.map(([a,b])=>{const n=b-a;if(n<5||n>w*.75)return false;const margin=Math.max(2,Math.floor(n*.1)),cols=new Float32Array(w);
  let mean=0,count=0;const lo=Math.max(0,a-margin),hi=Math.min(h,b+margin);for(let y=lo;y<hi;y++)for(let x=0;x<w;x++){mean+=gray[y*w+x];count++;}mean/=count;
  for(let y=lo;y<hi;y++)for(let x=0;x<w;x++)if(gray[y*w+x]<mean)cols[x]++;
  const peak=Math.max(...cols);let components=0,on=false;for(const v of cols){if(v>peak*.1){if(!on)components++;on=true;}else on=false;}return components>=2;});
 if(!flags.some(Boolean))return [];
 const result=[];for(let i=0;i<blocks.length;){if(flags[i]){const [a,b]=blocks[i],m=Math.max(5,Math.floor((b-a)*.5));result.push({y1:Math.max(0,a-m),y2:Math.min(h,b+m),horizontal:true});i++;}else{const start=i;while(i<blocks.length&&!flags[i])i++;result.push({y1:start>0?blocks[start-1][1]:blocks[start][0],y2:i<blocks.length?blocks[i][0]:blocks[i-1][1],horizontal:false});}}
 return result.filter(x=>x.y2>x.y1);
}
