import { MAX_UPLOAD_BYTES, UserError } from './history.mjs';

export class TelegramError extends Error {
  constructor(code,retryAfter=0,notModified=false) { super(`Telegram API error ${code}`); this.code=code; this.retryAfter=retryAfter; this.notModified=notModified; }
}
export class Telegram {
  #token;
  constructor(token,fetcher=fetch) {
    if (!/^\d+:[A-Za-z0-9_-]{30,}$/.test(token??'')) throw new Error('Missing or invalid bot token');
    this.#token=token; this.fetcher=fetcher;
  }
  async call(method,params={},form=null) {
    let response;
    try {
      response=await this.fetcher(`https://api.telegram.org/bot${this.#token}/${method}`,{
        method:'POST',headers:form?undefined:{'Content-Type':'application/json'},body:form??JSON.stringify(params),
        redirect:'error',signal:AbortSignal.timeout(method==='getUpdates'?45000:30000)
      });
    } catch { throw new TelegramError('NETWORK'); }
    let result;
    try {result=await response.json();} catch {throw new TelegramError('BAD_RESPONSE');}
    if (!result.ok) throw new TelegramError(result.error_code??response.status,Number(result.parameters?.retry_after??0),/message is not modified/i.test(result.description??''));
    return result.result;
  }
  message(chat,text,extra={}) {return this.call('sendMessage',{chat_id:chat,text,link_preview_options:{is_disabled:true},...extra});}
  async photo(params,bytes) {
    const form=new FormData();form.set('chat_id',String(params.chat_id));
    if(params.reply_markup)form.set('reply_markup',JSON.stringify(params.reply_markup));
    if(params.message_id){
      form.set('message_id',String(params.message_id));
      form.set('media',JSON.stringify({type:'photo',media:'attach://card',caption:params.caption??'',parse_mode:params.parse_mode??'HTML'}));
      form.set('card',new Blob([bytes],{type:'image/png'}),'card.png');
      return this.call('editMessageMedia',{},form);
    }
    form.set('caption',params.caption??'');form.set('parse_mode',params.parse_mode??'HTML');
    form.set('photo',new Blob([bytes],{type:'image/png'}),'card.png');
    return this.call('sendPhoto',{},form);
  }
  async document(chat,buffer,filename,caption='') {
    const form=new FormData(); form.set('chat_id',String(chat)); form.set('caption',caption);
    form.set('document',new Blob([buffer],{type:'application/octet-stream'}),filename);
    return this.call('sendDocument',{},form);
  }
  async download(fileId) {
    const file=await this.call('getFile',{file_id:fileId});
    if (Number(file.file_size)>MAX_UPLOAD_BYTES) throw new UserError('The upload exceeds 10 MB.');
    const path=file.file_path;
    if (typeof path!=='string'||!/^([A-Za-z0-9_-]+\/)*[A-Za-z0-9_.-]+$/.test(path)||path.split('/').some(p=>p==='..')) throw new TelegramError('INVALID_FILE_PATH');
    let response;
    try {response=await this.fetcher(`https://api.telegram.org/file/bot${this.#token}/${path}`,{redirect:'error',signal:AbortSignal.timeout(30000)});} catch {throw new TelegramError('FILE_NETWORK');}
    if (!response.ok||!response.body) throw new TelegramError('FILE_RESPONSE');
    const chunks=[]; let bytes=0;
    for await (const chunk of response.body) {
      bytes+=chunk.length;
      if (bytes>MAX_UPLOAD_BYTES) throw new UserError('The upload exceeds 10 MB.');
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }
}
