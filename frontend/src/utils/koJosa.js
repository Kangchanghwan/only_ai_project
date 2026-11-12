/**
 * 한국어 조사 보정. 문구에 "와(과)", "이(가)", "을(를)", "은(는)", "(으)로"처럼 써 두면
 * 바로 앞 글자의 받침을 보고 맞는 조사 하나로 바꾼다. 앞 글자가 한글이 아니면(숫자·영문 파일명 등) 그대로 둔다.
 * 예: "반짝이는 유니콘와(과) 연결됐어요" → "반짝이는 유니콘과 연결됐어요"
 */
const PAIRS = [
  // [패턴, 받침 없을 때, 받침 있을 때]
  ['와(과)', '와', '과'],
  ['이(가)', '가', '이'],
  ['을(를)', '를', '을'],
  ['은(는)', '는', '은'],
]

function batchim(ch) {
  const code = ch.charCodeAt(0)
  if (!(code >= 0xac00 && code <= 0xd7a3)) return null
  return (code - 0xac00) % 28
}

export function fixKoJosa(str) {
  if (typeof str !== 'string' || !str.includes('(')) return str
  let out = str
  for (const [pat, noB, withB] of PAIRS) {
    if (!out.includes(pat)) continue
    out = out.replace(new RegExp(`([\\s\\S])${pat.replace(/[()]/g, '\\$&')}`, 'g'), (m, prev) => {
      const b = batchim(prev)
      if (b === null) return m
      return prev + (b === 0 ? noB : withB)
    })
  }
  // (으)로: 받침이 없거나 ㄹ(8)이면 '로'
  out = out.replace(/([\s\S])\(으\)로/g, (m, prev) => {
    const b = batchim(prev)
    if (b === null) return m
    return prev + (b === 0 || b === 8 ? '로' : '으로')
  })
  return out
}
