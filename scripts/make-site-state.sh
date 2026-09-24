#!/usr/bin/env bash
# The static site's working database, encrypted, for the "Site" workflow to start from.
#
#   IXNOS_DATA_STATE_KEY=<the repository secret> scripts/make-site-state.sh [file]
#
# The workflow keeps its database between runs as an encrypted file on the release "site-state":
# it holds contractors' VAT numbers (needed to recognise the same contractor in new records),
# which must never be public. This makes the first version of that file from the local database,
# without the end-to-end tests' fixtures. Upload the result to that release as site-state.dump.enc.
#
# The key is the same text as the repository secret IXNOS_DATA_STATE_KEY; without it the file
# can't be read. Default file: site-state.dump.enc.
set -euo pipefail
cd "$(dirname "$0")/.."

: "${IXNOS_DATA_STATE_KEY:?set IXNOS_DATA_STATE_KEY to the key saved as the repository secret}"
out="${1:-site-state.dump.enc}"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

scripts/make-snapshot.sh --clean "$work/state.dump"
openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -pass env:IXNOS_DATA_STATE_KEY \
  -in "$work/state.dump" -out "$out"
echo "encrypted working database: $out ($(du -h "$out" | cut -f1))"
