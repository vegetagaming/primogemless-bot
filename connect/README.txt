PRIMOGEMLESS - ONE-TIME CONNECTION

1. Save the ZIP. Right-click it in File Explorer and choose Extract All.
   Do not run Connect.cmd from inside the ZIP or Telegram's preview.
2. Open the extracted folder. It must contain Connect.cmd, Connect.ps1,
   connection.json and README.txt together. Double-click Connect.cmd and press Enter.
3. In the new browser, sign in to the official HoYoLAB and Genshin redemption pages.
   Enter your password only on those official sites. Complete any verification there.
4. When the helper finishes, send Primogemless.connect.json to @Primogemless_bot.
5. The bot verifies the session and enables automatic syncing. No repeated wish files.

This connection request is personal and expires in 30 minutes.
Requires Windows with Microsoft Edge or Google Chrome. No administrator access.

The helper reads only six session-cookie fields from a NEW isolated browser profile.
It never reads your existing browser profile, game files, or game process.
Your password is not read by the helper. The session is encrypted before it becomes
a file (AES-256-CBC with HMAC-SHA256; keys wrapped with RSA-OAEP-SHA256).
Only the bot server can decrypt it, and only your Telegram account can import it.

The bot operator stores your session encrypted and can technically access it to make
HoYoverse requests. Session credentials have broader authority than a wish-history
key. Do not connect to an operator you do not trust. Telegram receives the encrypted
package, not the raw cookies. Delete the package after successful connection.

Use Disconnect inside /login to erase the bot's saved session. Log out/revoke the
session through HoYoverse to invalidate it there too. You may need to reconnect if
HoYoverse expires or revokes the login. This is an unofficial integration.

The helper closes its isolated browser and removes its temporary profile after
success. If interrupted, close that browser and remove its Primogemless-Login folder
from the Windows temporary folder. Existing browser profiles are untouched.

The launcher permits this local script for its PowerShell process only. It does not
change the system execution policy. No script is downloaded and executed remotely.
