import { getR2Service } from './r2Service';
import logger from '../utils/logger';

/**
 * 파일 삭제 결과 인터페이스
 */
export interface DeleteResult {
    success: boolean;
    deletedCount: number;
    error?: string;
}

/**
 * Cloudflare R2 Storage 관리 서비스
 * - 방 폴더의 파일 삭제
 */
export class StorageService {
    /**
     * 특정 방 번호의 모든 파일을 삭제합니다.
     * @param roomNr - 방 번호 (예: 123456)
     * @returns 삭제 결과
     */
    async deleteRoomFiles(roomNr: number): Promise<DeleteResult> {
        try {
            const r2Service = getR2Service();
            const roomId = String(roomNr);

            const deletedCount = await r2Service.deleteAllFiles(roomId);

            logger.log(`Successfully deleted ${deletedCount} files for room ${roomNr}`);
            return {
                success: true,
                deletedCount
            };

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            logger.error(`Unexpected error deleting files for room ${roomNr}:`, error);
            return {
                success: false,
                deletedCount: 0,
                error: errorMessage
            };
        }
    }
}
