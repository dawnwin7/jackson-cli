# Jackson CLI repo guidance

## Product boundary

The stable product surface is the `jackson` CLI. Keep root README focused on end-user CLI usage only.

Workspace shape:

```text
apps/docs        # Next.js landing page/docs app
packages/cli     # Rust CLI binary named jackson
packages/api     # FastAPI app deployable by FastAPI Cloud
```

## Local commands

Root commands delegate through Turbo to package-level wrappers:

```bash
pnpm install
pnpm test
pnpm --filter @jackson/docs build
pnpm --filter @dawnwin7/jackson-cli test
pnpm --filter @jackson/api test
pnpm smoke
```

`pnpm smoke` builds the workspace, starts the API locally with `JACKSON_TEST_MODE=true`, uses a temporary CLI credential directory, sends requests through the CLI, simulates Telegram webhook replies, and verifies `jackson get` plus `--wait` behavior.

## CLI notes

- `JACKSON_API_BASE_URL` defaults to `https://jackson-api.fastapicloud.dev`.
- Credentials are stored by default at `<home>/.jackson/credentials.json`, for example `~/.jackson/credentials.json` on macOS.
- Login credentials persist forever unless removed with `jackson logout`.
- `JACKSON_CONFIG_HOME` overrides credential storage for tests; with the override set, credentials are stored at `$JACKSON_CONFIG_HOME/jackson/credentials.json`.
- `jackson send` is intentionally not a documented product command. Bare positional text, for example `jackson "hello"`, is the canonical send path.

## API environment

- `JACKSON_TELEGRAM_BOT_TOKEN` live Telegram bot token.
- `JACKSON_TELEGRAM_OPERATOR_CHAT_ID` single allowed operator chat id.
- `JACKSON_TELEGRAM_WEBHOOK_SECRET` value expected in `X-Telegram-Bot-Api-Secret-Token`.
- `JACKSON_TEST_MODE=true` uses deterministic local Telegram behavior and requires no live Telegram credentials.
- `MONGO_URI` is required outside `JACKSON_TEST_MODE`; it must point to the production MongoDB deployment.
- `MONOGO_DBNAME` selects the MongoDB database name. `MONGO_DBNAME` is also accepted for the corrected spelling.

The server generates claim-once tokens, stores only token hashes, and requires `Authorization: Bearer <token>` for non-login CLI routes.

## Telegram webhook behavior

The API sends operator prompts with Telegram Bot API `sendMessage` in this format:

```text
From: <sender_username>

<content>
```

It stores the returned `message_id` and maps normal Telegram replies by `reply_to_message.message_id`, so using Telegram's reply action on a bot message replies to that exact request. Operators may also use `/reply <request_id> <reply text>`.

When configuring Telegram webhooks, set a secret token and send updates to the API webhook. Telegram will include the configured secret in the `X-Telegram-Bot-Api-Secret-Token` header; the API rejects missing or wrong values.

## FastAPI Cloud

The deployable FastAPI app directory is `packages/api`, with entrypoint `app.main:app` in `packages/api/pyproject.toml`.

```bash
fastapi deploy packages/api
```

Actual cloud deployment is credential-gated: live Telegram bot token, operator chat id, webhook secret, MongoDB env vars, and deployment credentials are required outside local smoke tests.
