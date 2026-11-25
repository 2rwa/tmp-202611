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
