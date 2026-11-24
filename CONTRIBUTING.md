# Contributing

Bug reports and focused pull requests are welcome. For security issues, follow
[SECURITY.md](SECURITY.md) instead of posting details publicly.

1. Fork and clone this repository. Use Node.js 24 or newer.
2. Run `npm ci --ignore-scripts` (use `npm.cmd` in PowerShell if needed).
3. Run `npm test`. Linux needs DejaVu Sans; the Dockerfile installs it.
4. Explain the user-visible change and include the relevant verification in your PR.

The default tests use isolated temporary storage and mocked service calls.
PostgreSQL integration tests require a separate disposable test database configured
as described in `test/postgres.test.mjs`; never point them at a live bot database.
Use your own separate Telegram bot for manual testing. Never run two polling
processes with the same token.

Keep Telegram-user and Genshin-account boundaries intact. Avoid logging cookies,
tokens, uploaded files, private message text or request URLs containing credentials.
Use synthetic accounts and records in tests and screenshots. Do not commit runtime
directories, databases, personal helper ZIPs, connection files, exports or secrets.

Keep third-party notices when changing data sources or artwork. Contributions to
the original code are provided under the project's MIT license; disclose any
third-party code or assets and preserve their applicable licenses.
