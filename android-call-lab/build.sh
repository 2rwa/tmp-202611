#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
SDK="${ANDROID_SDK_ROOT:-${ANDROID_HOME:-}}"
: "${SDK:?Android SDK required}"
BT="$SDK/build-tools/35.0.0"
PLATFORM="$SDK/platforms/android-35/android.jar"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
mkdir -p "$WORK/classes" "$WORK/dex" dist
"$BT/aapt2" link -I "$PLATFORM" --manifest AndroidManifest.xml -o "$WORK/resources.apk"
javac --release 8 -classpath "$PLATFORM" -d "$WORK/classes" $(find src -name '*.java')
jar cf "$WORK/classes.jar" -C "$WORK/classes" .
"$BT/d8" --lib "$PLATFORM" --min-api 22 --output "$WORK/dex" "$WORK/classes.jar"
cp "$WORK/resources.apk" "$WORK/unaligned.apk"
zip -q -j "$WORK/unaligned.apk" "$WORK/dex/classes.dex"
"$BT/zipalign" -f 4 "$WORK/unaligned.apk" "$WORK/aligned.apk"
# Optional persistent test signing key; never commit private keys.
if [ -n "${CALL_LAB_KEYSTORE:-}" ]; then
  KEY="$CALL_LAB_KEYSTORE"
  : "${CALL_LAB_KEY_PASSWORD:?signing password required}"
else
  KEY="$WORK/test.jks"
  CALL_LAB_KEY_PASSWORD=android
  export CALL_LAB_KEY_PASSWORD
  keytool -genkeypair -keystore "$KEY" -storepass android -keypass android \
    -alias calllab -keyalg RSA -keysize 2048 -validity 10000 \
    -dname 'CN=Call Lab CI Test' -noprompt
fi
"$BT/apksigner" sign --ks "$KEY" --ks-key-alias calllab \
  --ks-pass env:CALL_LAB_KEY_PASSWORD --key-pass env:CALL_LAB_KEY_PASSWORD \
  --v1-signing-enabled true --v2-signing-enabled true \
  --out dist/call-lab.apk "$WORK/aligned.apk"
"$BT/apksigner" verify --min-sdk-version 22 --verbose dist/call-lab.apk
"$BT/aapt" dump badging dist/call-lab.apk | tee dist/apk-info.txt
grep -q "sdkVersion:'22'" dist/apk-info.txt
grep -q "name='io.github.calllab.lockscreen'" dist/apk-info.txt
cp callctl.py dist/callctl.py
(cd dist && sha256sum call-lab.apk callctl.py > SHA256SUMS)
