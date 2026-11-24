# Primogemless 2.10

For hosting without a PC, see [Northflank deployment](NORTHFLANK.md). The Docker
image starts in migration hold mode and uses PostgreSQL or a persistent disk. It does not
start a second Telegram poller until the archive and existing secrets are restored.

Four public commands: `/connect`, `/history`, `/primogems`, `/characters`.
The home buttons are Connect, Wish History, Earned Primogems and Owned Characters.
Opening Connect sends the owner's uploaded video inline, then a personal Windows
ZIP. Until the video is added, it sends short text instructions and the ZIP.
The owner uses **Connect → Set video** and sends a normal Telegram video. The bot
stores its Telegram file ID and reuses it without downloading the video to the
server. Replace/remove controls are owner-only and require an explicit edit action.
A public channel/post link remains an optional fallback when no video is uploaded.
If Telegram rejects a saved video, the connection ZIP remains available.
Each new ZIP replaces only the requesting user's pairing challenge and expires in
30 minutes. Video editing and preview navigation do not request new ZIPs.
Connection settings and advanced login remain under Connect; the unlisted
`/login` and old `/tutorial` shortcuts still work. Old screenshot buttons open
Connect without changing pairing. The screenshot files remain archived locally.
Only the configured bot owner gets an extra **My Game Profile** home button for
manually recorded currency balances. `/profile` and `/savings` open the same page;
all balance entry, history and export routes enforce this owner restriction.
The home screen uses a two-by-two menu and a navy/gold image dashboard. Account
switching, backups, refresh, disconnect and deletion live inside those screens.

## Connect once

1. Open **Connect** to receive the video guide and your personal Windows ZIP.
2. Extract the personal ZIP and run `Connect.cmd` on Windows with Edge or Chrome.
3. Sign in on the official HoYoLAB and Genshin redemption pages in the isolated
   browser. Complete any CAPTCHA or verification there.
4. Send the generated `Primogemless.connect.json` to the bot once. It is encrypted
   for this bot server and bound to the requesting Telegram user for 30 minutes.
5. The bot verifies the session against HoYoverse before storing it. Initial sync
   starts immediately; later checks run every six hours while the server is online.

This release does not pretend to offer a verified global HoYoLAB QR login. Its
one-time helper provides an official-site sign-in flow without collecting a
password in Telegram. The helper reads only six allowlisted session-cookie fields
from a fresh browser profile; existing browser profiles and game files are untouched.
It closes and deletes its temporary profile after success. Interrupted helpers may
leave that isolated temporary profile until the user closes its browser and removes it.

The account connection and live upstream sync need a successful user login to be
verified end to end. Mocked API flows and Windows/Node encryption interoperability
are tested. Upstream sessions may expire or be revoked; reconnect when requested.
Read-only integration is not a promise of approval under the game's terms.

## Advanced cookie entry from Telegram

Players who already have their own fresh cookies can open **/login → Cookie
connection → Continue with cookie entry** from Android, iPhone or desktop.
The bot explains that Telegram cloud chat receives raw credentials before server
storage encryption. This is not end-to-end encryption. The Windows helper still
encrypts credentials before upload and remains a separate option.

The explicit entry window lasts ten minutes. Send one cookie_name=value per line
using **ltuid_v2** and **ltoken_v2**, plus **ltmid_v2** when present. The first
letter is lowercase L. Do not send a password, full cookie dump, screenshots or
an expired/exposed token. Only six allowlisted cookie names can be parsed.
The bot requests message deletion before verification and aborts the login if
Telegram does not confirm deletion. Deletion does not guarantee removal from all
Telegram copies. Input values are never echoed, written to logs or saved in UI
state. Verification failures leave an existing connection intact; a successful
connection replaces it. Disconnect erases the stored session.

An ltoken/ltuid pair enables **HoYoLAB-only** mode. The bot verifies account roles
and a roster response before saving it. Scheduled checks update available roster,
achievement-total and diary data without attempting wish endpoints. The UI
explicitly says wish auto-sync is disabled. Wish access requires all three of
cookie_token_v2, account_id_v2 and account_mid_v2 and successful authkey verification.
These can be supplied through the encrypted Windows helper (or explicit advanced
entry). Fields must belong to the same account. Authentication, expiry and upstream
availability still require real-account verification; tests use synthetic cookies.

The desktop DevTools/Application/Cookies instructions are not a phone-only cookie
export method. Standard [Chrome Android inspection](https://developer.chrome.com/docs/devtools/remote-debugging)
uses a computer, and [Safari iPhone inspection](https://webkit.org/web-inspector/enabling-web-inspector/)
uses a Mac. The guide covers both platforms without claiming that logging into the
mobile HoYoLAB app automatically exports cookies.

## Wish history

History groups records into verified patches, with totals, banner breakdowns,
five-star highlights, individual pulls, and Enka artwork cards. Dates are converted
from each account's server time zone to UTC before grouping. Initial verified
boundaries cover Luna VII (6.6) through 7.2. Earlier records stay in **Earlier archive**.

The bot checks HoYoverse's public game announcements every six hours and extracts
explicit update-maintenance dates. It persists newly verified boundaries. Unknown
periods are labelled as awaiting a patch update; they are not guessed from a fixed
42-day cycle. The parser must be maintained if HoYoverse changes announcement wording.

**All history** appears above the patch options and includes every saved pull for
the selected account. Each patch opens a three-column character picker with portrait
tiles, latest saved pity, rarity and copy counts. Tabs switch between characters and
weapons or filter 5-star/4-star records. Tap a name for a landscape card containing
full artwork, a large pity count, rarity, saved copies, banner and date. Newer/Older
browses copies. Copy counts refer to saved records, not inferred constellations.
Paging edits the current photo instead of sending a new one for every card.
Pity numbers in cards and collection tiles use green for 5-star counts 1–35,
yellow for 36–65, and red for 66 and above. Four-star pity is always purple.
The color uses the displayed count; a `+` still indicates incomplete earlier history.

Hit pity counts pulls since the preceding hit of the same rarity in the same
banner pool, including the winning pull. Character Event types 301/400 share a
pool; weapons and characters of the same rarity both reset that pool's counter.
Four-star and five-star counters are independent. Calculation runs over the whole
account archive before filtering by patch or rarity. A `+` marks the first observed
hit of a rarity, whose preceding reset is not saved. Unknown gaps can still make
archived counts incomplete; the bot does not invent missing pulls.

Only records still returned by HoYoverse can be fetched. Saved records persist.
Imports merge by exact pull ID, transactions roll back on conflicts, and Character
Event types 301/400 share a pity count. Pity is a count of archived rows, not a claim
that missing history is complete. UIGF v4.0–4.2 and v2.2–v3.0 files remain accepted,
including when Telegram gives the JSON a `.txt` filename. Backups are in History.

## Owned characters and 5-star weapons

Open **Owned Characters** from the home screen, or use **/characters**. HoYoLAB's character list supplies the owned
roster, C0–C6 constellation levels, character levels and equipped weapons. This
is separate from wish copies; no constellations are inferred from the archive.
The roster is a timestamped snapshot, updated during successful scheduled syncs
or with **Refresh roster**. A successful connected-account test is still required
for live end-to-end verification. Existing wish-file uploads alone cannot fill it.

The **5★ Weapons** screen has **Equipped** and **Unequipped (manual)** tabs.
HoYoLAB's character list does not supply the whole weapon bag. Equipped copies
are shown per character, including duplicates. To record unequipped copies,
choose **Add unequipped weapon**, search or browse the 5-star catalogue, then send
quantity, refinement and level; for example, **2 1 90**. Quantities replace the
entry for that weapon/refinement/level. Different variants use separate entries.
Edit or remove manual entries when equipping, refining or consuming copies.
Manual and equipped counts stay separate; the bot does not claim a complete bag.

All players can edit their own manual weapons. Only the bot owner can change
global artwork and emoji. Export roster downloads a reference JSON snapshot
(including manual entries); it is not UIGF and has no automatic restore flow.
Delete data removes roster and manual entries along with the account's records.

Visible wish lists show only 4-star and 5-star items. Three-star pulls remain in
storage, total counts, pity calculations and UIGF backups.

## Achievements (hidden)

Achievements are hidden from the home screen, command menu and tutorial. Saved
records and the unlisted legacy commands remain available for existing backups.

The catalogue contains 1,909 achievements across 75 categories, sourced from
Paimon.moe on 2026-11-23. Browse, search by name/description/ID, mark completion,
and filter unmarked entries. Each account has its own journal.

UIAF v1.0/v1.1 import and v1.1 export preserve individual IDs, progress, status and
timestamps, including unknown timestamps. Manual marks use the standard unknown
timestamp sentinel rather than inventing an in-game completion date.

When HoYoLAB permits it, sync stores the overall achievement count separately.
The available Battle Chronicle interface does not expose an individual completion
list. The UI therefore does not infer that list from a total or claim a complete
automatic achievement scan. Individual states are manual or imported.

## Earned Primogems

The main **Earned Primogems** button and `/primogems` open HoYoLAB Traveler’s Diary
for the selected account. Browse saved months or refresh available recent income.
A player without an account is offered account connection. The owner also sees
**My Game Profile** for manual balances; income does not change those balances.

## Customize icons

The owner opens **Connect → Customize icons** (or the unlisted `/icons` shortcut),
chooses one of 19 symbols, and sends one regular or premium emoji. Telegram's
`custom_emoji` entity supplies the ID, so the user does not copy IDs manually.
Each icon can also be removed or reset. Changes persist and apply to future screens
for all players. Existing messages update when opened again.

The four public commands remain unchanged. Only `BOT_OWNER_ID`, or the explicitly
configured `bot_owner_id` runtime setting, can manage icons. Fresh installations
have no icon administrator until configured; the first visitor never gains that role.

Custom emoji render in HTML message/caption entities and button
`icon_custom_emoji_id` fields. Telegram requires an eligible bot (currently a Premium
bot owner for directly sent messages, or eligible purchased usernames). If Telegram
rejects the custom emoji, the bot retries using its regular fallback. Monospace
statistics use regular emoji because custom emoji cannot nest in preformatted text.
See [Telegram's formatting rules](https://core.telegram.org/bots/api#formatting-options)
and [button fields](https://core.telegram.org/bots/api#inlinekeyboardbutton).

## Artwork studio

The owner opens **Connect → Artwork & emojis**, or **Edit artwork / emoji** under
a character's card. Upload PNG/JPEG artwork as a photo or file to replace the large
card image globally. A landscape image with the character toward the right works
best. A separate control sets a regular/premium emoji beside that character's button.
Both can be reset independently. Other players cannot invoke these controls.
The character tiles retain automatic portraits; custom art applies to large cards.

Automatic portraits and splash art come from static Enka/HoYoverse assets. Missing
splash art falls back to the portrait. Images are cached under the private runtime
artwork directory. Custom uploads are limited to 10 MB and 18 megapixels. SVG is
not accepted. All dynamic card text is XML-escaped before rendering. Telegram photo
IDs are cached by rendered-content hash. Custom Telegram emoji are used in native
captions/buttons; the decorative star in the PNG artwork is part of the graphic.

## Savings and Traveler's Diary

The bot owner opens **Home → My Game Profile** or the same button inside Wish
History / Earned Primogems. Other users cannot access this preview, even through
old buttons or direct commands. Balances are associated with the selected Genshin
UID. Save four numbers in this order:
Primogems, Genesis Crystals, Intertwined Fates, Acquaint Fates. Changed values create
dated snapshots; identical values do not duplicate a snapshot. The dashboard shows
the latest balances and change since the previous snapshot. History and JSON export
are scoped to the current Telegram user and selected Genshin account. After the
first save, tap Primogems, Genesis Crystals, Standard pulls or Event pulls to replace
just that balance. Single-field edits preserve the other balances and remain bound
to the account selected when editing began. Standard pulls mean Acquaint Fates;
event pulls mean Intertwined Fates. The profile uses the official currency names.
Open **My Game Profile → Set currency emojis** to assign a separate premium or
regular emoji to Primogems, Genesis Crystals, Acquaint Fates and Intertwined Fates.
These appear in Telegram labels and buttons. Only the bot owner can edit them;
the static dashboard image uses text labels.

The event-wish budget is Intertwined Fates plus floor(Primogems / 160). Standard
tickets remain separate. A second, explicitly hypothetical figure includes crystals
at a 1:1 conversion. The bot never converts or spends currency. Balances remain manual;
wish imports and income summaries never deduct from or add to a wallet automatically.

Connected sessions can request recent HoYoLAB Traveler's Diary monthly summaries,
including Primogems/Mora earned and income categories. Successful regular syncs also
save the current summary when HoYoLAB permits access. Older saved summaries remain
available, but fresh requests are limited to recent month/year pairs to avoid the
upstream API's month-only ambiguity. Live authenticated diary access still needs the
player's successful connection. This is an income report, not a complete inventory
or spending ledger. Delete data cascades to savings snapshots and saved diary summaries.

## Welkin countdown

The owner opens **My Game Profile → Welkin** and enters 0–180 remaining days.
The bot stores the entered number and its UTC timestamp separately for each UID.
Remaining days = max(0, saved days − floor(elapsed milliseconds / 86,400,000)).
The first decrease happens exactly 24 hours after saving. Setting a new number
restarts that interval; 0 marks it inactive. The counter catches up after downtime
and survives restarts without requiring a daily database update or a scheduler.
Reopen or tap **Refresh profile** to see the current count and next decrease time.
Existing Telegram messages remain snapshots. No daily notification is sent.

Welkin tracks days only; it does not credit Primogems to a manual currency balance.
It can be set before any currency balances are saved. The balance JSON export
includes the original day count, timestamp, current remaining days and expiry.
Deleting account data removes the counter. Set its emoji under **Set currency
emojis → Welkin Moon**. The feature remains owner-only.

## Run

Requires Node.js 24 or newer; no inbound ports. The pinned native SVG renderer is
installed through npm. Install a system sans-serif font on minimal Linux hosts;
Windows uses Segoe UI. Source archives exclude node_modules and private runtime files.

    npm ci --ignore-scripts

    powershell -NoProfile -ExecutionPolicy Bypass -File .\Protect-Token.ps1
    powershell -NoProfile -ExecutionPolicy Bypass -File .\Start-Bot.ps1 -Mode Setup
    powershell -NoProfile -ExecutionPolicy Bypass -File .\Start-Bot.ps1

Protect-Token prompts for the Telegram token without echoing it. The launcher
stores the token and a random vault master key using Windows DPAPI. These files
are specific to this Windows account and PC. Keep the runtime directory private.
The process execution-policy option does not permanently change Windows settings.

`Start-Bot.ps1` accepts `-TokenFile`, `-DataDirectory`, `-NodePath`, and `-Mode Check`.
For this workspace, the parent outputs folder has Start-My-Bot.cmd and
Stop-My-Bot.cmd. The stop helper uses a control file, avoiding unsafe PID reuse.

On other hosting systems, provide `TELEGRAM_BOT_TOKEN`, a stable `BOT_VAULT_KEY`
(base64-encoded 32 random bytes) through a secret manager, and `BOT_DATA_DIR` on
persistent storage. Do not put secrets in source, chat, command-line arguments,
or distributable archives. Run `node src/main.mjs --setup` once, then
`node src/main.mjs`. Losing or changing the vault key makes existing sessions
unreadable. Reconnect accounts if it is lost; do not silently reset it.

The Windows launchers run a local server and require that PC to remain awake.
The Northflank deployment runs independently of every player's PC and stores data
in its private PostgreSQL addon. Keep a separate recovery backup and vault key.
Only one Telegram polling process may run for a token.

## Privacy and security design

- Private chats only. Every data operation uses the Telegram sender ID, not a
  UID or owner value supplied by a file or callback. A UID alone does not prove ownership.
- The connection envelope uses AES-256-CBC with encrypt-then-HMAC-SHA256. A random
  encryption/MAC key is wrapped using RSA-OAEP-SHA256. The MAC binds the Telegram
  owner, single-use challenge, IV and ciphertext. Tampering is rejected before decryption.
- Sessions and the server's RSA private key are encrypted at rest with AES-256-GCM
  and context-bound additional data. The master key is protected separately by DPAPI
  on Windows. Credentials are decrypted in memory only for upstream requests.
- HoYoverse session credentials have broader account authority than a wish-history
  key. Encryption at rest does not prevent the operator from accessing them. This
  is disclosed before connection. Passwords are entered only on official pages.
- Temporary wish keys are generated as needed and are never written to the database.
  Account cookies are not sent to the wish-history endpoint or artwork providers.
- Disconnect deletes the saved session and stops future sync. A job in flight cannot
  recreate disconnected/deleted data. Delete data also cascades to wishes, journals,
  totals, savings, diary summaries, roster snapshots, manual weapon entries and connection challenges. Telegram files/messages and external backups
  are separate. No automatic database backups are created by this code.
- Uploads are processed in memory, with size limits and strict field validation.
  Credential-looking file uploads and accidental token messages outside the explicit cookie-entry flow are rejected. Operational logs contain codes,
  never request URLs, cookies, user messages or uploaded bodies.

## Validation

    node --disable-warning=ExperimentalWarning --test test/*.test.mjs

Tests cover exact IDs, deduplication, transactional rollback, owner isolation,
database persistence, patch time zones, announcement parsing, UIAF round trips,
envelope tampering/replay, credential encryption, disconnect races, authentication
expiry, request scoping, four-command UI, and personal connection archives.

## Data sources and credits

- [HoYoverse terms](https://genshin.hoyoverse.com/en-us/company/terms)
- [genshin.py authentication documentation](https://seria.is-a.dev/genshin.py/authentication/)
  and [source](https://github.com/seriaati/genshin.py) informed the unofficial API routes.
- [UIGF](https://uigf.org/en/standards/uigf.html) and
  [UIAF](https://uigf.org/en/standards/uiaf.html) for portable records.
- [Paimon.moe achievement data](https://github.com/MadeBaruna/paimon-moe/tree/main/src/data/achievement),
  with its MIT license in assets/PAIMON-MOE-LICENSE.txt. Game content belongs to its rights holders.
- [Paimon.moe weapon catalogue](https://github.com/MadeBaruna/paimon-moe/blob/main/src/data/weaponList.js) supplies the 5-star picker; the same MIT license is included.
- [Enka.Network](https://api.enka.network/) for public artwork and
  [icon metadata](https://github.com/EnkaNetwork/API-docs/tree/master/store/gi).
  No player UIDs are sent to Enka; Telegram fetches static artwork and caches file IDs.

Update the item dictionary, artwork mapping and achievement catalogue as the game
adds content. New unknown items still remain in wish history without artwork.

5-star weapon emojis: /connect -> Artwork & emojis -> 5-star Weapons.
All 76 supported weapons are available to the owner, regardless of ownership.
Choose a weapon, press Set button emoji and send one premium emoji.

VIDEO / CHANNEL TUTORIAL
Connection settings show wish connection status and short action buttons.
The bot owner can open Connect -> Add channel link.
Post the tutorial video in a public Telegram channel, then send its public post
link to the bot in that editor. A channel link also works. Players see Watch
video once the link is saved. Only the owner can change or remove the link.
