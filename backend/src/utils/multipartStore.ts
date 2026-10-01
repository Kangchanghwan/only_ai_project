/** 멀티파트 업로드 파트 크기 (마지막 파트 제외 고정, 64MiB) */
export const MULTIPART_PART_SIZE = 64 * 1024 * 1024;
/** S3/R2 파트 수 상한 */
export const MAX_PART_COUNT = 10000;
/** 한 번의 sign 요청으로 받을 수 있는 최대 파트 수 */
export const MAX_SIGN_PARTS = 20;
/** 레코드 보관 시간(프론트 resume 24시간 + 여유) */
const RECORD_TTL_MS = 25 * 3600 * 1000;

export interface MultipartRecord {
    roomId: string;
    key: string;
    size: number;
    partSize: number;
    partCount: number;
    /** 일일 한도 예약 키(날짜:HMAC(IP)) */
    ipKey: string;
    createdAt: number;
    /** 서버 재시작 후 클라이언트 size로 복원된 레코드 (일일 한도 예약 없음) */
    recovered?: boolean;
}

const records = new Map<string, MultipartRecord>();

export const computePartCount = (size: number, partSize: number = MULTIPART_PART_SIZE): number =>
    Math.ceil(size / partSize);

/** partNumber(1-base)의 바이트 길이. 마지막 파트는 나머지 크기 */
export const partLength = (size: number, partSize: number, partNumber: number): number => {
    const count = computePartCount(size, partSize);
    if (partNumber < count) return partSize;
    return size - partSize * (count - 1);
};

const prune = (now: number): void => {
    for (const [id, rec] of records) {
        if (now - rec.createdAt > RECORD_TTL_MS) records.delete(id);
    }
};

export const putRecord = (uploadId: string, rec: MultipartRecord): void => {
    prune(Date.now());
    records.set(uploadId, rec);
};
export const getRecord = (uploadId: string): MultipartRecord | undefined => records.get(uploadId);
export const deleteRecord = (uploadId: string): void => {
    records.delete(uploadId);
};

/** 룸의 진행 중 업로드 예약 바이트 합 */
export const reservedBytesForRoom = (roomId: string): number => {
    let total = 0;
    for (const rec of records.values()) if (rec.roomId === roomId) total += rec.size;
    return total;
};

/** 룸의 레코드를 모두 제거한다 (룸 정리 시) */
export const deleteRecordsForRoom = (roomId: string): void => {
    for (const [id, rec] of records) if (rec.roomId === roomId) records.delete(id);
};

export const resetMultipartStore = (): void => records.clear();
