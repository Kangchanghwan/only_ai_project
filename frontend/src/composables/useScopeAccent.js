import { computed } from 'vue'
import { isPrivateScope } from './useShareScope.js'

/**
 * scope('ip'|'global'|'prv:<roomId>') 값에 따라 coral(ip)/sage(global)/blue(1:1) 액센트 Tailwind 클래스를 반환한다.
 * DESIGN.md: ip 스코프 = --color-primary(coral, 기본), global 스코프 = --color-scope-global(sage),
 * 1:1 비공개 방 = --color-scope-private(blue).
 * 각 반환값은 리터럴 문자열로 작성되어야 Tailwind JIT 스캐너가 클래스를 인식한다.
 * @param {() => string} scopeGetter
 */
export function useScopeAccent(scopeGetter) {
  const isGlobal = computed(() => scopeGetter() === 'global')
  const isPrivate = computed(() => isPrivateScope(scopeGetter()))
  const pick = (ip, global, prv) => computed(() => (isPrivate.value ? prv : isGlobal.value ? global : ip))

  return {
    isGlobal,
    isPrivate,
    bg: pick('bg-primary', 'bg-scope-global', 'bg-scope-private'),
    text: pick('text-primary', 'text-scope-global', 'text-scope-private'),
    border: pick('border-primary', 'border-scope-global', 'border-scope-private'),
    borderL: pick('border-l-primary', 'border-l-scope-global', 'border-l-scope-private'),
    bgSoft10: pick('bg-primary/10', 'bg-scope-global/10', 'bg-scope-private/10'),
    bgSoft5: pick('bg-primary/5', 'bg-scope-global/5', 'bg-scope-private/5'),
    hoverShadow30: pick('hover:shadow-primary/30', 'hover:shadow-scope-global/30', 'hover:shadow-scope-private/30'),
    hoverBorder: pick('hover:border-primary', 'hover:border-scope-global', 'hover:border-scope-private'),
    hoverBorder50: pick('hover:border-primary/50', 'hover:border-scope-global/50', 'hover:border-scope-private/50'),
    hoverBg: pick('hover:bg-primary', 'hover:bg-scope-global', 'hover:bg-scope-private'),
    hoverText: pick('hover:text-primary', 'hover:text-scope-global', 'hover:text-scope-private'),
    accentColor: pick('accent-primary', 'accent-scope-global', 'accent-scope-private'),
  }
}
