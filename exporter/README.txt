GENSHIN WISH EXPORT HELPER - WINDOWS

1. Extract this ZIP into a folder you can write to, such as Downloads.
2. Open Genshin Impact, then Wish, then History. Wait for records to load.
3. Read Export-Wishes.ps1 if you want to inspect what it does.
4. Double-click Export-Wishes.cmd. Press a key when prompted.
5. If asked, enter the folder containing GenshinImpact.exe.
6. Wait for all banner categories to finish. Large histories take a few minutes.
7. Open the new Exports folder. Send the file ending in .uigf.json to the bot.

You can then close the game. The bot keeps your uploaded records. To add future
pulls, repeat these steps and upload again; duplicate pull IDs are skipped.

WHAT THIS HELPER DOES
- Opens the game's browser cache in read-only mode.
- Reads the temporary wish-history key into memory.
- Sends that key only to the global HoYoverse wish-history endpoint over HTTPS.
- Requests each supported character/weapon wish category until no rows remain.
- Writes only wish records, the Genshin UID and non-secret export metadata.
- Uses the bundled public UIGF dictionary for missing item IDs.

It does not change game files, click in the game, inspect process memory, ask for
your password or store the temporary access key in its output. Windows itself
can page process memory; this is not a guarantee against operating-system dumps.
The launcher allows this local script for that PowerShell process only. It does
not change the permanent execution policy. No administrator access is required.

LIMITS
This is an unofficial helper, not a HoYoverse-approved integration. Read-only
operation is not a guarantee about enforcement of game terms.
Only history still returned by the server is available. Recent wishes can take
time to appear. The export is not necessarily your lifetime wish history.
Supported: global Genshin character/weapon wishes on Windows (America, Europe,
Asia, TW/HK/MO). China servers, Wonderland and achievements are not supported.
Cache layouts can change with game updates. If the helper fails, reopen History
and retry. Never send raw cache files or a wish link to the bot to troubleshoot.

FILES TO SEND
Send: genshin-wishes-....uigf.json
Keep locally: genshin-wishes-....-summary.json
Never send: game cache files, access keys, passwords or bot tokens.

The JSON includes your Genshin UID and wishes. Telegram and the bot operator can
access uploads; read /privacy in the bot. /export creates a backup; /delete_me
removes saved records from the bot's live database after confirmation.

Public dictionary: https://api.uigf.org/dict/genshin/en.json
Format: https://uigf.org/en/standards/uigf.html
Game terms: https://genshin.hoyoverse.com/en-us/company/terms
