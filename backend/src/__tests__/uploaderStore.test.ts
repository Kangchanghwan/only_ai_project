import { recordUploader, getUploader, deleteUploader, deleteUploadersForRoom, resetUploaders, UPLOADER_TTL_MS, toSender } from '../utils/uploaderStore';

const sender = { socketId: 's1', deviceLabel: 'mac' as const, browser: 'Chrome', identity: { adj: 1, animal: 2 } };

describe('uploaderStore', () => {
    beforeEach(() => resetUploaders());

    it('기록/조회/삭제', () => {
        recordUploader('room-a', 'f.png', sender);
        expect(getUploader('room-a', 'f.png')).toEqual(sender);
        deleteUploader('room-a', 'f.png');
        expect(getUploader('room-a', 'f.png')).toBeUndefined();
    });

    it('24시간이 지나면 만료된다', () => {
        recordUploader('room-a', 'f.png', sender, 1000);
        expect(getUploader('room-a', 'f.png', 1000 + UPLOADER_TTL_MS)).toEqual(sender);
        expect(getUploader('room-a', 'f.png', 1000 + UPLOADER_TTL_MS + 1)).toBeUndefined();
    });

    it('룸 단위 삭제는 다른 룸에 영향이 없다', () => {
        recordUploader('room-a', '1', sender);
        recordUploader('room-a', '2', sender);
        recordUploader('room-b', '1', sender);
        deleteUploadersForRoom('room-a');
        expect(getUploader('room-a', '1')).toBeUndefined();
        expect(getUploader('room-b', '1')).toEqual(sender);
    });

    it('toSender는 공개 필드만 복사한다', () => {
        const s = toSender({ ...sender, os: 'macOS', joinedAt: 5, deviceType: 'desktop' } as never);
        expect(Object.keys(s).sort()).toEqual(['browser', 'deviceLabel', 'identity', 'socketId']);
    });
});
