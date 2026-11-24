import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {Store} from '../src/store.mjs';
import {Vault} from '../src/vault.mjs';
import {BotApp,MENU,COMMANDS} from '../src/app.mjs';

function setup(t){
 const store=new Store(':memory:');t.after(()=>store.close());const calls=[],vault=new Vault(store,randomBytes(32));
 const telegram={call:async(method,p)=>{calls.push({method,...p});return {};},message:async(chat,text,p)=>calls.push({method:'message',chat,text,...p}),document:async(chat,buffer,name,caption)=>calls.push({method:'document',chat,buffer,name,caption}),download:async()=>{throw new Error('Video must never be downloaded');}};
 const app=new BotApp({store,vault,telegram,ownerId:'1'}),run=async(body,owner=1)=>{app.limits.clear();await app.handle({message:{...(typeof body==='string'?{text:body}:body),from:{id:owner},chat:{id:owner,type:'private'},message_id:10}});};
 return {app,store,calls,telegram,run};
}
function config(zip){
 let offset=0;
 while(zip.readUInt32LE(offset)===0x04034b50){const size=zip.readUInt32LE(offset+18),nameLength=zip.readUInt16LE(offset+26),extra=zip.readUInt16LE(offset+28),start=offset+30+nameLength+extra,name=zip.subarray(offset+30,offset+30+nameLength).toString();if(name==='connection.json')return JSON.parse(zip.subarray(start,start+size));offset=start+size;}
 throw new Error('No connection configuration');
}

test('Connect replaces Tutorial and sends an inline video followed by a personal ZIP for each player',async t=>{
 const {app,store,calls,run}=setup(t);
 assert.deepEqual(COMMANDS.map(c=>c.command),['connect','history','primogems','characters','akasha']);assert.equal(MENU.inline_keyboard[0][0].text,'✦ Connect');assert.equal(MENU.inline_keyboard[0][0].callback_data,'connect');
 await run('/setconnectvideo');await run({video:{file_id:'recording_file_123',file_size:200000000},caption:'do not copy this caption'});
 assert.deepEqual(Object.keys(JSON.parse(store.getMeta('connect_video_v1'))).sort(),['file_id','saved_at']);assert.equal(app.savedConnectVideo().file_id,'recording_file_123');assert.equal(calls.at(-1).method,'sendVideo');assert.ok(!calls.at(-1).caption.includes('do not copy'));
 calls.length=0;await run('/connect',2);assert.deepEqual(calls.map(c=>c.method),['sendVideo','document']);assert.equal(calls[0].video,'recording_file_123');assert.equal(calls[1].name,'Connect-Primogemless.zip');assert.ok(!calls[0].reply_markup.inline_keyboard.flat().some(b=>b.callback_data==='setconnectvideo'));
 const first=config(calls[1].buffer);assert.equal(first.owner,'2');store.checkChallenge('2',first.challenge);
 await run('/connect',3);const second=config(calls.at(-1).buffer);assert.equal(second.owner,'3');assert.notEqual(second.challenge,first.challenge);store.checkChallenge('2',first.challenge);
 await run('/connectpreview',2);assert.equal(calls.at(-1).method,'sendVideo');store.checkChallenge('2',first.challenge);
 await run('/connect',2);const renewed=config(calls.at(-1).buffer);assert.notEqual(renewed.challenge,first.challenge);assert.throws(()=>store.checkChallenge('2',first.challenge));store.checkChallenge('3',second.challenge);
});

test('only an owner who explicitly starts video editing can publish, replace or remove it',async t=>{
 const {app,store,calls,run}=setup(t),video={video:{file_id:'first_video'}};
 await run(video);assert.equal(store.getMeta('connect_video_v1'),undefined);
 await run('/setconnectvideo',2);assert.match(calls.at(-1).text,/Only the bot owner/);await run(video,2);assert.equal(app.savedConnectVideo(),null);
 await run('/setconnectvideo');await run({document:{file_id:'mp4_file',file_name:'guide.mp4'}});assert.match(calls.at(-1).text,/not a document/);assert.equal(app.savedConnectVideo(),null);
 await run('/connectpreview');await run(video);assert.equal(app.savedConnectVideo(),null);
 await run('/setconnectvideo');await run(video);assert.equal(app.savedConnectVideo().file_id,'first_video');
 await run('/setconnectvideo');await run({video:{file_id:'https://attacker.test/video.mp4'}});assert.equal(app.savedConnectVideo().file_id,'first_video');
 await run({video:{file_id:'replacement_video'}});assert.equal(app.savedConnectVideo().file_id,'replacement_video');
 await run('/clearconnectvideo',2);assert.equal(app.savedConnectVideo().file_id,'replacement_video');
 store.setUI('2',{editingConnectVideo:true});await run({video:{file_id:'foreign_video'}},2);assert.equal(app.savedConnectVideo().file_id,'replacement_video');
 await run('/clearconnectvideo');assert.equal(app.savedConnectVideo(),null);assert.match(calls.at(-1).text,/video guide is coming soon/);
});

test('the ZIP stays available before recording and after a rejected video; owner previews do not rotate pairing',async t=>{
 const {app,store,calls,telegram,run}=setup(t);
 await run('/connect',2);assert.deepEqual(calls.map(c=>c.method),['message','document']);const before=config(calls.at(-1).buffer);
 await run('/setconnectvideo');await run({video:{file_id:'sample_video'}});store.checkChallenge('2',before.challenge);
 telegram.call=async(method,p)=>{calls.push({method,...p});if(method==='sendVideo')throw Object.assign(new Error('Rejected video'),{code:400});return {};};
 calls.length=0;await run('/connect',2);assert.deepEqual(calls.map(c=>c.method),['sendVideo','message','document']);assert.match(calls[1].text,/temporarily unavailable/);assert.equal(config(calls.at(-1).buffer).owner,'2');assert.equal(app.savedConnectVideo().file_id,'sample_video');
});
