import {readFileSync} from 'node:fs';
import {UserError} from './history.mjs';

const root=new URL('../assets/tutorial/',import.meta.url);
const manifest=JSON.parse(readFileSync(new URL('manifest.json',root)));
export const TUTORIAL_PAGES=Object.freeze([
 {title:'Get your personal helper',text:'Open <b>Connect HoYoLAB / settings</b> below, choose <b>Windows encrypted helper</b>, then save the ZIP.\n\nUse Windows with Edge or Chrome. Your game can stay closed. Each personal helper expires <b>30 minutes after you request it</b>.'},
 {title:'Extract the ZIP',text:'In File Explorer, right-click <b>Connect-Primogemless.zip → Extract All… → Extract</b>.\n\nOpen the extracted folder. Running the helper from inside the ZIP will not work.'},
 {title:'Run the helper',text:'Open <b>Connect.cmd</b> in the extracted folder. If extensions are hidden, choose the file whose type is <b>Windows Command Script</b>.\n\nIf Windows asks, check that this is the helper you just downloaded from this bot, then choose <b>Run</b>. Read the console notice and press <b>Enter</b>.'},
 {title:'Sign in on both tabs',text:'Use the <b>same HoYoverse account</b> in both tabs opened by the helper:\n\n1. <b>HoYoLAB</b> — hoyolab.com\n2. <b>Genshin redemption page</b> — genshin.hoyoverse.com/en/gift\n\nComplete any verification yourself. Keep the helper and browser open until the connection file is ready. Your login session will be stored encrypted by the bot operator; see <b>Privacy & data</b>.'},
 {title:'Send the connection file',text:'When the helper says <b>Connection package ready</b>, send <code>Primogemless.connect.json</code> as a file to this private bot chat, using the <b>same Telegram account</b> that requested the helper.\n\nWindows may show it as <b>Primogemless.connect</b>. The nearby <code>connection.json</code> is a different file. Keep the personal package private.'},
 {title:'Connected. Ready to explore.',text:'Wait for <b>Connected</b>, then <b>Sync complete</b>. Explore Wish History, Owned Characters, or Earned Primogems. The upload message is normally removed after a successful connection.\n\nYour PC and game can be closed. Checks run every <b>6 hours</b> while the server is online.\n\n<b>EXPIRED_PAIRING?</b> Request a fresh helper and finish within 30 minutes. Resetting your bot data or requesting another helper invalidates the previous pairing. Reconnect if HoYoverse later expires your login.'}
]);

export function tutorialPage(index){
 if(!Number.isInteger(index)||index<0||index>=TUTORIAL_PAGES.length)throw new UserError('Choose a page from the screenshot guide.');
 return {...TUTORIAL_PAGES[index],index,total:TUTORIAL_PAGES.length};
}
export function tutorialCard(index){
 tutorialPage(index);const asset=manifest[index];
 if(!asset||asset.file!==`windows-${index+1}.png`||!/^[a-f0-9]{64}$/.test(asset.sha256))throw new Error('Tutorial image unavailable');
 return {key:'tutorial:'+asset.sha256,png:()=>readFileSync(new URL(asset.file,root))};
}
