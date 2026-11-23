import test from 'node:test';
import assert from 'node:assert/strict';
import {Store} from '../src/store.mjs';
import {IconTheme,ThemedTelegram,iconFromMessage,ICONS} from '../src/icons.mjs';
import {BotApp,COMMANDS} from '../src/app.mjs';
import {TelegramError} from '../src/telegram.mjs';
import {UserError} from '../src/history.mjs';
const custom={text:'🌟',custom_emoji_id:'5368324170671202286'};
const message=(text,id=1,extra={})=>({message:{text,message_id:1,from:{id},chat:{id,type:'private'},...extra}});
const callback=(data,id=1)=>({callback_query:{id:'c',from:{id},data,message:{message_id:1,text:'Menu',chat:{id,type:'private'}}}});
function storeFor(t){const store=new Store(':memory:');t.after(()=>store.close());return store;}
class RawTelegram{constructor(){this.calls=[];}async call(method,params){this.calls.push({method,...params});return {};}}

test('premium emoji capture preserves exact ID and UTF-16 offsets and rejects extra text',()=>{
 const m={text:' 🌟 ',entities:[{type:'custom_emoji',offset:1,length:2,custom_emoji_id:custom.custom_emoji_id}]};
 assert.deepEqual(iconFromMessage(m),custom);
 assert.deepEqual(iconFromMessage({text:'👩‍💻'}),{text:'👩‍💻'});
 assert.throws(()=>iconFromMessage({...m,text:'x🌟 '}),UserError);
 assert.throws(()=>iconFromMessage({text:'😀😀'}),UserError);
 assert.throws(()=>iconFromMessage({text:'<img>'}),UserError);
 assert.throws(()=>iconFromMessage({...m,entities:[...m.entities,...m.entities]}),UserError);
});

test('theme persists across reloads, renders custom icons, and preserves HTML attributes and fixed-width content',t=>{
 const store=storeFor(t),theme=new IconTheme(store);theme.set('history',custom);theme.set('star',custom);
 const reloaded=new IconTheme(store);assert.deepEqual(reloaded.value('history'),custom);
 const html=reloaded.html('<b>✧ History</b><pre>5★  73</pre><a href="https://example.test/✧">link</a>');
 assert.match(html,/<tg-emoji emoji-id="5368324170671202286">🌟<\/tg-emoji>/);
 assert.match(html,/<pre>5🌟  73<\/pre>/);assert.match(html,/href="https:\/\/example.test\/✧"/);
 const button=reloaded.keyboard({inline_keyboard:[[{text:'✧ History',callback_data:'history'}]]}).inline_keyboard[0][0];
 assert.equal(button.text,'History');assert.equal(button.icon_custom_emoji_id,custom.custom_emoji_id);
 reloaded.set('history',{text:''});assert.equal(reloaded.html('✧ History'),' History');
 reloaded.set('history',null);assert.equal(reloaded.html('✧ History'),'✧ History');
 assert.throws(()=>reloaded.set('invented',custom),UserError);
 assert.equal(ICONS.length,14);
});

test('Telegram rejection falls back to regular icons for captions and buttons without dropping messages',async t=>{
 const store=storeFor(t),theme=new IconTheme(store);theme.set('history',custom);const raw=new RawTelegram();
 raw.call=async function(method,params){this.calls.push({method,...params});if(this.calls.length===1)throw new TelegramError(400);return {};};
 const tg=new ThemedTelegram(raw,theme);
 await tg.call('sendPhoto',{chat_id:1,photo:'existing-image',caption:'<b>✧ History</b>',parse_mode:'HTML',reply_markup:{inline_keyboard:[[{text:'✧ History',callback_data:'history'}]]}});
 assert.equal(raw.calls.length,2);assert.equal(tg.customEmojiFallbacks,1);
 assert.equal(raw.calls[1].caption,'<b>🌟 History</b>');assert.equal(raw.calls[1].reply_markup.inline_keyboard[0][0].icon_custom_emoji_id,undefined);
 raw.call=async()=>{throw new TelegramError(400,0,true);};
 await assert.rejects(tg.message(1,'✧',{parse_mode:'HTML'}),e=>e.notModified);assert.equal(tg.customEmojiFallbacks,1);
});

test('only the configured owner can edit icons; public commands remain four',async t=>{
 const store=storeFor(t),theme=new IconTheme(store),raw=new RawTelegram(),tg=new ThemedTelegram(raw,theme),app=new BotApp({store,telegram:tg,icons:theme,ownerId:'1'});
 const run=async update=>{app.limits.clear();await app.handle(update);};
 await run(message('/tutorial'));assert.ok(raw.calls.at(-1).reply_markup.inline_keyboard.flat().some(x=>x.callback_data==='icons'));
 await run(message('/tutorial',2));assert.ok(!raw.calls.at(-1).reply_markup.inline_keyboard.flat().some(x=>x.callback_data==='icons'));
 await run(callback('i:history',2));assert.match(raw.calls.at(-1).text,/Only the bot owner/);
 await run(callback('i:history'));
 await run(message('🌟',1,{entities:[{type:'custom_emoji',offset:0,length:2,custom_emoji_id:custom.custom_emoji_id}]}));
 assert.deepEqual(theme.value('history'),custom);assert.equal(store.getUI('1').editingIcon,undefined);
 await run(message('/start'));assert.equal(raw.calls.at(-1).reply_markup.inline_keyboard.flat().find(x=>x.callback_data==='history').icon_custom_emoji_id,custom.custom_emoji_id);
 await run(callback('ir:history',2));assert.deepEqual(theme.value('history'),custom);
 await run(callback('ir:history'));assert.equal(theme.value('history').text,'✧');
 assert.deepEqual(COMMANDS.map(x=>x.command),['tutorial','history','primogems','characters']);
});

