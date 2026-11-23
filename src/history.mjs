export class UserError extends Error {}
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const MAX_RECORDS = 50000;
export const BANNERS = { '100': "Beginners' Wish", '200': 'Standard', '301': 'Character Event', '302': 'Weapon Event', '500': 'Chronicled Wish' };
export const pool = type => type === '400' ? '301' : type;
const types = new Set(['100','200','301','302','400','500']);
const secretPattern = /authkey|cookie_token|access_token|stoken|ltoken|ltuid|ltmid|\bv2_[A-Za-z0-9_.+/%=-]{40,}|https?:\/\/|\b\d{8,12}:[A-Za-z0-9_-]{30,}\b/i;
const obj = value => value && typeof value === 'object' && !Array.isArray(value);
function text(value, label, max = 200) {
  if (typeof value !== 'string' || value.length > max || /[\u0000-\u001f\u007f]/u.test(value) || secretPattern.test(value)) throw new UserError(`Invalid ${label}. Upload a clean wish export, without account credentials or history links.`);
  return value;
}
function digits(value, label, max = 19) {
  // Never coerce unsafe JSON numbers into IDs: that irreversibly changes them.
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value) || value < 0) throw new UserError(`${label} must be saved as a text string to preserve its exact value.`);
    value = String(value);
  }
  if (typeof value !== 'string' || !new RegExp(`^\\d{1,${max}}$`).test(value)) throw new UserError(`Invalid ${label}.`);
  return value;
}
function timestamp(value) {
  value = text(value, 'wish timestamp', 19);
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)) throw new UserError('Wish dates must use YYYY-MM-DD HH:mm:ss.');
  const date = new Date(value.replace(' ', 'T') + 'Z');
  if (!Number.isFinite(+date) || date.toISOString().slice(0,19).replace('T',' ') !== value) throw new UserError('Invalid calendar date in wish history.');
  return value;
}
function normalizeRow(row, uid) {
  if (!obj(row)) throw new UserError('Invalid wish record.');
  if (row.uid !== undefined && digits(row.uid, 'UID', 12) !== uid) throw new UserError('One account contains wishes belonging to another UID.');
  const type = digits(row.gacha_type, 'banner type', 3);
  if (!types.has(type)) throw new UserError('This file contains an unsupported wish type. Version 1 supports Genshin character/weapon wishes, not other games or Wonderland.');
  const rank = String(row.rank_type ?? '');
  if (!['3','4','5'].includes(rank)) throw new UserError('Each wish needs its rarity (rank_type: 3, 4 or 5).');
  const count = String(row.count ?? '1');
  if (count !== '1') throw new UserError('Each record must describe a single pull.');
  if (row.uigf_gacha_type !== undefined && row.uigf_gacha_type !== pool(type)) throw new UserError('The banner grouping in this file is inconsistent.');
  return {
    uigf_gacha_type: pool(type), gacha_type: type,
    item_id: row.item_id === '' || row.item_id === undefined ? '' : digits(row.item_id,'item ID',12),
    count, time: timestamp(row.time), name: text(row.name,'item name'),
    item_type: text(row.item_type ?? '', 'item type', 80), rank_type: rank,
    id: digits(row.id,'pull ID')
  };
}
export function parseImport(buffer) {
  if (buffer.length > MAX_UPLOAD_BYTES) throw new UserError('This file exceeds 10 MB. Split it by account or use a smaller export.');
  const raw = buffer.toString('utf8').replace(/^\uFEFF/,'');
  if (secretPattern.test(raw)) throw new UserError('This looks like a file containing account credentials or a link. Send a clean UIGF wish export instead.');
  let data;
  try { data = JSON.parse(raw); } catch { throw new UserError('I could not read this JSON file. Send the original exported .json file, not a screenshot or ZIP.'); }
  let accounts;
  if (obj(data) && Array.isArray(data.hk4e)) {
    if (!/^v4\.[012]$/.test(data.info?.version ?? '')) throw new UserError('Supported multi-account formats: UIGF v4.0, v4.1 and v4.2.');
    accounts = data.hk4e;
  } else if (obj(data) && Array.isArray(data.list) && obj(data.info)) {
    if (!/^v?(2\.[234]|3\.0)$/.test(data.info.uigf_version ?? '')) throw new UserError('Supported single-account formats: UIGF v2.2–v3.0.');
    accounts = [{ uid: data.info.uid, timezone: data.info.region_time_zone, lang: data.info.lang, list: data.list }];
  } else throw new UserError('Use a UIGF wish-history JSON file. Raw game caches, Paimon.moe browser backups and achievement files are not supported in this version.');
  if (!accounts.length || accounts.length > 10) throw new UserError('Import between 1 and 10 Genshin accounts at a time.');
  const seenAccounts = new Set();
  let total = 0;
  const normalized = accounts.map(account => {
    if (!obj(account) || !Array.isArray(account.list)) throw new UserError('Invalid account section.');
    const uid = digits(account.uid,'UID',12);
    if (seenAccounts.has(uid)) throw new UserError('The same account appears twice in this file.');
    seenAccounts.add(uid);
    const inferred = uid.startsWith('6') ? -5 : uid.startsWith('7') ? 1 : 8;
    const timezone = account.timezone ?? inferred;
    if (!Number.isInteger(timezone) || timezone < -12 || timezone > 14) throw new UserError('Invalid server time zone.');
    const lang = account.lang ?? 'en-us';
    if (typeof lang !== 'string' || !/^[a-z]{2}-[a-z]{2}$/.test(lang)) throw new UserError('Invalid language code.');
    total += account.list.length;
    if (total > MAX_RECORDS) throw new UserError('This file has more than 50,000 records. Split it into smaller imports.');
    const seen = new Map();
    for (const row of account.list) {
      const clean = normalizeRow(row,uid);
      if (seen.has(clean.id) && !sameWish(seen.get(clean.id),clean)) throw new UserError('The file contains conflicting records for the same pull ID. Nothing was saved.');
      if (!seen.has(clean.id)) seen.set(clean.id,clean);
    }
    return { uid, timezone, lang, list: [...seen.values()] };
  });
  if (total === 0) throw new UserError('This file contains no wishes.');
  return { accounts: normalized, inputCount: total };
}
export function sameWish(a,b) {
  return a.id === b.id && a.time === b.time && a.gacha_type === b.gacha_type && a.rank_type === b.rank_type &&
    (a.item_id && b.item_id ? a.item_id === b.item_id : a.name === b.name);
}
export function sortWishes(rows, descending=false) {
  return [...rows].sort((a,b) => (BigInt(a.id) < BigInt(b.id) ? -1 : BigInt(a.id) > BigInt(b.id) ? 1 : 0) * (descending ? -1 : 1));
}
// Count every pull in its shared banner pool before applying any patch or rarity filter.
// The first observed hit is a lower bound because its preceding reset is unknown.
export function withPity(rows) {
  const pools = new Map();
  return sortWishes(rows).map(row => {
    const type = pool(row.gacha_type);
    if (!pools.has(type)) pools.set(type,{count:0,last:{}});
    const state = pools.get(type);
    state.count++;
    if (!['4','5'].includes(row.rank_type)) return {...row};
    const previous = state.last[row.rank_type];
    const pity = {count:state.count-(previous??0),anchored:previous!==undefined};
    state.last[row.rank_type] = state.count;
    return {...row,pity};
  });
}
export const pityLabel = row => row.pity ? `${row.pity.count}${row.pity.anchored?'':'+'} pity` : '';
export function stats(rows) {
  return Object.entries(BANNERS).map(([type,name]) => {
    const list = sortWishes(rows.filter(row => pool(row.gacha_type) === type),true);
    const i5 = list.findIndex(row => row.rank_type === '5');
    return {type,name,total:list.length,five:list.filter(r=>r.rank_type==='5').length,four:list.filter(r=>r.rank_type==='4').length,sinceFive:i5<0?list.length:i5,previousFiveFound:i5>=0,lastFive:i5<0?null:list[i5]};
  });
}
export const hasSecret = value => secretPattern.test(value);
