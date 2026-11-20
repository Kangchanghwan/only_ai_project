/** .hwp / .hwpx 파일 이름인지 (대소문자 무시) */
export const isHwpName = (name) => typeof name === 'string' && /\.hwpx?$/i.test(name)
