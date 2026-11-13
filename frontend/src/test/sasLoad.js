import { nextTick } from 'vue'

/** jsdom은 <img>를 받지 않으므로 확인 그림 4장의 load를 직접 일으킨다 */
export async function loadAllSas(root = document.body, type = 'load') {
  root.querySelectorAll('[data-testid="pair-sas-image"]').forEach((img) => img.dispatchEvent(new Event(type)))
  await nextTick()
}
