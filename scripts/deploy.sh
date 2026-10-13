#!/usr/bin/env bash
# 物理学習アプリを Vercel に公開する。
# 使い方: リポジトリ直下で `bash scripts/deploy.sh`
#   APP_PASSCODE=... ANTHROPIC_API_KEY=... bash scripts/deploy.sh のように環境変数で渡すと対話なしで進む。
set -euo pipefail

PROJECT="${VERCEL_PROJECT:-physics-learning}"
cd "$(dirname "$0")/.."

step() { printf '\n▶ %s\n' "$1"; }
ok()   { printf '  ✓ %s\n' "$1"; }
skip() { printf '  – %s\n' "$1"; }

step "必要なツールを確認しています"
command -v node >/dev/null || { echo "node が見つかりません"; exit 1; }
command -v vercel >/dev/null || { echo "vercel CLI が見つかりません: npm i -g vercel"; exit 1; }
ok "node $(node -v)"
ok "Vercel: $(vercel whoami 2>/dev/null || { echo 'ログインしていません: vercel login' >&2; exit 1; })"

step "テストとビルドを確認します"
[ -d node_modules ] || npm ci
npm test --silent >/dev/null && ok "unit tests"
npx next build >/dev/null && ok "build"

step "Vercel プロジェクト ${PROJECT} に接続します"
vercel link --yes --project "$PROJECT" >/dev/null
ok "$PROJECT"

step "環境変数を設定します"
existing="$(vercel env ls production 2>/dev/null || true)"
has_env() { grep -qE "^[[:space:]]*$1[[:space:]]" <<<"$existing"; }
set_env() {
  vercel env rm "$1" production --yes >/dev/null 2>&1 || true
  printf '%s' "$2" | vercel env add "$1" production >/dev/null
  ok "$1"
}
# .env.local に ANTHROPIC_API_KEY があれば使う
if [ -z "${ANTHROPIC_API_KEY:-}" ] && [ -f .env.local ]; then
  ANTHROPIC_API_KEY="$(grep -E '^ANTHROPIC_API_KEY=' .env.local | tail -1 | cut -d= -f2- | tr -d '"'"'"'' || true)"
fi

if [ -n "${APP_PASSCODE:-}" ]; then
  set_env APP_PASSCODE "$APP_PASSCODE"
elif has_env APP_PASSCODE; then
  skip "APP_PASSCODE は設定済みのものを使います"
else
  read -r -s -p "  公開URLを開くときのパスコードを決めてください（8文字以上）: " APP_PASSCODE; echo
  [ "${#APP_PASSCODE}" -ge 8 ] || { echo "  8文字以上にしてください"; exit 1; }
  set_env APP_PASSCODE "$APP_PASSCODE"
fi

# APP_SECRET を作り直すと全端末のロック解除が切れるので、初回だけ作る
if has_env APP_SECRET; then
  skip "APP_SECRET は設定済みのものを使います"
else
  set_env APP_SECRET "$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")"
fi

if [ -n "${ANTHROPIC_API_KEY:-}" ]; then
  set_env ANTHROPIC_API_KEY "$ANTHROPIC_API_KEY"
elif has_env ANTHROPIC_API_KEY; then
  skip "ANTHROPIC_API_KEY は設定済みのものを使います"
else
  skip "ANTHROPIC_API_KEY なし（チューターとAI問題生成以外は動作します）"
fi

step "公開します（数分かかります）"
url="$(vercel deploy --prod --yes)"
ok "$url"

step "Vercel のログイン保護をオフにします（アプリ自身のパスコードで保護されます）"
if vercel project protection disable "$PROJECT" --sso >/dev/null 2>&1; then
  ok "SSO protection off"
else
  skip "自動で切り替えられませんでした。Vercel の Settings → Deployment Protection → Vercel Authentication をオフにしてください"
fi

printf '\n完了: %s/physics\n' "$url"
echo "  固定URL（*.vercel.app）は Vercel のプロジェクト画面の Domains に表示されます"
echo "iPhone: Safari でこの URL を開き → 共有 → 「ホーム画面に追加」"
