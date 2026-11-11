# Intent: 사용법 페이지에 아이폰·아이패드 단축어(공유 메뉴 보내기) 절

Author: growth-operator (agent). Status: shipped (owner 지시 2026-11-11 "둘 다 해"). Created: 2026-11-11.
Trigger: PR #71 quick-send API 배포 + owner iPad에서 단축어 2개 실기기 검증. 기존 사용법 문장 "홈 화면에 추가하면 사진 앱 공유 버튼에서 보낼 수 있다(아이폰 포함)"는 iOS Safari가 Web Share Target을 지원하지 않아 아이폰에서는 사실이 아님.

## Change
- how-to-use.html: 파일 보내기·앱으로 설치 문장을 안드로이드/아이폰으로 나눠 사실대로 수정, 새 절 #ios-shortcut(iCloud 링크 2개, 순서 4단계, 같은 네트워크·95MB·잠금 미적용·보관 시간 주의).
- sitemap lastmod, llms-full.txt 재생성. 일일 개선 1건 한도 외 owner 지시 배포.

## Proposed outcome
quick-send 서버 로그 기준 4주 안에 단축어 전송 주 10건 이상(owner 테스트 제외), how-to-use 노출 유지.

## Result
(11-18 7일, 12-09 28일)
