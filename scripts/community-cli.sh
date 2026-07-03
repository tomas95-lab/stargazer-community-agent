#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
set -o allexport
source "$SCRIPT_DIR/.env" 2>/dev/null || true
set +o allexport

BASE_URL="${COMMUNITY_BASE_URL:-https://community.outlier.ai}"
API_KEY="${DISCOURSE_API_KEY:-}"
CLIENT_ID="${DISCOURSE_API_CLIENT_ID:-daily-thread-bot}"
CHANNEL_ID="${COMMUNITY_CHAT_CHANNEL_ID:-828853}"
CAT_ID="${COMMUNITY_CATEGORY_ID:-15895}"

api_get() {
  curl -s \
    -H "User-Api-Key: $API_KEY" \
    -H "User-Api-Client-Id: $CLIENT_ID" \
    "$@"
}

api_post() {
  curl -s -X POST \
    -H "User-Api-Key: $API_KEY" \
    -H "User-Api-Client-Id: $CLIENT_ID" \
    -H "Content-Type: application/json" \
    "$@"
}

cmd_read_chat() {
  local count="${1:-10}"
  api_get "$BASE_URL/chat/api/channels/$CHANNEL_ID/messages?page_size=$count" \
    | python3 -c "
import sys, json
data = json.load(sys.stdin)
for m in reversed(data.get('messages', [])):
    print(f\"[{m['user']['username']}] {m['message'][:300]}\")
    print('---')
"
}

cmd_send_chat() {
  local message="$1"
  local payload
  payload=$(python3 -c "import sys,json; print(json.dumps({'message': sys.argv[1]}))" "$message")
  api_post -d "$payload" "$BASE_URL/chat/api/channels/$CHANNEL_ID/messages" \
    | python3 -c "import sys,json; d=json.load(sys.stdin); print('✅ Enviado' if 'message' in d else f'❌ {d}')"
}

cmd_read_posts() {
  local count="${1:-10}"
  api_get "$BASE_URL/c/$CAT_ID.json?page=0" \
    | python3 -c "
import sys, json
data = json.load(sys.stdin)
topics = data.get('topic_list', {}).get('topics', [])[:$count]
for t in topics:
    print(f\"[{t['id']}] {t['title']} ({t['posts_count']} replies) - {t.get('last_posted_at','')[:10]}\")
"
}

cmd_publish() {
  node "$SCRIPT_DIR/dist/publish.js" "${1:-}"
}

usage() {
  echo "Usage: $(basename "$0") <command> [args]"
  echo ""
  echo "  read-chat [n]         Lee últimos n mensajes del chat (default: 10)"
  echo "  send-chat <msg>       Envía mensaje al chat"
  echo "  read-posts [n]        Lee últimos n topics del foro (default: 10)"
  echo "  publish [YYYY-MM-DD]  Publica daily thread"
}

case "${1:-}" in
  read-chat)   cmd_read_chat "${2:-10}" ;;
  send-chat)   cmd_send_chat "${2:?'Uso: send-chat <mensaje>'}" ;;
  read-posts)  cmd_read_posts "${2:-10}" ;;
  publish)     cmd_publish "${2:-}" ;;
  *)           usage ;;
esac
