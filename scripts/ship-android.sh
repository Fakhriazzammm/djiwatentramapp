#!/usr/bin/env bash
# Builds the Djiwa Pay Android app (APK + AAB) on THIS machine. Never run on the VPS; never touches the web deploy.
# The app is a Capacitor shell that loads https://djiwapay.web.id, so web releases do not need a new APK.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP="$ROOT/mobile/djiwapay-android"
TOOLS="${ANDROID_TOOLS_DIR:-$HOME/.local/android}"
export JAVA_HOME="${JAVA_HOME:-$(ls -d "$TOOLS"/jdk-21*/Contents/Home | head -1)}"
export ANDROID_HOME="${ANDROID_HOME:-$TOOLS/sdk}"
export PATH="$JAVA_HOME/bin:$PATH"
# Offset 1000: kode versi 577 sudah dipakai Play Console; counter web (BUILD_NUMBER) tetap naik, jadi kode selalu lebih besar.
export DJIWAPAY_VERSION_CODE="${DJIWAPAY_VERSION_CODE:-$(( 1000 + $(tr -dc 0-9 < "$ROOT/scripts/BUILD_NUMBER") ))}"
[ -f "${DJIWAPAY_KEYSTORE_PROPERTIES:-$TOOLS/keys/keystore.properties}" ] || { echo "Keystore belum ada: $TOOLS/keys/keystore.properties" >&2; exit 1; }
cd "$APP"
[ -d node_modules ] || npm ci
echo "sdk.dir=$ANDROID_HOME" > android/local.properties
npx cap sync android
(cd android && ./gradlew --no-daemon clean assembleRelease bundleRelease)
OUT="$APP/dist-android"; mkdir -p "$OUT"
cp android/app/build/outputs/apk/release/app-release.apk "$OUT/djiwapay.apk"
cp android/app/build/outputs/bundle/release/app-release.aab "$OUT/djiwapay.aab"
"$ANDROID_HOME"/build-tools/35.0.0/apksigner verify --print-certs "$OUT/djiwapay.apk" | head -3
ls -la "$OUT"
