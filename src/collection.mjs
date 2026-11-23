import {artwork,itemId} from './artwork.mjs';
import {sortWishes,UserError} from './history.mjs';
export function collection(rows,kind='c',rank='a'){
 if(!['c','w'].includes(kind)||!['a','4','5'].includes(rank))throw new UserError('Invalid collection filter.');
 const items=new Map();
 for(const r of sortWishes(rows,true)){
  const id=itemId(r),k=artwork[id]?.kind==='character'||/^100\d{5}$/.test(id)?'c':'w';
  if(!/^\d{1,12}$/.test(id)||k!==kind||!['4','5'].includes(r.rank_type)||(rank!=='a'&&r.rank_type!==rank))continue;
  if(!items.has(id))items.set(id,{id,name:r.name,rank:r.rank_type,copies:0,pity:r.pity?String(r.pity.count)+(r.pity.anchored?'':'+'):'?',row:r});
  items.get(id).copies++;
 }
 return [...items.values()];
}
