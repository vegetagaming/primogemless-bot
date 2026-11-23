import test from 'node:test';
import assert from 'node:assert/strict';
import {withPity,pityLabel,parseImport} from '../src/history.mjs';
import {Store} from '../src/store.mjs';
import {BotApp} from '../src/app.mjs';

const uid='712345678';
const row=(i,rank='3',type='301',time='2026-09-22 22:59:00')=>({id:String(9007199254740993000n+BigInt(i)),gacha_type:type,rank_type:rank,count:'1',time,item_id:rank==='5'?'10000069':rank==='4'?'10000031':'12301',name:rank==='5'?'Tighnari':rank==='4'?'Fischl':'Slingshot',item_type:rank==='3'?'Weapon':'Character'});
const parsed=rows=>parseImport(Buffer.from(JSON.stringify({info:{version:'v4.2'},hk4e:[{uid,timezone:1,lang:'en-us',list:rows}]})));

test('hit pity counts the winning pull, shares 301/400, and handles exact large IDs',()=>{
 const rows=[row(0,'5'),...Array.from({length:72},(_,i)=>row(i+1)),row(73,'5','400')];
 const result=withPity(rows.reverse());
 assert.equal(pityLabel(result.at(-1)),'73 pity');
 assert.equal(result.at(-1).pity.anchored,true);
 assert.equal(pityLabel(result[0]),'1+ pity');
 assert.equal(rows[0].pity,undefined);
});

test('four-star pity includes intervening five-stars and resets on four-star weapons too',()=>{
 const rows=[{...row(0,'4'),item_type:'Weapon',item_id:'15401',name:'Favonius Warbow'},row(1),row(2,'5'),row(3),row(4),row(5,'4')];
 assert.equal(pityLabel(withPity(rows).at(-1)),'5 pity');
 const split=withPity([row(0,'4'),row(1,'4','302'),row(2,'4','400')]);
 assert.deepEqual(split[1].pity,{count:1,anchored:false});
 assert.deepEqual(split[2].pity,{count:1,anchored:true});
});

class Telegram {
 constructor(){this.calls=[];}
 async call(method,data){this.calls.push({method,...data});return {photo:[{file_id:'cached-art'}]};}
 message(chat,text,extra={}){return this.call('sendMessage',{chat_id:chat,text,...extra});}
}
function fixture(t,rows){const store=new Store(':memory:');t.after(()=>store.close());store.import('1',parsed(rows));const tg=new Telegram(),app=new BotApp({telegram:tg,store});return {store,tg,app};}
function callback(data,photo=false,id=1){return {callback_query:{id:'c',from:{id},data,message:{message_id:20,chat:{id,type:'private'},...(photo?{photo:[{file_id:'old-art'}]}:{text:'Previous menu'})}}};}

test('patch card retains earlier-patch pity and puts rarity/pity columns below the photo',async t=>{
 const f=fixture(t,[row(0,'4'),row(1),row(2),row(3),row(4),row(5,'4','400','2026-09-22 23:00:00')]);
 await f.app.handle(callback('c:'+uid+':7.1:0:4'));
 const sent=f.tg.calls.at(-1);
 assert.equal(sent.method,'sendPhoto');assert.match(sent.photo,/^https:\/\/enka\.network\/ui\//);
 assert.match(sent.caption,/<b>Fischl<\/b>\n<pre>RARITY    PITY\n4★        5<\/pre>/);
 assert.match(sent.caption,/Version 7.1/);
 assert.equal(f.app.group('1',uid,'7.1').rows.length,1);
 assert.equal(f.app.group('1',uid,'7.1').rows[0].pity.count,5);
});

test('All history contains all patches and rarities, totals, and both image galleries',async t=>{
 const f=fixture(t,[row(0,'5'),row(1,'4'),row(2,'3','200','2026-09-22 23:00:00')]);
 await f.app.history(1,'1');const menu=f.tg.calls.at(-1);
 assert.ok(menu.reply_markup.inline_keyboard.flat().some(b=>b.callback_data==='p:'+uid+':all'));
 assert.match(menu.text,/<b>3<\/b> total wishes/);
 await f.app.patch(1,'1',uid,'all');const total=f.tg.calls.at(-1);
 assert.match(total.text,/ALL HISTORY/);assert.match(total.text,/<b>3<\/b> wishes · <b>1<\/b> five-stars · <b>1<\/b> four-stars/);assert.doesNotMatch(total.text,/three-stars/);
 for(const rank of ['4','5'])assert.ok(total.reply_markup.inline_keyboard.flat().some(b=>b.callback_data==='g:'+uid+':all:c:'+rank+':0'));
 await f.app.wishes(1,'1',uid,'all',0);assert.match(f.tg.calls.at(-1).text,/Fischl/);
});

test('photo pagination edits the existing card and rejects invalid rarity or foreign ownership',async t=>{
 const f=fixture(t,[row(0,'4'),row(1,'4')]);
 await f.app.handle(callback('c:'+uid+':all:0:4',true));
 const edited=f.tg.calls.at(-1);assert.equal(edited.method,'editMessageMedia');assert.equal(edited.media.type,'photo');
 assert.ok(edited.reply_markup.inline_keyboard.flat().some(b=>b.callback_data==='c:'+uid+':all:1:4'));
 f.app.limits.clear();await f.app.handle(callback('c:'+uid+':all:0:4',false,2));assert.match(f.tg.calls.at(-1).text,/Connect/);
 f.app.limits.clear();await f.app.handle(callback('c:'+uid+':all:0:3'));assert.match(f.tg.calls.at(-1).text,/four-star or five-star/);
});
