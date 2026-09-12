# SEO 성장 설계 (목표: 하루 방문 1,000)

작성일 2026-09-12. GA4/Search Console 진단 결과와 사용자의 "할 수 있는 건 전부 시도" 지시에 따라 작성한 설계.

## 1. 배경과 진단 요약

- 전체 기간(2025-11~2026-09) 활성 사용자 471명, 그중 74%가 direct이고 용인시 239명은 제작자 본인 트래픽으로 추정.
- Search Console 6.5개월: 노출 609회, 클릭 35회, 평균 순위 49.7. 검색어 89개 중 86개가 영어 "clipboard" 계열, 한국어는 3개(노출 5회).
- 구글 색인은 홈 1페이지뿐. `faq.html`, `how-to-use.html`은 홈에서 링크가 없어 미색인.
- 홈은 UI 라벨만 있는 텍스트 없는 단일 페이지. 프리렌더 본문은 영어 UI 문자열인데 `lang="ko"`와 한국어 title이라 언어 신호가 섞임.
- canonical/og:url/sitemap/robots가 모두 apex 도메인을 가리키는데 apex는 www로 307 리디렉션.
- JSON-LD에 실제 리뷰가 없는 aggregateRating(4.8/150), 존재하지 않는 `/room/{q}` SearchAction, 404인 logo.png.
- 본인 velog 글은 "회원가입 없이 파일 공유 사이트"에서 구글 3위인데 사이트는 없음. 텍스트가 있는 페이지는 랭크된다는 증거.

## 2. 목표와 성공 기준

- 최종 목표: 하루 방문 1,000. 현재 자연검색은 하루 1회 미만이므로 단기 달성은 불가하고, 이번 작업은 "검색에 등장할 수 있는 상태"를 만드는 1단계.
- 4주 후 측정 지표(기준값 대비): 색인 페이지 1 → 10, 주간 노출 609/28주 → 주 200 이상, 한국어 검색어 노출 0 → 발생, 브랜드 외 클릭 발생.
- 측정은 GA4 + Search Console 연동 보고서로 하고, 주간 루틴이 자동으로 비교한다.

## 3. 범위

포함:
1. 기술 SEO 수정 (도메인 통일, 구조화 데이터 정리, robots/sitemap, 프리렌더 언어 고정, GA 위생)
2. 홈에 크롤 가능한 설명 섹션(`LandingContent`) 추가, 제목·설명 재포지셔닝
3. 영어 URL `/en/` 추가 (경로 기반 로케일, 로케일별 메타, 프리렌더)
4. 정적 가이드 페이지 6개 (한국어 4, 영어 2)와 기존 `faq.html`/`how-to-use.html` 현행화
5. `llms.txt`, README 링크
6. 주간 SEO 모니터링 루틴, 월간 콘텐츠 제안 루틴
7. PR 생성 (머지는 사용자)

제외(사용자 직접 수행 필요): Cloudflare AI 봇 차단 해제, GA 내부 트래픽 필터 활성화와 주요 이벤트 지정, 네이버 서치어드바이저·GSC 사이트맵 재제출, 외부 커뮤니티 등록(Product Hunt, GeekNews, 디스콰이엇), Vercel 대시보드의 apex 리디렉션 코드 변경.

## 4. 포지셔닝

검색 의도는 두 갈래이고 둘 다 잡는다.
- 한국어(`/`): "PC와 폰 사이 파일·텍스트 즉시 전송", "온라인 클립보드", "같은 와이파이 파일 전송".
- 영어(`/en/`): "online clipboard", "share clipboard between phone and PC". Search Console 노출의 대부분이 여기서 나온다.

차별점: 회원가입·앱 설치 없음, 같은 와이파이 기기 자동 연결, 클립보드 텍스트·이미지·파일 실시간, 나가면 자동 삭제.

### 4.1 메타 카피

| 키 | ko | en |
|---|---|---|
| `seo.title` | PC와 폰 사이 파일·텍스트 즉시 전송 \| 온라인 클립보드 Clipboard Share | Online Clipboard – Share Text, Images & Files Between Phone and PC |
| `seo.description` | 회원가입·앱 설치 없이 같은 와이파이의 PC와 스마트폰이 브라우저에서 자동 연결돼 복사한 텍스트, 스크린샷, 파일을 바로 주고받는 무료 온라인 클립보드. 나가면 자동 삭제. | Free online clipboard, no sign-up, no app. Devices on the same Wi-Fi connect automatically in the browser to share copied text, screenshots and files instantly. Deleted when you leave. |

### 4.2 LandingContent 카피 (i18n `landing.*`)

ko:
- headline: PC와 스마트폰 사이, 복사한 것을 그대로 옮기는 온라인 클립보드
- intro: Clipboard Share는 회원가입도, 앱 설치도 없이 쓰는 무료 온라인 클립보드입니다. 같은 와이파이에 있는 기기들이 브라우저에서 자동으로 연결되어, 복사한 텍스트·스크린샷·파일이 다른 기기에 바로 나타납니다.
- howTitle: 이렇게 씁니다
- how1: 두 기기를 같은 와이파이에 연결한 뒤 이 페이지를 엽니다. 같은 네트워크의 기기는 자동으로 묶입니다.
- how2: 옮길 것을 붙여넣거나(Ctrl+V / Cmd+V) 파일을 끌어다 놓습니다.
- how3: 다른 기기 화면에 바로 나타납니다. 탭 한 번으로 복사하거나 내려받으세요.
- useCasesTitle: 이런 때 좋아요
- useCase1: 아이폰 사진을 케이블 없이 윈도우 PC로 옮길 때
- useCase2: PC방이나 회사 PC에서 내 계정 로그인 없이 파일을 가져올 때
- useCase3: 안드로이드와 맥 사이에서 AirDrop처럼 보내고 싶을 때
- useCase4: 폰에서 복사한 긴 링크, 인증번호, 코드를 PC에 붙여넣을 때
- safetyTitle: 안전한가요?
- safety1: 기본 공유 범위는 '같은 네트워크'라, 같은 공인 IP를 쓰는 기기에만 보입니다. 모두에게 보내려면 '전체 공유' 탭을 직접 선택해야 합니다.
- safety2: 모든 기기가 나가면 파일과 텍스트는 잠시 후 자동으로 삭제됩니다. 계정도, 기록도 남지 않습니다.
- safety3: 전송은 HTTPS로 암호화되고, 소스 코드는 GitHub에 공개되어 있습니다.
- faqTitle: 자주 묻는 질문
- faq1q/faq1a: 정말 무료인가요? / 네. 모든 기능이 무료이고 회원가입도 없습니다.
- faq2q/faq2a: 앱을 설치해야 하나요? / 아니요. 크롬, 사파리, 엣지 같은 브라우저만 있으면 됩니다. 원하면 홈 화면에 앱처럼 추가할 수도 있습니다.
- faq3q/faq3a: 같은 와이파이가 아니면 못 쓰나요? / '전체 공유' 탭으로 바꾸면 네트워크와 상관없이 이 서비스를 열어 둔 모든 사용자와 공유됩니다. 민감한 파일은 같은 네트워크에서만 공유하세요.
- faq4q/faq4a: 파일 크기 제한이 있나요? / 파일 하나당 업로드 카드에 표시된 최대 용량까지 올릴 수 있고, 여러 파일을 한 번에 올릴 수 있습니다.
- faq5q/faq5a: 파일은 얼마나 보관되나요? / 누군가 보고 있는 동안만 유지됩니다. 모든 기기가 나가면 잠시 후 자동 삭제되니, 필요한 파일은 바로 내려받으세요.
- moreTitle: 더 알아보기
- moreHowToUse: 사용법 안내
- moreFaq: 자주 묻는 질문 전체 보기
- guide1: 아이폰 사진을 윈도우 PC로 옮기기
- guide2: PC방·공용 PC에서 로그인 없이 파일 옮기기
- guide3: 안드로이드와 맥 사이 AirDrop 대안
- guide4: 폰에서 복사한 텍스트를 PC에 붙여넣기

en:
- headline: The online clipboard between your phone and PC
- intro: Clipboard Share is a free online clipboard with no sign-up and no app. Devices on the same Wi-Fi connect automatically in the browser, so copied text, screenshots and files show up on your other device right away.
- howTitle: How it works
- how1: Open this page on both devices while they are on the same Wi-Fi. Devices on the same network are grouped automatically.
- how2: Paste what you want to move (Ctrl+V / Cmd+V) or drop a file.
- how3: It appears on the other device instantly. Tap once to copy or download.
- useCasesTitle: Good for
- useCase1: Moving iPhone photos to a Windows PC without a cable
- useCase2: Grabbing a file on a shared or office PC without logging into your accounts
- useCase3: Sending between Android and Mac when AirDrop is not an option
- useCase4: Pasting a long link, one-time code or snippet from your phone into your PC
- safetyTitle: Is it safe?
- safety1: The default scope is "Same network", so only devices behind the same public IP can see your items. Sharing with everyone requires switching to the "Everyone" tab yourself.
- safety2: When every device leaves, files and text are deleted shortly after. No account, no history.
- safety3: Transfers are encrypted with HTTPS and the source code is public on GitHub.
- faqTitle: Frequently asked questions
- faq1q/faq1a: Is it really free? / Yes. Every feature is free and there is no account.
- faq2q/faq2a: Do I need to install an app? / No. Any modern browser works: Chrome, Safari, Edge, Firefox. You can add it to your home screen if you like.
- faq3q/faq3a: Does it work when devices are on different networks? / Switch to the "Everyone" tab to share with anyone who has the service open, regardless of network. Keep sensitive files on "Same network".
- faq4q/faq4a: Is there a file size limit? / Each file can be as large as the limit shown on the upload card, and you can upload several files at once.
- faq5q/faq5a: How long are files kept? / Only while someone is looking. Once every device leaves, everything is deleted shortly after, so download what you need right away.
- moreTitle: Learn more
- moreHowToUse: How to use (Korean)
- moreFaq: Full FAQ (Korean)
- guide1: Share your clipboard between phone and PC (no app)
- guide2: AirDrop alternative for Android, Windows and Mac
- guide3, guide4: (영어 가이드는 2개뿐이므로 비움. 컴포넌트는 빈 문자열인 가이드 링크를 렌더링하지 않는다)

나머지 19개 로케일은 위 ko/en을 번역해 같은 키로 넣는다. `LandingContent`는 `te('landing.headline')`이 false인 로케일에서는 아무것도 렌더링하지 않는다(한국어 폴백 노출 방지).

## 5. 아키텍처와 컴포넌트

### 5.1 URL과 언어
- `/` = 한국어 프리렌더, `/en/` = 영어 프리렌더. 같은 SPA 번들.
- 로케일 결정 우선순위: localStorage `user-locale` > 경로(`/en` 또는 `/en/`로 시작하면 `en`) > 브라우저 언어 > `ko`.
- hreflang: `ko` → `/`, `en` → `/en/`, `x-default` → `/`. 두 페이지 모두 같은 세트를 가진다.
- canonical은 경로 기준: `/en/`이면 `https://www.clipboardapp.org/en/`, 아니면 `https://www.clipboardapp.org/`.

### 5.2 `useSeoMeta` 컴포저블 (`frontend/src/composables/useSeoMeta.js`)
- 입력: i18n `locale`, `window.location.pathname`.
- 로케일이 바뀔 때마다 `document.title`, `meta[name=description]`, `meta[name=title]`, `og:title`, `og:description`, `og:url`, `og:locale`, `twitter:title`, `twitter:description`, `twitter:url`, `link[rel=canonical]`, `html[lang]`을 갱신한다. 값은 `seo.title`, `seo.description`. og:locale은 코드 → `ko_KR`, `en_US`, `ja_JP`, `zh_CN`, `es_ES`, `fr_FR`, `pt_BR`, `ar_AR`, `ru_RU`, `id_ID`, `de_DE`, `fa_IR`, `tr_TR`, `pl_PL`, `nl_NL`, `cs_CZ`, `vi_VN`, `uk_UA`, `sv_SE`, `hu_HU`, `ro_RO` 매핑.
- 요소가 없으면 만들지 않고 건너뛴다(테스트 환경 안전).
- `App.vue`의 setup에서 한 번 호출.

### 5.3 `LandingContent.vue` (`frontend/src/components/LandingContent.vue`)
- `RoomScreen.vue`의 `<main>` 아래, `AppFooter` 위에 배치. 홈 화면에만 존재(RoomScreen은 홈 전용).
- 구조: `<section aria-labelledby>`; 헤드라인은 `h2`(헤더의 `h1`은 유지, AppHeader 테스트가 h1을 요구함), 하위 섹션 제목 `h2`, FAQ 질문 `h3`.
- 스타일: DESIGN.md 토큰만 사용. 카드 `bg-surface border border-border rounded-xl`, 섹션 간격 8px 스케일(`mt-8`, `gap-4`), 제목 `font-display`, 본문 `text-text-secondary`, 링크 `text-primary`. 폰 프레임(480px) 안에서 한 컬럼.
- 가이드 링크: `locale === 'ko'`면 `/how-to-use.html`, `/faq.html`, `/guide/*.html` 4개; 아니면 `/en/guide/*.html` 2개. 빈 제목은 렌더링하지 않는다.
- `te('landing.headline')`이 false면 `null` 렌더링.

### 5.4 분석 이벤트 (`frontend/src/utils/analytics.js`)
- `trackEvent(name, params = {})`: `window.gtag`가 함수일 때만 `gtag('event', name, params)`; 예외는 삼킨다.
- 호출 지점(App.vue): 업로드 성공 후 `file_upload {file_count, scope}`, 텍스트 공유 후 `text_share {scope}`, 다운로드 성공 후 `file_download {file_count}`.

### 5.5 `index.html`
- GA 로더: 항상 `dataLayer`와 `gtag` 스텁을 정의하되, `location.hostname === 'www.clipboardapp.org'`일 때만 gtag.js `<script>`를 주입한다(dev/preview/prerender 트래픽 차단).
- title/description/og/twitter를 4.1의 ko 값으로. canonical/og:url/twitter:url을 www로. hreflang 3줄을 5.1대로.
- JSON-LD: Organization(logo → `https://www.clipboardapp.org/apple-touch-icon.png` 180×180), WebSite(SearchAction 제거), WebApplication(aggregateRating 제거, 설명·featureList를 현재 기능으로), FAQPage(4.2의 ko FAQ 5개), BreadcrumbList(www). SoftwareApplication과 HowTo 블록은 삭제.
- meta keywords는 새 포지셔닝 키워드로 교체(네이버용).

### 5.6 프리렌더 (`frontend/scripts/prerender.mjs`)
- routes: `['/', '/en/']`, 각 라우트의 로케일 `{'/': 'ko', '/en/': 'en'}`.
- 페이지 로드 전 `evaluateOnNewDocument`로 `localStorage.user-locale`을 해당 로케일로 설정하고 `navigator.language`를 `ko-KR`/`en-US`로 덮어쓴다.
- 캡처 전 알림 토스트(`NotificationToast`)와 같은 일시적 요소를 DOM에서 제거한다.
- 출력: `dist/index.html`, `dist/en/index.html`.

### 5.7 정적 파일
- `frontend/vercel.json`(신규; Vercel 루트 디렉터리가 `frontend`라 루트 vercel.json은 무시됨): `buildCommand: npm run build:seo`, `outputDirectory: dist`, apex 호스트 → www 영구 리디렉션(`has: host`), 보안 헤더, robots/sitemap Content-Type, 정적 자산 캐시. catch-all rewrite는 넣지 않는다(soft 404 방지).
- `robots.txt`: `User-agent: *`, `Allow: /`, `Disallow: /api/`, `Sitemap: https://www.clipboardapp.org/sitemap.xml`.
- `sitemap.xml`: www 기준 10개 URL(`/`, `/en/`, `/faq.html`, `/how-to-use.html`, 가이드 6개). `/`와 `/en/`에 xhtml:link hreflang. lastmod 2026-09-12.
- `llms.txt`: 서비스 한 줄 설명, 핵심 페이지 링크.
- README.md 상단: 서비스 링크와 한 줄 설명(백링크).

### 5.8 가이드 페이지 (`frontend/public/guide/*.html`, `frontend/public/en/guide/*.html`)
슬러그(사이트맵·LandingContent와 동일해야 함):
- ko: `guide/iphone-to-windows-photo-transfer.html`, `guide/pc-bang-file-transfer.html`, `guide/android-mac-airdrop-alternative.html`, `guide/copy-text-phone-to-pc.html`
- en: `en/guide/share-clipboard-between-phone-and-pc.html`, `en/guide/airdrop-alternative-android-windows-mac.html`

각 페이지: 고유 title(60자 이내), description(155자 이내), www canonical, og 태그, `Article` + `BreadcrumbList` JSON-LD, 본문 600~1,000자(문제 → 단계별 방법 → 팁 → 미니 FAQ 2~3개), 홈 CTA(ko는 `/`, en은 `/en/`), 형제 가이드·FAQ·사용법 링크. 스타일은 DESIGN.md 팔레트(코랄 `#FF6B4A`, 웜 뉴트럴, Plus Jakarta Sans)를 인라인 CSS로 적용한 공통 템플릿. 기존 `faq.html`/`how-to-use.html`도 같은 템플릿으로 현행화(6자리 룸 코드·Supabase 같은 옛 설명 제거, www canonical, HowTo JSON-LD 제거).

## 6. 루틴

- 주간(월 09:00 KST) "SEO 주간 리포트": Aside로 GA4 보고서 개요(최근 7일 vs 이전 7일)와 Search Console 쿼리 보고서를 읽고, 구글 `site:` 색인 수를 확인하고, 기준값과 비교한 요약을 남긴다. 회귀(색인 감소, 노출 급감)는 상단에 표시.
- 월간(1일 10:00 KST) "콘텐츠 제안": 노출은 있으나 클릭이 0인 검색어를 뽑아 가이드 주제 2개와 브리프를 제안한다.
- 루틴은 읽기 전용이며 사이트 설정을 바꾸지 않는다.

## 7. 테스트

- `useSeoMeta`: 로케일 변경 시 title/description/canonical/lang 갱신, 요소 없을 때 예외 없음, `/en/` 경로 canonical.
- `analytics.trackEvent`: gtag 없으면 무시, 있으면 인자 전달, 예외 삼킴.
- `LandingContent`: ko/en 렌더링, 미번역 로케일에서 미렌더링, ko/en 가이드 링크 분기, 빈 가이드 제목 미렌더링.
- `RoomScreen`: LandingContent가 렌더링된다(스텁).
- i18n: 모든 로케일에 `seo.title`, `seo.description`, `landing.headline` 등 필수 키 존재.
- 프리렌더 스크립트: 로컬 `npm run build:seo` 후 `dist/index.html`에 한국어 헤드라인과 `lang="ko"`, `dist/en/index.html`에 영어 헤드라인과 `lang="en"`, canonical이 각각 맞는지 확인(수동 검증 스크립트).
- 정적 페이지: 링크 대상 파일 존재, canonical www, JSON-LD 파싱 가능(검증 스크립트).

## 8. 위험과 완화

- 프리렌더가 빌드 시 프로덕션 소켓에 연결해 상태를 굽는다: 토스트 제거로 완화, 근본 수정은 범위 밖.
- 번역 품질: 19개 언어는 모델 번역. 검토 가능하도록 키 구조를 ko/en과 동일하게 유지.
- `/en/` 경로에서 로컬 저장 로케일이 우선이라 영어 URL에서 다른 언어가 보일 수 있음: 의도된 UX(사용자 선택 존중), SEO는 프리렌더가 담당.
- Vercel 대시보드의 apex 307 리디렉션이 vercel.json보다 먼저 적용될 수 있음: 그래도 해가 없고, 사용자에게 대시보드 설정 변경을 안내.
