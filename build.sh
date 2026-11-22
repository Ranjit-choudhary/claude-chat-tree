#!/bin/sh
# Builds dist/chat-tree-firefox.zip, dist/chat-tree-chrome.zip and dist/chat-tree-lite-firefox.zip
set -e
cd "$(dirname "$0")"
rm -rf dist && mkdir -p dist/tmp
FILES="background.js README.md icons src"
zip -qr dist/chat-tree-firefox.zip manifest.json $FILES embed
mkdir dist/tmp/chrome && cp -r $FILES embed dist/tmp/chrome/ && cp manifest.chrome.json dist/tmp/chrome/manifest.json
(cd dist/tmp/chrome && zip -qr ../../chat-tree-chrome.zip .)
mkdir dist/tmp/lite && cp -r $FILES dist/tmp/lite/ && sed 's/"name": "Chat Tree for Claude"/"name": "Chat Tree for Claude (lite)"/' manifest.json > dist/tmp/lite/manifest.json
(cd dist/tmp/lite && zip -qr ../../chat-tree-lite-firefox.zip .)
rm -rf dist/tmp
ls -la dist
