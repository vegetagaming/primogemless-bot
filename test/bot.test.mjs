import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {parseImport,stats,UserError,sortWishes} from '../src/history.mjs';
import {Store} from '../src/store.mjs';
import {BotApp,TUTORIAL,PRIVACY} from '../src/app.mjs';
import {Telegram,TelegramError} from '../src/telegram.mjs';

const wish=(id,rank='3',type='301',name='Slingshot')=>({id:String(id),gacha_type:type,item_id:name==='Tighnari'?'10000069':'12301',name,item_type:name==='Tighnari'?'Character':'Weapon',rank_type:rank,time:'2026-10-29 12:34:56',count:'1'});
const file=(rows=[wish('9007199254740993001')],uid='712345678')=>({info:{version:'v4.2'},hk4e:[{uid,timezone:1,lang:'en-us',list:rows}]});
const parse=data=>parseImport(Buffer.from(JSON.stringify(data)));
function fixture(t) {const s=new Store(':memory:');t.after(()=>s.close());return s;}

test('exact large IDs, BOM, deduplication and round-trip',t=>{
 const s=fixture(t),input=file([wish('9007199254740993001'),wish('9007199254740993001')]);
 const p=parseImport(Buffer.from('\uFEFF'+JSON.stringify(input)));
 assert.equal(p.inputCount,2);assert.equal(p.accounts[0].list.length,1);
 assert.equal(s.import('1',p).added,1);assert.equal(s.import('1',p).duplicates,1);
 assert.equal(parse(s.export('1')).accounts[0].list[0].id,'9007199254740993001');
 assert.equal(sortWishes([wish('100'),wish('99')])[0].id,'99');
});
test('rejects unsafe numeric IDs, credentials and invalid dates',()=>{
 for(const mutate of [d=>d.hk4e[0].list[0].id=9007199254740993000,d=>d.hk4e[0].list[0].time='2026-02-30 12:34:56',d=>d.info.authkey='secret',d=>d.hk4e[0].uid='../x']) {
  const data=file();mutate(data);assert.throws(()=>parse(data),UserError);
 }
 const data=file();data.hk4e[0].list[0].unused='arbitrary';assert.equal(parse(data).accounts[0].list[0].unused,undefined);
});
test('supports legacy UIGF without exposing unrelated top-level fields',()=>{
 const data={info:{uid:'712345678',uigf_version:'v2.3',lang:'en-us'},list:[wish('10')]};
 assert.equal(parse(data).accounts[0].timezone,1);
});
test('two Telegram users with the same Genshin UID are isolated',t=>{
 const s=fixture(t);s.import('1',parse(file([wish('11')])));s.import('2',parse(file([wish('22')])));
 assert.deepEqual(s.rows('1','712345678').map(r=>r.id),['11']);
 assert.deepEqual(s.export('2').hk4e[0].list.map(r=>r.id),['22']);
 assert.throws(()=>s.select('3','712345678'),UserError);
});
test('conflicting import rolls back all new rows and accounts',t=>{
 const s=fixture(t);s.import('1',parse(file([wish('11')])));
 const d=file([wish('12'),wish('11','5')]);d.hk4e.unshift({...d.hk4e[0],uid:'723456789',list:[wish('19')]});
 assert.throws(()=>s.import('1',parse(d)),UserError);
 assert.equal(s.accounts('1').length,1);assert.equal(s.rows('1','712345678').length,1);
});
test('pity combines 301 and 400 while keeping weapon separate',()=>{
 const rows=[wish('1','5'),wish('2','3','400'),wish('3','4'),wish('4','5','302')];
 const g=stats(rows);assert.equal(g.find(x=>x.type==='301').sinceFive,2);assert.equal(g.find(x=>x.type==='302').sinceFive,0);
 assert.equal(stats([wish('1')]).find(x=>x.type==='301').previousFiveFound,false);
});
test('confirmed deletion is scoped, expires, and can be cancelled',t=>{
 const s=fixture(t);s.import('1',parse(file()));s.import('2',parse(file()));
 const nonce=s.confirmation('1');assert.throws(()=>s.deleteUser('2',nonce),UserError);
 s.cancelDelete('1');assert.throws(()=>s.deleteUser('1',nonce),UserError);
 s.deleteUser('1',s.confirmation('1'));assert.equal(s.accounts('1').length,0);assert.equal(s.accounts('2').length,1);
});
test('SQLite preserves records across process-style reopen',()=>{
 const dir=mkdtempSync(join(tmpdir(),'wish-bot-'));
 try {const path=join(dir,'db.sqlite');let s=new Store(path);s.import('1',parse(file()));s.close();s=new Store(path);assert.equal(s.rows('1','712345678').length,1);s.close();}
 finally{rmSync(dir,{recursive:true,force:true});}
});
class FakeTelegram {
 constructor(){this.calls=[];this.bytes=Buffer.from(JSON.stringify(file([wish('11','5','301','Tighnari')])));}
 async call(method,params){this.calls.push({method,...params});return method==='sendPhoto'?{photo:[{file_id:'reusable-image-id'}]}:{};}
 message(chat,text,extra={}){return this.call('sendMessage',{chat_id:chat,text,...extra});}
 document(chat,bytes,filename,caption){return this.call('sendDocument',{chat_id:chat,bytes,filename,caption});}
 async download(){return this.bytes;}
}
function message(text,id=1,extra={}) {return {message:{message_id:10,from:{id},chat:{id,type:'private'},text,...extra}};}
test('private chat flow imports, shows cards, exports, and rejects foreign callbacks',async t=>{
 const store=fixture(t),tg=new FakeTelegram(),app=new BotApp({telegram:tg,store});
 const run=async update=>{app.limits.clear();await app.handle(update);};
 await run(message('/start'));assert.match(tg.calls.at(-1).text,/P R I M/);
 await run(message('',1,{document:{file_id:'f',file_name:'message.txt',file_size:100}}));
 assert.equal(store.rows('1','712345678').length,1);
 await run(message('/cards'));assert.equal(tg.calls.at(-1).method,'sendPhoto');assert.match(tg.calls.at(-1).photo,/^https:\/\/enka\.network\/ui\//);
 await run(message('/cards'));assert.equal(tg.calls.at(-1).photo,'reusable-image-id');
 await run(message('/export'));assert.equal(parse(tg.calls.at(-1).bytes&&JSON.parse(tg.calls.at(-1).bytes)).accounts[0].list.length,1);
 await run({callback_query:{id:'cb',from:{id:2},message:message('').message,data:'c:712345678:0'}});
 const n=tg.calls.length;
 await run(message('/history',2,{chat:{id:-10,type:'group'}}));assert.equal(tg.calls.length,n);
 await run(message('/pity',2));assert.match(tg.calls.at(-1).text,/Connect/);
 await run({callback_query:{id:'cb',from:{id:2},message:message('',2).message,data:'c:712345678:0'}});assert.match(tg.calls.at(-1).text,/Connect/);
});
test('secret upload is rejected and not retained',async t=>{
 const store=fixture(t),tg=new FakeTelegram(),app=new BotApp({telegram:tg,store});tg.bytes=Buffer.from('{"authkey":"example"}');
 await app.handle(message('',1,{document:{file_id:'f',file_name:'data.json'}}));
 assert.equal(store.accounts('1').length,0);assert.ok(tg.calls.some(c=>c.method==='deleteMessage'));
});
test('a queued document immediately after /start is imported',async t=>{
 const store=fixture(t),tg=new FakeTelegram(),app=new BotApp({telegram:tg,store});
 await app.handle(message('/start'));
 await app.handle(message('',1,{document:{file_id:'f',file_name:'message.txt'}}));
 assert.equal(store.rows('1','712345678').length,1);
 assert.match(tg.calls.at(-1).text,/History saved/);
});
test('Telegram client strips network exception details and rejects file traversal',async()=>{
 const token='123456789:'+ 'A'.repeat(35);
 let t=new Telegram(token,async()=>{throw new Error('https://secret/path');});
 await assert.rejects(t.call('getMe'),e=>e instanceof TelegramError&&!e.message.includes('secret'));
 t=new Telegram(token,async()=>({json:async()=>({ok:true,result:{file_path:'../secret'}})}));
 await assert.rejects(t.download('f'),e=>e.code==='INVALID_FILE_PATH');
});
test('tutorial and privacy fit Telegram text limits',()=>{assert.ok(TUTORIAL.length<4096);assert.ok(PRIVACY.length<4096);});
