# Security reports

Please report suspected vulnerabilities privately to the maintainer,
[@Wr_Vegeta on Telegram](https://t.me/Wr_Vegeta), before opening a public issue.
Describe the affected version, the impact and reproduction steps using synthetic
data. Do not send real tokens, cookies, connection packages or another user's data.
There is no guaranteed response time or bug bounty.

Fixes target the latest version on `main`; older versions do not receive a separate
maintenance stream. This project has not received an independent security audit.

## Operating a bot

- Store the Telegram token, database password and stable vault master key in runtime
  secrets, separate from source and build arguments.
- HoYoverse session credentials grant broader access than a wish-history link.
  Encryption at rest protects stored values, but the bot operator can decrypt them.
  Read the connection privacy notice before deciding which operator to trust.
- Keep a separate protected database backup and master-key backup. Disconnect and
  deletion affect the live database; external backups and Telegram are separate.
- Restrict administrative features with `BOT_OWNER_ID`, your numeric Telegram user
  ID. Never accept an owner ID from an uploaded file or grant ownership to the first
  person who starts a public bot.
- Use one poller per bot token and HTTPS for upstream services. The bot needs
  outbound network access, not a public HTTP port.

If credentials were exposed, revoke or rotate them through the issuing service.
Deleting a Git commit or Telegram message does not revoke a credential.
