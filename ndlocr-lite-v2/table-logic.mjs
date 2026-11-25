// Simple TableCenterNet decoder adapted from NDL tablecenternet.py (CC BY 4.0).
// Corner relocation and ruled-table recovery from the official default decoder
// are not yet ported. All coordinates in output are original image pixels.
const clamp=(x,lo,hi)=>Math.max(lo,Math.min(hi,x));
const sigmoid=x=>1/(1+Math.exp(-clamp(x,-50,50)));
function roundEven(x){const f=Math.floor(x);return x-f===.5?f+(f%2):Math.round(x);}
const atLeastOne=x=>Math.max(1,roundEven(x));
export function logicalCoords(lc,sp){
 const axis=(k,start,end,span)=>{const s=atLeastOne(span),v=lc.map(x=>atLeastOne(x[k]));
  let a,b;if(v[start[0]]===v[start[1]]){a=v[start[0]];b=a+s-1;}
  else if(v[end[0]]===v[end[1]]){b=Math.max(s+1,v[end[0]])-1;a=b+1-s;}
  else if(Math.abs(lc[start[0]][k]-lc[start[1]][k])<=Math.abs(lc[end[0]][k]-lc[end[1]][k])){a=atLeastOne((lc[start[0]][k]+lc[start[1]][k])/2);b=a+s-1;}
  else {b=Math.max(s+1,roundEven((lc[end[0]][k]+lc[end[1]][k])/2))-1;a=b+1-s;}
  return [a,b];};
 return [...axis(0,[0,3],[1,2],sp[0]),...axis(1,[0,1],[2,3],sp[1])];
}
export function decodeTable(outputs,region,{threshold=.2}={}){
 const {hm,reg,ct2cn,lc,sp}=outputs;
 if(!hm||!reg||!ct2cn||!lc||!sp)throw Error('Unexpected TableCenterNet outputs: '+Object.keys(outputs).join(','));
 const [batch,channels,h,w]=hm.dims,n=w*h;
 if(batch!==1||channels<1||![reg,ct2cn,lc,sp].every(t=>t.dims[0]===1&&t.dims[2]===h&&t.dims[3]===w)||reg.dims[1]<2||ct2cn.dims[1]<8||lc.dims[1]<2||sp.dims[1]<2)throw Error('Unexpected table output dimensions');
 const value=(t,c,x,y)=>t.data[c*n+y*w+x];
 const rw=region.x2-region.x1,rh=region.y2-region.y1,scale=Math.max(rw,rh)/w;
 const cells=[];
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const logit=value(hm,0,x,y),score=sigmoid(logit);if(score<threshold)continue;
  let peak=true;for(let j=Math.max(0,y-1);j<=Math.min(h-1,y+1);j++)for(let i=Math.max(0,x-1);i<=Math.min(w-1,x+1);i++)if(value(hm,0,i,j)>logit)peak=false;
  if(!peak)continue;
  const px=x+value(reg,0,x,y),py=y+value(reg,1,x,y);
  const poly=Array.from({length:4},(_,j)=>[px-value(ct2cn,j*2,x,y),py-value(ct2cn,j*2+1,x,y)]);
  const logical=poly.map(([a,b])=>[0,1].map(c=>value(lc,c,clamp(Math.trunc(a),0,w-1),clamp(Math.trunc(b),0,h-1))));
  const spans=[value(sp,0,x,y),value(sp,1,x,y)];
  if(!poly.flat().concat(logical.flat(),spans).every(Number.isFinite))continue;
  const [startCol,endCol,startRow,endRow]=logicalCoords(logical,spans);
  if(Math.max(endCol,endRow)>100)continue;
  const corners=poly.map(([a,b])=>[clamp(region.x1+rw/2+(a-w/2)*scale,region.x1,region.x2),clamp(region.y1+rh/2+(b-h/2)*scale,region.y1,region.y2)]);
  const xs=corners.map(p=>p[0]),ys=corners.map(p=>p[1]),box={x1:Math.min(...xs),y1:Math.min(...ys),x2:Math.max(...xs),y2:Math.max(...ys)};
  if(box.x2-box.x1<2||box.y2-box.y1<2)continue;
  cells.push({...box,corners,score,startCol,endCol,startRow,endRow,text:''});
 }
 // suppress duplicate geometry and logical slots (score-first)
 const area=b=>(b.x2-b.x1)*(b.y2-b.y1),kept=[];
 for(const c of cells.sort((a,b)=>b.score-a.score).slice(0,3000)){
  if(kept.some(b=>{const i=Math.max(0,Math.min(c.x2,b.x2)-Math.max(c.x1,b.x1))*Math.max(0,Math.min(c.y2,b.y2)-Math.max(c.y1,b.y1));return i/(area(c)+area(b)-i)>.5||(c.startRow<=b.endRow&&c.endRow>=b.startRow&&c.startCol<=b.endCol&&c.endCol>=b.startCol);}))continue;
  kept.push(c);
 }
 return kept.sort((a,b)=>a.startRow-b.startRow||a.startCol-b.startCol);
}
export function assignTableLines(cells,lines){
 const results=cells.map(c=>({...c,lines:[]}));
 for(const l of lines){
  const x=(l.x1+l.x2)/2,y=(l.y1+l.y2)/2;
  const hit=results.find(c=>x>=c.x1&&x<=c.x2&&y>=c.y1&&y<=c.y2);
  if(hit)hit.lines.push(l);
 }
 for(const c of results)c.text=c.lines.sort((a,b)=>a.y1-b.y1||a.x1-b.x1).map(l=>l.text).join('\n');
 return results;
}
export const escapeHTML=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function tableHTML(cells){
 const rows=Math.max(0,...cells.map(c=>c.endRow)),cols=Math.max(0,...cells.map(c=>c.endCol));
 if(!rows||!cols)return '<table></table>';
 const slots=new Map();for(const c of cells)for(let r=c.startRow;r<=c.endRow;r++)for(let k=c.startCol;k<=c.endCol;k++)slots.set(r+':'+k,c);
 let s='<table><tbody>';for(let r=1;r<=rows;r++){s+='<tr>';for(let k=1;k<=cols;k++){const c=slots.get(r+':'+k);if(!c){s+='<td></td>';continue;}if(c.startRow!==r||c.startCol!==k)continue;const rs=c.endRow-r+1,cs=c.endCol-k+1;s+='<td'+(rs>1?' rowspan="'+rs+'"':'')+(cs>1?' colspan="'+cs+'"':'')+'>'+escapeHTML(c.text).replace(/\n/g,'<br>')+'</td>';}s+='</tr>';}return s+'</tbody></table>';
}

// Find near-full-length horizontal and vertical rules; only use these for
// interior cropping, not to override the model's logical cell structure.
export function ruledAxes(data,w,h){
 const xx=new Uint32Array(w),yy=new Uint32Array(h);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const i=(y*w+x)*4;if((data[i]+data[i+1]+data[i+2])/3<100){xx[x]++;yy[y]++;}
 }
 function bands(count,span){
  const ranges=[];let start=-1;
  for(let i=0;i<=count.length;i++){
   if(i<count.length&&count[i]>=span*.70){if(start<0)start=i;}
   else if(start>=0){ranges.push({lo:start,hi:i,mid:(start+i-1)/2});start=-1;}
  }return ranges;
 }
 return {x:bands(xx,h),y:bands(yy,w)};
}
export function interiorCell(c,axes,region){
 const nearest=(a,v,offset,tol)=>a.reduce((best,r)=>Math.abs(r.mid+offset-v)<tol&&(!best||Math.abs(r.mid+offset-v)<Math.abs(best.mid+offset-v))?r:best,null);
 const w=c.x2-c.x1,h=c.y2-c.y1,pad=Math.max(2,Math.round(Math.min(w,h)*.035));
 const a=nearest(axes.x,c.x1,region.x1,w*.18),b=nearest(axes.x,c.x2,region.x1,w*.18),d=nearest(axes.y,c.y1,region.y1,h*.18),e=nearest(axes.y,c.y2,region.y1,h*.18);
 const out={x1:Math.max(region.x1,Math.ceil(a?a.hi+region.x1+1:c.x1+pad)),x2:Math.min(region.x2,Math.floor(b?b.lo+region.x1-1:c.x2-pad)),y1:Math.max(region.y1,Math.ceil(d?d.hi+region.y1+1:c.y1+pad)),y2:Math.min(region.y2,Math.floor(e?e.lo+region.y1-1:c.y2-pad))};
 return out.x2-out.x1>=4&&out.y2-out.y1>=4?out:null;
}
// Estimate isolated glyph geometry using the height of neighboring text lines
// when available. Do not interpret the shape as a particular character.
export function shortCellCandidates(ink,referenceHeight){
 const w=ink.x2-ink.x1,h=ink.y2-ink.y1,ref=Math.max(h,referenceHeight||h);
 return w<=ref*1.6&&h<=ref*1.5?[2.5,4,6]:[];
}
