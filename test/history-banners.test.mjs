import test from 'node:test';
import assert from 'node:assert/strict';
import {Store} from '../src/store.mjs';
import {BotApp} from '../src/app.mjs';
import {bannerGroup,historyBanner} from '../src/history-banners.mjs';
import {withPity,UserError} from '../src/history.mjs';
import {CardRenderer} from '../src/render.mjs';
const uid='712345678';
const wish=(i,type,weapon=false,rank='4')=>({id:String(9007199254740993000n+BigInt(i)),gacha_type:type,rank_type:rank,count:'1',time:'2026-09-22 23:00:'+String(i%60).padStart(2,'0'),item_id:weapon?'15401':'10000069',item_type:weapon?'Weapon':'Character',name:weapon?'Favonius Warbow':'Tighnari'});
const rows=[{...wish(1,'301'),time:'2026-09-22 22:59:00'},wish(2,'400',true,'3'),wish(3,'400',true),wish(4,'301',false,'5'),wish(5,'200',true),wish(6,'200',false,'5'),wish(7,'302',true,'5'),wish(8,'302'),wish(9,'500',false,'5'),wish(10,'500',true),wish(11,'100'),wish(12,'200',true,'3')];
const ids=n=>n.map(i=>wish(i,'301').id);
function fixture(t,data=rows){
 const store=new Store(':memory:');t.after(()=>store.close());store.import('1',{accounts:[{uid,timezone:1,lang:'en-us',list:data}]});
 const models=[],calls=[],telegram={message:async(chat,text,p)=>{calls.push({text,...p});return {};},photo:async p=>{calls.push(p);return {};},call:async(method,p)=>{calls.push({method,...p});return {};}};
 const renderer={render:async m=>{models.push(m);return {key:'fixture-'+models.length,png:()=>Buffer.from([1])};}};
 const app=new BotApp({store,telegram,renderer});
 const run=async data=>{app.limits.clear();await app.handle({callback_query:{id:'click',from:{id:1},data,message:{message_id:1,chat:{id:1,type:'private'},photo:[{file_id:'old'}]}}});};
 return {store,app,models,calls,run,buttons:()=>calls.at(-1).reply_markup.inline_keyboard.flat()};
}

test('banner filters combine both character-event types and separate standard, weapon, regional and beginner pools without resetting pity',()=>{
 const group={rows:withPity(rows)};
 for(const [filter,expected] of [['301',[1,2,3,4]],['302',[7,8]],['200',[5,6,12]],['500',[9,10]],['100',[11]]]){
  assert.deepEqual(bannerGroup(group,filter).rows.map(r=>r.id),ids(expected));
 }
 const limited=bannerGroup(group,'301');assert.equal(limited.total,4);assert.equal(limited.five,1);assert.equal(limited.four,2);
 assert.deepEqual(limited.rows.find(r=>r.id===wish(3,'400').id).pity,{count:2,anchored:true});
 assert.equal(bannerGroup(group).total,12);assert.throws(()=>bannerGroup(group,'400'),UserError);
 assert.equal(historyBanner('c').id,'a');assert.equal(historyBanner('w').id,'a');
});

test('banner UI scopes totals and rarity to the patch, includes both item kinds, preserves prior-patch pity and rejects foreign pulls',async t=>{
 const f=fixture(t);
 await f.run('g:'+uid+':7.1:301:a:0');const model=f.models.at(-1);
 assert.equal(model.bannerLabel,'Limited Character Banner');assert.equal(model.items.length,2);assert.equal(model.kind,'a');assert.equal(model.subtitle,'3 wishes  /  1 five-stars  /  1 four-stars');
 assert.deepEqual(model.items.map(x=>x.pullId),ids([4,3]));assert.equal(model.items[1].pity,'2');assert.equal(model.items[1].kind,'w');
 const buttons=f.buttons();for(const label of ['All banners','Limited Character Banner','Limited Weapon Banner','Standard Banner','Regional Banner'])assert.ok(buttons.some(b=>b.text===label));
 assert.ok(!buttons.some(b=>['Characters','Weapons'].includes(b.text)));assert.ok(buttons.some(b=>b.text==="Beginners' Wish"));
 assert.ok(buttons.some(b=>b.callback_data==='g:'+uid+':7.1:301:4:0'));assert.ok(buttons.some(b=>b.text==='Limited Character Banner'&&b.style==='primary'));
 const first=buttons.find(b=>b.callback_data.startsWith('hit:'));await f.run(first.callback_data);
 assert.equal(f.models.at(-1).row.id,wish(4,'301').id);assert.ok(f.buttons().some(b=>b.callback_data==='g:'+uid+':7.1:301:a:0'));
 await assert.rejects(f.app.pullCard('1','1',uid,'all',wish(5,'200').id,'301','a'),/unavailable/);
 await assert.rejects(f.app.grid('2','2',uid,'all','301','a',0),/Connect/);
 await f.run('g:'+uid+':all:200:5:0');assert.deepEqual(f.models.at(-1).items.map(x=>x.pullId),ids([6]));assert.equal(f.models.at(-1).subtitle,'3 wishes  /  1 five-stars  /  1 four-stars');
 await f.run('g:'+uid+':all:302:a:0');assert.deepEqual(f.models.at(-1).items.map(x=>x.kind),['c','w']);
 await f.run('g:'+uid+':all:500:a:0');assert.deepEqual(f.models.at(-1).items.map(x=>x.pullId),ids([10,9]));assert.match(f.models.at(-1).bannerLabel,/Chronicled Wish/);
 await f.run('g:'+uid+':all:a:a:0');assert.ok(f.buttons().some(b=>b.text==="Beginners' Wish"));
 assert.equal(f.store.rows('1',uid).length,12);
});

test('banner and rarity survive grid pagination, text pagination, exact-pull navigation and empty selections',async t=>{
 const f=fixture(t,[...Array.from({length:22},(_,i)=>wish(i+20,i%2?'400':'301',true)),wish(1,'200')]);
 await f.run('g:'+uid+':all:301:4:0');assert.equal(f.models.at(-1).items.length,18);assert.ok(!f.buttons().some(b=>b.text==="Beginners' Wish"));
 const next=f.buttons().find(b=>b.text==='Next →');assert.equal(next.callback_data,'g:'+uid+':all:301:4:1');await f.run(next.callback_data);assert.equal(f.models.at(-1).items.length,4);
 const hit=f.buttons().find(b=>b.callback_data.startsWith('hit:'));await f.run(hit.callback_data);assert.ok(f.buttons().some(b=>b.callback_data==='g:'+uid+':all:301:4:1'));
 await f.run('g:'+uid+':all:301:4:1');await f.run(f.buttons().find(b=>b.text==='Text list').callback_data);assert.match(f.calls.at(-1).caption??f.calls.at(-1).text,/Limited Character Banner/);assert.match(f.calls.at(-1).caption??f.calls.at(-1).text,/22 shown of 22 total/);
 const older=f.buttons().find(b=>b.text==='Older →');assert.equal(older.callback_data,'w:'+uid+':all:1:301:4');await f.run(older.callback_data);assert.match(f.calls.at(-1).caption??f.calls.at(-1).text,/2\/3/);assert.ok(f.buttons().some(b=>b.callback_data==='g:'+uid+':all:301:4:0'));
 await f.run('g:'+uid+':all:500:a:0');assert.equal(f.models.at(-1).items.length,0);assert.equal(f.models.at(-1).subtitle,'0 wishes  /  0 five-stars  /  0 four-stars');assert.match(f.calls.at(-1).caption,/No saved/);
 const card=await new CardRenderer({source:async()=>null}).render(f.models.at(-1));assert.match(card.svg,/REGIONAL BANNER · CHRONICLED WISH/);assert.ok(card.png().length>1000);
 await f.run('g:'+uid+':all:w:a:2');assert.equal(f.models.at(-1).bannerLabel,'All banners');assert.equal(f.models.at(-1).items.length,5);
 for(const b of f.buttons())if(b.callback_data)assert.ok(Buffer.byteLength(b.callback_data)<=64);
 assert.equal(f.store.rows('1',uid).length,23);
});
