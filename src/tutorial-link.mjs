import {UserError} from './history.mjs';

export function tutorialLink(input){
 let url;try{url=new URL(String(input).trim());}catch{throw new UserError('Send a public Telegram tutorial link, such as https://t.me/YourChannel/123.');}
 if(url.protocol!=='https:'||!['t.me','telegram.me'].includes(url.hostname)||url.port||url.username||url.password||url.search||url.hash)throw new UserError('Use a plain https://t.me/ channel or post link, without login details or extra parameters.');
 const path=url.pathname.match(/^\/(?:s\/)?([A-Za-z][A-Za-z0-9_]{3,31})(?:\/([1-9]\d*))?\/?$/);
 if(!path)throw new UserError('Use a public Telegram channel or post link so every player can open it.');
 return 'https://t.me/'+path[1]+(path[2]?'/'+path[2]:'');
}
