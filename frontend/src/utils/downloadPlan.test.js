import { describe, it, expect } from 'vitest'
import { planDownload, zipEntryNames, zipFileName, BIG_FILE_BYTES, ZIP_LIMIT_STREAM, ZIP_LIMIT_MEMORY } from './downloadPlan.js'

const MB = 1024 * 1024
const f = (name, mb) => ({ name, roomId: 'room-a', size: Math.round(mb * MB) })
const shape = (plan) => plan.items.map((i) => (i.type === 'zip' ? `zip[${i.files.map((x) => x.name).join(',')}]` : `file:${i.file.name}`))

describe('planDownload', () => {
  it('기준값: 큰 파일 200MB, 묶음 500MB(스트리밍)·300MB(메모리)', () => {
    expect(BIG_FILE_BYTES).toBe(200 * MB)
    expect(ZIP_LIMIT_STREAM).toBe(500 * MB)
    expect(ZIP_LIMIT_MEMORY).toBe(300 * MB)
  })

  it('작은 파일 여러 개는 ZIP 하나', () => {
    expect(shape(planDownload([f('a', 1), f('b', 2), f('c', 3)]))).toEqual(['zip[a,b,c]'])
  })

  it('200MB 넘는 파일은 ZIP에서 빼서 하나씩 (마지막에)', () => {
    expect(shape(planDownload([f('big', 1024), f('a', 1), f('b', 1)]))).toEqual(['zip[a,b]', 'file:big'])
    expect(shape(planDownload([f('edge', 200), f('a', 1)]))).toEqual(['zip[edge,a]'])
  })

  it('작은 파일이 1개만 남으면 ZIP으로 만들지 않는다', () => {
    expect(shape(planDownload([f('a', 1), f('big', 300)]))).toEqual(['file:a', 'file:big'])
    expect(shape(planDownload([f('only', 1)]))).toEqual(['file:only'])
  })

  it('묶음 한도를 넘으면 선택 순서대로 나눈다 (메모리 방식은 300MB)', () => {
    const files = [f('a', 150), f('b', 150), f('c', 150), f('d', 150)]
    expect(shape(planDownload(files))).toEqual(['zip[a,b,c]', 'file:d'])
    expect(shape(planDownload(files, { inMemory: true }))).toEqual(['zip[a,b]', 'zip[c,d]'])
  })

  it('크기를 모르는 파일은 하나씩 받는다', () => {
    expect(shape(planDownload([{ name: 'x', roomId: 'r', size: null }, f('a', 1), f('b', 1)]))).toEqual(['zip[a,b]', 'file:x'])
  })

  it('빈 선택은 빈 계획', () => {
    expect(planDownload([]).items).toEqual([])
    expect(planDownload(null).items).toEqual([])
  })
})

describe('zipEntryNames', () => {
  it('같은 이름은 (2), (3) 번호, 대소문자 무시', () => {
    expect(zipEntryNames([{ name: 'a.jpg' }, { name: 'A.jpg' }, { name: 'a.jpg' }, { name: 'b' }, { name: 'b' }]))
      .toEqual(['a.jpg', 'A (2).jpg', 'a (3).jpg', 'b', 'b (2)'])
  })
  it('경로·제어 문자를 지우고 빈 이름은 file', () => {
    expect(zipEntryNames([{ name: '../../etc/passwd' }, { name: 'a\\b:c?.txt' }, { name: '' }, { name: '...' }]))
      .toEqual(['_.._etc_passwd', 'a_b_c_.txt', 'file', 'file (2)'])
  })
})

describe('zipFileName', () => {
  it('날짜·시각, 묶음이 여럿이면 번호', () => {
    const d = new Date(2026, 10, 13, 9, 5)
    expect(zipFileName(d)).toBe('clipboard-share-20261113-0905.zip')
    expect(zipFileName(d, 1, 3)).toBe('clipboard-share-20261113-0905-2.zip')
  })
})
