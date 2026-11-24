# Primogemless 2.14.0

An open-source Telegram companion for Genshin Impact, created by
[@Wr_Vegeta](https://t.me/Wr_Vegeta).

[Use the bot](https://t.me/Primogemless_bot) · [Run your own](#run) ·
[Contribute](CONTRIBUTING.md) · [Security](SECURITY.md) · [MIT license](LICENSE)

- **Connect:** a Windows encrypted helper or guided manual cookie entry on mobile/desktop.
- **Wish History:** automatic checks, UIGF backups, patch filters and pity cards.
- **Earned Primogems:** available HoYoLAB Traveler's Diary monthly income.
- **Owned Characters:** constellations, levels and five-star weapons.
- **AKASHA:** Enka showcase build cards and links to Akasha rankings.
- **Reminders:** Daily Commission and full Original Resin alerts per account.
- **Owner preview:** manual currency balances and a Welkin day countdown.

Requires Node.js 24+, persistent SQLite or PostgreSQL storage, and your own
Telegram bot token. The public repository contains source, not the hosted bot's
database, tokens, encryption keys or connected accounts. Game artwork and other
third-party material retain their own rights; see [notices](THIRD_PARTY_NOTICES.md).

This is an independent fan project. HoYoLAB integrations are unofficial and may
change or expire; only history still available from the upstream server can be
fetched. Saved older records remain in the archive.

For hosting without a PC, see [Northflank deployment](NORTHFLANK.md). The Docker
image starts in migration hold mode and uses PostgreSQL or a persistent disk. It does not
start a second Telegram poller until the archive and existing secrets are restored.

The Telegram bio and description credit **Creator: @Wr_Vegeta**. Their source is
`src/bot-profile.mjs`; profile setup uses these values. The short bio stays within
Telegram’s 120-character limit.

Six public commands: `/connect`, `/history`, `/primogems`, `/characters`, `/akasha`, `/reminders`.
The home buttons are Connect, Wish History, Earned Primogems, Owned Characters, AKASHA and Reminders.
Opening Connect shows the owner's uploaded video inline and device choices for
Android, iPhone/iPad and Windows. Until a video is added, it shows short text
instructions. Only the Windows ZIP button generates and sends a personal ZIP;
opening Connect or phone guides does not expire an existing pairing challenge.
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
The balance card includes bundled Primogem, Genesis Crystal, Acquaint Fate and
Intertwined Fate artwork, large amounts, and a separate Welkin countdown panel.
Rendering uses local assets and does not require a network request.
Cards use an explicitly loaded DejaVu Sans font on Linux, with a numeric-glyph
probe before rendering. Missing fonts fall back to the text response instead of
sending a blank-text image. Render-cache versioning replaces older broken cards. Currency
premium emoji settings continue to control captions and buttons independently.
The home screen uses a two-column menu and a navy/gold image dashboard. Account
switching, backups, refresh, disconnect and deletion live inside those screens.

Traveler labels use Aether (10000005) and Lumine (10000007) in artwork/emoji
pickers, Enka build cards and owned rosters, including previously saved snapshots.
Their stable IDs and custom emoji/artwork settings are preserved.

## Character galleries

Owned Characters and the character tab in Wish History use portrait cards with
18 characters per page (three columns, up to six rows). Owned entries show a
portrait, constellation, level and element. Pulled entries show copies and the
latest saved pity, preserving the five-star green/yellow/red scale and purple
four-star pity. Character buttons and Next/Previous pages cover the same entries.
Weapon galleries retain nine entries per page.

## Daily and Original Resin reminders

Open **Reminders** or `/reminders`, choose a saved UID, and enable either switch.
Both are off by default. Enabling requires the UID to belong to the current
authenticated HoYoLAB account; importing someone else's wish file is insufficient.

- **Daily Commissions:** one alert during the final two hours before that account's
  04:00 server reset, only while daily tasks or their bonus reward remain unclaimed.
  Modern HoYoLAB task totals take priority over legacy counters, including Encounter
  Point completion. Claimed bonus rewards suppress the alert.
- **Original Resin:** one alert when a fresh HoYoLAB response reports resin at or
  above its reported cap. Checks run about every ten minutes. Another alert requires
  the bot to observe resin below the cap first. Spending and refilling entirely
  between checks cannot be detected.

Server offsets are fixed: America UTC−5, Europe UTC+1, Asia and TW/HK/MO UTC+8.
Scheduling does not use the player's computer timezone or daylight saving time.
Checks resume after an outage; daily catch-up stays within the current day's
two-hour window. HoYoLAB caching, network delays and queued requests can delay alerts.
No notification is inferred from an old snapshot or a calculated refill time.

Real-Time Notes must be available in HoYoLAB Battle Chronicle. If unavailable,
the settings panel explains how to enable it or reconnect; the bot does not change
HoYoLAB privacy settings. Errors back off, and Check now is limited to once a minute.
The latest snapshot, preferences and duplicate-prevention markers persist in SQLite
or PostgreSQL. Disconnect clears reminders; deleting data cascades to them too.
Blocking the bot disables that Telegram user's reminders.

The bot records an alert before delivery to prevent duplicates across restarts.
Definite Telegram rejection can be retried, respecting rate limits; ambiguous network
failures are not resent because delivery may already have succeeded. This favors
avoiding duplicate notifications and does not promise exactly-once delivery.
Only subscribed accounts receive background messages. Owner-editable premium icons
are available for Reminders, Daily Commissions and Original Resin.

Field and endpoint references:
[genshin.py Real-Time Notes model](https://github.com/seriaati/genshin.py/blob/master/genshin/models/genshin/chronicle/notes.py)
and [read-only dailyNote request](https://github.com/seriaati/genshin.py/blob/master/genshin/client/components/chronicle/genshin.py).

## AKASHA: builds and rankings

Open **AKASHA** for the selected saved Genshin UID. **Change account** switches
between only that Telegram user's saved UIDs. No additional login is needed.

- **Character build cards** fetch the public Enka showcase and display character
  artwork, constellation, level, weapon/refinement, combat stats and five artifacts
  with main stats, substats and artifact CRIT Value (2 × CRIT Rate + CRIT DMG,
  including artifact main stats). CV is not a rank or a universal build score.
- **Akasha profile · ranks & Top %** opens the selected UID on Akasha's website.
- **Leaderboards** and **Enka showcase** open their respective websites.
- **Showcase setup** explains how to add characters and enable **Show character
  details** in Genshin. HoYoLAB owned characters and the public showcase are separate.

Akasha returned Cloudflare HTTP 403 to normal requests from both the local computer
and Northflank during verification on 2026-11-24. This release does not bypass it
or claim to display Akasha rankings inside Telegram. Rankings and comparison
categories remain on Akasha. No Akasha refresh, login or write API is called.

Enka requests send only the selected public UID and an identifying User-Agent;
HoYoverse cookies never leave the existing HoYo client. Requests use fixed HTTPS
hosts, an 8-second timeout, a 2 MB response limit, cache/deduplication respecting
Enka TTL (at least 60 seconds), bounded memory cache and Retry-After backoff.
Refresh does not bypass that cache. Hidden/empty showcases and upstream outages
keep website buttons available. No background UID scanning is performed.

Sources: [Enka API rules](https://github.com/EnkaNetwork/API-docs/blob/master/api.md),
[Genshin response fields](https://github.com/EnkaNetwork/API-docs/blob/master/docs/gi/api.md),
[Akasha leaderboards](https://akasha.cv/leaderboards).

## Connect once

1. Open **Connect** for the video, then choose **Windows · personal ZIP**.
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

## Manual cookie connection on mobile and desktop

Open **Connect → Android / iPhone** for a browser guide, or **Enter cookies manually**
if you already have the values. This release reuses manual entry rather than
requiring a new native helper app. The guide distinguishes these options:

- **Android:** Firefox for Android with [Cookie-Editor by cgagnier](https://addons.mozilla.org/en-US/android/addon/cookie-editor/).
- **iPhone / iPad:** Safari with [Cookie-Editor by Christophe Gagnier](https://apps.apple.com/app/cookie-editor/id6446215341).
  Its own Safari help documents that some cookies, including HttpOnly cookies,
  cannot be displayed. Missing required cookies prevent full wish connection;
  use the Windows helper, or HoYoLAB-only mode when its fields are available.
- **Desktop:** Chrome/Edge DevTools → Application → Cookies.

Chrome's Desktop site changes website presentation; it does not add phone DevTools.
The [extension author's site](https://cookie-editor.com/) lists both mobile variants.
These guides are based on the extension's documentation and source; live login and
wish-cookie visibility still need verification on each player's phone/browser.
The bot does not install or bundle the extension and does not claim it has audited it.

Sign in to HoYoLAB and, for wishes, the Genshin redemption page with the same account
in the selected browser. The HoYoLAB mobile app's session is separate. Copy only:

- HoYoLAB: **ltuid_v2**, **ltoken_v2**, and **ltmid_v2** when present.
- Genshin redemption: **account_id_v2**, **account_mid_v2**, **cookie_token_v2**.

The first letter in **ltoken**, **ltuid** and **ltmid** is lowercase L. Account IDs are not
Genshin UIDs. Do not export all cookies, alter values, paste screenshots or send a
password. Grant extension site access narrowly where supported and remove it after use.

After collecting values, choose **Connect wishes + HoYoLAB** or **HoYoLAB only**.
The explicit entry window lasts ten minutes. Send one text message with one
**cookie_name=value** per line. Full mode requires both sets and verifies wish authkey
access before saving. Incomplete or rejected input leaves the existing session intact
instead of silently downgrading it. HoYoLAB-only mode rejects extra wish credentials
and enables roster/diary/available Real-Time Notes without wish syncing.
The legacy unlisted **/cookiebegin** route retains automatic capability detection.

Telegram cloud chat receives raw credentials before server storage encryption; it
is not end-to-end encrypted. The bot requests message deletion before verification
and aborts if Telegram does not confirm deletion. Deletion cannot guarantee removal
from all Telegram copies. Values are never echoed, logged or saved in UI state.
Only the six allowlisted names are accepted. A successful connection replaces the
previous session; disconnect erases it. The operator can decrypt stored sessions to
access account data. The Windows helper remains the option that encrypts the
connection package before it enters Telegram.

Phone extension compatibility, cookie visibility and HoYoverse authentication can
change. Authentication tests use synthetic cookies; they do not prove a phone's
current live login will work.

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
chooses one of 23 symbols, and sends one regular or premium emoji. Telegram's
`custom_emoji` entity supplies the ID, so the user does not copy IDs manually.
Each icon can also be removed or reset. Changes persist and apply to future screens
for all players. Existing messages update when opened again.

Only `BOT_OWNER_ID`, or the explicitly
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
Stop the foreground process with Ctrl+C and wait for it to exit before restarting.

Set `BOT_OWNER_ID` to your numeric Telegram user ID in the launch environment to
enable icon/artwork administration, tutorial video editing and the balance preview.
For example, in PowerShell, set `$env:BOT_OWNER_ID = 'YOUR_NUMERIC_TELEGRAM_ID'`
before launching. Replace the placeholder; a Telegram username is not a numeric ID.
Without this setting, a fresh installation has no administrator.

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
  totals, savings, diary summaries, roster snapshots, manual weapon entries, reminders and connection challenges. Telegram files/messages and external backups
  are separate. No automatic database backups are created by this code.
- Uploads are processed in memory, with size limits and strict field validation.
  Credential-looking file uploads and accidental token messages outside the explicit cookie-entry flow are rejected. Operational logs contain codes,
  never request URLs, cookies, user messages or uploaded bodies.

## Validation

    node --disable-warning=ExperimentalWarning --test test/*.test.mjs

Tests cover exact IDs, deduplication, transactional rollback, owner isolation,
database persistence, patch time zones, announcement parsing, UIAF round trips,
envelope tampering/replay, credential encryption, disconnect races, authentication
expiry, request scoping, six-command UI, personal connection archives, reminder
reset boundaries, persistent duplicate prevention and disconnect/toggle races.

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
  Static artwork uses item identifiers. AKASHA build cards send the selected public
  Genshin UID to Enka's showcase API; no HoYoverse cookies are sent to Enka.

Original code and documentation are licensed under [MIT](LICENSE). Preserve the
separate [third-party notices](THIRD_PARTY_NOTICES.md) when redistributing.

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
