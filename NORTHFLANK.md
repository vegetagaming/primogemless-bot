# Primogemless on Northflank

The container keeps the current Telegram bot, SQLite archive, account connections,
custom emojis and artwork. It needs one running instance and a persistent disk.
This is a deployment recipe; it does not mean the bot has been deployed.

## Free-plan check

Select Developer Sandbox and use Northflank Cloud. Check the dashboard's estimate
for BOTH the service and the persistent volume before creating resources. Do not
upgrade to Pay as you go to work around a free-plan limit. Card verification may
be required even for a free service. If the free account cannot attach a volume,
stop: this SQLite application cannot safely use its temporary container storage.

## Service

- Private source repository containing this directory, without node_modules or data.
- Combined service, Dockerfile `/Dockerfile`, build context `/`.
- One instance; no autoscaling and no public ports.
- Persistent Single Read/Write volume mounted at `/data`.
- Recreate rollout strategy, if available, so two Telegram pollers never overlap.
- Termination grace period of at least 60 seconds.
- Initially keep `BOT_DEPLOYMENT_MODE=hold` (the image default).
- Liveness command: `node /app/ops/healthcheck.mjs`, every 60 seconds, timeout
  10 seconds, failure threshold 3. Allow 120 seconds for startup.

The startup wrapper refuses a container with no separate data mount. Hold mode
keeps the container available for migration without polling Telegram or HoYoLAB.

## Runtime secrets

Set these as runtime variables/secrets, never build arguments or repository files:

- `TELEGRAM_BOT_TOKEN`: the existing bot token.
- `BOT_VAULT_KEY`: the SAME base64 encryption key used by the local bot.
- `BOT_DATA_DIR`: `/data`.
- `BOT_DEPLOYMENT_MODE`: `hold` until the migration is verified, then `run`.

The existing archive already contains the owner ID and custom emoji settings.
Do not generate a new vault key: existing HoYoLAB connections require the old key.
The Windows DPAPI XML files cannot be opened on Linux and must not be uploaded.

## Cutover

1. Build the service and verify its log says `CLOUD_MIGRATION_HOLD`.
2. Keep the PC bot active until the build, disk and secret configuration are ready.
3. Stop the PC bot and wait for `BOT_STOPPED` and a stopped health record.
4. Make a consistent SQLite backup and retain a local recovery copy. Copy the
   archive plus the `artwork/` directory using Northflank's authenticated file
   transfer. Do not copy process files, logs, XML secrets, or stop.request.
5. Verify SQLite integrity, record counts, emoji settings and artwork hashes on
   the server. Verify the existing vault key opens every encrypted connection.
6. Set `BOT_DEPLOYMENT_MODE=run`, then verify `BOT_RUNNING`, a fresh heartbeat,
   the four-button Telegram menu, history, a generated card and account syncing.
7. Restart the cloud container and check that its saved data and settings survive.
8. Keep the local bot stopped. Two polling instances cause Telegram conflicts.

Use Northflank's authenticated CLI/client to download backups. Back up the vault
key separately in a protected secret store. A disk is persistence, not a backup.

## Rollback

Set the cloud deployment to hold and confirm polling has stopped before starting
the PC bot. If users added anything after cutover, take a new cloud database/artwork
backup first and reconcile it; do not replace it with an older local snapshot.

## Sources

- https://northflank.com/pricing
- https://northflank.com/docs/v1/application/databases-and-persistence/add-a-volume
- https://northflank.com/docs/v1/application/observe/configure-health-checks
- https://northflank.com/docs/v1/api/copy-files
