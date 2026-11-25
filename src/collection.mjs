import {artwork,itemId} from './artwork.mjs';
import {sortWishes,UserError} from './history.mjs';
export function collection(rows,kind='a',rank='a'){
 if(!['a','c','w'].includes(kind)||!['a','4','5'].includes(rank))throw new UserError('Invalid collection filter.');
 const items=[];
 for(const r of sortWishes(rows,true)){
  const id=itemId(r),k=artwork[id]?.kind==='character'||/^100\d{5}$/.test(id)||r.item_type==='Character'?'c':'w';
  if((kind!=='a'&&k!==kind)||!['4','5'].includes(r.rank_type)||(rank!=='a'&&r.rank_type!==rank))continue;
  // A pull ID identifies an occurrence; an item ID only identifies its artwork.
  // Unknown artwork must not hide a valid history record.
  items.push({id,pullId:r.id,kind:k,name:r.name,rank:r.rank_type,copies:1,position:items.length+1,time:r.time,pity:r.pity?String(r.pity.count)+(r.pity.anchored?'':'+'):'?',row:r});
 }
 return items;
}
