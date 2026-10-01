/**
 * 업로드 용량 한도.
 * 환경 변수는 호출 시점에 읽는다 (테스트·런타임 변경 대응).
 */
const MB = 1024 * 1024;

function readMb(name: string, fallback: number): number {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/** 파일당 최대 바이트 (MAX_FILE_SIZE_MB, 기본 5120 = 5GB) */
export const getMaxFileSizeBytes = (): number => readMb('MAX_FILE_SIZE_MB', 5120) * MB;

/** 룸 전체 최대 바이트 (MAX_ROOM_SIZE_MB, 기본 10240 = 10GB) */
export const getMaxRoomSizeBytes = (): number => readMb('MAX_ROOM_SIZE_MB', 10240) * MB;

/**
 * 단일 PUT presign으로 허용하는 최대 바이트 (SINGLE_PUT_MAX_MB, 기본 100).
 * 이보다 큰 파일은 멀티파트를 써야 한다. 구버전 프론트 롤아웃 중에는 이 값을 임시로 올려 호환시킬 수 있다.
 */
export const getMaxSinglePutBytes = (): number => readMb('SINGLE_PUT_MAX_MB', 100) * MB;

export interface SizeCheckFailure {
  status: 400 | 413;
  error: string;
  code?: string;
}

/**
 * presign 요청의 파일 크기를 검증한다.
 * - size가 undefined/null: 구버전 프론트(size를 보내지 않음) 호환을 위해 통과시킨다 (null 반환 + legacy 표시).
 * - size가 있는데 정수가 아니거나 0 이하: 400
 * - size가 파일당 한도 초과: 413
 */
export function checkFileSize(size: unknown, opts: { singlePut?: boolean } = {}): SizeCheckFailure | 'legacy' | null {
  if (size === undefined || size === null) return 'legacy';
  if (typeof size !== 'number' || !Number.isInteger(size) || size <= 0) {
    return { status: 400, error: 'size는 1 이상의 정수(바이트)여야 합니다' };
  }
  if (size > getMaxFileSizeBytes()) {
    return {
      status: 413,
      error: `파일 크기는 ${getMaxFileSizeBytes() / MB}MB를 초과할 수 없습니다`,
      code: 'FILE_TOO_LARGE',
    };
  }
  if (opts.singlePut && size > getMaxSinglePutBytes()) {
    return {
      status: 413,
      error: `단일 업로드는 ${getMaxSinglePutBytes() / MB}MB까지만 가능합니다. 멀티파트 업로드를 사용하세요`,
      code: 'SINGLE_PUT_TOO_LARGE',
    };
  }
  return null;
}

/** 룸 현재 사용량 + 이번 요청 합계가 룸 한도를 넘으면 실패 객체를 반환한다 */
export function checkRoomSize(currentBytes: number, requestedBytes: number): SizeCheckFailure | null {
  if (currentBytes + requestedBytes > getMaxRoomSizeBytes()) {
    return {
      status: 413,
      error: `룸 용량 제한(${getMaxRoomSizeBytes() / MB}MB)을 초과합니다`,
      code: 'ROOM_SIZE_EXCEEDED',
    };
  }
  return null;
}
