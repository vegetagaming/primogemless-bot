import {UserError} from './history.mjs';

export const WELKIN_DAY_MS=24*60*60*1000;
export function welkinDays(value){
 if(!Number.isSafeInteger(value)||value<0||value>180)throw new UserError('Welkin days must be a whole number from 0 to 180.');
 return value;
}
export function parseWelkinDays(text){
 if(typeof text!=='string'||!/^\d{1,3}$/.test(text.trim()))throw new UserError('Send one whole number from 0 to 180 for your remaining Welkin days.');
 return welkinDays(Number(text.trim()));
}
export function welkinRecord(days,now=Date.now()){
 welkinDays(days);
 if(!Number.isSafeInteger(now)||now<0)throw new UserError('Invalid Welkin start time.');
 return {days,recorded_at:new Date(now).toISOString()};
}
export function welkinCountdown(record,now=Date.now()){
 if(!record)return null;
 const days=welkinDays(record.days),start=Date.parse(record.recorded_at);
 if(!Number.isSafeInteger(start)||!Number.isSafeInteger(now))throw new UserError('Invalid Welkin countdown time.');
 const elapsed=Math.min(days,Math.floor(Math.max(0,now-start)/WELKIN_DAY_MS)),remaining=days-elapsed;
 return {...record,remaining_days:remaining,next_decrease_at:remaining?new Date(start+(elapsed+1)*WELKIN_DAY_MS).toISOString():null,expires_at:new Date(start+days*WELKIN_DAY_MS).toISOString()};
}
