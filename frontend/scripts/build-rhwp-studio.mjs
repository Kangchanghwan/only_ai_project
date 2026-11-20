#!/usr/bin/env node
/**
 * rhwp-studio(MIT, github.com/edwardkim/rhwp)를 빌드 시점에 받아 빌드하고
 * dist/tools/hwp/studio/ 로 복사한다. wasm·폰트는 git에 넣지 않는다.
 *
 * - 버전은 scripts/rhwp-pin.json 으로 고정 (git tag + @rhwp/core npm tarball sha512 검증)
 * - 빌드 결과는 node_modules/.cache/rhwp-studio-<tag>-<core> 에 캐시해 재빌드 때 clone을 건너뛴다
 * - 필요: git, tar, Node 18+, 네트워크(github.com, registry.npmjs.org)
 *
 * Usage: node scripts/build-rhwp-studio.mjs   (vite build 이후, frontend/dist 가 있어야 함)
 */
import { execFileSync } from 'node:child_process'
import { brotliCompressSync, constants as zc } from 'node:zlib'
import { createHash } from 'node:crypto'
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const pin = JSON.parse(readFileSync(join(here, 'rhwp-pin.json'), 'utf8'))
const cacheRoot = join(root, 'node_modules', '.cache', `rhwp-studio-${pin.tag}-${pin.coreVersion}`)
const cachedDist = join(cacheRoot, 'dist')
const outDir = join(root, 'dist', 'tools', 'hwp', 'studio')

const fail = (msg) => {
  console.error(`\n[rhwp-studio] 실패: ${msg}\n`)
  process.exit(1)
}
const run = (cmd, args, opts = {}) => {
  try {
    execFileSync(cmd, args, { stdio: 'inherit', ...opts })
  } catch (e) {
    fail(`'${cmd} ${args.join(' ')}' 실행 오류. ${cmd}이(가) 설치돼 있고 네트워크가 되는지 확인하세요. (${e.message})`)
  }
}

if (!existsSync(join(root, 'dist'))) fail('dist/ 가 없습니다. vite build 를 먼저 실행하세요.')

if (!existsSync(join(cachedDist, 'index.html'))) {
  const major = Number(process.versions.node.split('.')[0])
  if (major < 18) fail(`Node ${process.versions.node} 는 지원하지 않습니다 (18 이상 필요)`)
  console.log(`[rhwp-studio] ${pin.tag} 빌드 시작 (캐시 없음)`)
  const work = join(cacheRoot, 'src')
  rmSync(cacheRoot, { recursive: true, force: true })
  mkdirSync(cacheRoot, { recursive: true })

  run('git', ['clone', '-q', '--depth', '1', '--branch', pin.tag, '--filter=blob:none', '--sparse', pin.repo, work])
  run('git', ['sparse-checkout', 'set', '--no-cone',
    '/rhwp-studio/', '/rhwp-shared/', '/npm/', '/vendor/npm/', '/assets/fonts/', '/scripts/*.mjs', '/src/renderer/*.sksl'], { cwd: work })

  // @rhwp/core wasm 패키지: 무결성 검증 후 pkg/ 로 풀기
  const res = await fetch(pin.coreTarball)
  if (!res.ok) fail(`${pin.coreTarball} 다운로드 실패: HTTP ${res.status}`)
  const buf = Buffer.from(await res.arrayBuffer())
  const got = 'sha512-' + createHash('sha512').update(buf).digest('base64')
  if (got !== pin.coreIntegrity) fail(`@rhwp/core ${pin.coreVersion} 무결성 불일치\n  기대: ${pin.coreIntegrity}\n  실제: ${got}`)
  const tgz = join(cacheRoot, 'core.tgz')
  const tmpPkg = join(cacheRoot, 'core')
  writeFileSync(tgz, buf)
  mkdirSync(tmpPkg, { recursive: true })
  run('tar', ['-xzf', tgz, '-C', tmpPkg])
  const pkg = join(work, 'pkg')
  mkdirSync(pkg, { recursive: true })
  cpSync(join(tmpPkg, 'package'), pkg, { recursive: true })

  const studio = join(work, 'rhwp-studio')
  run('npm', ['ci', '--no-audit', '--no-fund'], { cwd: studio })
  run('npx', ['vite', 'build', `--base=${pin.base}`], {
    cwd: studio,
    env: { ...process.env, RHWP_DISABLE_EXTERNAL_WEBFONTS: '1', RHWP_WITHOUT_AI: '1' },
  })

  // 후처리: 샘플·PWA(service worker) 제거
  const built = join(studio, 'dist')
  rmSync(join(built, 'samples'), { recursive: true, force: true })
  for (const f of readdirSync(built)) {
    if (f === 'sw.js' || f === 'registerSW.js' || f === 'manifest.webmanifest' || /^workbox-.*\.js$/.test(f)) {
      rmSync(join(built, f), { force: true })
    }
  }
  const idx = join(built, 'index.html')
  let html = readFileSync(idx, 'utf8')
  html = html
    .replace(/<script[^>]*registerSW\.js[^>]*><\/script>\s*/g, '')
    .replace(/<link[^>]*rel="manifest"[^>]*>\s*/g, '')
  if (/registerSW|manifest\.webmanifest/.test(html)) fail('studio index.html 에서 PWA 참조를 제거하지 못했습니다')
  writeFileSync(idx, html)
  cpSync(built, cachedDist, { recursive: true })
  rmSync(work, { recursive: true, force: true }) // 캐시에는 결과물만 남긴다
  rmSync(tmpPkg, { recursive: true, force: true })
  rmSync(tgz, { force: true })
} else {
  console.log(`[rhwp-studio] 캐시 사용: ${cachedDist}`)
}

// 진행률 표시용 manifest: 시작할 때 꼭 받는 파일(해시 URL)과 크기(원본, 전송량 추정=brotli)
if (!existsSync(join(cachedDist, 'manifest.json'))) {
  const assets = readdirSync(join(cachedDist, 'assets'))
  const find = (re) => assets.find((f) => re.test(f))
  const mainJs = find(/^index-.*\.js$/)
  const mainCss = find(/^index-.*\.css$/)
  const plugin = find(/^studio-plugin-.*\.js$/)
  const wasmName = readFileSync(join(cachedDist, 'assets', mainJs), 'utf8').match(/rhwp_bg-[\w-]+\.wasm/)?.[0]
  if (!mainJs || !wasmName) fail('manifest: 시작 파일을 찾지 못했습니다 (studio 번들 구조가 바뀜)')
  const rels = [`assets/${wasmName}`, `assets/${mainJs}`, mainCss && `assets/${mainCss}`, plugin && `assets/${plugin}`,
    'fonts/RHWPOldHangul-Regular.woff2', 'fonts/Pretendard-Regular.woff2', 'fonts/NotoSansKR-Regular.woff2', 'fonts/NotoSansKR-Bold.woff2'].filter(Boolean)
  const files = rels.filter((r) => existsSync(join(cachedDist, r))).map((rel) => {
    const buf = readFileSync(join(cachedDist, rel))
    const est = /\.woff2$/.test(rel) ? buf.length : brotliCompressSync(buf, { params: { [zc.BROTLI_PARAM_QUALITY]: 9 } }).length
    return { url: pin.base + rel, raw: buf.length, est }
  })
  writeFileSync(join(cachedDist, 'manifest.json'), JSON.stringify({ v: 1, tag: pin.tag, files }))
}

rmSync(outDir, { recursive: true, force: true })
mkdirSync(dirname(outDir), { recursive: true })
cpSync(cachedDist, outDir, { recursive: true })
console.log(`[rhwp-studio] 복사 완료 → ${outDir}`)
