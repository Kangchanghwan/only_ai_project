/** 처리량(Mbit/s) → GA4용 구간 라벨 */
export function mbpsBucket(mbps) {
  if (!(mbps >= 0)) return undefined
  if (mbps < 5) return '<5'
  if (mbps < 20) return '5-20'
  if (mbps < 50) return '20-50'
  if (mbps < 100) return '50-100'
  if (mbps < 300) return '100-300'
  return '300+'
}
