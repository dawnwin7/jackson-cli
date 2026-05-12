#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="${JACKSON_SMOKE_PORT:-8765}"
BASE_URL="http://127.0.0.1:${PORT}"
export NO_PROXY="127.0.0.1,localhost,::1"
export no_proxy="$NO_PROXY"
CONFIG_HOME="$(mktemp -d)"
API_LOG="$(mktemp)"
cleanup() {
  if [[ -n "${API_PID:-}" ]]; then
    kill "$API_PID" >/dev/null 2>&1 || true
    wait "$API_PID" 2>/dev/null || true
  fi
  rm -rf "$CONFIG_HOME" "$API_LOG"
}
trap cleanup EXIT

(
  cd "$ROOT/packages/api"
  JACKSON_TEST_MODE=true uv run uvicorn app.main:app --host 127.0.0.1 --port "$PORT" >"$API_LOG" 2>&1
) &
API_PID=$!

for _ in {1..50}; do
  if curl --noproxy '*' -fsS "$BASE_URL/cli/login" -X POST -H 'Content-Type: application/json' -d '{"username":"probe"}' >/dev/null 2>&1; then
    break
  fi
  sleep 0.2
done
if ! kill -0 "$API_PID" >/dev/null 2>&1; then
  cat "$API_LOG" >&2
  exit 1
fi

CLI=(cargo run --quiet --manifest-path "$ROOT/packages/cli/Cargo.toml" --)
JACKSON_CONFIG_HOME="$CONFIG_HOME" JACKSON_API_BASE_URL="$BASE_URL" "${CLI[@]}" login --username smoke-user >/tmp/jackson-login.out
SEND_OUTPUT=$(JACKSON_CONFIG_HOME="$CONFIG_HOME" JACKSON_API_BASE_URL="$BASE_URL" "${CLI[@]}" send "how are you?")
REQUEST_ID="${SEND_OUTPUT#request_id: }"

curl --noproxy '*' -fsS "$BASE_URL/telegram/webhook" \
  -H 'Content-Type: application/json' \
  -H 'X-Telegram-Bot-Api-Secret-Token: test-webhook-secret' \
  -d "{\"update_id\":10001,\"message\":{\"message_id\":10002,\"chat\":{\"id\":424242},\"text\":\"/reply ${REQUEST_ID} smoke reply\"}}" >/dev/null

REPLY=$(JACKSON_CONFIG_HOME="$CONFIG_HOME" JACKSON_API_BASE_URL="$BASE_URL" "${CLI[@]}" get "$REQUEST_ID")
[[ "$REPLY" == "smoke reply" ]]

WAIT_OUTPUT=$(JACKSON_CONFIG_HOME="$CONFIG_HOME" JACKSON_API_BASE_URL="$BASE_URL" "${CLI[@]}" send "delayed?")
WAIT_ID="${WAIT_OUTPUT#request_id: }"
(
  sleep 1
  curl --noproxy '*' -fsS "$BASE_URL/telegram/webhook" \
    -H 'Content-Type: application/json' \
    -H 'X-Telegram-Bot-Api-Secret-Token: test-webhook-secret' \
    -d "{\"update_id\":10003,\"message\":{\"message_id\":10004,\"chat\":{\"id\":424242},\"text\":\"/reply ${WAIT_ID} delayed smoke reply\"}}" >/dev/null
) &
WAIT_REPLY=$(JACKSON_CONFIG_HOME="$CONFIG_HOME" JACKSON_API_BASE_URL="$BASE_URL" "${CLI[@]}" get "$WAIT_ID" --wait --timeout-seconds 5)
[[ "$WAIT_REPLY" == "delayed smoke reply" ]]

echo "smoke passed request_id=${REQUEST_ID} delayed_request_id=${WAIT_ID}"
