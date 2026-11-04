'use strict';
const fs = require('node:fs');
const crypto = require('node:crypto');
const vm = require('node:vm');

const archives = [
  {name:'v1-classic', sources:['packed/archive/v1.part00','packed/archive/v1.part01','packed/archive/v1.part02'], sha:'b7c914f37c4f745c533e87b31580b00dea3fc911087a867c74ec111ce6d385d9'},
  {name:'v2-shapes', sources:['packed/archive/v2.part00','packed/archive/v2.part01','packed/archive/v2.part02','packed/archive/v2.part03'], sha:'e634fa601255797e922a4ea119272eb3ccca5035205089aea632e01897fd9248'},
  {name:'v3-reflections', sources:['packed/archive/v3.part00','packed/archive/v3.part01','packed/archive/v3.part02','packed/archive/v3.part03','packed/archive/v3.part04'], sha:'00c5539a4a9ccc0ade17c9d733bb522b354ac284f46cc13d471cdd15d91c9c36'},
  {name:'v4-speed', sources:['packed/game.html.part0','packed/game.html.part1','packed/game.html.part2','packed/game.html.part3'], sha:'e47adb8ccc1a5b2c7b4691607eb1f8ab296aaa8dd90eecbdc831fed58cdcd0da'}
];

fs.mkdirSync('games',{recursive:true});
for(const entry of archives){
  const pieces=entry.sources.map(p=>fs.readFileSync(p));
  let output=Buffer.concat(pieces);
  // Conversation file parsers remove the final newline; restore it once.
  if(output.at(-1)!==10) output=Buffer.concat([output, Buffer.from('\n')]);
  const sha=crypto.createHash('sha256').update(output).digest('hex');
  if(sha!==entry.sha) throw Error(entry.name+': SHA-256 mismatch '+sha+' != '+entry.sha);
  const html=output.toString('utf8');
  if(!html.toLowerCase().startsWith('<!doctype html>')||!html.includes('</html>'))throw Error(entry.name+': malformed HTML');
  const m=html.match(/<script>([\s\S]*?)<\/script>/);
  if(!m)throw Error(entry.name+': missing game script');
  new vm.Script(m[1],{filename:entry.name+'.js'});
  const dest='games/'+entry.name+'.html';
  fs.writeFileSync(dest,output);
  console.log('BUILT '+dest+' '+output.length+' bytes sha256='+sha);
}
