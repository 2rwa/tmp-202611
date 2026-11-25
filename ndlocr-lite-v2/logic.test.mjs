import assert from 'node:assert/strict';
import {firstTier,recognizeCascade,readingOrder} from './ocr-logic.mjs';
const b={x1:0,y1:0,x2:2000,y2:30,count:3};
assert.deepEqual([3,2,1,0,100,undefined].map(firstTier),[30,50,100,100,100,100]);
let calls=[];
let r=await recognizeCascade(b,async(t)=>{calls.push(t);return '短文';});assert.equal(r.text,'短文');assert.deepEqual(calls,[30]);
calls=[];r=await recognizeCascade(b,async t=>{calls.push(t);return 'あ'.repeat(t===30?25:t===50?45:60);});assert.deepEqual(calls,[30,50,100]);assert.equal(r.text.length,60);
calls=[];r=await recognizeCascade({...b,count:2},async t=>{calls.push(t);return 'あ'.repeat(24);});assert.deepEqual(calls,[50]);
calls=[];r=await recognizeCascade(b,async(t,box)=>{calls.push([t,box.x1,box.x2]);return box.x2-box.x1===2000?'あ'.repeat(98):box.x1===0?'左':'右';},{simple:true});assert.deepEqual(calls,[[100,0,2000],[100,0,1000],[100,1000,2000]]);assert.equal(r.text,'左右');
calls=[];r=await recognizeCascade({...b,x2:30,y2:2000,count:1},async t=>{calls.push(t);return 'あ'.repeat(98);});assert.deepEqual(calls,[100]);
const box=(id,x,y,w=200,h=35)=>({id,x1:x,y1:y,x2:x+w,y2:y+h});
const cols=[box('A',20,20),box('B',20,90),box('C',500,20),box('D',500,90)];
assert.deepEqual(readingOrder([cols[2],cols[1],cols[3],cols[0]],'horizontal').map(x=>x.id),['A','B','C','D']);
assert.deepEqual(readingOrder([box('left',20,20,30,300),box('right',200,20,30,300)],'vertical').map(x=>x.id),['right','left']);
assert.deepEqual(readingOrder([box('bottom',20,110),box('top',20,20)],'auto').map(x=>x.id),['top','bottom']);
console.log('cascade and XY-cut logic tests passed');

import {inclusionFromCSV,cropRect,cropPoint} from './ocr-logic.mjs';
const csv='source,target,source_codepoints,target_codepoints\r\n國,国,U+570B,U+56FD\r\n學,学,U+5B78,U+5B66\r\n"ab",國,x,x\r\n"abc",學,x,x\r\n"x,y","""",x,x\r\n';
const incl=inclusionFromCSV(csv);
assert.equal(incl.size,5);assert.equal(incl.apply('abc ab 國學 x,y'),'学 国 国学 "');
assert.throws(()=>inclusionFromCSV(csv+'國,国,x,x\n'),/duplicate/);
assert.deepEqual(cropPoint(50,45,{left:10,top:20,width:100,height:50},1000,500),{x:400,y:250});
assert.deepEqual(cropRect({x:99.8,y:80},{x:-10,y:10.2},80,100),{x1:0,y1:10,x2:80,y2:80});
assert.equal(cropRect({x:2,y:2},{x:3,y:3},100,100),null);
console.log('inclusion and crop logic tests passed');

import {suppressLines,inkBounds,tcySegments} from './ocr-logic.mjs';
const line=(x1,y1,x2,y2,score,cls)=>({x1,y1,x2,y2,score,cls});
assert.equal(suppressLines([line(0,0,100,20,.8,1),line(1,1,99,19,.9,2),line(0,24,100,44,.9,1)]).length,2);
assert.equal(suppressLines([line(0,0,100,20,.9,1),line(0,0,40,20,.8,2)]).length,2);
function raster(w,h,rects){const a=new Uint8ClampedArray(w*h*4).fill(255);for(const [x1,y1,x2,y2] of rects)for(let y=y1;y<y2;y++)for(let x=x1;x<x2;x++)for(let k=0;k<3;k++)a[(y*w+x)*4+k]=0;return a;}
assert.deepEqual(inkBounds(raster(100,50,[[20,10,80,30]]),100,50),{x1:19,y1:9,x2:81,y2:31});
assert.equal(inkBounds(raster(100,50,[]),100,50),null);
const seg=tcySegments(raster(40,140,[[5,5,35,40],[5,60,16,78],[23,60,34,78],[5,95,35,130]]),40,140);
assert.equal(seg.length,3);assert.equal(seg[1].horizontal,true);assert.equal(seg[0].horizontal,false);
console.log('line dedup, ink bounds and TCY projection tests passed');
