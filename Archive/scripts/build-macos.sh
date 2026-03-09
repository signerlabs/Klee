#!/usr/bin/env bash

# Automated macOS build + notarize + verification helper.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$ROOT_DIR"

ENV_FILE="$ROOT_DIR/.env"
if [[ -f "$ENV_FILE" ]]; then
  echo "==> Loading environment from $ENV_FILE"
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
else
  echo "⚠️  $ENV_FILE not found. Make sure required env vars are exported."
fi

REQUIRED_VARS=(APPLE_ID APPLE_APP_SPECIFIC_PASSWORD APPLE_TEAM_ID)
missing=()
for var in "${REQUIRED_VARS[@]}"; do
  if [[ -z "${!var:-}" ]]; then
    missing+=("$var")
  fi
done

if (( ${#missing[@]} > 0 )); then
  echo "❌ Missing required environment variables: ${missing[*]}"
  echo "   Please set them in $ENV_FILE or export them before running this script."
  exit 1
fi

VERSION="$(node -p "require('./client/package.json').version")"
echo "==> Building server workspace (types & API schema)…"
npm run build --workspace=server
echo "==> Building Klee v$VERSION for macOS (arm64)…"

npm run build --workspace=client

RELEASE_DIR="$ROOT_DIR/client/release/$VERSION"
APP_PATH="$RELEASE_DIR/mac-arm64/klee.app"
DMG_PATH="$RELEASE_DIR/klee_${VERSION}_arm64.dmg"

if [[ ! -d "$APP_PATH" ]]; then
  echo "❌ Expected app bundle not found at: $APP_PATH"
  exit 1
fi

echo "==> Verifying codesign (deep & strict)…"
codesign --verify --deep --strict "$APP_PATH"

if [[ ! -f "$DMG_PATH" ]]; then
  echo "❌ Expected DMG not found at: $DMG_PATH"
  exit 1
fi

# 检查是否跳过公证
if [[ "${SKIP_NOTARIZATION:-false}" == "true" ]]; then
  echo "⚠️  Skipping notarization (SKIP_NOTARIZATION=true)"
  echo "   To notarize manually later, run:"
  echo "   bash ./scripts/notarize-dmg.sh $DMG_PATH"
  echo ""
  echo "✅ Build complete (notarization skipped)."
  echo ""
  echo "Artifacts located at:"
  echo "  - $APP_PATH"
  echo "  - $DMG_PATH"
  echo ""
  echo "Release folder contents:"
  ls -1 "$RELEASE_DIR"
  exit 0
fi

echo "==> Submitting DMG to Apple for notarization…"
echo "    This may take 2-5 minutes. Please wait..."

# 提交公证（不等待完成，先获取 submission ID）
set +e  # 临时禁用错误退出
SUBMIT_OUTPUT=$(xcrun notarytool submit "$DMG_PATH" \
  --apple-id "$APPLE_ID" \
  --team-id "$APPLE_TEAM_ID" \
  --password "$APPLE_APP_SPECIFIC_PASSWORD" 2>&1)
SUBMIT_EXIT_CODE=$?
set -e  # 重新启用错误退出

if [[ $SUBMIT_EXIT_CODE -ne 0 ]]; then
  echo "❌ Failed to submit DMG for notarization:"
  echo "$SUBMIT_OUTPUT"
  exit 1
fi

# 提取 submission ID
SUBMISSION_ID=$(echo "$SUBMIT_OUTPUT" | grep "id:" | head -1 | awk '{print $2}')

if [[ -z "$SUBMISSION_ID" ]]; then
  echo "❌ Failed to extract submission ID from output:"
  echo "$SUBMIT_OUTPUT"
  exit 1
fi

echo "✅ Submitted successfully. Submission ID: $SUBMISSION_ID"
echo "==> Waiting for Apple to process notarization..."

# 轮询检查状态（更可靠，不会因为网络问题中断）
MAX_ATTEMPTS=60  # 最多等待 10 分钟 (60 * 10秒)
ATTEMPT=0
while [[ $ATTEMPT -lt $MAX_ATTEMPTS ]]; do
  sleep 10
  ATTEMPT=$((ATTEMPT + 1))

  set +e
  STATUS_OUTPUT=$(xcrun notarytool info "$SUBMISSION_ID" \
    --apple-id "$APPLE_ID" \
    --team-id "$APPLE_TEAM_ID" \
    --password "$APPLE_APP_SPECIFIC_PASSWORD" 2>&1)
  STATUS_EXIT_CODE=$?
  set -e

  if [[ $STATUS_EXIT_CODE -ne 0 ]]; then
    echo "⚠️  Failed to check status (attempt $ATTEMPT/$MAX_ATTEMPTS)"
    continue
  fi

  CURRENT_STATUS=$(echo "$STATUS_OUTPUT" | grep "status:" | awk '{print $2}')

  if [[ "$CURRENT_STATUS" == "Accepted" ]]; then
    echo "✅ Notarization successful!"
    break
  elif [[ "$CURRENT_STATUS" == "Invalid" ]]; then
    echo "❌ Notarization rejected by Apple (Invalid)."
    echo "$STATUS_OUTPUT"
    exit 1
  elif [[ "$CURRENT_STATUS" == "In Progress" ]]; then
    echo -n "."  # 显示进度点
  else
    echo "   Status: $CURRENT_STATUS (attempt $ATTEMPT/$MAX_ATTEMPTS)"
  fi
done

if [[ $ATTEMPT -eq $MAX_ATTEMPTS ]]; then
  echo ""
  echo "❌ Notarization timed out after 10 minutes."
  echo "   Submission ID: $SUBMISSION_ID"
  echo "   Check status with: xcrun notarytool info $SUBMISSION_ID --apple-id $APPLE_ID --team-id $APPLE_TEAM_ID --password \$APPLE_APP_SPECIFIC_PASSWORD"
  exit 1
fi

echo ""
echo "==> Stapling notarization ticket to DMG…"
xcrun stapler staple "$DMG_PATH"

echo "==> Verifying stapled ticket…"
xcrun stapler validate "$DMG_PATH"

echo "==> Assessing Gatekeeper policy…"
spctl --assess --type open --context context:primary-signature -vv "$DMG_PATH"

echo "✅ Build, notarize, and verification complete."
echo
echo "Artifacts located at:"
echo "  - $APP_PATH"
if [[ -f "$DMG_PATH" ]]; then
  echo "  - $DMG_PATH"
fi
echo
echo "Release folder contents:"
ls -1 "$RELEASE_DIR"
