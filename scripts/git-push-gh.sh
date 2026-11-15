#!/usr/bin/env bash
# Push to GitHub through the real Git for Windows build.
# The bundled niugit can't acquire schannel credentials (SEC_E_NO_CREDENTIALS),
# so we use Git for Windows plus the gh token in an HTTP header. No token is
# written to disk or to git config.
set -euo pipefail
GIT="/c/Program Files/Git/cmd/git.exe"
[[ -x "$GIT" ]] || { echo "Git for Windows not found at $GIT" >&2; exit 1; }
token=$(gh auth token)
[[ -n "$token" ]] || { echo "gh auth token is empty; run: gh auth login" >&2; exit 1; }
basic=$(printf 'x-access-token:%s' "$token" | base64 -w0)
exec "$GIT" -c credential.helper= -c "http.extraheader=AUTHORIZATION: basic $basic" "$@"
