#!/usr/bin/env sh

set -eu

# Chrome
echo "Building for Chrome..."

TARGET=chrome vite build

BUILD_ENV=${ENVIRONMENT:-local}

rm -f fleetyards-sync-$BUILD_ENV.chrome.zip

pushd dist

zip -r ../fleetyards-sync-$BUILD_ENV.chrome.zip *

popd

echo "Chrome build done!"

# Firefox
echo "Building for Firefox..."

TARGET=firefox vite build

rm -f fleetyards-sync-$BUILD_ENV.firefox.zip

pushd dist

zip -r ../fleetyards-sync-$BUILD_ENV.firefox.zip *

popd

echo "Firefox build done!"
