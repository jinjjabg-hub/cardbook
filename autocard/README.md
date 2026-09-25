# 자동 명함(AutoCard)

- 제작 앱: https://jinjjabg-hub.github.io/cardbook/autocard/
- 공개 명함: https://jinjjabg-hub.github.io/cardbook/autocard/c/?id={cardId}
- 관리자 승인: https://jinjjabg-hub.github.io/cardbook/autocard/admin.html

## 켜기 전에 한 번만
1. Firebase 콘솔 → Firestore → 규칙: 레포 루트의 `firestore.rules` 붙여넣고 게시
2. Firebase 콘솔 → Storage → 규칙: `storage.rules` 붙여넣고 게시 (Firestore 접근 권한 안내가 뜨면 허용)
3. Cloudflare Worker `cardbook-ai`: 루트의 `worker.js` 붙여넣고 Deploy (새 Secret 필요 없음)

## 매일 쓰는 법
고객에게 제작 앱 링크를 보냄 → 발행 요청이 오면 admin.html에서 입금 확인 후 **승인·발행**.
