#!/bin/bash
set -e

if [ -z "$WEIGHTS_URL" ]; then
  echo "ERROR: WEIGHTS_URL not set."
  exit 1
fi

echo "Downloading weights from $WEIGHTS_URL ..."
curl -fSL "$WEIGHTS_URL" -o /tmp/weights.bin

if [ -n "$WEIGHTS_SHA256" ]; then
  sha256=$(sha256sum /tmp/weights.bin | awk '{print $1}')
  if [ "$sha256" != "$WEIGHTS_SHA256" ]; then
    echo "ERROR: SHA256 mismatch! expected $WEIGHTS_SHA256, got $sha256"
    exit 2
  fi
fi

echo "Weights downloaded and verified."
mv /tmp/weights.bin data/weights.bin