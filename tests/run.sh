#!/bin/sh
# Worker(자동 명함 부분) 테스트 — 외부 호출은 전부 가짜(fetch 모의)라 키·네트워크 없이 돌아감
# 사용: sh tests/run.sh
cd "$(dirname "$0")" && cp ../worker.js worker.mjs || exit 1
fail=0
for t in *.test.mjs; do node "$t" >/tmp/t.out 2>&1 && tail -1 /tmp/t.out || { echo "FAIL $t"; tail -5 /tmp/t.out; fail=1; }; done
rm -f worker.mjs; exit $fail
