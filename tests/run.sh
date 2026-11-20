#!/bin/sh
# Worker(자동 명함 부분) 테스트 — 외부 호출은 전부 가짜(fetch 모의)라 키·네트워크 없이 돌아감
# 사용: sh tests/run.sh   (하나라도 실패하면 실패 개수를 출력하고 종료 코드 1)
cd "$(dirname "$0")" && cp ../worker.js worker.mjs || exit 1
out=$(mktemp)
total=0; failed=0; failed_names=""
for t in *.test.mjs; do
  total=$((total + 1))
  if node "$t" >"$out" 2>&1; then tail -1 "$out"
  else failed=$((failed + 1)); failed_names="$failed_names $t"; echo "FAIL $t"; tail -8 "$out"; fi
done
rm -f worker.mjs "$out"
echo "----"
if [ "$failed" -eq 0 ]; then echo "ALL $total TEST FILES PASSED"; exit 0; fi
echo "$failed of $total TEST FILES FAILED:$failed_names"
exit 1
