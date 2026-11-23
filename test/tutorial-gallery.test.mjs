import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {Store} from '../src/store.mjs';
import {BotApp,COMMANDS} from '../src/app.mjs';
import {CardRenderer} from '../src/render.mjs';
import {TUTORIAL_PAGES,tutorialPage,tutorialCard} from '../src/tutorial.mjs';

test('all six tutorial assets match their cache hashes and Telegram photo limits',async()=>{
 assert.equal(TUTORIAL_PAGES.length,6);
 const renderer=new CardRenderer(null);
 for(let index=0;index<6;index++){
  const card=await renderer.render({type:'tutorial',index}),bytes=card.png(),page=tutorialPage(index);
  assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
  assert.equal(card.key,'tutorial:'+createHash('sha256').update(bytes).digest('hex'));
  assert.ok(bytes.length<10*1024*1024);
  assert.ok(bytes.readUInt32BE(16)+bytes.readUInt32BE(20)<=10000);
  assert.ok(page.text.length+page.title.length<850);
 }
 for(const invalid of [-1,6,1.5,NaN,'0','../../token'])assert.throws(()=>tutorialCard(invalid));
 assert.match(tutorialPage(3).text,/same HoYoverse account/);assert.match(tutorialPage(3).text,/genshin.hoyoverse.com\/en\/gift/);
 assert.match(tutorialPage(4).text,/Primogemless\.connect\.json/);assert.match(tutorialPage(5).text,/EXPIRED_PAIRING/);
});

test('tutorial gallery sends, edits, and reuses cached photos without generating or changing pairing',async t=>{
 const store=new Store(':memory:');t.after(()=>store.close());
 const challenge=store.challenge('1'),calls=[];
 const telegram={
  call:async(method,params)=>{calls.push({method,...params});return {photo:[{file_id:'telegram-photo-'+calls.length}]};},
  photo:async(params,bytes)=>{calls.push({method:'uploadPhoto',...params,length:bytes.length});return {photo:[{file_id:'uploaded-'+calls.length}]};},
  message:async(chat,text,params)=>{calls.push({method:'message',chat_id:chat,text,...params});return {};}
 };
 const app=new BotApp({store,telegram,renderer:new CardRenderer(null)});
 const callback=async(data,actor=1,chat=1)=>{app.limits.clear();await app.handle({callback_query:{id:'test',from:{id:actor},data,message:{message_id:20,chat:{id:chat,type:'private'},photo:[{file_id:'old-photo'}]}}});};
 await callback('guide:hoyolab');let sent=calls.at(-1);assert.equal(sent.method,'uploadPhoto');assert.equal(sent.message_id,20);assert.match(sent.caption,/1 \/ 6/);
 let buttons=sent.reply_markup.inline_keyboard.flat();assert.ok(buttons.some(b=>b.callback_data==='walk:1'));assert.ok(!buttons.some(b=>b.callback_data==='walk:-1'));
 await callback('walk:1');assert.match(calls.at(-1).caption,/Extract the ZIP/);
 await callback('walk:0');assert.equal(calls.at(-1).method,'editMessageMedia');assert.match(calls.at(-1).media.media,/uploaded-/);
 await callback('walk:5');buttons=calls.at(-1).reply_markup.inline_keyboard.flat();assert.ok(buttons.some(b=>b.callback_data==='walk:4'));assert.ok(!buttons.some(b=>b.callback_data==='walk:6'));assert.ok(buttons.some(b=>b.callback_data==='history'));
 store.checkChallenge('1',challenge);assert.equal(store.connection('1'),null);assert.deepEqual(COMMANDS.map(x=>x.command),['tutorial','history','primogems','characters']);
 const count=calls.length;await callback('walk:0',2,1);assert.equal(calls.length,count);
 await callback('walk:99');assert.match(calls.at(-1).text??calls.at(-1).caption,/Choose a page/);
});

test('wish setup links to the screenshot guide and missing renderer keeps full text instructions',async t=>{
 const store=new Store(':memory:');t.after(()=>store.close());const messages=[];
 const app=new BotApp({store,telegram:{message:async(chat,text,p)=>messages.push({text,...p})}});
 await app.wishGuide(1,'1');assert.ok(messages.at(-1).reply_markup.inline_keyboard.flat().some(b=>b.callback_data==='walk:0'));
 await app.screenshotGuide(1,'1',3);assert.match(messages.at(-1).text,/same HoYoverse account/);assert.match(messages.at(-1).text,/genshin.hoyoverse.com\/en\/gift/);
});
