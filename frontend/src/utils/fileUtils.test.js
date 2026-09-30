import { describe, it, expect } from 'vitest'
import { formatFileSize, getFileIcon, getFileType, formatUploadTime } from './fileUtils'

describe('fileUtils', () => {
  describe('파일 크기 포맷팅', () => {
    it('바이트를 B로 표시해야 한다', () => {
      expect(formatFileSize(0)).toBe('0 B')
      expect(formatFileSize(100)).toBe('100 B')
      expect(formatFileSize(1023)).toBe('1023 B')
    })

    it('킬로바이트를 KB로 표시해야 한다', () => {
      expect(formatFileSize(1024)).toBe('1.0 KB')
      expect(formatFileSize(1536)).toBe('1.5 KB')
      expect(formatFileSize(10240)).toBe('10.0 KB')
      expect(formatFileSize(1048575)).toBe('1024.0 KB')
    })

    it('메가바이트를 MB로 표시해야 한다', () => {
      expect(formatFileSize(1048576)).toBe('1.0 MB')
      expect(formatFileSize(5242880)).toBe('5.0 MB')
      expect(formatFileSize(10485760)).toBe('10.0 MB')
      expect(formatFileSize(1073741823)).toBe('1024.0 MB')
    })

    it('기가바이트를 GB로 표시해야 한다', () => {
      expect(formatFileSize(1073741824)).toBe('1.0 GB')
      expect(formatFileSize(5368709120)).toBe('5.0 GB')
    })

    it('undefined나 null을 처리해야 한다', () => {
      expect(formatFileSize(undefined)).toBe('0 B')
      expect(formatFileSize(null)).toBe('0 B')
    })

    it('음수를 처리해야 한다', () => {
      expect(formatFileSize(-100)).toBe('0 B')
    })

    it('소수점 한 자리로 반올림해야 한다', () => {
      expect(formatFileSize(1536)).toBe('1.5 KB')
      expect(formatFileSize(1587)).toBe('1.5 KB') // 1.549... -> 1.5
      expect(formatFileSize(1638)).toBe('1.6 KB') // 1.599... -> 1.6
    })
  })

  describe('파일 타입 감지', () => {
    it('이미지 파일 타입을 감지해야 한다', () => {
      expect(getFileType('photo.jpg')).toBe('image')
      expect(getFileType('picture.jpeg')).toBe('image')
      expect(getFileType('logo.png')).toBe('image')
      expect(getFileType('icon.gif')).toBe('image')
      expect(getFileType('photo.webp')).toBe('image')
      expect(getFileType('image.bmp')).toBe('image')
      expect(getFileType('vector.svg')).toBe('image')
    })

    it('비디오 파일 타입을 감지해야 한다', () => {
      expect(getFileType('movie.mp4')).toBe('video')
      expect(getFileType('clip.avi')).toBe('video')
      expect(getFileType('video.mov')).toBe('video')
      expect(getFileType('film.wmv')).toBe('video')
      expect(getFileType('stream.webm')).toBe('video')
      expect(getFileType('recording.mkv')).toBe('video')
    })

    it('오디오 파일 타입을 감지해야 한다', () => {
      expect(getFileType('song.mp3')).toBe('audio')
      expect(getFileType('music.wav')).toBe('audio')
      expect(getFileType('audio.ogg')).toBe('audio')
      expect(getFileType('track.m4a')).toBe('audio')
      expect(getFileType('sound.flac')).toBe('audio')
    })

    it('문서 파일 타입을 감지해야 한다', () => {
      expect(getFileType('document.pdf')).toBe('document')
      expect(getFileType('report.doc')).toBe('document')
      expect(getFileType('paper.docx')).toBe('document')
      expect(getFileType('sheet.xls')).toBe('document')
      expect(getFileType('data.xlsx')).toBe('document')
      expect(getFileType('slides.ppt')).toBe('document')
      expect(getFileType('presentation.pptx')).toBe('document')
      expect(getFileType('note.txt')).toBe('document')
    })

    it('압축 파일 타입을 감지해야 한다', () => {
      expect(getFileType('archive.zip')).toBe('archive')
      expect(getFileType('package.rar')).toBe('archive')
      expect(getFileType('compressed.7z')).toBe('archive')
      expect(getFileType('tarball.tar')).toBe('archive')
      expect(getFileType('gzipped.gz')).toBe('archive')
    })

    it('코드 파일 타입을 감지해야 한다', () => {
      expect(getFileType('script.js')).toBe('code')
      expect(getFileType('component.jsx')).toBe('code')
      expect(getFileType('app.ts')).toBe('code')
      expect(getFileType('page.tsx')).toBe('code')
      expect(getFileType('style.css')).toBe('code')
      expect(getFileType('markup.html')).toBe('code')
      expect(getFileType('data.json')).toBe('code')
      expect(getFileType('server.py')).toBe('code')
      expect(getFileType('Main.java')).toBe('code')
    })

    it('알 수 없는 파일 타입을 처리해야 한다', () => {
      expect(getFileType('unknown.xyz')).toBe('file')
      expect(getFileType('noextension')).toBe('file')
      expect(getFileType('')).toBe('file')
    })

    it('대소문자를 구분하지 않아야 한다', () => {
      expect(getFileType('PHOTO.JPG')).toBe('image')
      expect(getFileType('Document.PDF')).toBe('document')
      expect(getFileType('Script.JS')).toBe('code')
    })

    it('파일명이 null이나 undefined일 때 처리해야 한다', () => {
      expect(getFileType(null)).toBe('file')
      expect(getFileType(undefined)).toBe('file')
    })
  })

  describe('파일 타입 아이콘', () => {
    it('이미지 파일 아이콘을 반환해야 한다', () => {
      expect(getFileIcon('photo.jpg')).toBe('🖼️')
      expect(getFileIcon('picture.png')).toBe('🖼️')
    })

    it('비디오 파일 아이콘을 반환해야 한다', () => {
      expect(getFileIcon('movie.mp4')).toBe('🎬')
      expect(getFileIcon('clip.avi')).toBe('🎬')
    })

    it('오디오 파일 아이콘을 반환해야 한다', () => {
      expect(getFileIcon('song.mp3')).toBe('🎵')
      expect(getFileIcon('music.wav')).toBe('🎵')
    })

    it('문서 파일 아이콘을 반환해야 한다', () => {
      expect(getFileIcon('document.pdf')).toBe('📄')
      expect(getFileIcon('report.docx')).toBe('📄')
    })

    it('압축 파일 아이콘을 반환해야 한다', () => {
      expect(getFileIcon('archive.zip')).toBe('📦')
      expect(getFileIcon('package.rar')).toBe('📦')
    })

    it('코드 파일 아이콘을 반환해야 한다', () => {
      expect(getFileIcon('script.js')).toBe('💻')
      expect(getFileIcon('app.py')).toBe('💻')
    })

    it('알 수 없는 파일 아이콘을 반환해야 한다', () => {
      expect(getFileIcon('unknown.xyz')).toBe('📁')
      expect(getFileIcon('noextension')).toBe('📁')
    })
  })

  describe('업로드 시간 포맷팅', () => {
    it('10초 미만은 지금으로 표시해야 한다', () => {
      const now = new Date()
      expect(formatUploadTime(now.toISOString())).toBe('지금')
    })

    it('초 단위를 표시해야 한다', () => {
      const past = new Date(Date.now() - 30 * 1000) // 30초 전
      expect(formatUploadTime(past.toISOString())).toBe('30초 전')
    })

    it('분 단위를 표시해야 한다', () => {
      const past = new Date(Date.now() - 5 * 60 * 1000) // 5분 전
      expect(formatUploadTime(past.toISOString())).toBe('5분 전')
    })

    it('시간 단위를 표시해야 한다', () => {
      const past = new Date(Date.now() - 3 * 60 * 60 * 1000) // 3시간 전
      expect(formatUploadTime(past.toISOString())).toBe('3시간 전')
    })

    it('하루 이상은 날짜로 표시해야 한다', () => {
      const past = new Date(Date.now() - 25 * 60 * 60 * 1000) // 25시간 전
      const formatted = formatUploadTime(past.toISOString())
      expect(formatted).toMatch(/\d{4}\.\s\d{1,2}\.\s\d{1,2}\./)
    })

    it('null이나 undefined를 처리해야 한다', () => {
      expect(formatUploadTime(null)).toBe('지금')
      expect(formatUploadTime(undefined)).toBe('지금')
    })

    it('잘못된 날짜 형식을 처리해야 한다', () => {
      expect(formatUploadTime('invalid-date')).toBe('지금')
    })
  })
})

describe('formatUploadTime 로케일', () => {
  it('영어 UI에서는 영어 상대시간을 사용한다', async () => {
    const { default: i18n } = await import('../i18n/index.js')
    i18n.global.locale.value = 'en'
    try {
      expect(formatUploadTime(new Date(Date.now() - 5 * 60 * 1000).toISOString())).toBe('5 minutes ago')
      expect(formatUploadTime(new Date().toISOString())).toBe('now')
      expect(formatUploadTime(new Date(Date.now() - 3 * 3600 * 1000).toISOString())).toMatch(/hours ago/)
    } finally {
      i18n.global.locale.value = 'ko'
    }
  })
})
