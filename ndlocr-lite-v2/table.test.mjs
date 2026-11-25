import assert from 'node:assert/strict';
import {decodeTable,logicalCoords,assignTableLines,tableHTML} from './table-logic.mjs';
assert.deepEqual(logicalCoords([[1,1],[3,1],[3,2],[1,2]],[2,1]),[1,2,1,1]);
const w=8,h=8,n=w*h,t=c=>({dims:[1,c,h,w],data:new Float32Array(c*n)});
const hm=t(2),reg=t(2),ct2cn=t(8),lc=t(2),sp=t(2);hm.data.fill(-20);hm.data[3*w+3]=10;lc.data.fill(1);sp.data.fill(1);
for(const [i,v] of [2,2,-2,2,-2,-2,2,-2].entries())ct2cn.data[i*n+3*w+3]=v;
const cells=decodeTable({hm,reg,ct2cn,lc,sp},{x1:0,y1:0,x2:80,y2:80});
assert.equal(cells.length,1);assert.deepEqual(cells[0].corners,[[10,10],[50,10],[50,50],[10,50]]);
const filled=assignTableLines(cells,[{x1:15,y1:20,x2:30,y2:30,text:'A<&'}]);assert.match(tableHTML(filled),/A&lt;&amp;/);
assert.match(tableHTML([{startRow:1,endRow:2,startCol:1,endCol:2,text:'merged'}]),/rowspan="2" colspan="2"/);
console.log('TableCenterNet synthetic decoder and HTML tests passed');

import {ruledAxes,interiorCell,shortCellCandidates} from './table-logic.mjs';
const gw=100,gh=80,pixels=new Uint8ClampedArray(gw*gh*4).fill(255);
for(let y=0;y<gh;y++)for(let x=0;x<gw;x++)if([5,6,50,51,94,95].includes(x)||[5,6,40,41,74,75].includes(y)){const j=(y*gw+x)*4;pixels[j]=pixels[j+1]=pixels[j+2]=0;}
const axes=ruledAxes(pixels,gw,gh);assert.equal(axes.x.length,3);assert.equal(axes.y.length,3);
assert.deepEqual(interiorCell({x1:4,y1:4,x2:52,y2:42},axes,{x1:0,y1:0,x2:gw,y2:gh}),{x1:8,x2:49,y1:8,y2:39});
assert.deepEqual(shortCellCandidates({x1:0,x2:20,y1:0,y2:14},30),[2.5,4,6]);
assert.deepEqual(shortCellCandidates({x1:0,x2:90,y1:0,y2:30},30),[]);
console.log('Ruled cell crop and short glyph geometry tests passed');
