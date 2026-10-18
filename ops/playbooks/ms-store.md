# Microsoft Store (2026-10-18 게시)

owner 지시(2026-10-18): Microsoft Store 앱을 일일 그로스 루프에서 함께 추적·관리한다.

## 기본 정보
| 항목 | 값 |
|---|---|
| 스토어 이름 | Clipboard Share - 온라인 클립보드 ('Clipboard Share'는 다른 곳에서 예약된 이름) |
| Store ID | 9N2BTKVCPCC5 |
| 공개 페이지 | https://apps.microsoft.com/detail/9N2BTKVCPCC5 |
| 파트너 센터 제품 | https://partner.microsoft.com/ko-kr/dashboard/products/9N2BTKVCPCC5/overview |
| 분석(취득) | https://partner.microsoft.com/ko-kr/dashboard/insights/analytics/store/acquisitions?productId=9N2BTKVCPCC5 |
| 계정 | 개인 개발자 계정, 게시자 CokeBear. 로그인은 반드시 개인 Microsoft 계정 lgodl1598@naver.com (계정 선택 화면에서 학교 계정 lgodl1598@knou.ac.kr 고르지 말 것) |
| 패키지 식별 | Package/Identity/Name `CokeBear.ClipboardShare-` (끝 하이픈 포함), Publisher `CN=9C34C9AB-FE63-445E-9E8F-311200A93248`, PublisherDisplayName `CokeBear` |
| 첫 제출 | 2026-10-18 게시. 패키지 v1.0.1.0(msixbundle) + v1.0.0.0(classic appxbundle), 연령 등급 IARC 12+(사용자 상호작용), 범주 생산성/유틸리티+도구, 무료, 전 세계 |

## 언제 업데이트가 필요한가
- 앱은 PWA라 화면·기능은 웹 배포로 바로 바뀐다. **스토어 업데이트 불필요.**
- 스토어 제출이 필요한 경우: manifest의 이름·아이콘·share_target 등 앱 신원/OS 연동이 바뀔 때, 스토어 설명·스크린샷을 고칠 때, 인증 정책 대응.
- 패키지 재생성: PWABuilder API `POST https://pwabuilder-windows-docker.azurewebsites.net/msix/generatezip` (JSON 옵션: name "Clipboard Share - 온라인 클립보드", packageId·publisher는 위 값, url https://www.clipboardapp.org/, version은 직전보다 크게(예 1.0.2 / classic 1.0.1), resourceLanguage "ko-kr" 문자열, edgeHtmlPackage.generate false, extensions 없음(앱 URI 핸들러 끔)). 웹 UI 다운로드는 브라우저가 멈출 수 있으니 API를 쓴다.
- 스토어 제출(새 버전·설명 변경)은 공개 행위라 **owner 확인 후** 진행한다. 파트너 센터의 '인증을 위해 제출' 버튼과 목록의 '더 추가' 버튼은 자동화로 누르면 페이지가 멈춘 적이 있다(2026-10-18) → 이 단계는 owner에게 직접 눌러 달라고 요청한다.

## 추적 (매주 월요일 주간 리포트)
1. 파트너 센터 분석: 취득(설치) 수, 페이지 보기 수, 전환율, 평점·리뷰 수. 지난주 대비로 리포트 표에 넣는다. 접근 불가면 "막힘: 파트너 센터 재로그인".
2. 새 리뷰가 있으면 내용 요약 + 답글 초안을 리포트에 남기고 owner 확인 후 게시(리뷰 답글은 공개 행위).
3. GA4: `pwa_install_click`, `pwa_install_result`, `pwa_installed`, `pwa_launch_standalone` 이벤트 수(설치된 앱 실행). 스토어 설치분은 브라우저 설치와 구분되지 않는다(같은 start_url) → 구분이 필요하면 intent로 제안.
4. 인증·정책 메일(lgodl1598@naver.com)이나 파트너 센터 알림에 경고가 있으면 즉시 owner 요청으로 보고.

## 홍보에 쓰기
- 커뮤니티·블로그 글에 "Microsoft Store에서도 받을 수 있어요" + 공개 페이지 링크를 자연스럽게 1줄 넣을 수 있다(윈도우 사용자 대상 글 우선).
- 디렉터리(AlternativeTo 등) 항목에 플랫폼 'Windows'와 스토어 링크 추가는 등록·승인 상태를 보고 진행.
- 사이트에 스토어 배지 추가는 intent 0018 참고(앱 코드라 PR + owner 승인).
