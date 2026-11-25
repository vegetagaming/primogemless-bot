import {pool,UserError} from './history.mjs';

export const HISTORY_BANNERS=[
 {id:'a',label:'All banners'},
 {id:'301',label:'Limited Character Banner'},
 {id:'302',label:'Limited Weapon Banner'},
 {id:'200',label:'Standard Banner'},
 {id:'500',label:'Regional Banner',caption:'Regional Banner · Chronicled Wish'},
 {id:'100',label:"Beginners' Wish"}
];

export function historyBanner(id='a'){
 // Old item-type buttons reopen the current all-banner view.
 const banner=HISTORY_BANNERS.find(b=>b.id===(id==='c'||id==='w'?'a':id));
 if(!banner)throw new UserError('Invalid banner filter.');
 return banner;
}

export function bannerGroup(group,id='a'){
 const banner=historyBanner(id);
 // Pity is calculated across the account before this display-only filter.
 const rows=banner.id==='a'?group.rows:group.rows.filter(r=>pool(r.gacha_type)===banner.id);
 return {...group,rows,total:rows.length,five:rows.filter(r=>r.rank_type==='5').length,four:rows.filter(r=>r.rank_type==='4').length};
}
