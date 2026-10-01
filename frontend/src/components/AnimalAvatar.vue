<script setup>
import { computed } from 'vue'
import { animalSrc, animalBg } from '../utils/identity'

const props = defineProps({
  /** {adj, animal, suffix?} */
  identity: { type: Object, required: true },
  /** 'sm' 32px / 'md' 40px */
  size: { type: String, default: 'sm' },
  /** 나간 기기: 회색 처리 */
  gray: { type: Boolean, default: false }
})

const src = computed(() => animalSrc(props.identity?.animal))
const boxClass = computed(() => (props.size === 'md' ? 'w-10 h-10' : 'w-8 h-8'))
</script>

<template>
  <span
    class="inline-flex items-center justify-center rounded-full shrink-0 overflow-hidden"
    :class="[boxClass, gray ? 'opacity-60 grayscale' : '']"
    :style="{ backgroundColor: animalBg(identity?.animal) }"
    data-testid="animal-avatar"
    :data-animal="identity?.animal"
  >
    <img v-if="src" :src="src" alt="" draggable="false" class="w-[78%] h-[78%] select-none" />
  </span>
</template>
