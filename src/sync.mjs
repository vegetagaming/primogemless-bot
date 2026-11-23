import {HoyoError} from './hoyo.mjs';
import {refreshSchedule} from './patches.mjs';
import {cookieCapabilities} from './vault.mjs';
export class SyncService {
 constructor({store,vault,hoyo}){this.store=store;this.vault=vault;this.hoyo=hoyo;this.jobs=new Map();this.controllers=new Map();this.tail=Promise.resolve();this.closed=false;}
 request(owner){owner=String(owner);if(this.jobs.has(owner))return this.jobs.get(owner);const job=this.tail.then(()=>this.run(owner)).finally(()=>this.jobs.delete(owner));this.jobs.set(owner,job);this.tail=job.catch(()=>{});return job;}
 async run(owner){
  if(this.closed||!this.store.connection(owner))return {cancelled:true};
  let added=0,rosters=0,diaries=0,totals=0;
  const sessionSecret=this.store.connection(owner,true)?.secret;
  const controller=new AbortController();this.controllers.set(owner,controller);
  try{
   const session=this.store.connection(owner,true),cookies=this.vault.load(owner),capabilities=cookieCapabilities(cookies),roles=await this.hoyo.roles(cookies);
   for(const role of roles){
    if(this.closed||this.store.connection(owner,true)?.secret!==session.secret)return {cancelled:true};
    const known=new Set(this.store.rows(owner,role.uid).map(x=>x.id));
    const parsed=capabilities.wishes?await this.hoyo.wishes(cookies,role,known,controller.signal):{accounts:[{...role,list:[]}]};
    // A disconnect or replacement login during a request must not re-create deleted data.
    if(this.closed||this.store.connection(owner,true)?.secret!==session.secret)return {cancelled:true};
    added+=this.store.import(owner,parsed).added;
    const optionalFailure=error=>{if(!capabilities.wishes&&error instanceof HoyoError&&error.auth)throw error;};
    try{const total=await this.hoyo.achievementTotal(cookies,role);if(this.store.connection(owner,true)?.secret===session.secret&&Number.isSafeInteger(total)){this.store.setAchievementTotal(owner,role.uid,total);totals++;}}catch(error){optionalFailure(error);}
    if(this.hoyo.diary)try{const diary=await this.hoyo.diary(cookies,role);if(this.store.connection(owner,true)?.secret===session.secret){this.store.saveDiary(owner,role.uid,diary);diaries++;}}catch(error){optionalFailure(error);}
    if(this.hoyo.roster)try{const roster=await this.hoyo.roster(cookies,role,controller.signal);if(!this.closed&&this.store.connection(owner,true)?.secret===session.secret){this.store.saveRoster(owner,role.uid,roster);rosters++;}}catch(error){optionalFailure(error);}
   }
   if(this.closed||this.store.connection(owner,true)?.secret!==session.secret)return {cancelled:true};
   if(!capabilities.wishes&&!rosters&&!diaries&&!totals)throw new HoyoError('HOYOLAB_UNAVAILABLE');
   this.store.syncState(owner,{success:true});return {added,accounts:roles.length,wishes:capabilities.wishes,rosters,diaries};
  }catch(error){if(this.closed||this.store.connection(owner,true)?.secret!==sessionSecret)return {cancelled:true};const expired=error instanceof HoyoError&&error.auth;this.store.syncState(owner,{status:expired?'expired':'retry',next:Date.now()+3600000,error:error instanceof HoyoError?error.code:'DATA'});throw error;}finally{this.controllers.delete(owner);}
 }
 start(){const tick=()=>{if(this.closed)return;refreshSchedule(this.store,this.hoyo).catch(()=>{});for(const {owner}of this.store.dueConnections())this.request(owner).catch(()=>{});this.timer=setTimeout(tick,60000);this.timer.unref();};tick();}
 async stop(){this.closed=true;clearTimeout(this.timer);for(const c of this.controllers.values())c.abort();await this.tail;}
}
