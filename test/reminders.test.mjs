import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname,resolve} from 'node:path';
import {Store} from '../src/store.mjs';
import {Hoyo,HoyoError} from '../src/hoyo.mjs';
import {TelegramError} from '../src/telegram.mjs';
import {ReminderService} from '../src/reminder-service.mjs';
import {normalizeNotes,resetWindow,nextNoteCheck} from '../src/notes.mjs';
import {BotApp,COMMANDS} from '../src/app.mjs';

const uid='712345678',role={uid,region:'os_euro',timezone:1,lang:'en-us'};
const cookies={ltuid_v2:'12345',ltoken_v2:'synthetic-test-session'};
const raw=(extra={})=>({current_resin:200,max_resin:200,resin_recovery_time:'0',finished_task_num:0,total_task_num:4,is_extra_task_reward_received:false,...extra});
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
function fixture({path=':memory:',now=Date.parse('2026-11-24T01:00:00Z')}={}){
 const store=new Store(path),sent=[],clock={now};let notes=raw();
 for(const owner of ['1','2']){store.import(owner,{accounts:[{...role,list:[]}]});store.saveConnection(owner,'synthetic-session-'+owner);}
 const hoyo={roles:async()=>[role],dailyNotes:async()=>notes},vault={load:()=>cookies},tg={message:async(chat,text,params)=>{sent.push({chat,text,params});return {};}};
 const service=new ReminderService({store,vault,hoyo,telegram:tg,now:()=>clock.now,pause:async()=>{}});
 return {store,sent,clock,hoyo,vault,tg,service,setNotes:value=>{notes=value;}};
}
test('daily notes validate live fields and prefer modern encounter-point totals over legacy counters',()=>{
 assert.equal(normalizeNotes(raw()).dailyComplete,false);
 const modern=normalizeNotes(raw({daily_task:{total_num:4,finished_num:4,is_extra_task_reward_received:true}}));
 assert.equal(modern.finished,4);assert.equal(modern.dailyComplete,true);
 assert.equal(normalizeNotes(raw({current_resin:220})).resin,220);
 assert.equal(normalizeNotes(raw({total_task_num:0})).dailyComplete,true);
 for(const changed of [{max_resin:0},{current_resin:-1},{resin_recovery_time:'bad'},{finished_task_num:5},{is_extra_task_reward_received:undefined}])assert.throws(()=>normalizeNotes(raw(changed)),/INVALID_DAILY_NOTES/);
});
test('daily windows follow each server 04:00 reset, not host timezone or DST',()=>{
 for(const [region,start,reset] of [['os_euro','2026-11-24T01:00:00Z','2026-11-24T03:00:00Z'],['os_usa','2026-11-24T07:00:00Z','2026-11-24T09:00:00Z'],['os_asia','2026-11-23T18:00:00Z','2026-11-23T20:00:00Z'],['os_cht','2026-11-23T18:00:00Z','2026-11-23T20:00:00Z']]){
  const t=Date.parse(start),w=resetWindow(region,t);assert.equal(w.inWindow,true);assert.equal(w.reset,Date.parse(reset));assert.equal(resetWindow(region,t-1).inWindow,false);assert.equal(resetWindow(region,w.reset).inWindow,false);assert.notEqual(resetWindow(region,w.reset).cycle,w.cycle);
  assert.equal(nextNoteCheck({region,daily_enabled:1,resin_enabled:0,daily_cycle:w.cycle},t),w.start+86400000);
 }
});
test('dailyNote is a read-only request for the selected authenticated UID and never enables HoYoLAB privacy settings',async()=>{
 const calls=[];const hoyo=new Hoyo({fetcher:async(url,options)=>{calls.push({url,options});return {ok:true,json:async()=>({retcode:0,data:raw()})};}});
 await hoyo.dailyNotes(cookies,role);assert.equal(calls.length,1);
 assert.equal(calls[0].url.hostname,'sg-public-api.hoyolab.com');assert.equal(calls[0].url.pathname,'/event/game_record/genshin/api/dailyNote');assert.equal(calls[0].url.searchParams.get('role_id'),uid);assert.equal(calls[0].url.searchParams.get('server'),'os_euro');assert.equal(calls[0].options.method,'GET');assert.equal(calls[0].options.body,undefined);
});
test('resin alerts persist across restarts, deduplicate concurrent checks, and rearm only after observed spending',async()=>{
 const directory=mkdtempSync(join(tmpdir(),'primogemless-reminders-')),path=join(directory,'test.sqlite');let f=fixture({path});
 try{
  f.store.setReminder('1',role,'resin',true,f.clock.now);await Promise.all([f.service.request('1',uid),f.service.request('1',uid)]);assert.equal(f.sent.length,1);assert.match(f.sent[0].text,/Original Resin is full/);await f.service.stop();f.store.close();
  f=fixture({path,now:f.clock.now+600000});await f.service.request('1',uid);assert.equal(f.sent.length,0);
  f.clock.now+=600000;f.setNotes(raw({current_resin:160,resin_recovery_time:'19000'}));await f.service.request('1',uid);assert.equal(f.store.reminder('1',uid).resin_notified,0);
  f.clock.now+=600000;f.setNotes(raw());await f.service.request('1',uid);assert.equal(f.sent.length,1);assert.equal(f.sent[0].chat,'1');assert.equal(f.store.reminder('2',uid),null);
 }finally{await f.service.stop();f.store.close();assert.equal(dirname(resolve(directory)),resolve(tmpdir()));rmSync(directory,{recursive:true,force:true});}
});
test('daily alerts send once per reset cycle, include unclaimed bonus, and skip completed or unlocked-zero days',async()=>{
 const f=fixture({now:Date.parse('2026-11-24T00:59:00Z')});
 try{
  f.store.setReminder('1',role,'daily',true,f.clock.now);await f.service.request('1',uid);assert.equal(f.sent.length,0);
  f.clock.now+=60000;await f.service.request('1',uid);assert.equal(f.sent.length,1);assert.match(f.sent[0].text,/0\/4/);
  f.clock.now+=600000;await f.service.request('1',uid);assert.equal(f.sent.length,1);
  f.clock.now=Date.parse('2026-11-25T01:00:00Z');f.setNotes(raw({daily_task:{total_num:4,finished_num:4,is_extra_task_reward_received:true}}));await f.service.request('1',uid);assert.equal(f.sent.length,1);
  f.clock.now=Date.parse('2026-11-26T01:00:00Z');f.setNotes(raw({finished_task_num:4}));await f.service.request('1',uid);assert.equal(f.sent.length,2);assert.match(f.sent[1].text,/Katheryne/);
  f.clock.now=Date.parse('2026-11-27T01:00:00Z');f.setNotes(raw({total_task_num:0}));await f.service.request('1',uid);assert.equal(f.sent.length,2);
 }finally{await f.service.stop();f.store.close();}
});
test('foreign imported UIDs, missing notes permission and expired logins cannot produce inferred alerts',async()=>{
 const f=fixture();try{
  f.hoyo.roles=async()=>[];await assert.rejects(f.service.enable('1',uid,'resin',true),/not part/);assert.equal(f.store.reminder('1',uid),null);
  f.store.setReminder('1',role,'resin',true,f.clock.now);await f.service.request('1',uid);assert.equal(f.store.reminder('1',uid).error_code,'ACCOUNT_MISMATCH');
  f.hoyo.roles=async()=>[role];f.clock.now+=3600000;f.hoyo.dailyNotes=async()=>{throw new HoyoError('10102');};await f.service.request('1',uid);assert.equal(f.store.reminder('1',uid).error_code,'10102');assert.equal(f.sent.length,0);
  f.clock.now+=3600000;f.hoyo.dailyNotes=async()=>{throw new HoyoError('-100');};await f.service.request('1',uid);assert.equal(f.store.reminder('1',uid).error_code,'-100');assert.equal(f.sent.length,0);
 }finally{await f.service.stop();f.store.close();}
});
test('disconnect, delete, replacement login and turning off during a fetch prevent late notifications or recreated data',async()=>{
 for(const action of ['disconnect','delete','replace','off']){
  const f=fixture(),started=deferred(),gate=deferred();try{
   f.store.setReminder('1',role,'resin',true,f.clock.now);f.hoyo.dailyNotes=async()=>{started.resolve();await gate.promise;return raw();};
   const job=f.service.request('1',uid);await started.promise;
   if(action==='disconnect')f.store.disconnect('1');if(action==='delete')f.store.deleteUser('1',f.store.confirmation('1'));if(action==='replace')f.store.saveConnection('1','new-synthetic-session');if(action==='off')await f.service.enable('1',uid,'resin',false);
   gate.resolve();await job;assert.equal(f.sent.length,0);if(['disconnect','delete'].includes(action))assert.equal(f.store.reminder('1',uid),null);
  }finally{gate.resolve();await f.service.stop();f.store.close();}
 }
});
test('an off action cancels an in-flight enable before settings are created',async()=>{
 const f=fixture(),started=deferred(),gate=deferred();try{
  f.hoyo.roles=async()=>{started.resolve();await gate.promise;return [role];};const enable=f.service.enable('1',uid,'resin',true);const rejection=assert.rejects(enable,/settings changed/);
  await started.promise;await f.service.enable('1',uid,'resin',false);gate.resolve();await rejection;assert.equal(f.store.reminder('1',uid),null);assert.equal(f.sent.length,0);
 }finally{gate.resolve();await f.service.stop();f.store.close();}
});
test('Telegram rate limits are retried after the delay; blocked chats stop; ambiguous delivery does not duplicate',async()=>{
 for(const code of [429,403,'NETWORK']){
  const f=fixture();let tries=0;f.tg.message=async()=>{tries++;if(tries===1)throw new TelegramError(code,120);return {};};
  try{f.store.setReminder('1',role,'resin',true,f.clock.now);await f.service.request('1',uid);
   f.clock.now+=60000;await f.service.request('1',uid);assert.equal(tries,1);
   f.clock.now+=600000;await f.service.request('1',uid);assert.equal(tries,code===429?2:1);if(code===403)assert.equal(f.store.reminder('1',uid).resin_enabled,0);
  }finally{await f.service.stop();f.store.close();}
 }
});
test('reminder UI is opt-in, supports separate per-account controls, and rejects another player callbacks',async()=>{
 const f=fixture(),calls=[],tg={call:async()=>({}),message:async(chat,text,params)=>{calls.push({chat,text,params});}};
 const app=new BotApp({telegram:tg,store:f.store,vault:f.vault,hoyo:f.hoyo,reminderService:f.service});
 try{
  await app.reminders.show('1','1');assert.match(calls.at(-1).text,/Daily Commissions<\/b> · OFF/);assert.equal(f.store.reminder('1',uid),null);
  await app.reminders.route('1','1',['remset',uid,'daily','1']);assert.equal(f.store.reminder('1',uid).daily_enabled,1);assert.equal(f.store.reminder('1',uid).resin_enabled,0);
  assert.equal(f.store.reminder('2',uid),null);assert.ok(COMMANDS.some(c=>c.command==='reminders'));
  await assert.rejects(app.reminders.route('3','3',['remset',uid,'resin','1']));
  await assert.rejects(app.reminders.route('1','1',['remset',uid,'unexpected','1']));
  const previous=calls.length;await app.handle({callback_query:{id:'test',from:{id:2},data:'remset:'+uid+':resin:1',message:{message_id:1,chat:{id:1,type:'private'}}}});assert.equal(calls.length,previous);assert.equal(f.store.reminder('2',uid),null);
 }finally{await f.service.stop();f.store.close();}
});
