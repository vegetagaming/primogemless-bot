import test from 'node:test';
import assert from 'node:assert/strict';
import {parseBalances,wishBudget,normalizeDiary,ledgerPeriods} from '../src/savings.mjs';
import {Store} from '../src/store.mjs';
import {BotApp,COMMANDS} from '../src/app.mjs';
import {Hoyo} from '../src/hoyo.mjs';
import {UserError} from '../src/history.mjs';
const uid='712345678',role={uid,region:'os_euro',timezone:1,lang:'en-us'};
function setup(t){const s=new Store(':memory:');t.after(()=>s.close());for(const owner of ['1','2'])s.import(owner,{accounts:[{...role,list:[]}],inputCount:0});return s;}
const input={primogems:12000,crystals:300,intertwined:25,acquaint:10};
const rawDiary=(period='2026-11')=>({uid:Number(uid),region:'os_euro',data_month:Number(period.slice(5)),month_data:{current_primogems:6000,current_mora:50000,group_by:[{action:'Events',num:1600}]},day_data:{current_primogems:60}});

test('balance parser requires four nonnegative integers; budgets never double-count standard fates or convert crystals silently',()=>{
 assert.deepEqual(parseBalances('12000 300 25 10'),input);
 assert.deepEqual(wishBudget(input),{event:100,primogemWishes:75,remainingPrimogems:0,standardTickets:10,withCrystals:101});
 for(const bad of ['12000 300 25','-1 0 0 0','1.5 0 0 0','1000000001 0 0 0','10,000 0 0 0'])assert.throws(()=>parseBalances(bad),UserError);
});

test('dated balance snapshots preserve changes, deduplicate identical saves, isolate owners and cascade on deletion',t=>{
 const s=setup(t);assert.equal(s.saveSavings('1',uid,input).changed,true);assert.equal(s.saveSavings('1',uid,input).changed,false);
 s.saveSavings('1',uid,{...input,primogems:10000});assert.equal(s.savingsRows('1',uid).length,2);assert.equal(s.savingsRows('1',uid)[1].primogems,12000);assert.equal(s.savingsRows('2',uid).length,0);
 assert.throws(()=>s.saveSavings('3',uid,input),UserError);
 s.saveDiary('1',uid,normalizeDiary(rawDiary(),uid,role.region,'2026-11'));assert.equal(s.savingsRows('1',uid)[0].primogems,10000);
 s.saveSavings('2',uid,input);s.deleteUser('1',s.confirmation('1'));assert.equal(s.savingsRows('1',uid).length,0);assert.equal(s.diaryRows('1',uid).length,0);assert.equal(s.savingsRows('2',uid).length,1);
});

test('monthly income is validated as income and month boundaries preserve the year',()=>{
 assert.deepEqual(ledgerPeriods(Date.parse('2026-12-31T17:00:00Z')),['2027-01','2026-12','2026-11']);
 const diary=normalizeDiary(rawDiary(),uid,role.region,'2026-11');assert.equal(diary.earnedPrimogems,6000);assert.equal(diary.primogems,undefined);
 assert.throws(()=>normalizeDiary(rawDiary(),'799999999',role.region,'2026-11'),UserError);
 assert.throws(()=>normalizeDiary(rawDiary(),uid,role.region,'2026-10'),UserError);
});

test('HoYo diary requests use the verified ledger endpoint and reject ambiguous historical years',async()=>{
 const period=ledgerPeriods()[0],calls=[],h=new Hoyo({fetcher:async(url,options)=>{calls.push({url,options});return {ok:true,json:async()=>({retcode:0,data:rawDiary(period)})};}});
 const result=await h.diary({cookie_token_v2:'synthetic'},role,period);assert.equal(result.period,period);assert.equal(new URL(calls[0].url).hostname,'sg-hk4e-api.hoyolab.com');assert.equal(new URL(calls[0].url).searchParams.get('uid'),uid);
 await assert.rejects(h.diary({},role,'2020-11'),UserError);assert.equal(calls.length,1);
});

test('Savings is inside History, saves to the account chosen at entry, and exports only that player',async t=>{
 const store=setup(t),calls=[],tg={call:async(method,p)=>{calls.push({method,...p});return {};},message:async(chat,text,extra)=>calls.push({text,...extra}),document:async(chat,bytes,name)=>calls.push({bytes,name})},app=new BotApp({store,telegram:tg});
 const msg=text=>({message:{text,from:{id:1},chat:{id:1,type:'private'},message_id:1}}),run=async text=>{app.limits.clear();await app.handle(msg(text));};
 await run('/history');assert.ok(calls.at(-1).reply_markup.inline_keyboard.flat().some(x=>x.callback_data==='savings'));
 await run('/savedit');await run('12000 300 25 10');assert.equal(store.savingsRows('1',uid)[0].primogems,12000);assert.match(calls.at(-1).text,/100 event wishes/);
 await run('/savexport');const data=JSON.parse(calls.at(-1).bytes);assert.equal(data.uid,uid);assert.equal(data.snapshots.length,1);assert.equal(data.snapshots[0].owner,undefined);
 assert.equal(COMMANDS.length,4);
});
