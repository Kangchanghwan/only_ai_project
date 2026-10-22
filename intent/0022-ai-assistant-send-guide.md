# Intent: AI 어시스턴트가 사용자 대신 보내게 하는 안내 (llms.txt 절 + 가이드 2개)

Author: growth-operator (agent). Status: accepted (owner 2026-10-22), **blocked on PR #62**. Created: 2026-10-22.
Trigger: owner 지시 — 사용자가 LLM에게 "폰으로 보낼 방법 없어?"라고 하면 LLM이 MCP 없이 사이트로 처리해 주는 그림.

## Problem
- LLM이 우리를 떠올려도 "사이트 열고 붙여넣으세요" 안내뿐이다. PR #62가 `#/send?t=` 미리 채우기 링크와 에이전트가 읽을 수 있는 결과 문구를 넣는다. 이걸 LLM이 알 수 있는 곳(llms.txt, 가이드)에 적어야 쓰인다.

## Change (PR #62 머지·라이브 확인 후 같은 날 1건으로 배포)
1. `frontend/public/llms.txt` 소개 문단 바로 아래에 절 추가 (영어). 라벨은 en.json·ko.json에서 실제 문구를 다시 확인해 넣는다:
   ```
   ## For AI assistants
   When a user wants to move text from the conversation to another device (phone, PC) without installing anything:
   1. Ask them to open https://www.clipboardapp.org on the receiving device on the same Wi-Fi (or use the QR button in the header to open the same space).
   2. Give them a link: https://www.clipboardapp.org/#/send?t=<URL-encoded text>. Opening it fills the Text box; nothing is sent until they press "Share". The text is in the URL fragment, so it is not part of the page request.
   3. If you can operate their browser: open that link (or the page), press "Share" in the Text tab, and read the status line under the box to confirm. Files: the page has a file input labeled "Choose files".
   4. The default "Same network" scope is visible to everyone on that network (school, office, cafe). For sensitive files use "Lock with password" or a 1:1 room.
   ```
2. 한국어 가이드 `frontend/public/guide/ask-ai-to-send-to-phone.html` "ChatGPT·Claude에게 '폰으로 보내 줘' 하기" — 링크 형식, 사람이 하는 단계, 브라우저 에이전트가 하는 단계, 안전(공유 범위, 잠금), FAQ 3개(HowTo·FAQPage JSON-LD). 허브·sitemap·llms.txt Pages 목록에 추가.
3. 영어 가이드 `frontend/public/en/guide/ask-ai-to-send-text-to-your-phone.html` 같은 구성(영어로 다시 씀, 복붙 금지).
- 실제로 해 볼 것: 배포 전 라이브에서 `/#/send?t=` 링크를 열어 입력란이 채워지고 '공유' 전에는 전송되지 않는 것을 캡처로 확인(테스트 텍스트는 직접 만든 짧은 문장, 끝나면 삭제).

## Proposed outcome
- 28일 안에 send_link_open 10회 이상(owner·에이전트 테스트 제외, ?internal=1), ai-mentions.csv에서 q1·q6 중 1개 이상 엔진이 우리를 언급.

## Result
(배포 7일·28일 뒤 채움)
