import test from 'node:test';
import assert from 'node:assert/strict';
import {Store} from '../src/store.mjs';
import {BotApp,COMMANDS} from '../src/app.mjs';

test('tutorial waits for a video, keeps account setup and owner editing, and never offers screenshots',async t=>{
 const store=new Store(':memory:');t.after(()=>store.close());const calls=[];
 const app=new BotApp({store,ownerId:'1',telegram:{message:async(chat,text,p)=>calls.push({text,...p})},renderer:{render:()=>{throw new Error('Tutorial must not render screenshots');}}});
 await app.tutorial(1,'1');assert.match(calls.at(-1).text,/video guide is coming soon/);
 let buttons=calls.at(-1).reply_markup.inline_keyboard.flat();assert.ok(buttons.some(b=>b.callback_data==='guidelink:wishes'));assert.ok(buttons.some(b=>b.callback_data==='login'));assert.ok(!buttons.some(b=>b.callback_data?.startsWith('walk:')));
 await app.tutorial(2,'2');buttons=calls.at(-1).reply_markup.inline_keyboard.flat();assert.ok(!buttons.some(b=>b.callback_data?.startsWith('guidelink:')));
 store.setMeta('tutorial_link:wishes','https://t.me/ExampleChannel/123');await app.tutorial(2,'2');assert.doesNotMatch(calls.at(-1).text,/coming soon/);assert.ok(calls.at(-1).reply_markup.inline_keyboard.flat().some(b=>b.url==='https://t.me/ExampleChannel/123'));
 await app.wishGuide(2,'2');assert.ok(!calls.at(-1).reply_markup.inline_keyboard.flat().some(b=>b.callback_data?.startsWith('walk:')));
 assert.deepEqual(COMMANDS.map(x=>x.command),['connect','history','primogems','characters']);
});

test('old screenshot buttons open the video tutorial without reusing the screenshot or changing pairing',async t=>{
 const store=new Store(':memory:');t.after(()=>store.close());const challenge=store.challenge('1'),calls=[];
 const app=new BotApp({store,telegram:{call:async(method,p)=>{calls.push({method,...p});return {};},message:async(chat,text,p)=>calls.push({method:'message',text,...p})}});
 await app.handle({callback_query:{id:'old',from:{id:1},data:'walk:3',message:{message_id:20,chat:{id:1,type:'private'},photo:[{file_id:'old-screenshot'}]}}});
 assert.equal(calls.at(-1).method,'message');assert.match(calls.at(-1).text,/video guide/);store.checkChallenge('1',challenge);assert.equal(store.connection('1'),null);
 await app.guide(1,'1','hoyolab');assert.match(calls.at(-1).text,/CONNECT HOYOLAB/);store.checkChallenge('1',challenge);
});
