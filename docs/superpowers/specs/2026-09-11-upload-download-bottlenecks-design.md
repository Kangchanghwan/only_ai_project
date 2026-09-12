# 업로드/다운로드 상위 5개 병목 수정 — 설계

날짜: 2026-09-11 · 근거: 감사 리포트(`findings/upload-download-bottlenecks.md`) D1, U1, U2, D4, D3

## 목표

1. **D1** 이미지 썸네일이 원본 전체를 내려받지 않게 한다.
2. **U1** 파일마다 반복되는 CORS preflight + presign 왕복을 줄인다.
3. **U2** 여러 파일을 동시에(제한된 병렬로) 업로드한다.
4. **D4** 업로드·삭제 이벤트를 소켓 메시지로 반영하고, 전체 목록 재조회를 없앤다.
5. **D3** 다운로드를 메모리 버퍼링 없이 브라우저 네이티브 다운로드로 바꾼다.

범위 밖: 서버측 크기 강제(U4), 멀티파트(U3), 파일명 유니코드/고유 키(U5), 인프라 설정(B1/B2).

## 결정과 대안

| 항목 | 채택 | 기각한 대안 | 이유 |
|---|---|---|---|
| D1 | 업로드 시 클라이언트가 160px JPEG 썸네일을 만들어 `thumbs/{roomId}/{fileName}.jpg`로 함께 업로드. 카드는 썸네일 URL을 먼저 쓰고 실패(404)하면 원본으로 폴백 | Cloudflare Image Transformations URL | zone에 활성화돼 있지 않음(`/cdn-cgi/image/` 404 확인). 코드만으로 완결되는 방식을 택함 |
| D1 저장 위치 | 룸 프리픽스 밖(`thumbs/`) | `{roomId}/{name}.thumb.jpg` | 목록 API가 썸네일을 파일로 노출하지 않게, 페이지네이션 경계 문제를 피하기 위해 |
| U1 | `Access-Control-Max-Age: 7200` + 배치 presign `POST /api/r2/presigned-urls` | 단순 요청(GET) 변환, 엣지 Worker | Max-Age로 preflight는 2시간에 1회로 줄고, 배치로 N파일 = 1왕복. Worker는 인프라 변경이라 별도 |
| U2 | 동시성 3의 풀(`runWithConcurrency`) | 무제한 병렬 | 모바일 망 혼잡·메모리 보호 |
| D4 | `file-uploaded`에 `size`·`created` 포함 → 수신 측 `addFile`(중복 제거). `file-deleted`·`files-cleared` 메시지 신설 | 서버 캐시로 재조회 완화 | 재조회 자체를 없애는 게 근본 해결. 필드가 없는 구버전 메시지는 기존대로 재조회 |
| D3 | API가 `response-content-disposition=attachment`가 서명된 presigned GET을 발급(`GET /api/r2/download-url/:roomId/:fileName`, 배치 `POST /api/r2/download-urls`). 프론트는 `<a>` 클릭으로 네이티브 다운로드. URL 발급 실패 시 기존 Blob 방식으로 폴백 | 업로드 시 `Content-Disposition` 메타데이터 서명 | presigned GET은 이미 저장된 객체에도 동작하고 인라인 보기(`window.open`)와 충돌하지 않음 |

## 인터페이스

### 백엔드 (`backend/src`)
- CORS 미들웨어: `Access-Control-Max-Age: 7200`.
- `POST /api/r2/presigned-urls` body `{ roomId, files: [{ fileName, contentType }] }`(1–50개) → `{ files: [{ uploadUrl, fileUrl, fileName, thumbUploadUrl?, thumbUrl? }] }`. `contentType`이 `image/*`면 썸네일 PUT(`image/jpeg`) URL 동봉.
- `GET /api/r2/download-url/:roomId/:fileName` → `{ fileName, url }` (600초, `attachment; filename*=UTF-8''…`).
- `POST /api/r2/download-urls` body `{ roomId, fileNames }`(1–100개) → `{ urls: [{ fileName, url }] }`.
- `R2Service`: `getThumbKey/getThumbUrl`, `getUploadPresignedUrls`, `getDownloadPresignedUrl`, `deleteFile`은 원본+썸네일 키를 한 번의 `DeleteObjects`로 삭제, `deleteAllFiles`는 룸 프리픽스와 `thumbs/{roomId}/` 프리픽스를 전 페이지 순회해 삭제.

### 프론트엔드 (`frontend/src`)
- `utils/concurrency.js` `runWithConcurrency(items, limit, worker)` → 입력 순서의 settled 결과 배열.
- `utils/thumbnail.js` `createImageThumbnail(file, { maxSize=160, quality=0.72 }, deps)` → `Blob(image/jpeg) | null`. 래스터 이미지가 아니거나 디코딩 불가면 `null`.
- `services/r2Service.js`: `getThumbUrl`, `getUploadUrls`, `putToPresignedUrl`, `getDownloadUrl`, `getDownloadUrls`. 기존 `uploadFile`은 유지(단일 경로).
- `composables/useFileManager.js`: `addFile` 멱등(roomId+name 키, 새 파일이면 `totalSize` 가산, 새로 추가됐는지 boolean 반환), `removeFile(roomId, name)`, `clearRoomFiles(roomId)`, `uploadFiles(roomId, files, { concurrency=3, onStart, onProgress, onComplete, onError })` → `{ successCount, failCount, results }`. 검증 실패 파일은 presign 대상에서 제외하고 `onError`로 보고. 썸네일 업로드는 원본과 병렬, 둘 다 끝난 뒤 완료 처리.
- `utils/applyFileMessage.js` `applyFileMessage(message, fileManager)` → `'added' | 'updated' | 'removed' | 'cleared' | 'reload' | 'ignored'`.
- `App.vue`: `uploadFiles` 풀 사용, 완료 시 `file-uploaded`(size, created 포함) 발행; 삭제·초기화 시 `file-deleted`·`files-cleared` 발행; 수신은 `applyFileMessage`로 처리, `'reload'`일 때만 재조회.
- `components/FileCard.vue`: 이미지 `<img>`는 썸네일 URL → 오류 시 원본으로 1회 폴백, `decoding="async"`, `width/height`.
- `composables/useDownload.js`: `downloadFile`/`downloadParallel`은 presigned URL 네이티브 다운로드, 실패 시 Blob 폴백. 파일 간 간격 250ms.
- `components/DownloadPage.vue`: 파일 객체에 `roomId` 포함.

## 오류 처리
- presign 배치 실패 → 해당 배치의 모든 파일 `onError`, 목록 상태 변경 없음.
- 썸네일 생성/업로드 실패 → 무시(원본만 업로드). 카드가 원본으로 폴백.
- 다운로드 URL 발급 실패(구버전 백엔드 포함) → Blob 방식 폴백.
- 구버전 클라이언트가 보낸 `file-uploaded`(size 없음) → 전체 재조회.

## 테스트
- 백엔드: `api.test.ts`(실제 Express + 오프라인 presign), `r2Service.thumbs.test.ts`(client.send 스파이).
- 프론트: `concurrency.test.js`, `thumbnail.test.js`(DI로 canvas/bitmap 대체), `r2Service.batch.test.js`, `useFileManager.uploadFiles.test.js`, `applyFileMessage.test.js`, `FileCard.thumb.test.js`, `useDownload.test.js`(신규 동작 + 폴백).

## 롤아웃
프론트가 먼저 배포되더라도 배치 presign·다운로드 URL 실패 시 기존 경로로 폴백하므로 순서 의존이 없다. 기존 객체는 썸네일이 없어 첫 로드에 1회 404 후 원본으로 폴백한다(룸이 비면 자동 삭제되므로 단기간).
