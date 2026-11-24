import test from 'node:test';
import assert from 'node:assert/strict';
import {Store} from '../src/store.mjs';
import {BotApp} from '../src/app.mjs';
import {CardRenderer} from '../src/render.mjs';
import {items} from '../src/artwork.mjs';
const uid='712345678';
test('owned and pulled character galleries paginate 18 without omissions, preserve details and reject foreign accounts',async t=>{
 const store=new Store(':memory:');t.after(()=>store.close());
 const chars=items.filter(x=>x.kind==='character').slice(0,20).map((x,i)=>({id:x.id,name:x.name,rank:i%2?4:5,level:90,constellation:i%7,weapon:null}));
 const wishes=chars.map((c,i)=>({id:String(1000+i),name:c.name,item_id:c.id,item_type:'Character',rank_type:String(c.rank),gacha_type:'301',count:'1',time:'2026-11-01 12:00:'+String(i).padStart(2,'0')}));
 store.import('1',{accounts:[{uid,timezone:1,lang:'en-us',list:wishes}]});store.saveRoster('1',uid,chars);
 const models=[],calls=[],app=new BotApp({store,renderer:{render:async m=>{models.push(m);return {key:'fixture-'+models.length,png:()=>Buffer.from([1])};}},telegram:{call:async()=>({}),photo:async p=>{calls.push(p);return {};}}});
 await app.roster.characters('1','1');assert.equal(models.at(-1).items.length,18);assert.equal(models.at(-1).pages,2);const ownedFirst=models.at(-1).items;
 const buttons=calls.at(-1).reply_markup.inline_keyboard.flat();assert.equal(buttons.filter(b=>b.callback_data.startsWith('od:')).length,18);assert.ok(buttons.some(b=>b.callback_data==='oc:'+uid+':a:1'));
 await app.roster.characters('1','1',uid,'a',1);assert.equal(models.at(-1).items.length,2);assert.equal(new Set([...ownedFirst,...models.at(-1).items].map(c=>c.id)).size,20);
 await app.grid('1','1',uid,'all','c','a',0);const pulledFirst=models.at(-1).items;assert.equal(pulledFirst.length,18);assert.equal(models.at(-1).pages,2);
 assert.equal(calls.at(-1).reply_markup.inline_keyboard.flat().filter(b=>b.callback_data.startsWith('v:')).length,18);
 await app.grid('1','1',uid,'all','c','a',1);assert.equal(models.at(-1).items.length,2);assert.equal(new Set([...pulledFirst,...models.at(-1).items].map(c=>c.id)).size,20);
 const id=models.at(-1).items[0].id;await app.itemCard('1','1',uid,'all',id,0,1,'a');assert.ok(calls.at(-1).reply_markup.inline_keyboard.flat().some(b=>b.callback_data==='g:'+uid+':all:c:a:1'));
 await app.roster.characters('1','1',uid,'4',0);assert.equal(models.at(-1).items.length,10);assert.equal(models.at(-1).pages,1);
 await assert.rejects(app.grid('1','1',uid,'all','c','a',2),/unavailable/);await assert.rejects(app.roster.characters('2','2',uid),/Connect your Genshin/);
 await assert.rejects(app.grid('2','2',uid,'all','c','a',0),/Connect your Genshin/);
});
test('character gallery renders a portrait PNG with all 18 items, escaped names, constellations and colored pity',async()=>{
 const renderer=new CardRenderer({source:async()=>null}),entries=Array.from({length:18},(_,i)=>({id:String(10000001+i),name:'Character <'+i+'>',rank:i%2?'4':'5',level:90,badge:'C'+i%7,copies:i+1,pity:['25','5','73','5','42','5'][i%6]}));
 for(const type of ['ownedgrid','grid']){
  const card=await renderer.render({type,kind:'c',title:'Test gallery',subtitle:'Synthetic',items:entries,page:0,pages:2});const png=card.png();assert.equal(png.readUInt32BE(16),1200);assert.ok(png.readUInt32BE(20)>1200);
  for(let i=0;i<18;i++)assert.ok(card.svg.includes('Character &lt;'+i+'&gt;'));assert.match(card.svg,/PAGE 1 \/ 2/);
  if(type==='ownedgrid'){assert.match(card.svg,/>C6</);assert.match(card.svg,/Lv. 90/);assert.doesNotMatch(card.svg,/LATEST PITY/);}
  else{assert.match(card.svg,/LATEST PITY/);for(const color of ['#76dba1','#ff858a','#f3d275','#c3a2f3'])assert.ok(card.svg.includes(color));}
 }
});
