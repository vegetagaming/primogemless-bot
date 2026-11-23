import test from 'node:test';
import assert from 'node:assert/strict';
import {Store} from '../src/store.mjs';
import {BotApp,COMMANDS} from '../src/app.mjs';
import {Hoyo} from '../src/hoyo.mjs';
import {SyncService} from '../src/sync.mjs';
import {normalizeRoster,equippedFiveStars,parseManualWeapon,weaponCatalogue} from '../src/roster-data.mjs';
import {UserError} from '../src/history.mjs';
import {CardRenderer} from '../src/render.mjs';

const uid='712345678',role={uid,region:'os_euro',timezone:1,lang:'en-us'};
const raw=()=>({list:[
 {id:10000069,name:'Tighnari',rarity:5,level:90,actived_constellation_num:2,weapon:{id:15501,name:'Skyward Harp',rarity:5,level:90,affix_level:1}},
 {id:10000031,name:'Fischl',rarity:4,level:80,actived_constellation_num:6,weapon:{id:15501,name:'Skyward Harp',rarity:5,level:80,affix_level:2}},
 {id:10000062,name:'Aloy',rarity:105,level:70,actived_constellation_num:0,weapon:{id:15401,name:'Favonius Warbow',rarity:4,level:70,affix_level:3}}
]});
const normalized=()=>normalizeRoster(raw(),role);
function setup(t){const store=new Store(':memory:');t.after(()=>store.close());for(const owner of ['1','2'])store.import(owner,{accounts:[{...role,list:[]}],inputCount:0});return store;}
function appFor(store,extra={}){const calls=[],telegram={call:async(method,p)=>{calls.push({method,...p});return {};},message:async(chat,text,p)=>calls.push({chat,text,...p}),document:async(chat,bytes,name)=>calls.push({chat,bytes,name})};return {app:new BotApp({store,telegram,...extra}),calls};}
const mw={weapon_id:'15501',quantity:2,refinement:1,level:90};

test('roster records reported constellations, collaboration rarity, and separate equipped copies',()=>{
 const list=normalized();assert.equal(list[0].constellation,2);assert.equal(list[2].rank,5);assert.equal(list[2].constellation,0);
 const weapons=equippedFiveStars(list);assert.equal(weapons.length,2);assert.notEqual(weapons[0].holderId,weapons[1].holderId);assert.equal(weapons[1].refinement,2);
 for(const mutation of [d=>delete d.list[0].actived_constellation_num,d=>d.list.push(d.list[0]),d=>d.uid='799999999',d=>d.list[0].weapon.affix_level=6]){const d=raw();mutation(d);assert.throws(()=>normalizeRoster(d,role),UserError);}
 assert.equal(weaponCatalogue.every(w=>w.rarity===5),true);assert.ok(weaponCatalogue.length>50);
});

test('manual inventory replaces quantities by exact variant, isolates players, rejects collisions and cascades deletion',t=>{
 const s=setup(t);s.saveRoster('1',uid,normalized());const id=s.saveManualWeapon('1',uid,mw);
 assert.equal(s.saveManualWeapon('1',uid,{...mw,quantity:3}),id);assert.equal(s.manualWeapons('1',uid)[0].quantity,3);
 const variant=s.saveManualWeapon('1',uid,{...mw,refinement:2});assert.notEqual(variant,id);
 assert.throws(()=>s.saveManualWeapon('1',uid,{...mw,refinement:2},id),UserError);
 assert.throws(()=>s.saveManualWeapon('2',uid,mw,id),UserError);assert.throws(()=>s.removeManualWeapon('2',uid,id),UserError);
 assert.throws(()=>s.saveManualWeapon('3',uid,mw),UserError);assert.equal(s.manualWeapons('2',uid).length,0);assert.equal(s.roster('2',uid),null);
 s.removeManualWeapon('1',uid,variant);assert.equal(s.manualWeapons('1',uid).length,1);
 for(const text of ['0 1 90','2 6 90','2 1 101','2.1 1 90','2 1'])assert.throws(()=>parseManualWeapon('15501',text),UserError);
 assert.throws(()=>parseManualWeapon('15401','1 1 90'),UserError);
 s.saveManualWeapon('2',uid,mw);s.deleteUser('1',s.confirmation('1'));assert.equal(s.roster('1',uid),null);assert.equal(s.manualWeapons('1',uid).length,0);assert.equal(s.manualWeapons('2',uid).length,1);
});

test('HoYo roster uses the read-only character/list POST with the selected role',async()=>{
 const requests=[],h=new Hoyo({fetcher:async(url,options)=>{requests.push({url,options});return {ok:true,json:async()=>({retcode:0,data:raw()})};}});
 assert.equal((await h.roster({},role)).length,3);
 assert.equal(String(requests[0].url),'https://sg-public-api.hoyolab.com/event/game_record/genshin/api/character/list');assert.equal(requests[0].options.method,'POST');assert.deepEqual(JSON.parse(requests[0].options.body),{role_id:uid,server:'os_euro'});
});

test('roster refresh checks account ownership, preserves cache on errors, and cannot recreate data after disconnect',async t=>{
 const store=setup(t);store.saveRoster('1',uid,normalized());store.saveConnection('1','synthetic');let fetches=0;
 const {app}=appFor(store,{vault:{load:()=>({})},hoyo:{roles:async()=>[{...role,uid:'799999999'}],roster:async()=>{fetches++;return normalized();}}});
 await assert.rejects(app.roster.refresh(1,'1',uid),/does not own/);assert.equal(fetches,0);assert.equal(store.roster('1',uid).characters[0].constellation,2);
 app.roster.refreshed.clear();app.hoyo.roles=async()=>[role];app.hoyo.roster=async()=>{throw new Error('synthetic upstream failure');};
 await assert.rejects(app.roster.refresh(1,'1',uid),/synthetic/);assert.equal(store.roster('1',uid).characters.length,3);
 app.roster.refreshed.clear();app.hoyo.roster=async()=>{store.disconnect('1');return normalized();};
 await assert.rejects(app.roster.refresh(1,'1',uid),/connection changed/);assert.equal(store.connection('1'),null);
 store.saveConnection('1','replacement');app.roster.refreshed.clear();app.hoyo.roster=async()=>{store.deleteUser('1',store.confirmation('1'));return normalized();};
 await assert.rejects(app.roster.refresh(1,'1',uid),/connection changed/);assert.equal(store.roster('1',uid),null);
});

test('automatic sync saves roster without changing manual weapons; optional roster failure does not lose wishes',async t=>{
 const store=setup(t);store.saveConnection('1','synthetic');store.saveManualWeapon('1',uid,mw);
 const hoyo={roles:async()=>[role],wishes:async()=>({accounts:[{...role,list:[]}]}),achievementTotal:async()=>10,roster:async()=>normalized()},sync=new SyncService({store,hoyo,vault:{load:()=>({account_id_v2:'12345',account_mid_v2:'synthetic-mid',cookie_token_v2:'synthetic-cookie'})}});
 await sync.request('1');assert.equal(store.roster('1',uid).characters.length,3);assert.equal(store.manualWeapons('1',uid)[0].quantity,2);
 hoyo.roster=async()=>{throw new Error('unavailable');};await sync.request('1');assert.equal(store.roster('1',uid).characters.length,3);assert.equal(store.connection('1').status,'active');await sync.stop();
});

test('roster menu, filters, manual add/edit/remove, search and export work within the four-command bot',async t=>{
 const store=setup(t),{app,calls}=appFor(store);store.saveRoster('1',uid,normalized());
 const run=async(text,owner=1)=>{app.limits.clear();return app.handle({message:{text,from:{id:owner},chat:{id:owner,type:'private'},message_id:1}});};
 await run('/history');assert.ok(calls.at(-1).reply_markup.inline_keyboard.flat().some(x=>x.callback_data==='characters'));
 await run('/characters');assert.match(calls.at(-1).text,/Your owned characters/);
 await run('/oc:'+uid+':5:0');const buttons=calls.at(-1).reply_markup.inline_keyboard.flat();assert.ok(buttons.some(b=>b.text.includes('Tighnari · C2')));assert.ok(!buttons.some(b=>b.text.includes('Fischl')));
 await run('/wasrch:'+uid);await run('Skyward');assert.match(calls.at(-1).text,/matches/);
 await run('/wa:'+uid+':clear');assert.match(calls.at(-1).text,new RegExp(weaponCatalogue.length+' matches'));
 await run('/was:'+uid+':15501');await run('2 1 90');const id=store.manualWeapons('1',uid)[0].id;assert.match(calls.at(-1).text,/R1 · Level 90 · ×2/);
 await run('/wedit:'+uid+':'+id);await run('3 2 80');assert.equal(store.manualWeapons('1',uid)[0].refinement,2);
 await run('/oexport:'+uid);const data=JSON.parse(calls.at(-1).bytes);assert.equal(data.unequipped_manual.length,1);assert.equal(data.unequipped_manual[0].owner,undefined);
 await run('/owm:'+uid+':'+id,2);assert.match(calls.at(-1).text,/unavailable/);
 await run('/wdelok:'+uid+':'+id);assert.equal(store.manualWeapons('1',uid).length,0);assert.equal(COMMANDS.length,4);
});

test('visible history hides 3-star rows while total, export and pity still count them',async t=>{
 const store=setup(t),rows=[5,3,3,3,3,4,3,3,3,5].map((rank,i)=>({id:String(i+1),name:rank===3?'Hidden three-star':rank===4?'Fischl':'Tighnari',item_id:rank===3?'11301':rank===4?'10000031':'10000069',rank_type:String(rank),gacha_type:'301',count:'1',time:'2026-11-01 00:00:'+String(i).padStart(2,'0'),item_type:rank===3?'Weapon':'Character'}));
 store.import('1',{accounts:[{...role,list:rows}]});const {app,calls}=appFor(store);await app.wishes(1,'1',uid,'all',0);
 assert.doesNotMatch(calls.at(-1).text,/Hidden three-star|3★/);assert.match(calls.at(-1).text,/3 shown of 10 total/);assert.match(calls.at(-1).text,/1\/1/);
 assert.equal(app.group('1',uid,'all').rows[0].pity.count,9);assert.equal(store.export('1').hk4e[0].list.length,10);
});

test('owned cards render constellation and refinement instead of wish pity',async()=>{
 const r=new CardRenderer({source:async()=>null});const grid=await r.render({type:'ownedgrid',title:'Synthetic demo',subtitle:'Not account data',kind:'c',page:0,pages:1,items:[{id:'10000069',name:'Tighnari',rank:'5',badge:'C2',secondary:'LEVEL 90',detail:'CONSTELLATION'}]});
 assert.match(grid.svg,/>C2</);assert.doesNotMatch(grid.svg,/pity|LATEST SAVED PULL/);assert.ok(grid.png().length>1000);
 const detail=await r.render({type:'ownedDetail',id:'15501',name:'Skyward Harp',rank:'5',title:'SYNTHETIC DEMO',badge:'R1',badgeLabel:'REFINEMENT',metrics:[{value:90,label:'LEVEL'},{value:'×2',label:'COPIES'}],footer:'Not account data'});assert.match(detail.svg,/>R1</);assert.ok(detail.png().length>1000);
});
