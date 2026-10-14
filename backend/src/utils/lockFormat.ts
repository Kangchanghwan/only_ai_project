/**
 * 비밀번호 잠금 파일 형식 (v1). 규격: docs/superpowers/specs/2026-10-13-password-lock-design.md
 *
 * 서버는 암호문만 다룬다. 비밀번호·키는 받지 않고, 잠금 메타데이터(salt, vh, 감싼 키 등)를
 * R2 객체 메타데이터로 보관했다가 비밀번호 확인값이 맞을 때만 돌려준다.
 */

/** 평문 레코드 크기 (1 MiB) */
export const LOCK_RECORD_SIZE = 1024 * 1024;
/** AES-GCM 태그 크기 */
export const LOCK_TAG_SIZE = 16;
/** 파트 하나에 들어가는 레코드 수 */
export const LOCK_RECORDS_PER_PART = 64;
/** 잠금 멀티파트의 파트 크기(암호문 바이트) = 64 × (1 MiB + 16) */
export const LOCK_PART_SIZE = LOCK_RECORDS_PER_PART * (LOCK_RECORD_SIZE + LOCK_TAG_SIZE);
export const LOCK_VERSION = 1;

/** 평문 크기 → 암호문 크기 */
export const ctSizeOf = (pt: number): number => pt + LOCK_TAG_SIZE * Math.ceil(pt / LOCK_RECORD_SIZE);

/** 암호문 크기 → 평문 크기 (ctSizeOf의 역함수, 형식이 맞는 크기에 한해) */
export const ptSizeOf = (ct: number): number => {
    const records = Math.ceil(ct / (LOCK_RECORD_SIZE + LOCK_TAG_SIZE));
    return ct - LOCK_TAG_SIZE * records;
};

/** 클라이언트가 보내는 잠금 메타데이터 */
export interface LockMetaInput {
    v: number;
    salt: string;
    vh: string;
    wk: string;
    wkIv: string;
    np: string;
    en: string;
    enIv: string;
    /** 올린 기기만 아는 삭제 키의 SHA-256(hex). 없으면 비밀번호로만 지울 수 있다 */
    dh?: string;
}

/** R2 객체 메타데이터로 저장하는 형태 (S3 메타데이터 키는 소문자) */
export type LockObjectMetadata = Record<'v' | 'salt' | 'vh' | 'wk' | 'wkiv' | 'np' | 'en' | 'eniv' | 'pt', string> & { dh?: string };

const B64URL = /^[A-Za-z0-9_-]+$/;
/** n바이트를 패딩 없는 base64url로 인코딩한 길이 */
const b64Len = (n: number): number => Math.ceil((n * 4) / 3);

const isB64 = (v: unknown, bytes: number): v is string => typeof v === 'string' && v.length === b64Len(bytes) && B64URL.test(v);

/** 파일명 암호문 허용 길이: 태그 16B + 평문 1~180B */
const EN_MIN = b64Len(LOCK_TAG_SIZE + 1);
const EN_MAX = b64Len(LOCK_TAG_SIZE + 180);

/**
 * 잠금 메타데이터를 검증해 저장용 형태로 바꾼다. 형식이 틀리면 null.
 * 값의 의미(키가 맞는지 등)는 서버가 알 수 없으므로 길이·문자 형식만 본다.
 */
export function normalizeLockMeta(input: unknown, pt: number): LockObjectMetadata | null {
    if (!input || typeof input !== 'object') return null;
    const m = input as Partial<LockMetaInput>;
    if (m.v !== LOCK_VERSION) return null;
    if (!isB64(m.salt, 16)) return null;
    if (typeof m.vh !== 'string' || !/^[0-9a-f]{64}$/.test(m.vh)) return null;
    if (!isB64(m.wk, 32 + LOCK_TAG_SIZE)) return null;
    if (!isB64(m.wkIv, 12)) return null;
    if (!isB64(m.np, 4)) return null;
    if (!isB64(m.enIv, 12)) return null;
    if (typeof m.en !== 'string' || m.en.length < EN_MIN || m.en.length > EN_MAX || !B64URL.test(m.en)) return null;
    if (m.dh !== undefined && (typeof m.dh !== 'string' || !/^[0-9a-f]{64}$/.test(m.dh))) return null;
    return {
        v: String(LOCK_VERSION),
        salt: m.salt,
        vh: m.vh,
        wk: m.wk,
        wkiv: m.wkIv,
        np: m.np,
        en: m.en,
        eniv: m.enIv,
        pt: String(pt),
        ...(m.dh ? { dh: m.dh } : {}),
    };
}

/** R2에서 읽은 메타데이터가 잠금 형식인지 확인한다 */
export function readLockMeta(meta: Record<string, string> | undefined): LockObjectMetadata | null {
    if (!meta) return null;
    const keys: Array<keyof LockObjectMetadata> = ['v', 'salt', 'vh', 'wk', 'wkiv', 'np', 'en', 'eniv', 'pt'];
    if (keys.some((k) => typeof meta[k] !== 'string' || meta[k].length === 0)) return null;
    if (meta.v !== String(LOCK_VERSION)) return null;
    return meta as LockObjectMetadata;
}

/** 잠금 파일 id: 16바이트 hex (파일명을 키에 남기지 않는다) */
export const isLockId = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{32}$/.test(v);

/** 해제 요청의 verifier: 32바이트 base64url */
export const isVerifier = (v: unknown): v is string => isB64(v, 32);

/** 삭제 키: 32바이트 base64url (올린 기기가 만든 무작위 값) */
export const isDeleteKey = (v: unknown): v is string => isB64(v, 32);
