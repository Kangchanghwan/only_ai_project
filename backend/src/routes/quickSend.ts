/**
 * @file quickSend.ts
 * @description 앱·브라우저 없이 보내는 "빠른 보내기" 경로 (iOS 단축어용).
 *
 * iPhone/iPad의 공유 메뉴에서 단축어가 이 경로로 파일이나 텍스트를 보낸다.
 * 룸 토큰 대신 요청 IP로 같은 네트워크 방(IP 룸)을 서버가 직접 계산한다.
 * 소켓으로 그 방에 들어간 것과 같은 권한이므로 다른 방에는 보낼 수 없다.
 *
 * - POST /api/quick-send (multipart/form-data)
 *   - file: 파일 1개 이상 (합계 QUICK_SEND_MAX_BYTES 이하. Cloudflare 요청 한도 100MB 때문)
 *   - text: 텍스트 (선택)
 *   - device: 'iphone' | 'ipad' (선택, 이름표 표시용)
 * - 응답: { ok, files, text, receivers, message }  message는 단축어가 그대로 보여 준다
 */
import type { Express, Request, Response, NextFunction } from 'express';
import type { Server } from 'socket.io';
import multer from 'multer';
import { createReadStream, promises as fsp } from 'fs';
import { tmpdir } from 'os';
import { randomBytes } from 'crypto';
import { extractClientIp, deriveIpRoomId } from '../utils/clientIp';
import { checkFileSize, checkRoomSize } from '../utils/uploadLimits';
import { reservedBytesForRoom } from '../utils/multipartStore';
import { quotaKeyFromRequest, reserveDailyQuota, releaseDailyQuota } from '../utils/dailyQuota';
import { recordUploader, Sender } from '../utils/uploaderStore';
import { getTextQueue, TextQueue } from '../utils/textQueue';
import { relayTextShared } from '../handlers/socketHandlers';
import { TokenBucket } from '../utils/tokenBucket';
import type { R2Service } from '../services/r2Service';
import type { DeviceLabel } from '../utils/deviceInfo';
import logger from '../utils/logger';

/** 요청 하나의 파일 합계 한도. Cloudflare 무료 요청 본문 한도(100MB)보다 조금 작게 */
export const QUICK_SEND_MAX_BYTES = 95 * 1024 * 1024;
/** 요청 하나에 담을 수 있는 파일 수 */
export const QUICK_SEND_MAX_FILES = 20;
/** IP당 연속 20회, 그 뒤 3초에 1회 (사진 20장을 한 번에 보내는 경우를 허용) */
const BUCKET_CAPACITY = 20;
const BUCKET_REFILL_PER_SEC = 1 / 3;

const DEVICE_LABELS: Record<string, DeviceLabel> = { iphone: 'iphone', ipad: 'ipad' };

export interface QuickSendDeps {
    io: Server;
    getR2Service: () => R2Service;
    /** 방에 지금 열려 있는 기기 수 */
    countUsers: (roomId: string) => number;
    textQueue?: TextQueue;
    now?: () => number;
}

type Lang = 'ko' | 'en';

const MESSAGES = {
    ko: {
        sent: (what: string, n: number) => n > 0
            ? `${what} 보냈어요. 같은 와이파이의 기기 ${n}대에 바로 나타나요.`
            : `${what} 보냈어요. 지금 열린 기기는 없어요. PC에서 clipboardapp.org를 열면 보여요.`,
        files: (n: number) => `파일 ${n}개를`,
        text: '텍스트를',
        both: (n: number) => `파일 ${n}개와 텍스트를`,
        empty: '보낼 파일이나 텍스트가 없어요.',
        tooLarge: '한 번에 95MB까지 보낼 수 있어요. 큰 파일은 clipboardapp.org에서 보내 주세요.',
        tooMany: `한 번에 파일 ${QUICK_SEND_MAX_FILES}개까지 보낼 수 있어요.`,
        rate: '너무 빠르게 보내고 있어요. 잠시 뒤 다시 보내 주세요.',
        quota: '오늘 보낼 수 있는 용량을 다 썼어요.',
        roomFull: '이 네트워크의 보관함이 가득 찼어요. clipboardapp.org에서 오래된 파일을 지워 주세요.',
        noIp: '네트워크를 확인하지 못했어요. 와이파이에 연결돼 있는지 확인해 주세요.',
        failed: '보내지 못했어요. 잠시 뒤 다시 시도해 주세요.',
    },
    en: {
        sent: (what: string, n: number) => n > 0
            ? `Sent ${what}. It shows up right away on ${n} device(s) on the same Wi-Fi.`
            : `Sent ${what}. No device is open right now. Open clipboardapp.org on your PC to see it.`,
        files: (n: number) => `${n} file(s)`,
        text: 'the text',
        both: (n: number) => `${n} file(s) and the text`,
        empty: 'Nothing to send.',
        tooLarge: 'You can send up to 95MB at a time. Send bigger files from clipboardapp.org.',
        tooMany: `You can send up to ${QUICK_SEND_MAX_FILES} files at a time.`,
        rate: "You're sending too fast. Please wait a moment and try again.",
        quota: "You've used today's upload allowance.",
        roomFull: 'Storage for this network is full. Delete old files on clipboardapp.org.',
        noIp: "Couldn't detect your network. Check that you're on Wi-Fi.",
        failed: "Couldn't send. Please try again in a moment.",
    },
};

const pickLang = (req: Request): Lang => {
    const explicit = typeof req.body?.lang === 'string' ? req.body.lang : '';
    if (explicit === 'ko' || explicit === 'en') return explicit;
    return /^ko\b/i.test(req.get('accept-language') ?? '') ? 'ko' : 'en';
};

/** 단축어가 보내는 파일명은 비어 있거나 경로가 섞일 수 있어 정리한다 */
const safeOriginalName = (name: string | undefined, index: number): string => {
    // multer는 파일명을 latin1로 읽는다. 한글 파일명을 되살린다
    let n = name ?? '';
    try { n = Buffer.from(n, 'latin1').toString('utf8'); } catch { /* 그대로 */ }
    n = n.split(/[\\/]/).pop()?.trim() ?? '';
    return n || `shared-${index + 1}`;
};

export const registerQuickSendRoutes = (app: Express, deps: QuickSendDeps): void => {
    const now = deps.now ?? Date.now;
    const textQueue = deps.textQueue ?? getTextQueue();
    const buckets = new Map<string, TokenBucket>();

    const upload = multer({
        storage: multer.diskStorage({
            destination: tmpdir(),
            filename: (_req, _file, cb) => cb(null, `qs-${randomBytes(8).toString('hex')}`),
        }),
        limits: { fileSize: QUICK_SEND_MAX_BYTES, files: QUICK_SEND_MAX_FILES, fields: 10, fieldSize: 128 * 1024 },
    });

    const cleanup = (files: Express.Multer.File[]) =>
        Promise.all(files.map((f) => fsp.unlink(f.path).catch(() => undefined)));

    /** multer 한도 오류를 단축어가 읽을 수 있는 응답으로 바꾼다 */
    const parse = (req: Request, res: Response, next: NextFunction) => {
        upload.array('file', QUICK_SEND_MAX_FILES)(req, res, (err: unknown) => {
            if (!err) { next(); return; }
            const lang = pickLang(req);
            const code = err instanceof multer.MulterError ? err.code : 'UNKNOWN';
            const status = code === 'LIMIT_FILE_SIZE' ? 413 : code === 'LIMIT_FILE_COUNT' ? 413 : 400;
            const message = code === 'LIMIT_FILE_SIZE' ? MESSAGES[lang].tooLarge
                : code === 'LIMIT_FILE_COUNT' ? MESSAGES[lang].tooMany
                : MESSAGES[lang].failed;
            const files = Array.isArray(req.files) ? req.files : [];
            void cleanup(files);
            res.status(status).json({ ok: false, code, message });
        });
    };

    app.post('/api/quick-send', parse, async (req: Request, res: Response) => {
        const lang = pickLang(req);
        const M = MESSAGES[lang];
        const files = (Array.isArray(req.files) ? req.files : []) as Express.Multer.File[];
        let quotaHold: { key: string; bytes: number } | null = null;
        try {
            const text = typeof req.body?.text === 'string' ? req.body.text : '';
            const hasText = text.trim().length > 0;
            if (files.length === 0 && !hasText) {
                res.status(400).json({ ok: false, code: 'EMPTY', message: M.empty });
                return;
            }

            const ip = extractClientIp({ headers: req.headers, address: req.socket.remoteAddress });
            if (!ip) {
                res.status(400).json({ ok: false, code: 'NO_IP', message: M.noIp });
                return;
            }
            const secret = process.env.ROOM_ID_SECRET || 'dev-insecure-secret';
            const roomId = deriveIpRoomId(ip, secret);

            let bucket = buckets.get(roomId);
            if (!bucket) { bucket = new TokenBucket(BUCKET_CAPACITY, BUCKET_REFILL_PER_SEC, now); buckets.set(roomId, bucket); }
            if (!bucket.tryConsume()) {
                res.status(429).json({ ok: false, code: 'RATE_LIMITED', message: M.rate });
                return;
            }

            const deviceLabel = DEVICE_LABELS[String(req.body?.device ?? '').toLowerCase()] ?? 'unknown';
            // 이름표(identity)가 없으므로 받는 쪽 도착 알림은 model 이름("iPhone")으로 표시된다
            const model = deviceLabel === 'iphone' ? 'iPhone' : deviceLabel === 'ipad' ? 'iPad' : undefined;
            const sender: Sender = { socketId: `shortcut-${randomBytes(4).toString('hex')}`, deviceLabel, browser: 'Shortcuts', ...(model ? { model } : {}) };

            if (files.length > 0) {
                const sizes = files.map((f) => f.size);
                for (const s of sizes) {
                    if (checkFileSize(s, { singlePut: true })) {
                        res.status(413).json({ ok: false, code: 'FILE_TOO_LARGE', message: M.tooLarge });
                        return;
                    }
                }
                const total = sizes.reduce((a, b) => a + b, 0);
                const r2 = deps.getR2Service();
                const current = await r2.getRoomTotalSize(roomId);
                if (checkRoomSize(current + reservedBytesForRoom(roomId), total)) {
                    res.status(413).json({ ok: false, code: 'ROOM_FULL', message: M.roomFull });
                    return;
                }
                const key = quotaKeyFromRequest(req);
                const quota = reserveDailyQuota(key, total);
                if (!quota.ok) {
                    res.status(429).json({ ok: false, code: 'DAILY_QUOTA', message: M.quota });
                    return;
                }
                quotaHold = { key, bytes: total };

                for (let i = 0; i < files.length; i++) {
                    const f = files[i];
                    const generated = r2.generateFileName(safeOriginalName(f.originalname, i));
                    const result = await r2.uploadFileStream(roomId, generated, createReadStream(f.path), f.size, f.mimetype || 'application/octet-stream');
                    recordUploader(roomId, result.fileName, sender);
                    deps.io.to(roomId).emit('message', {
                        type: 'file-uploaded',
                        fileName: result.fileName,
                        url: result.fileUrl,
                        size: f.size,
                        created: new Date(now()).toISOString(),
                        roomId,
                        sender,
                    });
                }
                quotaHold = null;
            }

            if (hasText) {
                const msg = {
                    type: 'text-shared',
                    textId: `qs${now().toString(36)}${randomBytes(4).toString('hex')}`,
                    timestamp: now(),
                    roomId,
                    content: text,
                };
                const r = textQueue.offer(msg, roomId, sender, { sid: sender.socketId, net: roomId });
                deps.io.to(roomId).emit('message', relayTextShared({ ...msg, sender }, r.stored ? r.entry : null));
            }

            const receivers = deps.countUsers(roomId);
            const what = files.length > 0 && hasText ? M.both(files.length) : files.length > 0 ? M.files(files.length) : M.text;
            logger.info(`[QuickSend] ${roomId} files=${files.length} text=${hasText} receivers=${receivers}`);
            res.json({ ok: true, files: files.length, text: hasText, receivers, message: M.sent(what, receivers) });
        } catch (error) {
            if (quotaHold) releaseDailyQuota(quotaHold.key, quotaHold.bytes);
            logger.error('[QuickSend] 오류:', error);
            res.status(500).json({ ok: false, code: 'FAILED', message: M.failed });
        } finally {
            await cleanup(files);
        }
    });
};
