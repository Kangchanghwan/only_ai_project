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
   * 파일명을 정리합니다 (원본 파일명 유지, URL-safe 처리)
   */
  sanitizeFileName(originalFileName: string): string {
    if (!originalFileName || typeof originalFileName !== 'string') {
      return 'unnamed_file';
    }

    // 확장자 분리
    let baseName = originalFileName;
    let extension = '';
    const lastDot = originalFileName.lastIndexOf('.');
    if (lastDot !== -1 && lastDot !== 0) {
      baseName = originalFileName.slice(0, lastDot);
      extension = originalFileName.slice(lastDot);
    } else if (lastDot === 0) {
      // .jpg 같은 경우 (확장자만 있는 경우)
      extension = originalFileName;
      baseName = '';
    }

    // 공백, 탭, 줄바꿈을 언더스코어로 변환
    let sanitized = baseName.replace(/\s+/g, '_');

    // URL-safe 문자만 허용 (영문, 숫자, 한글, 점, 하이픈, 언더스코어)
    // Unicode property escape를 사용하여 한글을 안정적으로 매칭
    sanitized = sanitized.replace(/[^a-zA-Z0-9\p{Script=Hangul}._-]/gu, '');

    // 빈 문자열이면 기본값 사용
    if (!sanitized) {
      sanitized = 'unnamed_file';
    }

    // 파일명 길이 제한 (확장자 포함 255자)
    const maxBaseLength = 255 - extension.length;
    if (sanitized.length > maxBaseLength) {
      sanitized = sanitized.slice(0, maxBaseLength);
    }

    return sanitized + extension;
  }

  /**
   * 파일명을 생성합니다 (하위 호환성을 위해 유지)
   * @deprecated sanitizeFileName을 사용하세요
   */
  generateFileName(originalFileName: string): string {
    return this.sanitizeFileName(originalFileName);
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
