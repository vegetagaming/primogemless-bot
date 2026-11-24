import {setTimeout as delay} from 'node:timers/promises';
import {HoyoError} from './hoyo.mjs';
import {UserError} from './history.mjs';
import {cookieCapabilities} from './vault.mjs';
import {normalizeNotes,resetWindow,nextNoteCheck} from './notes.mjs';

export class ReminderService {
 constructor({store,vault,hoyo,telegram,now=()=>Date.now(),pause=()=>delay(1000)}){Object.assign(this,{store,vault,hoyo,tg:telegram,now,pause});this.jobs=new Map();this.operations=new Map();this.controllers=new Set();this.tail=Promise.resolve();this.closed=false;}
 async enable(owner,uid,kind,enabled){
  owner=String(owner);
  if(!['daily','resin'].includes(kind)||typeof enabled!=='boolean'||!this.store.accounts(owner).some(a=>a.uid===uid))throw new UserError('Choose your own account and reminder.');
  const key=owner+':'+uid,operation=Symbol();this.operations.set(key,operation);
  if(!enabled){this.store.disableReminder(owner,uid,kind);this.operations.delete(key);return;}
  try{
  const session=this.store.connection(owner,true);if(!session||session.status==='expired')throw new UserError('Connect HoYoLAB before enabling reminders.');
  const cookies=this.vault.load(owner);if(!cookieCapabilities(cookies).hoyolab)throw new UserError('Reconnect through the Windows helper and sign in to HoYoLAB as well.');
  const roles=await this.hoyo.roles(cookies),role=roles.find(r=>r.uid===uid);
  if(this.closed||this.operations.get(key)!==operation||this.store.connection(owner,true)?.secret!==session.secret)throw new UserError('Your connection or settings changed. Open Reminders again.');
  if(!role)throw new UserError('This UID is not part of your current HoYoLAB login.');
  this.store.setReminder(owner,role,kind,true,this.now());
  await this.request(owner,uid);
  }finally{if(this.operations.get(key)===operation)this.operations.delete(key);}
 }
 request(owner,uid){
  owner=String(owner);const key=owner+':'+uid;if(this.jobs.has(key))return this.jobs.get(key);
  const job=this.tail.then(()=>this.run(owner,uid)).finally(()=>this.jobs.delete(key));
  this.jobs.set(key,job);this.tail=job.catch(()=>{});return job;
 }
 async run(owner,uid){
  const initial=this.store.reminder(owner,uid),session=this.store.connection(owner,true);
  if(this.closed||!initial||(!initial.daily_enabled&&!initial.resin_enabled)||!session||session.status==='expired')return;
  if(['DELIVERY','429'].includes(initial.error_code)&&initial.next_check>this.now())return;
  if(initial.attempted_at!==null&&this.now()-initial.attempted_at<60000)return;
  const revision=initial.revision,controller=new AbortController();this.controllers.add(controller);
  const current=()=>!this.closed&&this.store.connection(owner,true)?.secret===session.secret&&this.store.reminder(owner,uid)?.revision===revision;
  try{
   this.store.attemptReminder(owner,uid,revision,this.now());
   const cookies=this.vault.load(owner);if(!cookieCapabilities(cookies).hoyolab)throw new HoyoError('HOYOLAB_LOGIN');
   const roles=await this.hoyo.roles(cookies,controller.signal),role=roles.find(r=>r.uid===uid&&r.region===initial.region);
   if(!current())return;if(!role)throw new HoyoError('ACCOUNT_MISMATCH');
   const notes=normalizeNotes(await this.hoyo.dailyNotes(cookies,role,controller.signal));
   if(!current())return;
   const now=this.now(),window=resetWindow(role.region,now);
   this.store.recordReminder(owner,uid,revision,{notes,checked:now,next:nextNoteCheck(initial,now),error:null});
   // Only a fresh observed value below cap rearms a full-resin notification.
   if(notes.resin<notes.maxResin)this.store.setResinNotified(owner,uid,revision,false);
   const events=[];
   if(initial.daily_enabled&&window.inWindow&&!notes.dailyComplete){
    const minutes=Math.max(1,Math.ceil((window.reset-now)/60000));
    const body=notes.finished<notes.total?`${notes.finished}/${notes.total} daily commissions completed. Finish or use Encounter Points and claim your daily rewards.`:'Your daily commissions are complete, but the bonus reward is still unclaimed. Visit Katheryne to claim it.';
    events.push({kind:'daily',cycle:window.cycle,text:`<b>📅 Daily Commissions</b>\nUID <code>${uid}</code>\n\n${body}\nServer reset in about ${minutes} minutes.\n\n<i>Checked just now through HoYoLAB.</i>`});
   }
   if(initial.resin_enabled&&notes.resin>=notes.maxResin)events.push({kind:'resin',cycle:null,text:`<b>💧 Original Resin is full</b>\nUID <code>${uid}</code>\n\n<b>${notes.resin} / ${notes.maxResin}</b> Original Resin\nSpend some when you can.\n\n<i>Checked just now through HoYoLAB.</i>`});
   for(const event of events){
    if(!current())return;
    // Claim before sending: a restart or ambiguous network failure must not spam.
    if(!this.store.claimReminder(owner,uid,revision,event.kind,event.cycle))continue;
    try{await this.tg.message(owner,event.text,{parse_mode:'HTML',reply_markup:{inline_keyboard:[[{text:'🔔 Reminder settings',callback_data:'reminders:'+uid}]]}});}
    catch(error){
     if(!current())return;
     if(error.code===403){this.store.disableAllReminders(owner,'TELEGRAM_BLOCKED');return;}
     if(typeof error.code==='number'&&error.code>=400&&error.code<500){
      this.store.releaseReminder(owner,uid,revision,event.kind,event.cycle);
      const retry=Math.max(60000,Math.min(86400000,(Number(error.retryAfter)||600)*1000));
      this.store.deferReminder(owner,uid,revision,this.now()+retry,'DELIVERY');return;
     }
     this.store.deferReminder(owner,uid,revision,this.now()+600000,'DELIVERY_UNCERTAIN');return;
    }
   }
   if(current())this.store.deferReminder(owner,uid,revision,nextNoteCheck(this.store.reminder(owner,uid),this.now()),null);
  }catch(error){
   if(current())this.store.deferReminder(owner,uid,revision,this.now()+3600000,error instanceof HoyoError?error.code:'NOTES_UNAVAILABLE');
  }finally{this.controllers.delete(controller);if(!this.closed)await this.pause();}
 }
 start(){const tick=()=>{if(this.closed)return;for(const row of this.store.dueReminders(this.now()))this.request(row.owner,row.uid).catch(()=>{});this.timer=setTimeout(tick,30000);this.timer.unref();};tick();}
 async stop(){this.closed=true;clearTimeout(this.timer);for(const controller of this.controllers)controller.abort();await this.tail;}
}
