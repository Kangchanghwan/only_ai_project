import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import logger from '../utils/logger';

/**
 * Cloudflare R2 서비스
 *
 * S3 호환 API를 사용하여 R2와 상호작용합니다.
 * Presigned URL을 생성하여 프론트엔드에서 직접 업로드할 수 있게 합니다.
 * 다운로드는 퍼블릭 URL을 통해 직접 접근합니다.
 */
class R2Service {
  private client: S3Client;
  private bucketName: string;
  private publicUrl: string;

  constructor() {
    const accountId = process.env.R2_ACCOUNT_ID;
    const accessKeyId = process.env.R2_ACCESS_KEY_ID;
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
    const bucketName = process.env.R2_BUCKET_NAME;
    const publicUrl = process.env.R2_PUBLIC_URL;

    if (!accountId || !accessKeyId || !secretAccessKey || !bucketName || !publicUrl) {
      throw new Error('R2 환경 변수가 설정되지 않았습니다');
    }

    this.client = new S3Client({
      region: 'auto',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });

    this.bucketName = bucketName;
    this.publicUrl = publicUrl;
  }

  /**
   * 파일명을 생성합니다
   */
  generateFileName(originalFileName: string): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);

    let extension = '';
    if (originalFileName && typeof originalFileName === 'string') {
      const lastDot = originalFileName.lastIndexOf('.');
      if (lastDot !== -1) {
        extension = originalFileName.slice(lastDot);
      }
    }

    return `${timestamp}_${random}${extension}`;
  }

  /**
   * 파일의 공개 URL을 생성합니다
   */
  getFileUrl(roomId: string, fileName: string): string {
    return `${this.publicUrl}/${roomId}/${fileName}`;
  }

  /**
   * 업로드용 Presigned URL을 생성합니다
   */
  async getUploadPresignedUrl(
    roomId: string,
    fileName: string,
    contentType: string,
    expiresIn: number = 3600
  ): Promise<{ uploadUrl: string; fileUrl: string; fileName: string }> {
    const key = `${roomId}/${fileName}`;

    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      ContentType: contentType,
    });

    const uploadUrl = await getSignedUrl(this.client, command, { expiresIn });

    logger.info(`[R2Service] 업로드 Presigned URL 생성: ${key}`);

    return {
      uploadUrl,
      fileUrl: this.getFileUrl(roomId, fileName),
      fileName,
    };
  }

  /**
   * 특정 룸의 파일 목록을 불러옵니다
   */
  async loadFiles(
    roomId: string,
    options: { limit?: number; continuationToken?: string } = {}
  ): Promise<{
    files: Array<{
      name: string;
      url: string;
      size: number;
      lastModified: string;
    }>;
    nextToken?: string;
  }> {
    const { limit = 100, continuationToken } = options;

    logger.info(`[R2Service] 파일 로드 시작: ${roomId}`);

    const command = new ListObjectsV2Command({
      Bucket: this.bucketName,
      Prefix: `${roomId}/`,
      MaxKeys: limit,
      ContinuationToken: continuationToken,
    });

    const response = await this.client.send(command);

    const files = (response.Contents || [])
      .filter((obj) => obj.Key && !obj.Key.endsWith('/'))
      .map((obj) => {
        const fileName = obj.Key!.split('/').pop()!;
        return {
          name: fileName,
          url: this.getFileUrl(roomId, fileName),
          size: obj.Size || 0,
          lastModified: obj.LastModified?.toISOString() || new Date().toISOString(),
        };
      });

    logger.info(`[R2Service] 파일 로드 완료: ${files.length}개`);

    return {
      files,
      nextToken: response.NextContinuationToken,
    };
  }

  /**
   * 파일을 직접 업로드합니다 (서버를 통한 업로드)
   */
  async uploadFile(
    roomId: string,
    fileName: string,
    buffer: Buffer,
    contentType: string
  ): Promise<{ fileUrl: string; fileName: string }> {
    const key = `${roomId}/${fileName}`;

    logger.info(`[R2Service] 직접 업로드 시작: ${key}, 크기: ${buffer.length} bytes`);

    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    });

    await this.client.send(command);

    logger.info(`[R2Service] 직접 업로드 완료: ${key}`);

    return {
      fileUrl: this.getFileUrl(roomId, fileName),
      fileName,
    };
  }

  /**
   * 파일을 삭제합니다
   */
  async deleteFile(roomId: string, fileName: string): Promise<void> {
    const key = `${roomId}/${fileName}`;

    logger.info(`[R2Service] 파일 삭제 시작: ${key}`);

    const command = new DeleteObjectCommand({
      Bucket: this.bucketName,
      Key: key,
    });

    await this.client.send(command);

    logger.info(`[R2Service] 파일 삭제 완료: ${key}`);
  }

  /**
   * 룸의 모든 파일을 삭제합니다
   */
  async deleteAllFiles(roomId: string): Promise<number> {
    logger.info(`[R2Service] 룸 전체 파일 삭제 시작: ${roomId}`);

    // 먼저 파일 목록을 가져옴
    const { files } = await this.loadFiles(roomId, { limit: 1000 });

    if (files.length === 0) {
      logger.info(`[R2Service] 삭제할 파일이 없습니다`);
      return 0;
    }

    // 파일 키 목록 생성
    const objects = files.map((file) => ({
      Key: `${roomId}/${file.name}`,
    }));

    const command = new DeleteObjectsCommand({
      Bucket: this.bucketName,
      Delete: {
        Objects: objects,
        Quiet: true,
      },
    });

    await this.client.send(command);

    logger.info(`[R2Service] 전체 삭제 완료: ${files.length}개 파일`);

    return files.length;
  }

  /**
   * 룸의 총 파일 용량을 바이트 단위로 반환합니다
   */
  async getRoomTotalSize(roomId: string): Promise<number> {
    logger.info(`[R2Service] 룸 총 용량 조회 시작: ${roomId}`);

    const { files } = await this.loadFiles(roomId, { limit: 1000 });

    const totalSize = files.reduce((sum, file) => sum + file.size, 0);

    logger.info(`[R2Service] 룸 총 용량: ${totalSize} bytes`);

    return totalSize;
  }
}

// 싱글톤 인스턴스
let r2ServiceInstance: R2Service | null = null;

export const getR2Service = (): R2Service => {
  if (!r2ServiceInstance) {
    r2ServiceInstance = new R2Service();
  }
  return r2ServiceInstance;
};

export { R2Service };
