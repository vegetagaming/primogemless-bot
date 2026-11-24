import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomBytes } from 'node:crypto';
import { sameWish, sortWishes, UserError } from './history.mjs';
import {balances,CURRENCIES} from './savings.mjs';
import {validateRoster,manualWeapon} from './roster-data.mjs';
import {welkinRecord} from './welkin.mjs';
import {characterName} from './character-names.mjs';
import {SERVER_OFFSETS} from './notes.mjs';

export class Store {
  constructor(path,{database}={}) {
    if (path !== ':memory:') mkdirSync(dirname(path),{recursive:true});
    this.db = database??new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA secure_delete=ON; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, selected_uid TEXT, created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS accounts (owner TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, uid TEXT NOT NULL, timezone INTEGER NOT NULL, lang TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY(owner,uid));
      CREATE TABLE IF NOT EXISTS wishes (owner TEXT NOT NULL, uid TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY(owner,uid,id), FOREIGN KEY(owner,uid) REFERENCES accounts(owner,uid) ON DELETE CASCADE);
      CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS artwork_blobs (hash TEXT PRIMARY KEY, bytes BLOB NOT NULL);
      CREATE TABLE IF NOT EXISTS confirmations (owner TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, nonce TEXT NOT NULL, expires INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS connections (owner TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, secret TEXT NOT NULL, status TEXT NOT NULL, linked_at TEXT NOT NULL, last_sync TEXT, next_sync INTEGER NOT NULL DEFAULT 0, error_code TEXT);
      CREATE TABLE IF NOT EXISTS login_challenges (owner TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, challenge TEXT NOT NULL UNIQUE, expires INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS achievement_records (owner TEXT NOT NULL, uid TEXT NOT NULL, id INTEGER NOT NULL, current INTEGER NOT NULL, status INTEGER NOT NULL, timestamp INTEGER NOT NULL, source TEXT NOT NULL, PRIMARY KEY(owner,uid,id), FOREIGN KEY(owner,uid) REFERENCES accounts(owner,uid) ON DELETE CASCADE);
      CREATE TABLE IF NOT EXISTS achievement_totals (owner TEXT NOT NULL, uid TEXT NOT NULL, total INTEGER NOT NULL, checked_at TEXT NOT NULL, PRIMARY KEY(owner,uid), FOREIGN KEY(owner,uid) REFERENCES accounts(owner,uid) ON DELETE CASCADE);
      CREATE TABLE IF NOT EXISTS ui_state (owner TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS savings (id INTEGER PRIMARY KEY AUTOINCREMENT, owner TEXT NOT NULL, uid TEXT NOT NULL, primogems INTEGER NOT NULL, crystals INTEGER NOT NULL, intertwined INTEGER NOT NULL, acquaint INTEGER NOT NULL, recorded_at TEXT NOT NULL, FOREIGN KEY(owner,uid) REFERENCES accounts(owner,uid) ON DELETE CASCADE);
      CREATE INDEX IF NOT EXISTS savings_owner_uid ON savings(owner,uid,id);
      CREATE TABLE IF NOT EXISTS diary_months (owner TEXT NOT NULL, uid TEXT NOT NULL, period TEXT NOT NULL, data TEXT NOT NULL, checked_at TEXT NOT NULL, PRIMARY KEY(owner,uid,period), FOREIGN KEY(owner,uid) REFERENCES accounts(owner,uid) ON DELETE CASCADE);
      CREATE TABLE IF NOT EXISTS welkin (owner TEXT NOT NULL, uid TEXT NOT NULL, days INTEGER NOT NULL CHECK(days >= 0 AND days <= 180), recorded_at TEXT NOT NULL, PRIMARY KEY(owner,uid), FOREIGN KEY(owner,uid) REFERENCES accounts(owner,uid) ON DELETE CASCADE);
      CREATE TABLE IF NOT EXISTS roster_snapshots (owner TEXT NOT NULL, uid TEXT NOT NULL, data TEXT NOT NULL, checked_at TEXT NOT NULL, PRIMARY KEY(owner,uid), FOREIGN KEY(owner,uid) REFERENCES accounts(owner,uid) ON DELETE CASCADE);
      CREATE TABLE IF NOT EXISTS manual_weapons (id INTEGER PRIMARY KEY AUTOINCREMENT, owner TEXT NOT NULL, uid TEXT NOT NULL, weapon_id TEXT NOT NULL, quantity INTEGER NOT NULL, refinement INTEGER NOT NULL, level INTEGER NOT NULL, updated_at TEXT NOT NULL, UNIQUE(owner,uid,weapon_id,refinement,level), FOREIGN KEY(owner,uid) REFERENCES accounts(owner,uid) ON DELETE CASCADE);
      CREATE TABLE IF NOT EXISTS reminders (owner TEXT NOT NULL, uid TEXT NOT NULL, region TEXT NOT NULL, daily_enabled INTEGER NOT NULL DEFAULT 0, resin_enabled INTEGER NOT NULL DEFAULT 0, revision TEXT NOT NULL, next_check INTEGER NOT NULL DEFAULT 0, attempted_at INTEGER, checked_at INTEGER, data TEXT, daily_cycle TEXT, resin_notified INTEGER NOT NULL DEFAULT 0, error_code TEXT, PRIMARY KEY(owner,uid), FOREIGN KEY(owner,uid) REFERENCES accounts(owner,uid) ON DELETE CASCADE);
      CREATE INDEX IF NOT EXISTS reminders_due ON reminders(next_check);
    `);
  }
  close() { this.db.close(); }
  reminder(owner,uid){const r=this.db.prepare('SELECT * FROM reminders WHERE owner=? AND uid=?').get(String(owner),String(uid));return r?{...r,notes:r.data?JSON.parse(r.data):null}:null;}
  setReminder(owner,role,kind,enabled,now=Date.now()){
    if(!['daily','resin'].includes(kind)||typeof enabled!=='boolean'||SERVER_OFFSETS[role.region]===undefined||!this.accounts(owner).some(a=>a.uid===role.uid))throw new UserError('Choose your own connected account and reminder.');
    const old=this.reminder(owner,role.uid),daily=kind==='daily'?Number(enabled):old?.daily_enabled??0,resin=kind==='resin'?Number(enabled):old?.resin_enabled??0;
    this.db.prepare('INSERT INTO reminders(owner,uid,region,daily_enabled,resin_enabled,revision,next_check) VALUES (?,?,?,?,?,?,?) ON CONFLICT(owner,uid) DO UPDATE SET region=excluded.region,daily_enabled=excluded.daily_enabled,resin_enabled=excluded.resin_enabled,revision=excluded.revision,next_check=excluded.next_check,error_code=NULL').run(String(owner),role.uid,role.region,daily,resin,randomBytes(16).toString('hex'),now);
  }
  disableReminder(owner,uid,kind){
    if(!['daily','resin'].includes(kind)||!this.accounts(owner).some(a=>a.uid===uid))throw new UserError('Choose your own reminder.');
    const column=kind==='daily'?'daily_enabled':'resin_enabled';
    this.db.prepare(`UPDATE reminders SET ${column}=0,revision=? WHERE owner=? AND uid=?`).run(randomBytes(16).toString('hex'),String(owner),uid);
  }
  disableAllReminders(owner,error){this.db.prepare('UPDATE reminders SET daily_enabled=0,resin_enabled=0,revision=?,error_code=? WHERE owner=?').run(randomBytes(16).toString('hex'),error,String(owner));}
  dueReminders(now=Date.now()){return this.db.prepare("SELECT r.owner,r.uid FROM reminders r JOIN connections c ON c.owner=r.owner WHERE (r.daily_enabled=1 OR r.resin_enabled=1) AND c.status IN ('active','retry') AND r.next_check<=? ORDER BY r.next_check LIMIT 25").all(now);}
  attemptReminder(owner,uid,revision,now){this.db.prepare('UPDATE reminders SET attempted_at=? WHERE owner=? AND uid=? AND revision=?').run(now,String(owner),uid,revision);}
  recordReminder(owner,uid,revision,{notes,checked,next,error}){this.db.prepare('UPDATE reminders SET data=?,checked_at=?,next_check=?,error_code=? WHERE owner=? AND uid=? AND revision=?').run(JSON.stringify(notes),checked,next,error,String(owner),uid,revision);}
  deferReminder(owner,uid,revision,next,error){this.db.prepare('UPDATE reminders SET next_check=?,error_code=? WHERE owner=? AND uid=? AND revision=?').run(next,error,String(owner),uid,revision);}
  setResinNotified(owner,uid,revision,value){this.db.prepare('UPDATE reminders SET resin_notified=? WHERE owner=? AND uid=? AND revision=?').run(Number(value),String(owner),uid,revision);}
  claimReminder(owner,uid,revision,kind,cycle){
    if(kind==='daily')return !!this.db.prepare('UPDATE reminders SET daily_cycle=? WHERE owner=? AND uid=? AND revision=? AND daily_enabled=1 AND (daily_cycle IS NULL OR daily_cycle<>?)').run(cycle,String(owner),uid,revision,cycle).changes;
    if(kind==='resin')return !!this.db.prepare('UPDATE reminders SET resin_notified=1 WHERE owner=? AND uid=? AND revision=? AND resin_enabled=1 AND resin_notified=0').run(String(owner),uid,revision).changes;
    return false;
  }
  releaseReminder(owner,uid,revision,kind,cycle){
    if(kind==='daily')this.db.prepare('UPDATE reminders SET daily_cycle=NULL WHERE owner=? AND uid=? AND revision=? AND daily_cycle=?').run(String(owner),uid,revision,cycle);
    if(kind==='resin')this.setResinNotified(owner,uid,revision,false);
  }
  saveArtwork(hash,bytes){this.db.prepare('INSERT INTO artwork_blobs VALUES (?,?) ON CONFLICT(hash) DO NOTHING').run(hash,bytes);}
  loadArtwork(hash){const row=this.db.prepare('SELECT bytes FROM artwork_blobs WHERE hash=?').get(hash);return row?Buffer.from(row.bytes):null;}
  roster(owner,uid){const r=this.db.prepare('SELECT data,checked_at FROM roster_snapshots WHERE owner=? AND uid=?').get(String(owner),String(uid));return r?{characters:JSON.parse(r.data).map(c=>({...c,name:characterName(c.id,c.name)})),checked_at:r.checked_at}:null;}
  saveRoster(owner,uid,rows){
    if(!this.accounts(owner).some(a=>a.uid===uid))throw new UserError('Choose your own saved account.');
    const data=validateRoster(rows);
    this.db.prepare('INSERT INTO roster_snapshots VALUES (?,?,?,?) ON CONFLICT(owner,uid) DO UPDATE SET data=excluded.data,checked_at=excluded.checked_at').run(String(owner),uid,JSON.stringify(data),new Date().toISOString());
  }
  manualWeapons(owner,uid){return this.db.prepare('SELECT id,weapon_id,quantity,refinement,level,updated_at FROM manual_weapons WHERE owner=? AND uid=? ORDER BY id DESC').all(String(owner),String(uid));}
  saveManualWeapon(owner,uid,input,rowId=null){
    owner=String(owner);if(!this.accounts(owner).some(a=>a.uid===uid))throw new UserError('Choose your own saved account.');
    const w=manualWeapon(input),all=this.manualWeapons(owner,uid),old=rowId===null?null:all.find(x=>x.id===rowId),same=all.find(x=>x.weapon_id===w.weapon_id&&x.refinement===w.refinement&&x.level===w.level);
    if(rowId!==null&&!old)throw new UserError('That manual weapon is unavailable.');
    if(old&&old.weapon_id!==w.weapon_id)throw new UserError('Choose the original weapon when editing.');
    if(old&&same&&old.id!==same.id)throw new UserError('That refinement and level already have an entry. Update its quantity, then remove the old entry.');
    if(!old&&!same&&all.length>=500)throw new UserError('Maximum 500 manual weapon entries per account.');
    if(old){this.db.prepare('UPDATE manual_weapons SET quantity=?,refinement=?,level=?,updated_at=? WHERE owner=? AND uid=? AND id=?').run(w.quantity,w.refinement,w.level,new Date().toISOString(),owner,uid,rowId);return rowId;}
    const r=this.db.prepare('INSERT INTO manual_weapons(owner,uid,weapon_id,quantity,refinement,level,updated_at) VALUES (?,?,?,?,?,?,?) ON CONFLICT(owner,uid,weapon_id,refinement,level) DO UPDATE SET quantity=excluded.quantity,updated_at=excluded.updated_at RETURNING id').get(owner,uid,w.weapon_id,w.quantity,w.refinement,w.level,new Date().toISOString());return r.id;
  }
  removeManualWeapon(owner,uid,rowId){if(!this.db.prepare('DELETE FROM manual_weapons WHERE owner=? AND uid=? AND id=?').run(String(owner),String(uid),rowId).changes)throw new UserError('That manual weapon is unavailable.');}
  savingsRows(owner,uid,limit=5000){return this.db.prepare('SELECT * FROM savings WHERE owner=? AND uid=? ORDER BY id DESC LIMIT ?').all(String(owner),String(uid),limit);}
  welkin(owner,uid){return this.db.prepare('SELECT days,recorded_at FROM welkin WHERE owner=? AND uid=?').get(String(owner),String(uid))??null;}
  saveWelkin(owner,uid,days,now=Date.now()){
    if(!this.accounts(owner).some(a=>a.uid===uid))throw new UserError('Choose your own saved account.');
    const record=welkinRecord(days,now);
    this.db.prepare('INSERT INTO welkin(owner,uid,days,recorded_at) VALUES (?,?,?,?) ON CONFLICT(owner,uid) DO UPDATE SET days=excluded.days,recorded_at=excluded.recorded_at').run(String(owner),uid,record.days,record.recorded_at);
  }
  saveSavings(owner,uid,input){
    if(!this.accounts(owner).some(a=>a.uid===uid))throw new UserError('Choose your own saved account.');
    const value=balances(input),prior=this.savingsRows(owner,uid,1)[0];
    if(prior&&CURRENCIES.every(([key])=>prior[key]===value[key]))return {changed:false};
    if(this.db.prepare('SELECT count(*) AS n FROM savings WHERE owner=? AND uid=?').get(String(owner),uid).n>=5000)throw new UserError('Savings snapshot limit reached. Export a backup before deleting old bot data.');
    this.db.prepare('INSERT INTO savings(owner,uid,primogems,crystals,intertwined,acquaint,recorded_at) VALUES (?,?,?,?,?,?,?)').run(String(owner),uid,value.primogems,value.crystals,value.intertwined,value.acquaint,new Date().toISOString());return {changed:true};
  }
  diaryRows(owner,uid){return this.db.prepare('SELECT data,checked_at FROM diary_months WHERE owner=? AND uid=? ORDER BY period DESC').all(String(owner),String(uid)).map(x=>({...JSON.parse(x.data),checked_at:x.checked_at}));}
  saveDiary(owner,uid,data){if(!this.accounts(owner).some(a=>a.uid===uid)||!/^\d{4}-(0[1-9]|1[0-2])$/.test(data.period))throw new UserError('Invalid diary account or month.');this.db.prepare('INSERT INTO diary_months VALUES (?,?,?,?,?) ON CONFLICT(owner,uid,period) DO UPDATE SET data=excluded.data,checked_at=excluded.checked_at').run(String(owner),uid,data.period,JSON.stringify(data),new Date().toISOString());}
  ensureUser(owner) { this.db.prepare('INSERT OR IGNORE INTO users(id,created_at) VALUES (?,?)').run(String(owner),new Date().toISOString()); }
  getMeta(key) { return this.db.prepare('SELECT value FROM meta WHERE key=?').get(key)?.value; }
  setMeta(key,value) { this.db.prepare('INSERT INTO meta(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key,String(value)); }
  accounts(owner) { return this.db.prepare('SELECT uid,timezone,lang,updated_at,(SELECT count(*) FROM wishes w WHERE w.owner=a.owner AND w.uid=a.uid) AS count FROM accounts a WHERE owner=? ORDER BY uid').all(String(owner)); }
  selected(owner) {
    const uid = this.db.prepare('SELECT selected_uid FROM users WHERE id=?').get(String(owner))?.selected_uid;
    return this.accounts(owner).find(a=>a.uid===uid) ?? this.accounts(owner)[0] ?? null;
  }
  select(owner,uid) {
    if (!this.accounts(owner).some(a=>a.uid===uid)) throw new UserError('That account is not in your saved history.');
    this.db.prepare('UPDATE users SET selected_uid=? WHERE id=?').run(uid,String(owner));
  }
  rows(owner,uid) { return this.db.prepare('SELECT data FROM wishes WHERE owner=? AND uid=?').all(String(owner),String(uid)).map(row=>JSON.parse(row.data)); }
  import(owner,parsed) {
    owner = String(owner);
    this.db.exec('BEGIN IMMEDIATE');
    let added=0,duplicates=0;
    try {
      this.ensureUser(owner);
      const current = this.accounts(owner);
      if (new Set([...current.map(a=>a.uid),...parsed.accounts.map(a=>a.uid)]).size>10) throw new UserError('A maximum of 10 accounts can be saved per Telegram user.');
      const existingCount = Number(this.db.prepare('SELECT count(*) AS n FROM wishes WHERE owner=?').get(owner).n);
      const insertAccount = this.db.prepare('INSERT INTO accounts VALUES (?,?,?,?,?) ON CONFLICT(owner,uid) DO UPDATE SET updated_at=excluded.updated_at');
      const getRow = this.db.prepare('SELECT data FROM wishes WHERE owner=? AND uid=? AND id=?');
      const insertRow = this.db.prepare('INSERT INTO wishes(owner,uid,id,data) VALUES (?,?,?,?)');
      const updateRow = this.db.prepare('UPDATE wishes SET data=? WHERE owner=? AND uid=? AND id=?');
      for (const account of parsed.accounts) {
        const old = current.find(a=>a.uid===account.uid);
        if (old && old.timezone !== account.timezone) throw new UserError('This account was previously imported with a different time zone. Nothing was saved; check the export settings.');
        insertAccount.run(owner,account.uid,account.timezone,account.lang,new Date().toISOString());
        for (const row of account.list) {
          const prior = getRow.get(owner,account.uid,row.id);
          if (prior) {
            const previous = JSON.parse(prior.data);
            if (!sameWish(previous,row)) throw new UserError('An imported pull conflicts with a saved record. Nothing was changed. Check that this is the correct account and server time zone.');
            if (!previous.item_id && row.item_id) updateRow.run(JSON.stringify({...previous,item_id:row.item_id}),owner,account.uid,row.id);
            duplicates++;
          } else {
            if (existingCount+added>=100000) throw new UserError('Storage limit reached: 100,000 wishes per Telegram user.');
            insertRow.run(owner,account.uid,row.id,JSON.stringify(row)); added++;
          }
        }
      }
      if (!this.db.prepare('SELECT selected_uid FROM users WHERE id=?').get(owner).selected_uid) this.select(owner,parsed.accounts[0].uid);
      this.db.exec('COMMIT');
      return {added,duplicates,total:existingCount+added,accounts:parsed.accounts.length};
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  export(owner) {
    return {info:{export_timestamp:Math.floor(Date.now()/1000),export_app:'Telegram Wish Archive',export_app_version:'1.0.0',version:'v4.2'},hk4e:this.accounts(owner).map(account=>({uid:account.uid,timezone:account.timezone,lang:account.lang,list:sortWishes(this.rows(owner,account.uid))}))};
  }
  confirmation(owner) {
    this.ensureUser(owner);
    const nonce=randomBytes(12).toString('hex');
    this.db.prepare('INSERT INTO confirmations VALUES (?,?,?) ON CONFLICT(owner) DO UPDATE SET nonce=excluded.nonce,expires=excluded.expires').run(String(owner),nonce,Date.now()+300000);
    return nonce;
  }
  cancelDelete(owner) { this.db.prepare('DELETE FROM confirmations WHERE owner=?').run(String(owner)); }
  setUI(owner,value) {this.ensureUser(owner);this.db.prepare('INSERT INTO ui_state VALUES (?,?) ON CONFLICT(owner) DO UPDATE SET value=excluded.value').run(String(owner),JSON.stringify(value));}
  getUI(owner) {const x=this.db.prepare('SELECT value FROM ui_state WHERE owner=?').get(String(owner));return x?JSON.parse(x.value):{};}
  challenge(owner) {this.ensureUser(owner);const challenge=randomBytes(24).toString('hex');this.db.prepare('INSERT INTO login_challenges VALUES (?,?,?) ON CONFLICT(owner) DO UPDATE SET challenge=excluded.challenge,expires=excluded.expires').run(String(owner),challenge,Date.now()+1800000);return challenge;}
  checkChallenge(owner,challenge) {const c=this.db.prepare('SELECT * FROM login_challenges WHERE owner=?').get(String(owner));if(!c||c.expires<Date.now()||c.challenge!==challenge)throw new UserError('This connection request expired or belongs to another Telegram user. Open /login and start again.');}
  connection(owner,includeSecret=false) {const c=this.db.prepare('SELECT * FROM connections WHERE owner=?').get(String(owner));if(c&&!includeSecret)delete c.secret;return c??null;}
  saveConnection(owner,secret) {this.ensureUser(owner);this.db.prepare("INSERT INTO connections(owner,secret,status,linked_at,next_sync) VALUES (?,?,'active',?,0) ON CONFLICT(owner) DO UPDATE SET secret=excluded.secret,status='active',linked_at=excluded.linked_at,next_sync=0,error_code=NULL").run(String(owner),secret,new Date().toISOString());this.db.prepare('UPDATE reminders SET next_check=0 WHERE owner=?').run(String(owner));this.db.prepare('DELETE FROM login_challenges WHERE owner=?').run(String(owner));}
  disconnect(owner) {this.db.prepare('DELETE FROM reminders WHERE owner=?').run(String(owner));this.db.prepare('DELETE FROM connections WHERE owner=?').run(String(owner));this.db.prepare('DELETE FROM login_challenges WHERE owner=?').run(String(owner));}
  syncState(owner,{status='active',next=Date.now()+21600000,error=null,success=false}={}) {this.db.prepare('UPDATE connections SET status=?,next_sync=?,error_code=?,last_sync=CASE WHEN ? THEN ? ELSE last_sync END WHERE owner=?').run(status,next,error,success?1:0,new Date().toISOString(),String(owner));}
  dueConnections(now=Date.now()) {return this.db.prepare("SELECT owner FROM connections WHERE status IN ('active','retry') AND next_sync<=? ORDER BY next_sync LIMIT 10").all(now);}
  achievementRows(owner,uid) {return this.db.prepare('SELECT id,current,status,timestamp,source FROM achievement_records WHERE owner=? AND uid=? ORDER BY id').all(String(owner),String(uid));}
  setAchievements(owner,uid,rows,source='uiaf') {
    if(!this.accounts(owner).some(a=>a.uid===uid))throw new UserError('Choose one of your connected accounts first.');
    const statement=this.db.prepare('INSERT INTO achievement_records VALUES (?,?,?,?,?,?,?) ON CONFLICT(owner,uid,id) DO UPDATE SET current=excluded.current,status=excluded.status,timestamp=excluded.timestamp,source=excluded.source');
    this.db.exec('BEGIN');try{for(const row of rows)statement.run(String(owner),uid,row.id,row.current,row.status,row.timestamp,source);this.db.exec('COMMIT');}catch(error){this.db.exec('ROLLBACK');throw error;}
  }
  achievementTotal(owner,uid) {return this.db.prepare('SELECT total,checked_at FROM achievement_totals WHERE owner=? AND uid=?').get(String(owner),uid)??null;}
  setAchievementTotal(owner,uid,total) {if(!Number.isSafeInteger(total)||total<0||total>100000)return;this.db.prepare('INSERT INTO achievement_totals VALUES (?,?,?,?) ON CONFLICT(owner,uid) DO UPDATE SET total=excluded.total,checked_at=excluded.checked_at').run(String(owner),uid,total,new Date().toISOString());}
  deleteUser(owner,nonce) {
    const confirmation=this.db.prepare('SELECT nonce,expires FROM confirmations WHERE owner=?').get(String(owner));
    if (!confirmation || confirmation.nonce!==nonce || confirmation.expires<Date.now()) throw new UserError('This confirmation expired. Use /delete_me again.');
    this.db.prepare('DELETE FROM users WHERE id=?').run(String(owner));
    this.db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
  }
}
