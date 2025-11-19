import { supabase, BUCKET_NAME } from '../config/supabase';
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
 * Supabase Storage 관리 서비스
 * - 방 폴더의 파일 삭제
 */
export class StorageService {
    private readonly MAX_DELETE_BATCH = 1000; // Supabase 한 번에 최대 1000개 삭제 가능

    /**
     * 특정 방 번호의 모든 파일을 삭제합니다.
     * @param roomNr - 방 번호 (예: 123456)
     * @returns 삭제 결과
     */
    async deleteRoomFiles(roomNr: number): Promise<DeleteResult> {
        try {
            // Supabase가 설정되지 않은 경우
            if (!supabase) {
                logger.warn(`Supabase not configured. Skipping file deletion for room ${roomNr}`);
                return {
                    success: false,
                    deletedCount: 0,
                    error: 'Supabase not configured'
                };
            }

            const folderPath = `${roomNr}`;

            // 1. 방 폴더의 모든 파일 목록 조회
            const { data: files, error: listError } = await supabase.storage
                .from(BUCKET_NAME)
                .list(folderPath);

            if (listError) {
                logger.error(`Failed to list files for room ${roomNr}:`, listError);
                return {
                    success: false,
                    deletedCount: 0,
                    error: listError.message
                };
            }

            // 파일이 없는 경우
            if (!files || files.length === 0) {
                logger.log(`No files to delete for room ${roomNr}`);
                return {
                    success: true,
                    deletedCount: 0
                };
            }

            // 2. 파일 경로 목록 생성 (폴더명/파일명)
            const filePaths = files.map(file => `${folderPath}/${file.name}`);

            // 3. 1000개씩 배치로 나누어 삭제 (Supabase 제한)
            let totalDeleted = 0;
            for (let i = 0; i < filePaths.length; i += this.MAX_DELETE_BATCH) {
                const batch = filePaths.slice(i, i + this.MAX_DELETE_BATCH);

                const { error: deleteError } = await supabase.storage
                    .from(BUCKET_NAME)
                    .remove(batch);

                if (deleteError) {
                    logger.error(`Failed to delete batch for room ${roomNr}:`, deleteError);
                    return {
                        success: false,
                        deletedCount: totalDeleted,
                        error: deleteError.message
                    };
                }

                totalDeleted += batch.length;
            }

            logger.log(`Successfully deleted ${totalDeleted} files for room ${roomNr}`);
            return {
                success: true,
                deletedCount: totalDeleted
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
