#!/usr/bin/env bash
set -euo pipefail

file="${1:-}"
if [[ -z "$file" ]]; then
    echo "Usage: $0 <path-to-evtc-or-zevtc> [output-json]"
    exit 1
fi

if [[ ! -f "$file" ]]; then
    echo "File not found: $file"
    exit 1
fi

out="${2:-}"
if [[ -z "$out" ]]; then
    mkdir -p testdata
    base="$(basename "$file")"
    out="testdata/${base%.*}.json"
fi

upload_response="$(curl -sS -F "file=@$file" https://dps.report/uploadContent)"
permalink_id="$(
    printf '%s' "$upload_response" | node -e "const fs=require('fs');const body=fs.readFileSync(0,'utf8');const match=body.match(/#JSON#\\s*(\\{[\\s\\S]*?\\})\\s*#JSON#/);if(!match){throw new Error('Upload response did not contain JSON');}const resp=JSON.parse(match[1]);const per=resp.permalink||'';const id=per.split('/').pop()||resp.id||'';process.stdout.write(id);"
)"

if [[ -z "$permalink_id" ]]; then
    echo "Failed to extract permalink id from upload response."
    exit 1
fi

curl -sS "https://dps.report/getJson?permalink=${permalink_id}" > "$out"
echo "Wrote ${out}"
echo "Permalink id: ${permalink_id}"
