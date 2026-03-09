#!/usr/bin/env bash

# Standalone script to notarize an already-built DMG

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$ROOT_DIR"

# Load environment
ENV_FILE="$ROOT_DIR/.env"
if [[ -f "$ENV_FILE" ]]; then
  echo "==> Loading environment from $ENV_FILE"
  set -a
  source "$ENV_FILE"
  set +a
fi

# Check arguments
if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <path-to-dmg>"
  echo "Example: $0 client/release/0.1.0/klee_0.1.0_arm64.dmg"
  exit 1
fi

DMG_PATH="$1"

if [[ ! -f "$DMG_PATH" ]]; then
  echo "❌ DMG not found: $DMG_PATH"
  exit 1
fi

echo "==> Notarizing DMG: $DMG_PATH"

# Submit notarization (without --wait for better reliability)
set +e
SUBMIT_OUTPUT=$(xcrun notarytool submit "$DMG_PATH" \
  --apple-id "$APPLE_ID" \
  --team-id "$APPLE_TEAM_ID" \
  --password "$APPLE_APP_SPECIFIC_PASSWORD" 2>&1)
SUBMIT_EXIT_CODE=$?
set -e

if [[ $SUBMIT_EXIT_CODE -ne 0 ]]; then
  echo "❌ Failed to submit DMG for notarization:"
  echo "$SUBMIT_OUTPUT"
  exit 1
fi

# Extract submission ID
SUBMISSION_ID=$(echo "$SUBMIT_OUTPUT" | grep "id:" | head -1 | awk '{print $2}')

if [[ -z "$SUBMISSION_ID" ]]; then
  echo "❌ Failed to extract submission ID from output:"
  echo "$SUBMIT_OUTPUT"
  exit 1
fi

echo "✅ Submitted successfully. Submission ID: $SUBMISSION_ID"
echo "==> Waiting for Apple to process notarization..."
echo "    (Polling every 10 seconds, max 10 minutes)"

# Poll for status
MAX_ATTEMPTS=60
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
    echo ""
    echo "✅ Notarization successful!"
    break
  elif [[ "$CURRENT_STATUS" == "Invalid" ]]; then
    echo ""
    echo "❌ Notarization rejected by Apple (Invalid)."
    echo "$STATUS_OUTPUT"
    exit 1
  elif [[ "$CURRENT_STATUS" == "In Progress" ]]; then
    echo -n "."
  else
    echo ""
    echo "   Status: $CURRENT_STATUS (attempt $ATTEMPT/$MAX_ATTEMPTS)"
  fi
done

if [[ $ATTEMPT -eq $MAX_ATTEMPTS ]]; then
  echo ""
  echo "❌ Notarization timed out after 10 minutes."
  echo "   Submission ID: $SUBMISSION_ID"
  echo "   Check status with:"
  echo "   xcrun notarytool info $SUBMISSION_ID --apple-id $APPLE_ID --team-id $APPLE_TEAM_ID --password \$APPLE_APP_SPECIFIC_PASSWORD"
  exit 1
fi

echo ""
echo "==> Stapling notarization ticket to DMG…"
xcrun stapler staple "$DMG_PATH"

echo "==> Verifying stapled ticket…"
xcrun stapler validate "$DMG_PATH"

echo "==> Assessing Gatekeeper policy…"
spctl --assess --type open --context context:primary-signature -vv "$DMG_PATH"

echo ""
echo "✅ Notarization complete!"
echo "   DMG: $DMG_PATH"
