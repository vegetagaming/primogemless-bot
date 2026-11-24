import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {Store} from '../src/store.mjs';
import {Vault,cleanCookies,cookieCapabilities} from '../src/vault.mjs';
import {parseCookieEntry} from '../src/cookie-login.mjs';
import {BotApp} from '../src/app.mjs';
import {SyncService} from '../src/sync.mjs';
import {Hoyo,HoyoError} from '../src/hoyo.mjs';
import {hasSecret,UserError} from '../src/history.mjs';

// Synthetic credentials; never use a real account in this test suite.
const cookies={ltuid_v2:'12345',ltoken_v2:'v2_'+('SYNTHETIC_TEST_'.repeat(8))},role={uid:'712345678',region:'os_euro',timezone:1,lang:'en-us'};
const text=Object.entries(cookies).map(([k,v])=>k+'='+v).join('\n');
const roster=[{id:'10000069',name:'Tighnari',rank:5,level:90,constellation:1,weapon:null}];
function setup(t){const store=new Store(':memory:');t.after(()=>store.close());const vault=new Vault(store,randomBytes(32)),events=[];const telegram={call:async(method)=>{events.push(method);return {};},message:async(chat,text,options)=>{events.push({chat,text,...options});return {};}};let authRequests=0;
 const hoyo={roles:async()=>{events.push('roles');return [role];},roster:async()=>roster,authkey:async()=>{authRequests++;return 'synthetic';}};
 const app=new BotApp({store,vault,hoyo,telegram});
 const run=async(value,owner=1,chatType='private')=>{app.limits.clear();await app.handle({message:{message_id:9,text:value,from:{id:owner},chat:{id:owner,type:chatType}}});};
 return {store,vault,events,telegram,hoyo,app,run,authRequests:()=>authRequests};
}

test('cookie pair unlocks only HoYoLAB; full same-account cookie set unlocks wishes',()=>{
 assert.deepEqual(cleanCookies(cookies),cookies);assert.deepEqual(cookieCapabilities(cookies),{hoyolab:true,wishes:false});
 assert.deepEqual(parseCookieEntry(text),cookies);
 const full={...cookies,account_id_v2:'12345',account_mid_v2:'synthetic-mid',cookie_token_v2:'synthetic-cookie'};assert.equal(cookieCapabilities(cleanCookies(full)).wishes,true);
 for(const bad of [{ltoken_v2:cookies.ltoken_v2},{...full,account_id_v2:'99999'},{...full,ltmid_v2:'different'},{ltuid_v2:'12345'}])assert.throws(()=>cleanCookies(bad),UserError);
 for(const bad of [text+'\npassword=secret',text+'\nltuid_v2=12345',text.replace('v2_','v2_\\'),text.replace('ltoken_v2','Itoken_v2')])assert.throws(()=>parseCookieEntry(bad),UserError);
});

test('wish authkey refuses HoYoLAB-only cookies before issuing any network request',async()=>{
 let calls=0;const h=new Hoyo({fetcher:async()=>{calls++;throw new Error();}});await assert.rejects(h.authkey(cookies,role),/HoYoLAB-only/);assert.equal(calls,0);
});

test('explicit private cookie entry deletes first, verifies roster, encrypts session and does not claim wish access',async t=>{
 const f=setup(t);await f.run('/cookiebegin');f.events.length=0;await f.run(text);
 assert.equal(f.events[0],'deleteMessage');assert.equal(f.events[1],'roles');assert.deepEqual(f.vault.load('1'),cookies);assert.equal(f.store.roster('1',role.uid).characters[0].constellation,1);assert.equal(f.authRequests(),0);
 assert.equal(f.store.getUI('1').cookieLogin,undefined);assert.equal(f.store.connection('1',true).secret.includes(cookies.ltoken_v2),false);assert.equal(JSON.stringify(f.events).includes(cookies.ltoken_v2),false);
 assert.match(f.events.at(-1).text,/Wish auto-sync is disabled/);assert.equal(f.store.connection('2'),null);
 await f.run('/login');assert.match(f.events.at(-1).text,/HoYoLAB only · wish auto-sync disabled/);await f.run('/history');assert.match(f.events.at(-1).text,/wish auto-sync disabled/);
 await f.run(text);assert.match(f.events.at(-1).text,/Cookie entry is not active/);
});

test('accidental token posts, cancelled requests, expired entry and group messages never log in',async t=>{
 const f=setup(t);assert.equal(hasSecret(cookies.ltoken_v2),true);assert.equal(hasSecret(text),true);
 await f.run(cookies.ltoken_v2);assert.equal(f.events[0],'deleteMessage');assert.equal(f.store.connection('1'),null);
 await f.run('/cookiebegin');await f.run('/login');await f.run(text);assert.equal(f.store.connection('1'),null);
 await f.run('/cookiebegin');const ui=f.store.getUI('1');ui.cookieLogin.expires=0;f.store.setUI('1',ui);await f.run(text);assert.match(f.events.at(-1).text,/expired/);assert.equal(f.store.connection('1'),null);
 const n=f.events.length;await f.run(text,1,'group');assert.equal(f.events.length,n);
});

test('failed deletion or upstream verification preserves the previous session without persisting new cookies',async t=>{
 const f=setup(t);f.vault.save('1',{...cookies,ltoken_v2:'v2_'+('PREVIOUS_TEST_'.repeat(8))});const old=f.store.connection('1',true).secret;
 await f.run('/cookiebegin');f.telegram.call=async()=>{throw new Error('synthetic');};await f.run(text);assert.equal(f.store.connection('1',true).secret,old);assert.match(f.events.at(-1).text,/not saved/);
 f.telegram.call=async()=>({});await f.run('/cookiebegin');f.hoyo.roster=async()=>{throw new HoyoError('-100');};await f.run(text);assert.equal(f.store.connection('1',true).secret,old);
});

test('cancellation during verification cannot save a new connection or recreate deleted data',async t=>{
 const f=setup(t);await f.run('/cookiebegin');f.hoyo.roles=async()=>{f.store.deleteUser('1',f.store.confirmation('1'));return [role];};await f.run(text);assert.equal(f.store.connection('1'),null);assert.equal(f.store.accounts('1').length,0);assert.match(f.events.at(-1).text,/changed or expired/);
});

test('HoYoLAB-only periodic sync skips wishes, saves data and recognizes expired or unavailable upstream access',async t=>{
 const f=setup(t);f.vault.save('1',cookies);let wishes=0;f.hoyo.wishes=async()=>{wishes++;throw new Error('should not be called');};f.hoyo.achievementTotal=async()=>123;
 const sync=new SyncService({store:f.store,vault:f.vault,hoyo:f.hoyo});const result=await sync.request('1');assert.equal(result.wishes,false);assert.equal(wishes,0);assert.equal(f.store.roster('1',role.uid).characters.length,1);assert.equal(f.store.achievementTotal('1',role.uid).total,123);
 f.hoyo.achievementTotal=async()=>{throw new HoyoError('-100');};await assert.rejects(sync.request('1'));assert.equal(f.store.connection('1').status,'expired');
 f.hoyo.achievementTotal=async()=>{throw new HoyoError('NETWORK');};f.hoyo.roster=async()=>{throw new HoyoError('NETWORK');};await assert.rejects(sync.request('1'));assert.equal(f.store.connection('1').status,'retry');assert.equal(f.store.roster('1',role.uid).characters.length,1);await sync.stop();
});

test('full manual login verifies wish access, keeps incomplete input from downgrading an existing session, and scopes credentials',async t=>{
 const f=setup(t),full={...cookies,account_id_v2:'12345',account_mid_v2:'synthetic-mid',cookie_token_v2:'synthetic-cookie'};
 const complete=Object.entries(full).map(([k,v])=>k+'='+v).join('\n');
 f.vault.save('1',full);const old=f.store.connection('1',true).secret;
 await f.run('/cookiemode:wishes');assert.equal(f.store.getUI('1').cookieLogin.mode,'wishes');
 await f.run(text);assert.match(f.events.at(-1).text,/Missing required cookies/);assert.equal(f.store.connection('1',true).secret,old);assert.equal(f.authRequests(),0);
 f.hoyo.authkey=async()=>{throw new HoyoError('-100');};await f.run(complete);assert.equal(f.store.connection('1',true).secret,old);
 let verified=0;f.hoyo.authkey=async()=>{verified++;return 'synthetic';};f.events.length=0;await f.run(complete);
 assert.equal(f.events[0],'deleteMessage');assert.equal(verified,1);assert.deepEqual(f.vault.load('1'),full);assert.match(f.events.at(-1).text,/Wish syncing is enabled/);assert.equal(f.store.connection('2'),null);
 for(const value of [full.ltoken_v2,full.cookie_token_v2]){assert.ok(!JSON.stringify(f.events).includes(value));assert.ok(!JSON.stringify(f.store.getUI('1')).includes(value));assert.ok(!f.store.connection('1',true).secret.includes(value));}
});

test('explicit HoYoLAB-only entry refuses a broader credential set; cancellation and bad modes do not authenticate',async t=>{
 const f=setup(t);await f.run('/cookiemode:hoyolab');await f.run(text+'\naccount_id_v2=12345\naccount_mid_v2=synthetic-mid\ncookie_token_v2=synthetic-cookie');assert.match(f.events.at(-1).text,/HoYoLAB-only mode/);assert.equal(f.store.connection('1'),null);
 await f.run(text);assert.match(f.events.at(-1).text,/Wish auto-sync is disabled/);
 await f.run('/cookiemode:wishes');await f.run('/cookieguide:android');assert.equal(f.store.getUI('1').cookieLogin,undefined);
 await f.run('/cookiemode:invalid');assert.match(f.events.at(-1).text,/Choose a connection mode/);assert.equal(f.store.getUI('1').cookieLogin,undefined);
});

test('phone guides identify real browsers, list wish cookies, preserve privacy and warn about Safari visibility',async t=>{
 const f=setup(t);await f.run('/cookieguide');assert.match(f.events.at(-1).text,/does not add DevTools/);
 for(const platform of ['android','ios','desktop']){
  await f.run('/cookieguide:'+platform);const guide=f.events.at(-1);assert.ok(guide.text.length<4096);assert.match(guide.text,/cookie_token_v2/);assert.match(guide.text,/same (HoYoverse )?account/);assert.match(guide.text,/Telegram receives raw/);
  const buttons=guide.reply_markup.inline_keyboard.flat();assert.ok(buttons.some(b=>b.callback_data==='cookiemode:wishes'));assert.ok(buttons.some(b=>b.callback_data==='cookiemode:hoyolab'));
  if(platform==='android'){assert.match(guide.text,/Firefox for Android/);assert.ok(buttons.some(b=>b.url?.startsWith('https://addons.mozilla.org/')));}
  if(platform==='ios'){assert.match(guide.text,/HttpOnly/);assert.ok(buttons.some(b=>b.url==='https://apps.apple.com/app/cookie-editor/id6446215341'));}
 }
 await f.run('/cookieguide:invalid');assert.match(f.events.at(-1).text,/Choose Android/);
});
