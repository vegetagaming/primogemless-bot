import {readFileSync} from 'node:fs';
import {UserError} from './history.mjs';
import {characterName} from './character-names.mjs';

export const weaponCatalogue=JSON.parse(readFileSync(new URL('../assets/five-star-weapons.json',import.meta.url))).items;
export const weaponById=new Map(weaponCatalogue.map(w=>[w.id,w]));
const integer=(value,min,max)=>{if(!Number.isSafeInteger(value)||value<min||value>max)throw new UserError('Invalid roster value. Your previous snapshot is unchanged.');return value;};
const id=value=>{const s=String(value??'');if(!/^\d{1,12}$/.test(s))throw new UserError('Invalid roster item ID.');return s;};
const name=value=>{if(typeof value!=='string'||!value.trim()||value.length>100||/[\u0000-\u001f]/.test(value))throw new UserError('Invalid roster name.');return value;};
export function validateRoster(rows){
 if(!Array.isArray(rows)||rows.length>1000)throw new UserError('HoYoLAB did not return a valid character roster.');
 const seen=new Set();
 return rows.map(c=>{
  const out={id:id(c.id),name:name(characterName(c.id,c.name)),rank:integer(c.rank,4,5),level:integer(c.level,1,100),constellation:integer(c.constellation,0,6)};
  if(seen.has(out.id))throw new UserError('HoYoLAB returned a duplicate character.');seen.add(out.id);
  if(c.weapon){const w=c.weapon;out.weapon={id:id(w.id),name:name(w.name),rank:integer(w.rank,1,5),level:integer(w.level,1,100),refinement:integer(w.refinement,1,5)};}
  else out.weapon=null;
  return out;
 });
}
export function normalizeRoster(data,role){
 if(data?.uid!==undefined&&String(data.uid)!==role.uid||data?.region!==undefined&&data.region!==role.region)throw new UserError('HoYoLAB returned a different account.');
 if(!Array.isArray(data?.list))throw new UserError('HoYoLAB did not return a character roster.');
 return validateRoster(data.list.map(c=>({id:c.id,name:c.name,rank:c.rarity===105?5:c.rarity,level:c.level,constellation:c.actived_constellation_num,weapon:c.weapon?{id:c.weapon.id,name:c.weapon.name,rank:c.weapon.rarity,level:c.weapon.level,refinement:c.weapon.affix_level}:null})));
}
export function manualWeapon(value){
 const weapon_id=String(value?.weapon_id??'');
 if(!weaponById.has(weapon_id))throw new UserError('Choose a 5★ weapon from the catalogue.');
 const {quantity,refinement,level}=value;
 if(!Number.isSafeInteger(quantity)||quantity<1||quantity>99||!Number.isSafeInteger(refinement)||refinement<1||refinement>5||!Number.isSafeInteger(level)||level<1||level>100)throw new UserError('Use quantity 1–99, refinement 1–5 and level 1–100. Example: 2 1 90');
 return {weapon_id,quantity,refinement,level};
}
export function parseManualWeapon(weapon_id,text){const p=text.trim().split(/\s+/);if(p.length!==3||p.some(v=>!/^\d+$/.test(v)))throw new UserError('Send quantity, refinement and level. Example: 2 1 90');return manualWeapon({weapon_id,quantity:Number(p[0]),refinement:Number(p[1]),level:Number(p[2])});}
export const equippedFiveStars=rows=>rows.filter(c=>c.weapon?.rank===5).map(c=>({...c.weapon,holderId:c.id,holder:c.name,quantity:1}));
