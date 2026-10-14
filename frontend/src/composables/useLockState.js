import { reactive, ref } from 'vue'
import { deriveLock } from '../utils/lockCrypto.js'

/**
 * 비밀번호 잠금 상태 (이번 접속 동안 메모리에만 둔다. localStorage·URL에는 남기지 않는다).
 *
 * - 범위(ip/global)별 잠금: 켜져 있으면 그 범위로 보내는 파일은 모두 잠금 업로드로 간다.
 * - keyring: salt → { encKey, verifier }. 같은 비밀번호 묶음(salt)을 이번 접속에서 이미 풀었거나
 *   내가 설정했으면 다시 묻지 않는다.
 * - names: 잠긴 파일 id → 원래 이름. 내가 보낸 파일이거나 이번 접속에서 푼 파일만 안다.
 */

export const MIN_LOCK_PASSWORD = 4

// 모듈 싱글톤 (여러 컴포넌트가 같은 상태를 본다)
const scopes = reactive({ ip: null, global: null }) // 화면용: { salt } | null
const busy = reactive({ ip: false, global: false })
const secrets = { ip: null, global: null } // { salt, encKey, verifier, vh }
const keyring = new Map()
const names = reactive(new Map())
const version = ref(0) // keyring 변경 알림용

const nameKey = (roomId, id) => `${roomId}::${id}`

/** 비밀번호 잠금을 켠다 (PBKDF2 파생에 시간이 걸린다) */
async function setLock(scope, password, opts) {
  if (!['ip', 'global'].includes(scope)) throw new Error('invalid scope')
  if (typeof password !== 'string' || password.length < MIN_LOCK_PASSWORD) {
    throw Object.assign(new Error('password too short'), { code: 'LOCK_PASSWORD_SHORT' })
  }
  busy[scope] = true
  try {
    const lock = await deriveLock(password, undefined, opts)
    secrets[scope] = lock
    keyring.set(lock.salt, { encKey: lock.encKey, verifier: lock.verifier })
    version.value++
    scopes[scope] = { salt: lock.salt }
    return lock
  } finally {
    busy[scope] = false
  }
}

function clearLock(scope) {
  secrets[scope] = null
  scopes[scope] = null
}

/** 업로드에 쓸 잠금 (없으면 null) */
const getLock = (scope) => secrets[scope] || null

const isLocked = (scope) => !!scopes[scope]

function rememberKey(salt, encKey, verifier) {
  keyring.set(salt, { encKey, verifier })
  version.value++
}

const keyFor = (salt) => keyring.get(salt) || null

function rememberName(roomId, id, name) {
  if (roomId && id && name) names.set(nameKey(roomId, id), name)
}

const nameFor = (roomId, id) => names.get(nameKey(roomId, id)) || null

/** 테스트용 초기화 */
function resetLockState() {
  clearLock('ip')
  clearLock('global')
  keyring.clear()
  names.clear()
}

export function useLockState() {
  return {
    scopes,
    busy,
    version,
    setLock,
    clearLock,
    getLock,
    isLocked,
    rememberKey,
    keyFor,
    rememberName,
    nameFor,
    resetLockState
  }
}
