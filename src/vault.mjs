import {randomBytes,createCipheriv,createDecipheriv,generateKeyPairSync,privateDecrypt,createHmac,timingSafeEqual,constants,createPrivateKey} from 'node:crypto';
import {UserError} from './history.mjs';
export const COOKIE_FIELDS=['account_id_v2','account_mid_v2','cookie_token_v2','ltuid_v2','ltmid_v2','ltoken_v2'];
export function cookieCapabilities(cookies){return {hoyolab:!!(cookies?.ltoken_v2&&(cookies.ltuid_v2||cookies.account_id_v2)),wishes:!!(cookies?.cookie_token_v2&&cookies.account_mid_v2&&cookies.account_id_v2)};}
export function cleanCookies(input){
 if(!input||typeof input!=='object'||Array.isArray(input))throw new UserError('The connection package is invalid.');
 const out={};
 for(const key of COOKIE_FIELDS){const value=input[key];if(value!==undefined){if(typeof value!=='string'||value.length>8192||!value.length||/[\s;\r\n\x00-\x1f]/.test(value))throw new UserError('The connection package contains an invalid session.');out[key]=value;}}
 const capabilities=cookieCapabilities(out);
 if(!capabilities.hoyolab&&!capabilities.wishes)throw new UserError('Provide ltoken_v2 with ltuid_v2 for HoYoLAB. Wish access needs account_id_v2, account_mid_v2 and cookie_token_v2; open Connect for manual or Windows setup.');
 for(const key of ['account_id_v2','ltuid_v2'])if(out[key]&&!/^\d{1,20}$/.test(out[key]))throw new UserError('Invalid account identifier.');
 if(out.account_id_v2&&out.ltuid_v2&&out.account_id_v2!==out.ltuid_v2)throw new UserError('The cookie account identifiers do not match. Copy fields from the same login.');
 if(out.account_mid_v2&&out.ltmid_v2&&out.account_mid_v2!==out.ltmid_v2)throw new UserError('The cookie session identifiers do not match. Copy fields from the same login.');
 return out;
}
function b64(value,max){if(typeof value!=='string'||value.length>max||!/^([A-Za-z0-9+/]{4})*([A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value))throw new UserError('Invalid encrypted connection file.');return Buffer.from(value,'base64');}
export class Vault {
 #key;
 constructor(store,key){if(!Buffer.isBuffer(key)||key.length!==32)throw new Error('VAULT_KEY_MISSING');this.#key=key;this.store=store;
  let saved=store.getMeta('vault_rsa_v1');
  if(!saved){const pair=generateKeyPairSync('rsa',{modulusLength:2048,privateKeyEncoding:{format:'pem',type:'pkcs8'},publicKeyEncoding:{format:'pem',type:'spki'}});saved=this.seal(pair.privateKey,'server-rsa');store.setMeta('vault_rsa_v1',saved);}
  this.privateKey=createPrivateKey(this.open(saved,'server-rsa'));
 }
 seal(value,context){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',this.#key,iv);cipher.setAAD(Buffer.from(context));const data=Buffer.concat([cipher.update(value,'utf8'),cipher.final()]);return JSON.stringify({v:1,iv:iv.toString('base64'),data:data.toString('base64'),tag:cipher.getAuthTag().toString('base64')});}
 open(value,context){const x=JSON.parse(value),decipher=createDecipheriv('aes-256-gcm',this.#key,Buffer.from(x.iv,'base64'));decipher.setAAD(Buffer.from(context));decipher.setAuthTag(Buffer.from(x.tag,'base64'));return Buffer.concat([decipher.update(Buffer.from(x.data,'base64')),decipher.final()]).toString('utf8');}
 publicConfig(owner){const challenge=this.store.challenge(owner),jwk=this.privateKey.export({format:'jwk'});return {kind:'primogemless-pair-v1',challenge,owner:String(owner),bot:'Primogemless_bot',publicKey:{n:jwk.n,e:jwk.e},expires:Date.now()+1800000};}
 decryptPackage(owner,input){
  if(input?.kind!=='primogemless-connect-v1')throw new UserError('This is not a Primogemless connection file.');
  this.store.checkChallenge(owner,input.challenge);
  try{
   const wrapped=b64(input.key,1024),iv=b64(input.iv,64),ct=b64(input.data,120000),mac=b64(input.mac,64);
   if(wrapped.length!==256||iv.length!==16||mac.length!==32||!ct.length||ct.length%16)throw new Error();
   const keys=privateDecrypt({key:this.privateKey,oaepHash:'sha256',padding:constants.RSA_PKCS1_OAEP_PADDING},wrapped);
   if(keys.length!==64)throw new Error();
   const expected=createHmac('sha256',keys.subarray(32)).update(`${owner}.${input.challenge}.${input.iv}.${input.data}`).digest();
   if(!timingSafeEqual(expected,mac))throw new Error();
   const decipher=createDecipheriv('aes-256-cbc',keys.subarray(0,32),iv);
   const plain=Buffer.concat([decipher.update(ct),decipher.final()]);keys.fill(0);
   const cookies=cleanCookies(JSON.parse(plain.toString('utf8')));plain.fill(0);return cookies;
  }catch(error){if(error instanceof UserError)throw error;throw new UserError('The encrypted connection file could not be verified. Create a new one from /login.');}
 }
 save(owner,cookies){this.store.saveConnection(owner,this.seal(JSON.stringify(cleanCookies(cookies)),`hoyo:${owner}`));}
 load(owner){const c=this.store.connection(owner,true);return c?cleanCookies(JSON.parse(this.open(c.secret,`hoyo:${owner}`))):null;}
}
