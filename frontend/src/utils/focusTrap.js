/** 시트 안에서 Tab이 밖으로 나가지 않게 가둔다. keydown 핸들러에서 호출. */
const FOCUSABLE = 'button:not([disabled]), a[href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

export function trapTab(event, container) {
  if (event.key !== 'Tab' || !container) return
  const items = [...container.querySelectorAll(FOCUSABLE)]
  if (items.length === 0) { event.preventDefault(); return }
  const first = items[0]
  const last = items[items.length - 1]
  const active = document.activeElement
  if (event.shiftKey && (active === first || !container.contains(active))) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && (active === last || !container.contains(active))) {
    event.preventDefault()
    first.focus()
  }
}
