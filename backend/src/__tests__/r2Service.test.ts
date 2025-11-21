import { R2Service } from '../services/r2Service';

// R2Service의 sanitizeFileName 메서드만 테스트
// (전체 서비스는 R2 연결이 필요하므로 단위 테스트만 수행)

describe('R2Service - sanitizeFileName', () => {
  let r2Service: R2Service;

  beforeAll(() => {
    // 환경 변수 설정 (테스트용)
    process.env.R2_ACCOUNT_ID = 'test-account';
    process.env.R2_ACCESS_KEY_ID = 'test-key';
    process.env.R2_SECRET_ACCESS_KEY = 'test-secret';
    process.env.R2_BUCKET_NAME = 'test-bucket';
    process.env.R2_PUBLIC_URL = 'https://test.com';
  });

  beforeEach(() => {
    r2Service = new R2Service();
  });

  describe('기본 파일명 처리', () => {
    it('일반 영문 파일명은 그대로 유지해야 한다', () => {
      const result = r2Service.sanitizeFileName('photo.jpg');
      expect(result).toBe('photo.jpg');
    });

    it('확장자가 없는 파일명도 처리해야 한다', () => {
      const result = r2Service.sanitizeFileName('README');
      expect(result).toBe('README');
    });

    it('여러 개의 점이 있는 파일명도 처리해야 한다', () => {
      const result = r2Service.sanitizeFileName('my.file.name.jpg');
      expect(result).toBe('my.file.name.jpg');
    });
  });

  describe('공백 처리', () => {
    it('공백은 언더스코어로 변환해야 한다', () => {
      const result = r2Service.sanitizeFileName('my photo.jpg');
      expect(result).toBe('my_photo.jpg');
    });

    it('여러 공백은 하나의 언더스코어로 변환해야 한다', () => {
      const result = r2Service.sanitizeFileName('my   photo   file.jpg');
      expect(result).toBe('my_photo_file.jpg');
    });

    it('탭과 줄바꿈도 언더스코어로 변환해야 한다', () => {
      const result = r2Service.sanitizeFileName('my\tphoto\nfile.jpg');
      expect(result).toBe('my_photo_file.jpg');
    });
  });

  describe('한글 파일명', () => {
    it('한글 파일명을 지원해야 한다', () => {
      const result = r2Service.sanitizeFileName('사진.jpg');
      expect(result).toBe('사진.jpg');
    });

    it('한글과 영문 혼합 파일명을 지원해야 한다', () => {
      const result = r2Service.sanitizeFileName('my사진file.jpg');
      expect(result).toBe('my사진file.jpg');
    });
  });

  describe('특수문자 처리', () => {
    it('URL-unsafe 특수문자를 제거해야 한다', () => {
      const result = r2Service.sanitizeFileName('file@#$%^&*().jpg');
      expect(result).toBe('file.jpg');
    });

    it('하이픈과 언더스코어는 유지해야 한다', () => {
      const result = r2Service.sanitizeFileName('my-file_name.jpg');
      expect(result).toBe('my-file_name.jpg');
    });

    it('괄호와 대괄호를 제거해야 한다', () => {
      const result = r2Service.sanitizeFileName('file(1)[2].jpg');
      expect(result).toBe('file12.jpg');
    });

    it('느낌표와 물음표를 제거해야 한다', () => {
      const result = r2Service.sanitizeFileName('what!is?this.jpg');
      expect(result).toBe('whatisthis.jpg');
    });
  });

  describe('엣지 케이스', () => {
    it('빈 문자열은 default 파일명을 반환해야 한다', () => {
      const result = r2Service.sanitizeFileName('');
      expect(result).toBe('unnamed_file');
    });

    it('특수문자만 있는 파일명은 default를 반환해야 한다', () => {
      const result = r2Service.sanitizeFileName('@#$%.jpg');
      expect(result).toBe('unnamed_file.jpg');
    });

    it('매우 긴 파일명을 적절히 처리해야 한다', () => {
      const longName = 'a'.repeat(300) + '.jpg';
      const result = r2Service.sanitizeFileName(longName);
      // 파일명 길이 제한 (예: 200자)
      expect(result.length).toBeLessThanOrEqual(255);
    });

    it('확장자만 있는 경우를 처리해야 한다', () => {
      const result = r2Service.sanitizeFileName('.jpg');
      expect(result).toBe('unnamed_file.jpg');
    });
  });
});
