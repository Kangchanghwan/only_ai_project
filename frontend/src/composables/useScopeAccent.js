import { computed } from 'vue'

/**
 * scope('ip'|'global') 값에 따라 coral(ip)/sage(global) 액센트 Tailwind 클래스를 반환한다.
 * DESIGN.md: ip 스코프 = --color-primary(coral, 기본), global 스코프 = --color-scope-global(sage).
 * 각 반환값은 리터럴 삼항식으로 작성되어야 Tailwind JIT 스캐너가 클래스를 인식한다.
 * @param {() => 'ip'|'global'} scopeGetter
 */
export function useScopeAccent(scopeGetter) {
  const isGlobal = computed(() => scopeGetter() === 'global')

  return {
    isGlobal,
    bg: computed(() => (isGlobal.value ? 'bg-scope-global' : 'bg-primary')),
    text: computed(() => (isGlobal.value ? 'text-scope-global' : 'text-primary')),
    border: computed(() => (isGlobal.value ? 'border-scope-global' : 'border-primary')),
    borderL: computed(() => (isGlobal.value ? 'border-l-scope-global' : 'border-l-primary')),
    bgSoft10: computed(() => (isGlobal.value ? 'bg-scope-global/10' : 'bg-primary/10')),
    bgSoft5: computed(() => (isGlobal.value ? 'bg-scope-global/5' : 'bg-primary/5')),
    hoverShadow30: computed(() => (isGlobal.value ? 'hover:shadow-scope-global/30' : 'hover:shadow-primary/30')),
    hoverBorder: computed(() => (isGlobal.value ? 'hover:border-scope-global' : 'hover:border-primary')),
    hoverBorder50: computed(() => (isGlobal.value ? 'hover:border-scope-global/50' : 'hover:border-primary/50')),
    hoverBg: computed(() => (isGlobal.value ? 'hover:bg-scope-global' : 'hover:bg-primary')),
    hoverText: computed(() => (isGlobal.value ? 'hover:text-scope-global' : 'hover:text-primary')),
    accentColor: computed(() => (isGlobal.value ? 'accent-scope-global' : 'accent-primary')),
  }
}
