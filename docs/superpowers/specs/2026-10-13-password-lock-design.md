# 비밀번호 잠금 공유 (같은 네트워크 + 전체 공유)

Status: accepted (owner 2026-10-13). 범위: 파일만(텍스트는 2차).

## 목표
- 보내는 사람이 비밀번호를 걸면 비밀번호를 아는 사람만 받을 수 있다.
- URL·저장소·서버 로그가 새어도 내용과 파일명은 알 수 없다. 운영자(R2 열람 가능)도 열 수 없다.
- 평소 흐름(잠금 안 씀)에는 클릭이 하나도 늘지 않는다.
- 잠긴 파일도 5GB까지.

## 보호 3겹
1. 브라우저 암호화: 파일·파일명을 보내는 기기에서 AES-GCM으로 암호화. 비밀번호와 키는 서버로 가지 않는다.
2. 공개 주소 없는 별도 R2 버킷(`R2_LOCKED_BUCKET_NAME`, 기본 `clipboard-share-locked`). 커스텀 도메인·r2.dev 공개 없음, 1일 수명 주기.
3. 서버 시도 제한: 비밀번호 확인값(verifier)이 맞을 때만 60초 presigned GET 발급. 틀린 횟수는 같은 비밀번호 묶음(vh)당 전체 30회, IP당 5회.

## 암호 규격 (v1)
| 항목 | 값 |
|---|---|
| 비밀번호 → master | PBKDF2-HMAC-SHA256, 600,000회, salt 16B 랜덤(잠금 설정 1회당), 256bit |
| encKey | HKDF-SHA256(master, salt=빈 값, info=`cs-lock-v1/enc`) → AES-GCM-256 |
| verifier | HKDF-SHA256(master, salt=빈 값, info=`cs-lock-v1/verify`) → 32B |
| vh | hex(SHA-256(verifier)). 서버에는 vh만 저장, 해제 시 verifier를 받아 해시 비교 |
| DK | 파일마다 랜덤 32B (AES-GCM-256) |
| wk | AES-GCM(encKey, wkIv 12B 랜덤, DK raw, AAD=`cs-lock-v1/key`) → 48B |
| en | AES-GCM(DK, enIv 12B 랜덤, UTF-8 파일명(확장자 보존, 최대 180바이트), AAD=`cs-lock-v1/name`) |
| 레코드 | 평문 RS = 1 MiB 단위. 레코드 i: iv = np(4B 랜덤, 파일마다) ‖ uint64BE(i), AAD = ASCII `cs-lock-v1` ‖ uint64BE(i) ‖ (마지막이면 0x01 아니면 0x00). 암호문 = 평문 + 16B 태그 |
| 암호문 크기 | ct = pt + 16 × ceil(pt / RS) (pt ≥ 1) |
| 파트 | 64 레코드 = 67,109,888 바이트(64 × (RS+16)). 마지막 파트는 나머지 |
| 인코딩 | 바이너리는 base64url(패딩 없음) |

같은 접속에서 잠금을 한 번 설정하면 salt·encKey·vh를 재사용한다(파일마다 PBKDF2를 다시 돌리지 않음). 파일마다 DK·np는 새로 만든다.

## API
룸 토큰(X-Room-Token) 필요: create/sign/parts/complete/abort, 삭제, 목록.
토큰 불필요(비밀번호가 관문): meta, unlock.

- `POST /api/r2/locked/multipart/create` body `{roomId, socketId?, size: pt, lock: {v:1, salt, vh, wk, wkIv, np, en, enIv}}`
  → `{uploadId, key, id, partSize, partCount, ctSize}`. key = `${roomId}/${id}`, id = 랜덤 16B hex. lock 필드는 객체 메타데이터로 저장.
- `POST /api/r2/locked/multipart/{sign,parts,complete,abort}`: 기존 멀티파트와 같은 본문(`roomId, uploadId, key, size(ctSize, 복구용), partNumbers | parts`).
  complete → `{success, id, locked: true, size: pt, ctSize}`.
- `GET /api/r2/files/:roomId`: 잠긴 객체도 `{name: id, locked: true, size: pt, lastModified, uploader?}`로 함께 준다(url 없음).
- `DELETE /api/r2/locked/:roomId/:id`, `DELETE /api/r2/files/:roomId`(잠긴 것 포함), 룸 정리도 잠긴 것 포함. 룸 용량은 두 버킷 합(암호문 크기).
- `GET /api/r2/locked/meta/:roomId/:id` → `{v, salt, size, rs, remaining}` | 404 `LOCKED_NOT_FOUND`.
- `POST /api/r2/locked/unlock` body `{roomId, id, verifier}` →
  200 `{url, expiresIn: 60, size, ctSize, rs, np, wk, wkIv, en, enIv}` | 403 `{code: WRONG_PASSWORD, remaining}` | 429 `{code: LOCKED_OUT, remaining: 0}` | 404.

소켓 알림: `{type: 'file-uploaded', locked: true, fileName: id, size: pt, created, roomId}` (url 없음).

## 프론트
- 잠금 상태는 범위(ip/global)별, 이번 접속 동안 메모리에만. 업로드 영역의 잠금 칩(끔 → 누르면 비밀번호 입력 / 켜짐 → `잠금 켜짐 · 해제`).
- 전체 공유 확인 창에 비밀번호 입력란(선택). 비우면 지금과 같음.
- 잠금이 켜진 범위로 보내는 파일은 크기와 상관없이 잠금 멀티파트로 보낸다(이어올리기 저장은 1차에서 하지 않음, 접속 중 재시도는 됨).
- 진행 카드 2단(잠그는 중 / 올리는 중). 진행률은 실제 처리 바이트 기준, 인위적 지연 없음.
- 잠긴 파일 카드: 파일명 대신 무작위 문자, 크기·시각·보낸 기기, 비밀번호 입력 + 풀기. 틀리면 흔들림 + 남은 시도. 맞으면 받으면서 풀기 → 이름 복원 + "이 기기에서만 풀렸어요". 배지 "운영자도 열 수 없어요"(누르면 설명).
- 같은 접속에서 같은 salt의 비밀번호를 풀었으면 다시 묻지 않는다. 보낸 기기는 자기 파일 이름을 기억해 보여 준다.
- 잠긴 파일은 공유 링크·QR·미리보기·썸네일을 숨긴다(1차).
- 받기: 서비스워커 스트리밍 복호화(`/__locked/<token>`), 컨트롤러가 없거나 iOS면 메모리 복호화(500MB까지, 넘으면 다른 기기에서 받으라고 안내).

## 알려진 한계
- 시도 횟수 카운터는 서버 메모리라 재시작 시 초기화된다.
- 운영자는 서버의 vh와 암호문으로 짧은 비밀번호를 오프라인 대입할 수 있다(8자 이상이면 사실상 불가).
- 파일 크기·업로드 시각·보낸 기기 표시는 숨기지 않는다.
- 사이트 코드 자체가 변조되면 브라우저 암호화도 무력하다(웹 E2E 공통 한계).
