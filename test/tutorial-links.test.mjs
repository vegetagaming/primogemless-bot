import test from 'node:test';
import assert from 'node:assert/strict';
import {tutorialLink} from '../src/tutorial-link.mjs';
import {UserError} from '../src/history.mjs';
import {Store} from '../src/store.mjs';
import {BotApp} from '../src/app.mjs';

test('tutorial links accept public Telegram posts and reject credentials, private links and other destinations',()=>{
 assert.equal(tutorialLink('https://t.me/ExampleChannel/123'),'https://t.me/ExampleChannel/123');
 assert.equal(tutorialLink('https://telegram.me/s/ExampleChannel/123/'),'https://t.me/ExampleChannel/123');
 for(const link of ['javascript:alert(1)','http://t.me/ExampleChannel','https://t.me.attacker.test/ExampleChannel','https://name:secret@t.me/ExampleChannel','https://t.me/ExampleChannel?authkey=secret','https://t.me/+PrivateInvite','https://t.me/c/123/456'])assert.throws(()=>tutorialLink(link),UserError);
});

test('only the owner can publish or remove the shared tutorial link; everyone can watch it',async t=>{
 const store=new Store(':memory:');t.after(()=>store.close());const calls=[],app=new BotApp({store,ownerId:'1',telegram:{call:async()=>({}),message:async(chat,text,extra)=>calls.push({chat,text,...extra})}});
 const run=async(text,owner=1)=>{app.limits.clear();await app.handle({message:{text,message_id:1,from:{id:owner},chat:{id:owner,type:'private'}}});};
 await run('/guidelink:wishes',2);assert.match(calls.at(-1).text,/Only the bot owner/);assert.equal(store.getUI('2').editingGuideLink,undefined);
 await run('/guidelink:wishes');await run('https://t.me/ExampleChannel/123');assert.equal(store.getMeta('tutorial_link:wishes'),'https://t.me/ExampleChannel/123');
 await run('/guide:wishes',2);let buttons=calls.at(-1).reply_markup.inline_keyboard.flat();assert.ok(buttons.some(b=>b.url==='https://t.me/ExampleChannel/123'));assert.ok(!buttons.some(b=>b.callback_data?.startsWith('guidelink:')));
 await run('/guideclear:wishes',2);assert.equal(store.getMeta('tutorial_link:wishes'),'https://t.me/ExampleChannel/123');
 await run('/guideclear:wishes');assert.equal(store.getMeta('tutorial_link:wishes'),'');assert.ok(!calls.at(-1).reply_markup.inline_keyboard.flat().some(b=>b.url));
});

test('compact wish guide distinguishes a working full connection from HoYoLAB-only access',async t=>{
 const store=new Store(':memory:');t.after(()=>store.close());store.import('1',{accounts:[{uid:'712345678',timezone:1,lang:'en-us',list:[]}]});store.saveConnection('1','synthetic');
 const calls=[],vault={load:()=>({ltuid_v2:'12345',ltoken_v2:'synthetic'})},app=new BotApp({store,vault,telegram:{message:async(chat,text,extra)=>calls.push({text,...extra})}});
 await app.guide(1,'1','wishes');assert.match(calls.at(-1).text,/Wish syncing still needs setup/);assert.ok(!calls.at(-1).reply_markup.inline_keyboard.flat().some(b=>b.callback_data==='sync'));
 vault.load=()=>({account_id_v2:'12345',account_mid_v2:'synthetic',cookie_token_v2:'synthetic'});await app.guide(1,'1','wishes');assert.match(calls.at(-1).text,/Your wish history is connected/);assert.ok(calls.at(-1).reply_markup.inline_keyboard.flat().some(b=>b.callback_data==='sync'));assert.ok(calls.at(-1).text.length<600);
});
