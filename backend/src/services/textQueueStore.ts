import { getR2Service, R2Service } from './r2Service';
import { TextQueueStore, QueuedText, TEXT_QUEUE_MAX_TOTAL } from '../utils/textQueue';

/** 대기열 객체 프리픽스. 잠금 파일(`<roomId>/<id>`)과 겹치지 않는다 */
export const TEXT_QUEUE_PREFIX = '_texts/';

export const textQueueKey = (roomId: string, textId: string): string => `${TEXT_QUEUE_PREFIX}${roomId}/${textId}.json`;

/** 잠금(비공개) 버킷이 설정돼 있을 때만 R2 서비스. 공개 버킷에는 절대 쓰지 않는다 */
const lockedR2 = (): R2Service | null => {
    try {
        const r2 = getR2Service();
        return r2.isLockedEnabled() ? r2 : null;
    } catch {
        return null; // R2 환경 변수 없음 (테스트·로컬): 메모리만 쓴다
    }
};

/**
 * 텍스트 대기열의 R2 저장소: 비공개 버킷 `_texts/<roomId>/<textId>.json`.
 * 공개 도메인이 없고 1일 수명 주기가 걸린 버킷이라, 정리가 실패해도 하루 안에 사라진다.
 * 잠금 버킷이 없으면 아무것도 하지 않는다(재시작 시 대기열이 비는 것만 다르다).
 */
export const r2TextQueueStore: TextQueueStore = {
    async put(entry: QueuedText) {
        await lockedR2()?.putLockedJson(textQueueKey(entry.roomId, entry.textId), entry);
    },
    async remove(roomId: string, textIds: string[]) {
        await lockedR2()?.deleteLockedKeys(textIds.map((id) => textQueueKey(roomId, id)));
    },
    async loadAll() {
        const r2 = lockedR2();
        if (!r2) return [];
        const keys = (await r2.listLockedKeys(TEXT_QUEUE_PREFIX)).slice(0, TEXT_QUEUE_MAX_TOTAL * 2);
        const out: unknown[] = [];
        for (const key of keys) {
            const value = await r2.getLockedJson(key).catch(() => null);
            if (value) out.push(value);
        }
        return out;
    },
};
