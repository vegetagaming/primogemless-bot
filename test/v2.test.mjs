import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,createPublicKey,publicEncrypt,createCipheriv,createHmac,constants} from 'node:crypto';
import {Store} from '../src/store.mjs';
import {Vault} from '../src/vault.mjs';
import {Hoyo,HoyoError} from '../src/hoyo.mjs';
import {SyncService} from '../src/sync.mjs';
import {BotApp,COMMANDS,MENU} from '../src/app.mjs';
import {parseImport,UserError} from '../src/history.mjs';
import {parseUIAF,exportUIAF,catalogue} from '../src/achievements.mjs';
import {patchFor,patchGroups,parseAnnouncements} from '../src/patches.mjs';
import {zipFiles} from '../src/zip.mjs';
const cookies={account_id_v2:'12345',account_mid_v2:'test-mid',cookie_token_v2:'test-private-cookie',ltoken_v2:'test-ltoken'};
const role={uid:'712345678',region:'os_euro',timezone:1,lang:'en-us'};
const row={id:'9007199254740993010',gacha_type:'301',rank_type:'5',count:'1',item_id:'10000069',name:'Tighnari',item_type:'Character',time:'2026-10-29 12:34:56'};
const parsed=()=>parseImport(Buffer.from(JSON.stringify({info:{version:'v4.2'},hk4e:[{...role,list:[row]}]})));
function fixture(t){const store=new Store(':memory:');t.after(()=>store.close());return store;}
function envelope(vault,owner,config,session=cookies){
 const keys=randomBytes(64),iv=randomBytes(16),cipher=createCipheriv('aes-256-cbc',keys.subarray(0,32),iv),data=Buffer.concat([cipher.update(JSON.stringify(session)),cipher.final()]).toString('base64'),iv64=iv.toString('base64');
 return {kind:'primogemless-connect-v1',challenge:config.challenge,key:publicEncrypt({key:createPublicKey(vault.privateKey),oaepHash:'sha256',padding:constants.RSA_PKCS1_OAEP_PADDING},keys).toString('base64'),iv:iv64,data,mac:createHmac('sha256',keys.subarray(32)).update(`${owner}.${config.challenge}.${iv64}.${data}`).digest('base64')};
}
test('exactly four public commands and four home buttons',()=>{
 assert.deepEqual(COMMANDS.map(x=>x.command),['tutorial','history','primogems','characters']);assert.equal(MENU.inline_keyboard.flat().length,4);
});
test('patch boundaries convert server time to UTC; unknown dates stay unclassified',()=>{
 assert.equal(patchFor({...row,time:'2026-09-22 22:59:59'},1).id,'7.0');
 assert.equal(patchFor({...row,time:'2026-09-22 23:00:00'},1).id,'7.1');
 assert.equal(patchFor({...row,time:'2027-01-01 01:00:00'},1).id,'unmapped');
 assert.equal(patchGroups([row],1)[0].id,'7.1');
});
test('official announcement parser ignores unrelated notices and uses maintenance start',()=>{
 const data={list:[{ann_id:1,title:'Version 7.3 Update Maintenance Preview',content:'Maintenance compensation date 2026/12/01. We will begin update maintenance on &lt;t&gt;2026/12/16 06:00&lt;/t&gt;.'},{title:'Version 99.0 free rewards',content:'maintenance begins 2026/12/15 06:00'}]};
 const p=parseAnnouncements(data,Date.parse('2026-11-23'));assert.equal(p.length,1);assert.equal(p[0].start,'2026-12-15T22:00:00.000Z');
});
test('vault binds encrypted storage to its owner and never stores a raw session',t=>{
 const store=fixture(t),vault=new Vault(store,randomBytes(32));vault.save('1',cookies);assert.deepEqual(vault.load('1'),cookies);
 const stored=store.connection('1',true).secret;assert.ok(!stored.includes(cookies.cookie_token_v2));assert.equal(store.connection('1').secret,undefined);
 assert.throws(()=>vault.open(stored,'hoyo:2'));assert.throws(()=>new Vault(store,randomBytes(32)));
});
test('connection envelopes reject tampering, another Telegram user, expired and consumed pairing',t=>{
 const store=fixture(t),vault=new Vault(store,randomBytes(32)),config=vault.publicConfig('1'),doc=envelope(vault,'1',config);
 assert.deepEqual(vault.decryptPackage('1',doc),cookies);assert.throws(()=>vault.decryptPackage('2',doc),UserError);
 assert.throws(()=>vault.decryptPackage('1',{...doc,data:'AAAA'+doc.data.slice(4)}),UserError);
 store.db.prepare('UPDATE login_challenges SET expires=0').run();assert.throws(()=>vault.decryptPackage('1',doc),UserError);
 const fresh=vault.publicConfig('1'),file=envelope(vault,'1',fresh);vault.save('1',cookies);assert.throws(()=>vault.decryptPackage('1',file),UserError);
});
test('UIAF preserves unfinished rows, merges by ID, and isolates account journals',t=>{
 const store=fixture(t);store.import('1',parsed());store.import('2',parsed());
 const input={info:{uiaf_version:'v1.1'},list:[{id:81000,current:0,status:1,timestamp:253402271999},{id:81001,current:1,status:3,timestamp:1700000000}]};
 const rows=parseUIAF(Buffer.from(JSON.stringify(input)));store.setAchievements('1',role.uid,rows);store.setAchievements('1',role.uid,rows);
 assert.equal(store.achievementRows('1',role.uid).length,2);assert.equal(store.achievementRows('2',role.uid).length,0);
 assert.deepEqual(parseUIAF(Buffer.from(JSON.stringify(exportUIAF(store.achievementRows('1',role.uid))))),rows);
 assert.throws(()=>parseUIAF(Buffer.from(JSON.stringify({...input,list:[{...rows[0],status:4}]}))),UserError);
});
test('deleting data removes credentials and achievements but preserves another player',t=>{
 const store=fixture(t),vault=new Vault(store,randomBytes(32));for(const user of ['1','2']){store.import(user,parsed());vault.save(user,cookies);store.setAchievements(user,role.uid,[{id:81000,current:0,status:3,timestamp:253402271999}]);}
 store.deleteUser('1',store.confirmation('1'));assert.equal(store.connection('1'),null);assert.equal(store.achievementRows('1',role.uid).length,0);assert.equal(store.connection('2').status,'active');
});
test('HoYo wish requests use only a temporary key; account cookies stay out of gacha requests',async()=>{
 const calls=[];
 const hoyo=new Hoyo({pause:async()=>{},fetcher:async(url,options)=>{calls.push({url:String(url),options});const u=new URL(url);let data;
  if(u.pathname.endsWith('genAuthKeyByCookieToken'))data={authkey:'A'.repeat(1024)};
  else data={region:role.region,list:u.searchParams.get('gacha_type')==='301'&&u.searchParams.get('page')==='1'?[{...row,uid:role.uid,item_id:''}]:[]};
  return {ok:true,json:async()=>({retcode:0,data})};
 }});
 const result=await hoyo.wishes(cookies,role);assert.equal(result.accounts[0].list.length,1);assert.equal(result.accounts[0].list[0].item_id,'10000069');
 assert.ok(calls[0].options.headers.Cookie.includes(cookies.cookie_token_v2));for(const call of calls.slice(1))assert.equal(call.options.headers.Cookie,undefined);
});
test('automatic sync merges data and records a successful check',async t=>{
 const store=fixture(t),vault=new Vault(store,randomBytes(32));vault.save('1',cookies);
 const sync=new SyncService({store,vault,hoyo:{roles:async()=>[role],wishes:async()=>parsed(),achievementTotal:async()=>500}});
 const r=await sync.request('1');await sync.tail;assert.equal(r.added,1);assert.equal(store.achievementTotal('1',role.uid).total,500);assert.ok(store.connection('1').last_sync);assert.ok(store.connection('1').next_sync>Date.now());await sync.stop();
});
test('disconnect during a network request cannot recreate an account or save its results',async t=>{
 const store=fixture(t),vault=new Vault(store,randomBytes(32));vault.save('1',cookies);let finish,started;
 const ready=new Promise(r=>started=r),pending=new Promise(r=>finish=r);
 const sync=new SyncService({store,vault,hoyo:{roles:async()=>[role],wishes:async()=>{started();return pending;},achievementTotal:async()=>10}});
 const task=sync.request('1');await ready;store.disconnect('1');finish(parsed());assert.equal((await task).cancelled,true);assert.equal(store.accounts('1').length,0);await sync.stop();
});
test('expired HoYo login stops scheduled retries until reconnection',async t=>{
 const store=fixture(t),vault=new Vault(store,randomBytes(32));vault.save('1',cookies);const sync=new SyncService({store,vault,hoyo:{roles:async()=>{throw new HoyoError(10001);}}});
 await assert.rejects(sync.request('1'));await sync.tail;assert.equal(store.connection('1').status,'expired');assert.equal(store.dueConnections(Date.now()+999999999).length,0);await sync.stop();
});
class FakeTelegram{constructor(){this.calls=[];}async call(method,params){this.calls.push({method,...params});return {};}message(chat,text,extra={}){return this.call('sendMessage',{chat_id:chat,text,...extra});}document(chat,buffer,filename,caption){return this.call('sendDocument',{chat_id:chat,buffer,filename,caption});}}
const msg=(text,id=1)=>({message:{from:{id},chat:{id,type:'private'},text,message_id:1}});
const cb=(data,id=1)=>({callback_query:{id:'c',from:{id},message:msg('',id).message,data}});
test('four-function UI shows patch groups and persists manual achievements without granting another user access',async t=>{
 const store=fixture(t);store.import('1',parsed());const tg=new FakeTelegram(),app=new BotApp({telegram:tg,store});
 const run=async update=>{app.limits.clear();await app.handle(update);};
 await run(msg('/start'));assert.equal(tg.calls.at(-1).reply_markup.inline_keyboard.flat().length,4);
 await run(msg('/history'));assert.ok(tg.calls.at(-1).reply_markup.inline_keyboard.flat().some(b=>b.callback_data==='p:712345678:7.1'));
 await run(cb('p:712345678:7.1'));assert.ok(tg.calls.at(-1).reply_markup.inline_keyboard.flat().some(b=>b.text==='Tighnari'));
 await run(cb('p:712345678:7.1',2));assert.ok(!tg.calls.at(-1).text.includes('Tighnari'));
 await run(msg('/achievements'));assert.match(tg.calls.at(-1).text,/manual or imported/);
 await run(cb('am:81000:1'));assert.equal(store.achievementRows('1',role.uid)[0].status,3);
 await run(msg('/achievements overlooking'));assert.ok(tg.calls.at(-1).reply_markup.inline_keyboard.flat().some(b=>b.callback_data==='ad:81000'));
 await run(cb('aexport'));assert.equal(parseUIAF(tg.calls.at(-1).buffer).length,1);
});
test('connection package contains only a public key and helper; no bot token or private key',async t=>{
 const store=fixture(t),vault=new Vault(store,randomBytes(32)),tg=new FakeTelegram(),app=new BotApp({telegram:tg,store,vault});await app.handle(cb('beginlogin'));
 const zip=tg.calls.at(-1).buffer;assert.equal(zip.readUInt32LE(0),0x04034b50);assert.ok(zip.includes(Buffer.from('connection.json')));assert.ok(!zip.includes(Buffer.from('PRIVATE KEY')));assert.ok(!zip.includes(Buffer.from('TELEGRAM_BOT_TOKEN')));
});
test('achievement catalogue IDs are unique and export round trips sentinel timestamps',()=>{
 assert.equal(new Set(catalogue.items.map(x=>x.id)).size,catalogue.items.length);const rows=[{id:81000,current:0,status:3,timestamp:253402271999}];assert.deepEqual(parseUIAF(Buffer.from(JSON.stringify(exportUIAF(rows)))),rows);
});
