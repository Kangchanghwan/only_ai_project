import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { readFileSync } from 'node:fs'
import { ref } from 'vue'
import TextItemRow from './TextItemRow.vue'
import i18n from '../i18n/index.js'
import { SENDER_CONTEXT_KEY } from '../utils/senderContext'

const fox = { adj: 1, animal: 1 }
const sender = { socketId: 'me', identity: fox, deviceLabel: 'mac', browser: 'Chrome' }
const provide = { [SENDER_CONTEXT_KEY]: { mySocketId: ref('me'), myIdentity: ref(fox), devices: ref([sender]) } }
const mountRow = (text) => mount(TextItemRow, { props: { text }, global: { plugins: [i18n], provide } })

describe('TextItemRow 받은 텍스트', () => {
  const time = Date.now() - 3 * 60_000
  it('보낸 사람+시간 헤더는 항목당 한 번이고, 복사 버튼은 hover 없이 보인다', async () => {
    const w = mountRow({ id: '1', content: 'hi', timestamp: time, sender })
    const entry = w.find('[data-testid="text-entry"]')
    expect(entry.findAll('[data-testid="sender-label"]')).toHaveLength(1)
    expect(entry.find('[data-testid="text-time"]').exists()).toBe(false)
    expect(entry.text().match(/3분 전/g)).toHaveLength(1)
    const copy = entry.find('[data-testid="text-copy"]')
    expect(copy.classes().join(' ')).not.toContain('opacity-0')
    await copy.trigger('click')
    expect(w.emitted('copy-text')[0]).toEqual(['1'])
  })

  it('삭제는 더보기 메뉴에서 한다', async () => {
    const w = mountRow({ id: '1', content: 'hi', timestamp: time })
    expect(w.find('[data-testid="text-delete"]').exists()).toBe(false)
    await w.find('[data-testid="text-more"]').trigger('click')
    await w.find('[data-testid="text-delete"]').trigger('click')
    expect(w.emitted('remove-text')[0]).toEqual(['1'])
  })

  it('본문은 일반 텍스트로만 렌더링된다 (HTML 주입 없음)', () => {
    const w = mountRow({ id: '1', content: '<img src=x onerror=alert(1)><b>x</b>', timestamp: time })
    expect(w.find('[data-testid="text-title"] img').exists()).toBe(false)
    expect(w.find('[data-testid="text-title"]').text()).toContain('<img src=x')
  })
})


describe('TextItemRow 보관 중·잠긴 텍스트 카드', () => {
  const queued = { id: 'q1', content: '보낸 글', timestamp: 0, roomId: 'r', expiresAt: 1, remainingMs: 8 * 60000 - 1000, canCancel: true }

  it('보관 중이면 남은 시간과 보관 취소 버튼, 누르면 cancel-text', async () => {
    const w = mountRow(queued)
    expect(w.find('[data-testid="text-expires"]').text()).toBe('8분 뒤 삭제')
    await w.find('[data-testid="text-more"]').trigger('click')
    await w.find('[data-testid="text-cancel-keep"]').trigger('click')
    expect(w.emitted('cancel-text')[0]).toEqual(['q1'])
  })

  it('1분 미만은 "곧 삭제", 지울 증명이 없으면 취소 버튼이 없다, 보관 중이 아니면 삭제 시각이 없다', async () => {
    const soon = mountRow({ ...queued, remainingMs: 30000, canCancel: false })
    expect(soon.find('[data-testid="text-expires"]').text()).toBe('곧 삭제')
    await soon.find('[data-testid="text-more"]').trigger('click')
    expect(soon.find('[data-testid="text-cancel-keep"]').exists()).toBe(false)
    const live = mountRow({ ...queued, expiresAt: undefined, remainingMs: 0 })
    expect(live.find('[data-testid="text-expires"]').exists()).toBe(false)
  })

  it('잠긴 텍스트는 내용·복사 없이 "잠긴 텍스트"로만 보이고, 비밀번호로 풀기를 요청한다', async () => {
    const w = mountRow({ id: 'L1', content: null, locked: true, salt: 's', timestamp: 0, roomId: 'r' })
    expect(w.find('[data-testid="text-body"]').exists()).toBe(false)
    expect(w.find('[data-testid="text-copy"]').exists()).toBe(false)
    expect(w.find('[data-testid="text-locked"]').text()).toContain('잠긴 텍스트')

    await w.find('[data-testid="text-unlock-open"]').trigger('click')
    await w.find('[data-testid="text-unlock-password"]').setValue('wrong')
    await w.find('[data-testid="text-unlock-form"]').trigger('submit')
    const [{ id, password, done }] = w.emitted('unlock-text')[0]
    expect({ id, password }).toEqual({ id: 'L1', password: 'wrong' })
    done({ ok: false, code: 'WRONG_PASSWORD', remaining: 3 })
    await w.vm.$nextTick()
    expect(w.find('[data-testid="text-unlock-message"]').text()).toBe('비밀번호가 맞지 않아요 · 남은 시도 3회')

    await w.find('[data-testid="text-unlock-form"]').trigger('submit')
    w.emitted('unlock-text')[1][0].done({ ok: false, code: 'TEXT_NOT_FOUND' })
    await w.vm.$nextTick()
    expect(w.find('[data-testid="text-unlock-message"]').text()).toBe('보관 시간(10분)이 지나 열 수 없어요.')
  })

  it('96KB를 넘어 보관되지 않은 내 텍스트는 지금 열린 기기에만 갔다고 알리고 .txt로 보내기를 제안한다', async () => {
    const w = mountRow({ id: 'big', content: 'x', timestamp: 0, roomId: 'r', notStored: 'TOO_LARGE' })
    expect(w.find('[data-testid="text-not-kept"]').text()).toContain('96KB가 넘어 보관하지 않았어요 · 지금 열린 기기에만 전달됐어요')
    await w.find('[data-testid="text-send-as-file"]').trigger('click')
    expect(w.emitted('send-as-file')[0]).toEqual(['big'])
    const full = mountRow({ id: 'f', content: 'x', timestamp: 0, roomId: 'r', notStored: 'FULL' })
    expect(full.find('[data-testid="text-not-kept"]').text()).toContain('서버 보관함이 가득 차')
    expect(full.find('[data-testid="text-send-as-file"]').exists()).toBe(false)
  })

  it('풀린 잠긴 텍스트는 일반 카드처럼 내용과 복사 버튼이 보인다', () => {
    const w = mountRow({ id: 'L2', content: '열림', locked: true, salt: 's', timestamp: 0, roomId: 'r' })
    expect(w.find('[data-testid="text-title"]').text()).toBe('열림')
    expect(w.find('[data-testid="text-copy"]').exists()).toBe(true)
  })
})

describe('TextItemRow 행 모양', () => {
  it('"텍스트" 태그, 한 줄 제목(첫 줄), 복사 버튼은 남색 채움', () => {
    const w = mountRow({ id: '1', content: '\n  첫 줄\nb\nc\nd', timestamp: Date.now(), sender })
    expect(w.find('[data-testid="text-tag"]').text()).toBe('텍스트')
    const title = w.find('[data-testid="text-title"]')
    expect(title.text()).toBe('첫 줄')
    expect(title.classes()).toContain('truncate')
    expect(w.find('[data-testid="text-body"]').exists()).toBe(false)
    const copy = w.find('[data-testid="text-copy"]')
    expect(copy.classes()).toContain('bg-ink')
    expect(copy.classes()).toContain('min-h-[44px]')
  })
})

describe('TextItemRow 더보기', () => {
  const multi = { id: 'm', content: 'one\ntwo\n\nfour', timestamp: Date.now() }
  it('여러 줄이면 메타 줄에 "더보기"가 보이고, 한 줄 글에는 없다', () => {
    const more = mountRow(multi).find('[data-testid="text-expand"]')
    expect(more.text()).toContain('더보기')
    expect(more.element.closest('[data-testid="text-meta"]')).not.toBeNull()
    expect(mountRow({ id: 's', content: 'hi', timestamp: Date.now() }).find('[data-testid="text-expand"]').exists()).toBe(false)
    expect(mountRow({ id: 's', content: 'hi\n\n', timestamp: Date.now() }).find('[data-testid="text-expand"]').exists()).toBe(false)
  })
  it('더보기를 누르면 전체 글을 그대로 보여 주고(줄 번호·줄 복사 없음), 글을 눌러도 접히지 않으며 접기로 접는다', async () => {
    const w = mountRow(multi)
    await w.find('[data-testid="text-expand"]').trigger('click')
    const body = w.find('[data-testid="text-body"]')
    expect(body.classes()).toContain('whitespace-pre-wrap')
    expect(body.classes()).toContain('max-h-[60vh]')
    expect(body.text()).toContain('four')
    expect(w.find('[data-testid="text-line-copy"]').exists()).toBe(false)
    await body.trigger('click')
    expect(w.find('[data-testid="text-body"]').exists()).toBe(true)
    await w.find('[data-testid="text-collapse"]').trigger('click')
    expect(w.find('[data-testid="text-body"]').exists()).toBe(false)
    expect(w.emitted('copy-text')).toBeUndefined()
  })
})

describe('TextItemRow 잠금 풀기 포커스', () => {
  it('풀기를 누르면 비밀번호 칸에 포커스가 가고 비밀번호 관리자 무시 속성이 있다', async () => {
    const w = mount(TextItemRow, { props: { text: { id: 'L2', content: null, locked: true, salt: 's', timestamp: 0, roomId: 'r' } }, attachTo: document.body, global: { plugins: [i18n], provide } })
    await w.find('[data-testid="text-unlock-open"]').trigger('click')
    await w.vm.$nextTick()
    const input = w.find('[data-testid="text-unlock-password"]')
    expect(document.activeElement).toBe(input.element)
    expect(input.attributes('data-1p-ignore')).toBeDefined()
    expect(input.attributes('data-lpignore')).toBe('true')
    expect(input.attributes('data-bwignore')).toBeDefined()
    expect(w.find('[role="checkbox"]').exists()).toBe(false)
    w.unmount()
  })
})

describe('TextItemRow 접힌 행은 파일 행과 같은 모양', () => {
  const fileRowClasses = () => {
    const src = readFileSync('src/components/FileCard.vue', 'utf8')
    const m = src.match(/class="group file-row ([^"]+)"/)
    return m[1].split(/\s+/).filter((c) => !['cursor-pointer', 'select-none', 'border'].includes(c) && !c.startsWith('focus-visible'))
  }
  it('루트·컨테이너 클래스가 FileCard 행과 같고 제목은 truncate(여러 줄 줄임 없음), 삭제 시각은 메타 줄 안에 있다', () => {
    const w = mountRow({ id: 'p', content: '첫 줄\n둘째 줄', timestamp: Date.now(), expiresAt: 1, remainingMs: 5 * 60000, canCancel: true, sender })
    const classes = w.find('[data-testid="text-entry"]').classes()
    for (const c of fileRowClasses()) {
      if (c.startsWith('[') || c.startsWith('hover:') || c.includes('{')) continue
      expect(classes).toContain(c)
    }
    expect(classes).toContain('file-row')
    expect(classes).toContain('border-border')
    const title = w.find('[data-testid="text-title"]')
    expect(title.classes()).toContain('truncate')
    expect(w.html()).not.toContain('line-clamp')
    expect(title.classes()).toEqual(expect.arrayContaining(['text-sm', 'font-medium']))
    expect(w.find('[data-testid="text-meta"] [data-testid="text-expires"]').text()).toBe('5분 뒤 삭제')
    expect(w.find('[data-testid="text-queued"]').exists()).toBe(false)
    // 복사/더보기 버튼: FileCard의 받기/더보기와 같은 크기 클래스
    expect(w.find('[data-testid="text-copy"]').classes()).toEqual(expect.arrayContaining(['bg-ink', 'min-h-[44px]', 'min-w-[44px]', 'px-3', 'sm:px-4']))
    expect(w.find('[data-testid="text-more"]').classes()).toEqual(expect.arrayContaining(['w-11', 'h-11', 'border-border', 'bg-background']))
  })
})

describe('TextItemRow 빈 곳 눌러 더보기', () => {
  const multi = { id: 'm', content: '첫 줄\n둘째 줄', timestamp: Date.now() }
  it('체크박스·빈 자리가 없다', () => {
    const w = mountRow(multi)
    expect(w.find('input[type="checkbox"]').exists()).toBe(false)
    expect(w.find('[data-testid="text-spacer"]').exists()).toBe(false)
  })
  it('펼칠 수 있는 행의 빈 곳을 누르면 펼쳐지고 다시 누르면 접힌다', async () => {
    const w = mountRow(multi)
    await w.find('[data-testid="text-entry"]').trigger('click')
    expect(w.find('[data-testid="text-body"]').exists()).toBe(true)
    await w.find('[data-testid="text-entry"]').trigger('click')
    expect(w.find('[data-testid="text-body"]').exists()).toBe(false)
  })
  it('한 줄짜리(펼칠 수 없는) 행은 눌러도 변하지 않는다', async () => {
    const w = mountRow({ id: 's', content: 'hi', timestamp: Date.now() })
    await w.find('[data-testid="text-entry"]').trigger('click')
    expect(w.find('[data-testid="text-body"]').exists()).toBe(false)
  })
  it('펼친 본문 안을 눌러도 접히지 않는다', async () => {
    const w = mountRow(multi)
    await w.find('[data-testid="text-entry"]').trigger('click')
    await w.find('[data-testid="text-body"]').trigger('click')
    expect(w.find('[data-testid="text-body"]').exists()).toBe(true)
  })
  it('복사 버튼을 눌러도 펼쳐지지 않는다', async () => {
    const w = mountRow(multi)
    await w.find('[data-testid="text-copy"]').trigger('click')
    expect(w.find('[data-testid="text-body"]').exists()).toBe(false)
  })
})

describe('TextItemRow ⋯ 메뉴 닫기', () => {
  const open = async () => {
    const w = mount(TextItemRow, { props: { text: { id: '1', content: 'hi', timestamp: Date.now(), sender } }, global: { plugins: [i18n], provide }, attachTo: document.body })
    await w.find('[data-testid="text-more"]').trigger('click')
    return w
  }
  it('열기 → Esc → 닫히고 포커스가 ⋯ 버튼으로 돌아간다, 메뉴 항목은 menuitem', async () => {
    const w = await open()
    expect(w.find('[data-testid="text-menu"]').exists()).toBe(true)
    expect(w.find('[data-testid="text-delete"]').attributes('role')).toBe('menuitem')
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await w.vm.$nextTick()
    expect(w.find('[data-testid="text-menu"]').exists()).toBe(false)
    expect(document.activeElement).toBe(w.find('[data-testid="text-more"]').element)
    w.unmount()
  })
  it('열기 → 바깥 pointerdown → 닫히고, 안쪽 pointerdown은 유지된다', async () => {
    const w = await open()
    w.find('[data-testid="text-menu"]').element.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    await w.vm.$nextTick()
    expect(w.find('[data-testid="text-menu"]').exists()).toBe(true)
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    await w.vm.$nextTick()
    expect(w.find('[data-testid="text-menu"]').exists()).toBe(false)
    w.unmount()
  })
})

describe('TextItemRow 잠금 표시', () => {
  const lockIconRect = '<rect x="5" y="11" width="14" height="9" rx="2"'
  it('잠긴 행은 타일에 자물쇠 아이콘과 data-locked, 내용이 열려 있으면 작은 "잠금" 태그가 메타 줄 맨 앞', () => {
    const w = mountRow({ id: 'L', content: '열림', locked: true, salt: 's', timestamp: 0, roomId: 'r' })
    const tag = w.find('[data-testid="text-tag"]')
    expect(tag.attributes('data-locked')).toBe('true')
    expect(tag.html()).toContain(lockIconRect)
    const lt = w.find('[data-testid="text-meta"] > [data-testid="text-lock-tag"]')
    expect(lt.exists()).toBe(true)
    expect(lt.text()).toBe(i18n.global.t('lock.tag'))
    expect(lt.classes()).toContain('max-[359px]:hidden')
    expect(w.find('[data-testid="text-meta"]').element.firstElementChild).toBe(lt.element)
  })
  it('아직 못 푼 행은 타일이 자물쇠이고 제목 안에는 자물쇠 svg와 태그가 없다', () => {
    const w = mountRow({ id: 'L', content: null, locked: true, salt: 's', timestamp: 0, roomId: 'r' })
    expect(w.find('[data-testid="text-tag"]').html()).toContain(lockIconRect)
    expect(w.find('[data-testid="text-locked"] svg').exists()).toBe(false)
    expect(w.find('[data-testid="text-locked"]').text()).toContain('잠긴 텍스트')
    expect(w.find('[data-testid="text-lock-tag"]').exists()).toBe(false)
  })
  it('잠기지 않은 행은 기존 줄 아이콘이고 data-locked가 없다', () => {
    const w = mountRow({ id: 'P', content: 'hi', timestamp: 0 })
    expect(w.find('[data-testid="text-tag"]').attributes('data-locked')).toBeUndefined()
    expect(w.find('[data-testid="text-tag"]').html()).not.toContain(lockIconRect)
    expect(w.find('[data-testid="text-lock-tag"]').exists()).toBe(false)
  })
  it('풀기 폼은 행 아래 한 줄(basis-full)로 내려가고 행은 flex-wrap, 제목·버튼은 첫 줄에 남는다', async () => {
    const w = mountRow({ id: 'L', content: null, locked: true, salt: 's', timestamp: 0, roomId: 'r' })
    expect(w.find('[data-testid="text-entry"]').classes()).toContain('flex-nowrap')
    await w.find('[data-testid="text-unlock-open"]').trigger('click')
    expect(w.find('[data-testid="text-entry"]').classes()).toContain('flex-wrap')
    const form = w.find('[data-testid="text-unlock-form"]')
    expect(form.classes()).toEqual(expect.arrayContaining(['basis-full', 'pl-[2.375rem]', 'sm:pl-[3.25rem]']))
    expect(w.find('[data-testid="text-unlock-password"]').classes()).toEqual(expect.arrayContaining(['flex-1', 'min-w-0']))
    expect(w.find('[data-testid="text-locked"]').exists()).toBe(true)
    expect(w.find('[data-testid="text-unlock-open"]').exists()).toBe(true)
    expect(w.find('[data-testid="text-more"]').exists()).toBe(true)
    // 폼은 행의 직계 자식이며 제목 줄(file-info) 뒤에 온다
    const kids = Array.from(w.find('[data-testid="text-entry"]').element.children)
    expect(kids.indexOf(form.element)).toBeGreaterThan(kids.findIndex((el) => el.classList.contains('file-info')))
  })
})
