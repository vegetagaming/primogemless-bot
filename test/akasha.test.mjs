import test from 'node:test';
import assert from 'node:assert/strict';
import {Store} from '../src/store.mjs';
import {BotApp} from '../src/app.mjs';
import {CardRenderer} from '../src/render.mjs';
import {Enka,normalizeShowcase} from '../src/enka.mjs';
import {akashaLinks} from '../src/akasha.mjs';
const uid='712345678';
const data=()=>({uid,ttl:120,playerInfo:{nickname:'Test <Traveler>',level:60},avatarInfoList:[{avatarId:10000069,propMap:{4001:{val:'90'}},talentIdList:[1,2],fightPropMap:{2000:18000,2001:1600,2002:800,20:.75,22:1.65,23:1.2,28:400,43:.466},equipList:[{itemId:15501,weapon:{level:90,affixMap:{115501:2}}},{reliquary:{level:21},flat:{equipType:'EQUIP_DRESS',rankLevel:5,icon:'UI_RelicIcon_15001_3',reliquaryMainstat:{mainPropId:'FIGHT_PROP_CRITICAL',statValue:31.1},reliquarySubstats:[{appendPropId:'FIGHT_PROP_CRITICAL_HURT',statValue:21},{appendPropId:'FIGHT_PROP_ATTACK_PERCENT',statValue:5.8}]}}]}]});
test('Enka normalization uses totals, percentage scales, C/R, artifact main/substats and isolated CV',()=>{
 const p=normalizeShowcase(data(),uid),b=p.builds[0];assert.equal(b.name,'Tighnari');assert.equal(b.constellation,2);assert.equal(b.weapon.refinement,3);assert.equal(b.level,90);assert.equal(b.stats.find(x=>x.label==='CRIT Rate').value,'75.0%');assert.equal(b.stats.find(x=>x.label==='HP').value,'18,000');assert.equal(b.stats.at(-1).label,'Dendro DMG');assert.equal(b.stats.at(-1).value,'46.6%');assert.equal(b.artifacts[4].level,20);assert.equal(b.cv,83.2);assert.equal(b.artifacts[4].main.text,'31.1%');assert.equal(b.artifacts[0].missing,true);
 assert.equal(normalizeShowcase({uid,playerInfo:{nickname:'Hidden'}},uid).builds.length,0);
 assert.throws(()=>normalizeShowcase(data(),'723456789'),/did not match/);
 for(const invalid of ['../x','https://example.com','712345678?a=b'])assert.throws(()=>akashaLinks(invalid));
 assert.deepEqual(akashaLinks(uid),{profile:'https://akasha.cv/profile/'+uid,enka:'https://enka.network/u/'+uid+'/',leaderboards:'https://akasha.cv/leaderboards'});
});
test('Enka honors TTL, deduplicates requests, sends no credentials and limits cache size',async()=>{
 let now=1000000,calls=0;const enka=new Enka({now:()=>now,fetcher:async(url,opts)=>{calls++;assert.equal(url,'https://enka.network/api/uid/'+uid+'/');assert.equal(opts.redirect,'error');assert.ok(opts.headers['User-Agent'].includes('Primogemless'));assert.deepEqual(Object.keys(opts.headers).sort(),['Accept','User-Agent']);return Response.json(data());}});
 const [a,b]=await Promise.all([enka.showcase(uid),enka.showcase(uid)]);assert.equal(calls,1);assert.equal(a,b);now+=119999;assert.equal(await enka.showcase(uid),a);assert.equal(calls,1);now++;await enka.showcase(uid);assert.equal(calls,2);
 for(let i=0;i<110;i++)enka.remember(String(i),{expires:now+1});assert.equal(enka.cache.size,100);
});
test('Enka handles rate limiting, hidden profiles, invalid payloads and timeouts without leaking upstream messages',async()=>{
 let now=1000000,calls=0;const enka=new Enka({now:()=>now,fetcher:async()=>{calls++;return new Response('do not display',{status:429,headers:{'Retry-After':'180'}});}});
 await assert.rejects(enka.showcase(uid),/Enka is busy/);now+=61000;await assert.rejects(enka.showcase('723456789'),/Enka is busy/);assert.equal(calls,1);now+=120000;await assert.rejects(enka.showcase(uid),/Enka is busy/);assert.equal(calls,2);
 for(const fetcher of [async()=>new Response('<html>private upstream</html>'),async()=>{throw new Error('secret upstream detail');},async()=>new Response('x',{headers:{'Content-Length':'2000001'}})]){const e=new Enka({fetcher});await assert.rejects(e.showcase(uid),error=>/could not load/.test(error.message)&&!error.message.includes('upstream'));}
 const hidden=new Enka({fetcher:async()=>Response.json({uid,playerInfo:{}})});assert.equal((await hidden.showcase(uid)).builds.length,0);
});
test('AKASHA is public, keeps account selection isolated, renders build cards, and explains hidden showcases',async t=>{
 const store=new Store(':memory:');t.after(()=>store.close());store.import('1',{accounts:[{uid,timezone:1,lang:'en-us',list:[]}]});store.import('2',{accounts:[{uid:'723456789',timezone:1,lang:'en-us',list:[]}]});
 const calls=[],requests=[],app=new BotApp({store,ownerId:'1',enka:{showcase:async u=>{requests.push(u);return {...normalizeShowcase(data(),u),refreshAt:'2026-11-24T12:34:56Z'};}},renderer:new CardRenderer(null),telegram:{call:async()=>({}),photo:async(p,b)=>{assert.equal(b.readUInt32BE(0),0x89504e47);calls.push(p);return {};},message:async(chat,text,opts)=>{calls.push({chat,text,...opts});return {};}}});
 assert.ok(app.menu('2').inline_keyboard.flat().some(b=>b.callback_data==='akasha'));assert.ok(!app.menu('2').inline_keyboard.flat().some(b=>b.callback_data==='savings'));
 await app.akasha.show('1','1');assert.match(calls.at(-1).caption,/ranks open on the website/);assert.equal(requests.length,0);
 await assert.rejects(app.akasha.builds('2','2',uid),/Connect your Genshin/);await assert.rejects(app.akasha.route('2','2',['akaccount',uid]),/Connect your Genshin/);assert.equal(requests.length,0);
 await app.akasha.builds('1','1',uid);assert.match(calls.at(-1).text,/Test &lt;Traveler&gt;/);assert.ok(calls.at(-1).reply_markup.inline_keyboard.flat().some(b=>b.callback_data==='akcard:'+uid+':10000069'));
 await app.akasha.builds('1','1',uid,'10000069');assert.match(calls.at(-1).caption,/C2/);assert.match(calls.at(-1).caption,/83.2/);
 await assert.rejects(app.akasha.builds('1','1',uid,'10000001'),/no longer/);
 app.akasha.enka={showcase:async()=>normalizeShowcase({uid,playerInfo:{}},uid)};await app.akasha.builds('1','1',uid);assert.match(calls.at(-1).text,/Show character details/);
 app.akasha.enka=new Enka({fetcher:async()=>new Response('',{status:503})});await app.akasha.builds('1','1',uid);assert.match(calls.at(-1).text,/Showcase unavailable/);assert.ok(calls.at(-1).reply_markup.inline_keyboard.flat().some(b=>b.url===akashaLinks(uid).profile));
 await app.handle({message:{message_id:1,chat:{id:1,type:'private'},from:{id:1},text:'/akasha'}});assert.match(calls.at(-1).caption,/AKASHA/);
 const svg=await app.renderer.svg({type:'showcase',...normalizeShowcase(data(),uid).builds[0],uid,nickname:'<test>'});assert.match(svg,/&lt;test&gt;/);assert.match(svg,/EQUIPPED ARTIFACTS/);assert.match(svg,/31.1%/);
});
