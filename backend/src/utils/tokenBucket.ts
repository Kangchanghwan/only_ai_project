/** 간단한 토큰버킷: capacity만큼 버스트 허용, refillPerSec 속도로 충전 */
export class TokenBucket {
    private tokens: number;
    private last: number;

    constructor(
        private readonly capacity: number,
        private readonly refillPerSec: number,
        private readonly now: () => number = Date.now
    ) {
        this.tokens = capacity;
        this.last = now();
    }

    /** 토큰 1개 소비 시도. 성공하면 true */
    tryConsume(): boolean {
        const t = this.now();
        const elapsedSec = Math.max(0, (t - this.last) / 1000);
        this.last = t;
        this.tokens = Math.min(this.capacity, this.tokens + elapsedSec * this.refillPerSec);
        if (this.tokens < 1) return false;
        this.tokens -= 1;
        return true;
    }
}
