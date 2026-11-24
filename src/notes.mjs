export const SERVER_OFFSETS=Object.freeze({os_usa:-5,os_euro:1,os_asia:8,os_cht:8});
export const NOTE_INTERVAL=600000;
const hour=3600000,day=24*hour;
const integer=(value,min,max)=>{if(!Number.isSafeInteger(value)||value<min||value>max)throw Error('INVALID_DAILY_NOTES');return value;};
export function normalizeNotes(data){
 if(!data||typeof data!=='object')throw Error('INVALID_DAILY_NOTES');
 const maxResin=integer(data.max_resin,1,10000),resin=integer(data.current_resin,0,100000);
 const recovery=typeof data.resin_recovery_time==='string'&&/^\d+$/.test(data.resin_recovery_time)?Number(data.resin_recovery_time):data.resin_recovery_time;
 integer(recovery,0,31536000);
 const daily=data.daily_task;
 const total=integer(daily?.total_num??data.total_task_num,0,100);
 const finished=integer(daily?.finished_num??data.finished_task_num,0,total);
 const claimed=daily?.is_extra_task_reward_received??data.is_extra_task_reward_received;
 if(typeof claimed!=='boolean')throw Error('INVALID_DAILY_NOTES');
 return {resin,maxResin,recoverySeconds:recovery,total,finished,bonusClaimed:claimed,dailyComplete:total===0||claimed};
}
export function resetWindow(region,now=Date.now()){
 const offset=SERVER_OFFSETS[region];if(offset===undefined||!Number.isFinite(now))throw Error('INVALID_SERVER');
 const cycle=Math.floor((now+offset*hour-4*hour)/day);
 const reset=(cycle+1)*day+4*hour-offset*hour;
 return {cycle:String(cycle),reset,start:reset-2*hour,inWindow:now>=reset-2*hour&&now<reset};
}
export function nextNoteCheck(settings,now){
 const w=resetWindow(settings.region,now);
 let next=now+day;
 if(settings.resin_enabled)next=now+NOTE_INTERVAL;
 if(settings.daily_enabled){const daily=settings.daily_cycle===w.cycle?w.start+day:w.inWindow?now+NOTE_INTERVAL:w.start;next=Math.min(next,daily);}
 return Math.max(now+1000,next);
}
export function notesError(code){
 if(['10102','10103'].includes(String(code)))return 'Enable Real-Time Notes in HoYoLAB → Battle Chronicle, then tap Check now.';
 if(['-100','10001','-101','401','-1071','HOYOLAB_LOGIN'].includes(String(code)))return 'Reconnect HoYoLAB through Connect to resume checks.';
 if(code==='ACCOUNT_MISMATCH')return 'This UID is not part of the current HoYoLAB login. Reconnect the matching account.';
 if(code==='TELEGRAM_BLOCKED')return 'Telegram could not deliver alerts. Start the bot again and enable reminders.';
 if(code==='DELIVERY')return 'Telegram could not deliver the alert. The bot will retry after a short delay.';
 if(code==='DELIVERY_UNCERTAIN')return 'Telegram did not confirm delivery. To avoid duplicates, that alert will not be repeated.';
 return 'HoYoLAB is temporarily unavailable. The bot will retry; no alert is inferred from old data.';
}
