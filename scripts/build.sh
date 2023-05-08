#!/usr/bin/env sh

set -eu

# Chrome
echo "Building for Chrome..."

TARGET=chrome yarn build

rm fleetyards-sync.chrome.zip

pushd dist

zip -r ../fleetyards-sync.chrome.zip *

popd

echo "Chrome build done!"

# Firefox
echo "Building for Firefox..."

TARGET=firefox yarn build

rm fleetyards-sync.firefox.zip

pushd dist

zip -r ../fleetyards-sync.firefox.zip *

popd

echo "Firefox build done!"
