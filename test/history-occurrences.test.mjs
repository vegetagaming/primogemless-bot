import test from 'node:test';
import assert from 'node:assert/strict';
import {Store} from '../src/store.mjs';
import {BotApp} from '../src/app.mjs';
import {collection} from '../src/collection.mjs';
import {withPity,UserError} from '../src/history.mjs';
import {CardRenderer} from '../src/render.mjs';
const uid='712345678';
const wish=(i,weapon=false)=>({id:String(9007199254740993000n+BigInt(i)),gacha_type:'301',rank_type:weapon?'4':'5',count:'1',time:'2026-11-24 12:00:'+String(i%60).padStart(2,'0'),item_id:weapon?'15401':'10000069',item_type:weapon?'Weapon':'Character',name:weapon?'Favonius Warbow':'Tighnari'});
const data=rows=>({accounts:[{uid,timezone:1,lang:'en-us',list:rows}]});

test('mixed history lists every occurrence with its own exact ID and pity, including weapons without artwork',()=>{
 const rows=withPity([wish(0),wish(1,true),wish(2),{...wish(3,true),item_id:'',name:'Unknown weapon'},{...wish(4,true),rank_type:'3'}]);
 const list=collection(rows);
 assert.equal(list.length,4);assert.deepEqual(list.map(x=>x.pullId),[3,2,1,0].map(i=>wish(i).id));
 assert.deepEqual(list.filter(x=>x.id==='10000069').map(x=>x.pity),['2','1+']);
 assert.equal(collection(rows,'w').length,2);assert.equal(collection(rows,'c').length,2);assert.equal(collection(rows,'a','5').length,2);
 assert.equal(list[0].name,'Unknown weapon');assert.equal(list[0].id,'');
});

test('mixed pages preserve duplicate tiles and exact clicked pulls after a sync adds newer copies',async t=>{
 const store=new Store(':memory:');t.after(()=>store.close());store.import('1',data(Array.from({length:21},(_,i)=>wish(i,i%2===1))));
 const calls=[],models=[],telegram={call:async(method,p)=>{calls.push({method,...p});return {};},photo:async p=>{calls.push(p);return {};},message:async(chat,text,p)=>{calls.push({text,...p});return {};}};
 const renderer={render:async m=>{models.push(m);return {key:'mock-'+models.length,png:()=>Buffer.from([1])};}},app=new BotApp({store,telegram,renderer});
 await app.patch('1','1',uid,'all');const first=models.at(-1);assert.equal(first.kind,'a');assert.equal(first.items.length,18);assert.equal(first.pages,2);assert.ok(first.items.some(x=>x.kind==='w'));assert.ok(first.items.filter(x=>x.kind==='c').length>1);
 const buttons=calls.at(-1).reply_markup.inline_keyboard.flat(),hits=buttons.filter(b=>b.callback_data.startsWith('hit:'));
 assert.equal(hits.length,18);assert.equal(new Set(hits.map(b=>b.callback_data)).size,18);for(const b of buttons)if(b.callback_data)assert.ok(Buffer.byteLength(b.callback_data)<=64);
 await app.grid('1','1',uid,'all','a','a',1);assert.equal(models.at(-1).items.length,3);assert.equal(new Set([...first.items,...models.at(-1).items].map(x=>x.pullId)).size,21);
 const original=first.items[0];store.import('1',data([wish(100)]));
 await app.handle({callback_query:{id:'click',from:{id:1},data:hits[0].callback_data,message:{message_id:1,chat:{id:1,type:'private'},photo:[{file_id:'old'}]}}});
 assert.equal(models.at(-1).row.id,original.pullId);assert.equal(models.at(-1).row.pity.count,original.row.pity.count);assert.notEqual(models.at(-1).row.id,wish(100).id);
 const newest=calls.at(-1).reply_markup.inline_keyboard.flat().find(b=>b.text==='← Newer');assert.ok(newest.callback_data.includes(wish(100).id));
 await assert.rejects(app.pullCard('2','2',uid,'all',original.pullId,'a','a'),/Connect/);
 await assert.rejects(app.pullCard('1','1',uid,'all',original.pullId,'w','a'),/unavailable/);
 await assert.rejects(app.pullCard('1','1',uid,'all',original.pullId,'a','4'),/unavailable/);
 await assert.rejects(app.pullCard('1','1',uid,'all','invalid','a','a'),UserError);
 assert.equal(store.rows('1',uid).length,22);
});

test('mixed portrait image labels per-pull pity and dates without merging repeated artwork',async()=>{
 const entries=collection(withPity([wish(0),wish(1,true),wish(2)]));
 const card=await new CardRenderer({source:async()=>null}).render({type:'grid',kind:'a',title:'History',subtitle:'Synthetic test data',items:entries,page:0,pages:1});
 assert.equal((card.svg.match(/Tighnari/g)??[]).length,2);assert.match(card.svg,/Favonius Warbow/);assert.match(card.svg,/CHARACTER &amp; WEAPON WISHES/);assert.match(card.svg,/PITY AT PULL/);assert.match(card.svg,/2026-11-24 12:00/);assert.doesNotMatch(card.svg,/LATEST PITY/);
 const png=card.png();assert.equal(png.readUInt32BE(16),1200);assert.ok(png.readUInt32BE(20)>1200);
});
