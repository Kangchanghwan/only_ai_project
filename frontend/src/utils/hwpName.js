/** .hwp / .hwpx 파일 이름인지 (대소문자 무시) */
export const isHwpName = (name) => typeof name === 'string' && /\.hwpx?$/i.test(name)

/** 'docx' | 'xlsx' | 'pptx' | null (대소문자 무시) */
export const officeKindOf = (name) => {
  const m = typeof name === 'string' && name.match(/\.(docx|xlsx|pptx)$/i)
  return m ? m[1].toLowerCase() : null
}

/** 방에서 미리보기 시트로 열 수 있는 파일 (한글 + Office) */
export const isPreviewName = (name) => isHwpName(name) || !!officeKindOf(name)
