import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectsCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import logger from '../utils/logger';

/** 썸네일 객체 프리픽스 (룸 프리픽스 밖에 두어 목록 API에 노출되지 않게 한다) */
const THUMB_PREFIX = 'thumbs';
/** 썸네일 MIME 타입 (JPEG: 모든 브라우저 canvas가 인코딩 가능) */
const THUMB_CONTENT_TYPE = 'image/jpeg';
/** S3 DeleteObjects 한 번에 삭제 가능한 최대 키 수 */
const DELETE_BATCH_SIZE = 1000;

/** 배치 presign 요청 항목 */
export interface UploadRequest {
  fileName: string;
  contentType: string;
}

/** 배치 presign 응답 항목 */
export interface UploadTarget {
  uploadUrl: string;
  fileUrl: string;
  fileName: string;
  thumbUploadUrl?: string;
  thumbUrl?: string;
}

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

  /** 썸네일 객체 키 (thumbs/{roomId}/{fileName}.jpg) */
  getThumbKey(roomId: string, fileName: string): string {
    return `${THUMB_PREFIX}/${roomId}/${fileName}.jpg`;
  }

  /** 썸네일 공개 URL */
  getThumbUrl(roomId: string, fileName: string): string {
    return `${this.publicUrl}/${this.getThumbKey(roomId, fileName)}`;
  }

  /**
   * 여러 파일의 업로드 Presigned URL을 한 번에 생성합니다.
   * 이미지(image/*)에는 썸네일 업로드 URL(image/jpeg)을 함께 돌려줍니다.
   */
  async getUploadPresignedUrls(
    roomId: string,
    files: UploadRequest[],
    expiresIn: number = 3600
  ): Promise<UploadTarget[]> {
    return Promise.all(
      files.map(async ({ fileName, contentType }) => {
        const safeName = this.sanitizeFileName(fileName);
        const target: UploadTarget = await this.getUploadPresignedUrl(roomId, safeName, contentType, expiresIn);

        if (contentType.startsWith('image/')) {
          const thumbCommand = new PutObjectCommand({
            Bucket: this.bucketName,
            Key: this.getThumbKey(roomId, safeName),
            ContentType: THUMB_CONTENT_TYPE,
          });
          target.thumbUploadUrl = await getSignedUrl(this.client, thumbCommand, { expiresIn });
          target.thumbUrl = this.getThumbUrl(roomId, safeName);
        }

        return target;
      })
    );
  }

  /**
   * 브라우저가 네이티브로 다운로드하도록 Content-Disposition: attachment가 서명된
   * 다운로드용 Presigned URL을 생성합니다 (기존 객체에도 동작).
   */
  async getDownloadPresignedUrl(
    roomId: string,
    fileName: string,
    expiresIn: number = 600
  ): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: `${roomId}/${fileName}`,
      ResponseContentDisposition: `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    });

    return getSignedUrl(this.client, command, { expiresIn });
  }

  /** 프리픽스 아래 모든 객체 키를 페이지네이션을 따라 전부 수집합니다 */
  private async listAllKeys(prefix: string): Promise<string[]> {
    const keys: string[] = [];
    let continuationToken: string | undefined;

    do {
      const response = await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.bucketName,
          Prefix: prefix,
          ContinuationToken: continuationToken,
        })
      );
      for (const obj of response.Contents || []) {
        if (obj.Key && !obj.Key.endsWith('/')) {
          keys.push(obj.Key);
        }
      }
      continuationToken = response.NextContinuationToken;
    } while (continuationToken);

    return keys;
  }

  /** 키 목록을 DeleteObjects 최대 크기 단위로 나눠 삭제합니다 */
  private async deleteKeys(keys: string[]): Promise<void> {
    for (let i = 0; i < keys.length; i += DELETE_BATCH_SIZE) {
      const chunk = keys.slice(i, i + DELETE_BATCH_SIZE);
      await this.client.send(
        new DeleteObjectsCommand({
          Bucket: this.bucketName,
          Delete: { Objects: chunk.map((Key) => ({ Key })), Quiet: true },
        })
      );
    }
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
   * 파일을 삭제합니다 (원본과 썸네일을 한 번의 요청으로 함께 삭제)
   */
  async deleteFile(roomId: string, fileName: string): Promise<void> {
    const key = `${roomId}/${fileName}`;

    logger.info(`[R2Service] 파일 삭제 시작: ${key}`);

    await this.deleteKeys([key, this.getThumbKey(roomId, fileName)]);

    logger.info(`[R2Service] 파일 삭제 완료: ${key}`);
  }

  /**
   * 룸의 모든 파일(과 썸네일)을 삭제합니다. 반환값은 삭제된 원본 파일 수입니다.
   */
  async deleteAllFiles(roomId: string): Promise<number> {
    logger.info(`[R2Service] 룸 전체 파일 삭제 시작: ${roomId}`);

    const [fileKeys, thumbKeys] = await Promise.all([
      this.listAllKeys(`${roomId}/`),
      this.listAllKeys(`${THUMB_PREFIX}/${roomId}/`),
    ]);

    if (fileKeys.length === 0 && thumbKeys.length === 0) {
      logger.info(`[R2Service] 삭제할 파일이 없습니다`);
      return 0;
    }

    await this.deleteKeys([...fileKeys, ...thumbKeys]);

    logger.info(`[R2Service] 전체 삭제 완료: ${fileKeys.length}개 파일, ${thumbKeys.length}개 썸네일`);

    return fileKeys.length;
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
