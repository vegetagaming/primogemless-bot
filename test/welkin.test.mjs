import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname,basename,resolve} from 'node:path';
import {Store} from '../src/store.mjs';
import {BotApp} from '../src/app.mjs';
import {parseWelkinDays,welkinCountdown,welkinRecord,WELKIN_DAY_MS as DAY} from '../src/welkin.mjs';
import {UserError} from '../src/history.mjs';
const start=Date.parse('2026-11-24T08:00:00.000Z'),uid='712345678';
const account=(uid='712345678')=>({uid,timezone:1,lang:'en-us',list:[]});

test('Welkin decreases at exact 24-hour boundaries, catches up, never goes below zero and is timezone-independent',()=>{
 const record=welkinRecord(180,start);
 for(const [time,days]of [[start-DAY,180],[start,180],[start+DAY-1,180],[start+DAY,179],[start+2*DAY-1,179],[start+2*DAY,178],[start+173*DAY,7],[start+180*DAY,0],[start+400*DAY,0]])assert.equal(welkinCountdown(record,time).remaining_days,days);
 assert.equal(welkinCountdown(record,start+DAY).next_decrease_at,new Date(start+2*DAY).toISOString());
 assert.equal(welkinCountdown(record,start+180*DAY).next_decrease_at,null);
 assert.equal(welkinCountdown(welkinRecord(0,start),start).remaining_days,0);
 assert.equal(welkinCountdown(null),null);
 assert.equal(parseWelkinDays(' 180 '),180);assert.equal(parseWelkinDays('0'),0);
 for(const value of ['181','-1','1.5','30 days','','Infinity'])assert.throws(()=>parseWelkinDays(value),UserError);
 for(const value of [-1,181,NaN,Infinity,3.5,'180'])assert.throws(()=>welkinRecord(value,start),UserError);
});

test('Welkin survives reopening, stays separate by UID and owner, and cascades on account-data deletion',()=>{
 const dir=mkdtempSync(join(tmpdir(),'primogemless-welkin-')),path=join(dir,'test.sqlite');let store=new Store(path);
 try{
  for(const owner of ['1','2'])store.import(owner,{accounts:[account(),account('799999999')]});
  store.saveWelkin('1',uid,180,start);store.saveWelkin('1','799999999',30,start);store.saveWelkin('2',uid,7,start);
  assert.throws(()=>store.saveWelkin('3',uid,30,start),UserError);assert.throws(()=>store.saveWelkin('1',uid,181,start),UserError);
  store.close();store=new Store(path);
  assert.equal(welkinCountdown(store.welkin('1',uid),start+4*DAY).remaining_days,176);assert.equal(store.welkin('1','799999999').days,30);assert.equal(store.welkin('2',uid).days,7);
  store.saveWelkin('1',uid,10,start+4*DAY);assert.equal(welkinCountdown(store.welkin('1',uid),start+5*DAY).remaining_days,9);
  store.deleteUser('1',store.confirmation('1'));assert.equal(store.welkin('1',uid),null);assert.equal(store.welkin('1','799999999'),null);assert.equal(store.welkin('2',uid).days,7);
 }finally{store.close();assert.equal(dirname(resolve(dir)),resolve(tmpdir()));assert.ok(basename(dir).startsWith('primogemless-welkin-'));rmSync(dir,{recursive:true,force:true});}
});

test('Welkin is owner-only, accepts days without currency setup, preserves the selected edit account, and exports its anchor',async t=>{
 const store=new Store(':memory:');t.after(()=>store.close());store.import('1',{accounts:[account(),account('799999999')]});store.select('1',uid);
 const calls=[],app=new BotApp({store,ownerId:'1',telegram:{call:async(method,p)=>{calls.push({method,...p});return {};},message:async(chat,text,p)=>calls.push({text,...p}),document:async(chat,bytes)=>calls.push({bytes})}});
 const run=async(text,owner=1)=>{app.limits.clear();await app.handle({message:{text,from:{id:owner},chat:{id:owner,type:'private'}}});};
 await run('/profile');assert.ok(calls.at(-1).reply_markup.inline_keyboard.flat().some(b=>b.callback_data==='welkin'));
 await run('/welkin',2);assert.match(calls.at(-1).text,/only to the bot owner/);
 store.setUI('2',{welkinUid:uid});await run('180',2);assert.equal(store.welkin('2',uid),null);
 await run('/welkin');store.select('1','799999999');await run('181');assert.equal(store.welkin('1',uid),null);assert.match(calls.at(-1).text,/0 to 180/);
 await run('180');assert.equal(store.welkin('1',uid).days,180);assert.equal(store.welkin('1','799999999'),null);assert.equal(store.selected('1').uid,uid);assert.match(calls.at(-1).text,/180 days remaining/);assert.equal(store.savingsRows('1',uid).length,0);
 const anchor=store.welkin('1',uid).recorded_at;await run('/profile');assert.equal(store.welkin('1',uid).recorded_at,anchor);
 await run('/savexport');const backup=JSON.parse(calls.at(-1).bytes);assert.equal(backup.welkin.days,180);assert.equal(backup.welkin.recorded_at,anchor);assert.equal(backup.welkin.remaining_days,180);
 store.saveWelkin('1',uid,180,Date.now()-2*DAY);await run('/profile');assert.match(calls.at(-1).text,/178 days remaining/);
 await run('/welkin');await run('/profile');await run('30');assert.equal(store.welkin('1',uid).days,180);
 await run('/welkin');await run('0');assert.equal(store.welkin('1',uid).days,0);assert.match(calls.at(-1).text,/0 days remaining/);
});
