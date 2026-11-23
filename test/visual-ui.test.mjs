import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Store} from '../src/store.mjs';
import {Artwork,imageInfo} from '../src/artwork.mjs';
import {CardRenderer} from '../src/render.mjs';
import {collection} from '../src/collection.mjs';
import {BotApp} from '../src/app.mjs';
import {IconTheme,ThemedTelegram} from '../src/icons.mjs';
import {parseImport,withPity,UserError} from '../src/history.mjs';
import {Telegram,TelegramError} from '../src/telegram.mjs';
const tiny=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64');
const uid='712345678';
const wish=(id,item='10000069',rank='5')=>({id:String(id),item_id:item,name:item==='10000069'?'Tighnari':'Fischl',gacha_type:'301',rank_type:rank,time:'2026-10-29 12:00:00',count:'1',item_type:'Character'});
const parse=rows=>parseImport(Buffer.from(JSON.stringify({info:{version:'v4.2'},hk4e:[{uid,timezone:1,lang:'en-us',list:rows}]})));
const message=(text,id=1,extra={})=>({message:{text,from:{id},chat:{id,type:'private'},message_id:10,...extra}});
const callback=(data,id=1,photo=false)=>({callback_query:{id:'c',from:{id},data,message:{chat:{id,type:'private'},message_id:10,...(photo?{photo:[{file_id:'existing'}]}:{text:'Menu'})}}});
class FakeTelegram{
 constructor(){this.calls=[];this.downloads=0;}
 async call(method,params){this.calls.push({method,...params});return {photo:[{file_id:'rendered-card'}]};}
 photo(params,bytes){return this.call(params.message_id?'editUpload':'photoUpload',{...params,bytes});}
 message(chat,text,extra={}){return this.call('sendMessage',{chat_id:chat,text,...extra});}
 async download(){this.downloads++;return tiny;}
}
function fixture(t){
 const dir=mkdtempSync(join(tmpdir(),'primogemless-art-')),store=new Store(':memory:');t.after(()=>{store.close();rmSync(dir,{recursive:true,force:true});});
 store.import('1',parse([wish(1),wish(2,'10000031','4'),wish(3)]));
 const art=new Artwork(store,dir,{fetcher:async()=>{throw new Error('Offline');}}),theme=new IconTheme(store),raw=new FakeTelegram(),tg=new ThemedTelegram(raw,theme);
 const renderer={models:[],async render(model){this.models.push(model);return {key:'test-'+model.type,png:()=>tiny};}};
 const app=new BotApp({store,telegram:tg,art,renderer,icons:theme,ownerId:'1'});
 const run=async update=>{app.limits.clear();await app.handle(update);};
 return {store,art,theme,raw,tg,renderer,app,run};
}

test('collection groups duplicate characters, preserves latest full-history pity and filters rarities',()=>{
 const rows=withPity([wish(1),wish(2,'10000031','4'),wish(3)]),list=collection(rows);
 assert.equal(list.length,2);assert.equal(list[0].id,'10000069');assert.equal(list[0].copies,2);assert.equal(list[0].pity,'2');
 assert.equal(collection(rows,'c','4')[0].name,'Fischl');assert.equal(collection(rows,'w').length,0);
 assert.throws(()=>collection(rows,'x'),UserError);
});

test('native cards generate PNGs and escape uploaded names without introducing SVG resources',async()=>{
 const renderer=new CardRenderer({source:async()=>null});
 const card=await renderer.render({type:'hit',row:{...withPity([wish(1)])[0],name:'<image href="file:///secret"/>'},patch:'All history',banner:'Character Event',copies:1,index:0,total:1});
 assert.ok(!card.svg.includes('<image href="file:///secret"'));assert.ok(card.svg.includes('&lt;image'));
 assert.deepEqual(imageInfo(card.png()),{mime:'image/png',width:1200,height:650});
});

test('visual navigation reuses photo IDs and edits existing photo messages',async t=>{
 const f=fixture(t);await f.run(message('/start'));assert.equal(f.raw.calls.at(-1).method,'photoUpload');
 await f.run(callback('history',1,true));assert.equal(f.raw.calls.at(-1).method,'editMessageMedia');
 await f.run(callback('g:'+uid+':all:c:a:0',1,true));assert.equal(f.renderer.models.at(-1).type,'grid');
 const row=f.raw.calls.at(-1).reply_markup.inline_keyboard.find(r=>r.some(b=>b.callback_data.startsWith('v:')));assert.equal(row.length,2);
 await f.run(callback('v:'+uid+':all:10000069:0:0:a',1,true));const m=f.renderer.models.at(-1);assert.equal(m.type,'hit');assert.equal(m.copies,2);assert.equal(m.row.pity.count,2);
 const before=f.renderer.models.length;await f.run(callback('v:'+uid+':all:10000069:0:0:a',2,true));assert.equal(f.renderer.models.length,before);assert.match(f.raw.calls.at(-1).caption??f.raw.calls.at(-1).text,/Connect/);
});

test('artwork and per-character premium emoji are owner-only, persistent, and independent of global icons',async t=>{
 const f=fixture(t);f.theme.set('history',{text:'📚'});
 await f.run(callback('artset:10000069',2));assert.match(f.raw.calls.at(-1).text,/Only the bot owner/);assert.equal(f.raw.downloads,0);
 await f.run(callback('artset:10000069'));await f.run(message('',1,{photo:[{file_id:'photo',file_size:tiny.length}]}));
 assert.ok(f.art.override('10000069'));assert.equal(f.raw.downloads,1);assert.equal((await f.art.source('10000069')).custom,true);
 await f.run(callback('artemoji:10000069'));await f.run(message('🌿',1,{entities:[{type:'custom_emoji',offset:0,length:2,custom_emoji_id:'5368324170671202286'}]}));
 await f.run(callback('g:'+uid+':all:c:a:0'));const button=f.raw.calls.at(-1).reply_markup.inline_keyboard.flat().find(b=>b.text==='Tighnari');assert.equal(button.icon_custom_emoji_id,'5368324170671202286');assert.equal(button.ui_icon,undefined);
 assert.equal(f.theme.value('history').text,'📚');assert.equal(f.store.rows('1',uid).length,3);
 await f.run(callback('artreset:10000069',2));assert.ok(f.art.override('10000069'));
 await f.run(callback('artreset:10000069'));assert.equal(f.art.override('10000069'),null);
});

test('unsafe artwork and oversized image dimensions are rejected before saving',t=>{
 const f=fixture(t);assert.throws(()=>f.art.save('10000069',Buffer.from('<svg><script/></svg>')),UserError);
 const huge=Buffer.from(tiny);huge.writeUInt32BE(60000,16);assert.throws(()=>f.art.save('10000069',huge),UserError);
 assert.throws(()=>f.art.save('../../secret',tiny),UserError);assert.equal(f.art.override('10000069'),null);
});

test('per-character button icons and uploaded media both fall back when Telegram rejects custom emoji',async t=>{
 const f=fixture(t),original=f.raw.photo.bind(f.raw);let count=0;
 f.raw.photo=async(params,bytes)=>{if(++count===1)throw new TelegramError(400);return original(params,bytes);};
 await f.tg.photo({chat_id:1,caption:'Card',parse_mode:'HTML',reply_markup:{inline_keyboard:[[{text:'Tighnari',callback_data:'view',ui_icon:{text:'🌿',custom_emoji_id:'5368324170671202286'}}]]}},tiny);
 const button=f.raw.calls.at(-1).reply_markup.inline_keyboard[0][0];assert.equal(button.text,'🌿 Tighnari');assert.equal(button.icon_custom_emoji_id,undefined);assert.equal(button.ui_icon,undefined);
});

test('Telegram multipart uploads use photo or attach://card for edits with caption and keyboard',async()=>{
 const seen=[],tg=new Telegram('123456789:'+'A'.repeat(35),async(url,options)=>{seen.push({url,form:options.body});return {json:async()=>({ok:true,result:{}})};});
 const params={chat_id:1,caption:'Card',parse_mode:'HTML',reply_markup:{inline_keyboard:[]}};
 await tg.photo(params,tiny);assert.ok(seen[0].url.endsWith('/sendPhoto'));assert.equal(seen[0].form.get('photo').size,tiny.length);
 await tg.photo({...params,message_id:42},tiny);assert.ok(seen[1].url.endsWith('/editMessageMedia'));assert.equal(JSON.parse(seen[1].form.get('media')).media,'attach://card');assert.equal(seen[1].form.get('card').size,tiny.length);
});
