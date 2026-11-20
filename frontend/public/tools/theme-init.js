// 테마 적용 (첫 화면 깜빡임 방지용 동기 스크립트, <body> 맨 앞에서 실행). 메인 앱 useTheme.js와 같은 규칙:
// localStorage 'clipboard-share-theme' 값(light|dark), 없으면 시스템 설정, 기본은 다크.
(function () {
  var theme = 'dark'
  try {
    var saved = localStorage.getItem('clipboard-share-theme')
    if (saved === 'light' || saved === 'dark') theme = saved
    else if (window.matchMedia && !window.matchMedia('(prefers-color-scheme: dark)').matches) theme = 'light'
  } catch (e) {}
  document.documentElement.setAttribute('data-theme', theme)
  if (document.body) document.body.className = theme // useTheme.js와 같게 body에도 (body.light/dark 토큰이 :root보다 우선)
})()
