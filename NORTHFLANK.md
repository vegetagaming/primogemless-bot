# Primogemless on Northflank

The Sandbox deployment uses one bot service and the included PostgreSQL addon.
The PC copy keeps SQLite. Both use the same Store behavior and encryption format.
All cloud records and custom artwork are committed to PostgreSQL before returning;
container storage is only a disposable artwork cache and heartbeat directory.

## Configuration

- Developer Sandbox; no paid upgrade or standalone volume.
- Public or private GitHub source, Dockerfile `/Dockerfile`, build context `/`.
- One bot instance, recreate rollout, no public ports, 90-second shutdown grace.
- Private PostgreSQL 17 addon with TLS; the application uses its non-admin role.
- `BOT_DATABASE_URL`: private PostgreSQL URI, as a runtime secret.
- `TELEGRAM_BOT_TOKEN`: existing bot token, as a runtime secret.
- `BOT_VAULT_KEY`: the SAME base64 master key as the local bot, as a runtime secret.
- `BOT_DATA_DIR=/data`; `BOT_DEPLOYMENT_MODE=hold` during migration, `run` afterward.
- `BOT_OWNER_ID`: the operator's numeric Telegram user ID, for admin-only controls.
- Health command `node /app/ops/healthcheck.mjs`, period 60s, timeout 10s,
  initial delay 120s, failure threshold 3.

Secrets must never be build arguments or repository files. Windows DPAPI XML files
stay on Windows. Existing encrypted sessions need the original master key.

The database adapter uses one dedicated worker/session to preserve the existing
synchronous Store interface. A session advisory lock prevents two cloud writers.
Queries have timeouts, parameterized values, verified TLS, and durable commits.
This is intended for the initial small bot; database round trips block each Store
operation. For a large public audience, migrate the Store interface to async
queries and batch imports before increasing traffic.

## Migration

This procedure describes migrating an existing installation. New users can first
initialize a local SQLite installation using the README's Windows setup. The cloud
startup guard deliberately requires a verified migration; changing visibility on
GitHub does not change database access or publish runtime secrets.

1. Build in hold mode. The PC bot remains active during preparation.
2. Verify PostgreSQL integration tests in the isolated `primogemless_test` schema.
3. Stop the PC bot and wait for its stopped heartbeat.
4. Take a consistent SQLite backup; keep it locally for recovery.
5. Copy all tables in one PostgreSQL transaction, preserving IDs, owner boundaries,
   metadata, encrypted sessions, UI state, and sequence counters. Copy artwork blobs.
6. Compare hashes and row counts and verify the existing key decrypts connections.
7. Set `cloud_migration_complete=ready` only after verification, then run the cloud bot.
8. Verify a live heartbeat, Telegram access, image rendering, and restart persistence.

Hold mode never polls Telegram or HoYoLAB. Run mode refuses an unverified empty
cloud database. An alternative SQLite deployment still requires a separately
mounted persistent volume; it must not use ephemeral storage.

## Recovery

Keep the local bot stopped while cloud polling is enabled. Set cloud mode to hold
and verify polling has stopped before restarting a PC copy. Cloud data may be newer
than the original SQLite backup: export and reconcile it before rolling back.
Keep the vault key securely backed up separately. A persistent database is not a
separate backup. Monitor Sandbox resource limits; the free plan has no uptime SLA.

Official documentation: https://northflank.com/pricing and
https://northflank.com/docs/v1/application/databases-and-persistence.
