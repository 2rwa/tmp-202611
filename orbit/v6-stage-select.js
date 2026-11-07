(function(root){
'use strict';
const KEY='orbitBreakerV6CompletedStage';
const MAX=999;
function readCompleted(){
 try{
  const value=Number(localStorage.getItem(KEY));
  return Number.isSafeInteger(value)?Math.max(0,Math.min(MAX,value)):0;
 }catch(_){return 0;}
}
function create({engine,world,refresh}){
 const panel=document.getElementById('stage-picker');
 const grid=document.getElementById('stage-grid');
 const trigger=document.getElementById('stage-picker-open');
 const closeButton=document.getElementById('stage-picker-close');
 const summary=document.getElementById('stage-progress');
 let completed=readCompleted();
 const canPlay=stage=>Number.isInteger(stage)&&stage>=1&&stage<=completed+1;
 function render(){
  const fragment=document.createDocumentFragment();
  const count=Math.max(12,Math.min(MAX+1,completed+3));
  for(let stage=1;stage<=count;stage++){
   const cleared=stage<=completed,allowed=canPlay(stage);
   const button=document.createElement('button');
   button.type='button';
   button.className='stage-tile '+(cleared?'is-cleared':allowed?'is-next':'is-locked');
   button.dataset.stage=String(stage);
   button.disabled=!allowed;
   button.setAttribute('aria-label','ステージ'+stage+'：'+(cleared?'クリア済み':allowed?'挑戦可能':'未解放'));
   button.textContent='Lv '+stage;
   if(cleared){
    const mark=document.createElement('small');
    mark.textContent='✓ CLEAR';
    button.appendChild(mark);
   }else if(allowed){
    const mark=document.createElement('small');
    mark.textContent='NEXT';
    button.appendChild(mark);
   }
   if(allowed)button.addEventListener('click',()=>{
    close(false);
    engine.reset(stage);
    engine.start();
    refresh();
    document.getElementById('arena').focus();
   });
   fragment.appendChild(button);
  }
  grid.replaceChildren(fragment);
  summary.textContent='クリア済み：Lv '+completed+' ／ 挑戦可能：Lv '+(completed+1);
  trigger.textContent='ステージ選択'+(completed?'（Lv '+(completed+1)+'解放）':'');
 }
 function close(restoreFocus=true){
  if(panel.hidden)return;
  panel.hidden=true;
  trigger.setAttribute('aria-expanded','false');
  if(restoreFocus)trigger.focus();
 }
 function open(){
  if(!panel.hidden)return;
  if(world.state==='playing')engine.pause();
  refresh();
  render();
  panel.hidden=false;
  trigger.setAttribute('aria-expanded','true');
  closeButton.focus();
 }
 function markCleared(stage){
  if(!Number.isSafeInteger(stage)||stage<=completed||stage<1||stage>MAX)return false;
  completed=stage;
  try{localStorage.setItem(KEY,String(completed));}catch(_){}
  render();
  return true;
 }
 trigger.addEventListener('click',()=>panel.hidden?open():close());
 closeButton.addEventListener('click',close);
 panel.addEventListener('click',e=>{if(e.target===panel)close();});
 render();
 return Object.freeze({markCleared,canPlay,completed:()=>completed,isOpen:()=>!panel.hidden,close});
}
root.OrbitV6StageSelector=Object.freeze({create,readCompleted});
})(globalThis);
