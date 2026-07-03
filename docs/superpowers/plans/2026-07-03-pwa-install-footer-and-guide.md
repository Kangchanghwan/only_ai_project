# PWA 설치 유도 (푸터) + 사용 가이드 상세화 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 푸터에 PWA 설치 유도 문구+버튼을 조건부로 노출하고, 사용 가이드(HelpModal)에 설치 방법과 설치 후 공유 연동 효과를 설명하는 섹션을 추가한다.

**Architecture:** `beforeinstallprompt`/`appinstalled` 브라우저 이벤트를 캡처하는 신규 컴포저블 `usePWAInstall.js`(모듈 스코프 공유 상태, `useTheme.js`와 동일 패턴)를 만들고, `AppFooter.vue`가 이를 사용해 설치 가능한 경우에만 유도 UI를 보여준다. `HelpModal.vue`에는 상태와 무관하게 항상 노출되는 정적 안내 섹션을 추가한다. 21개 로케일 파일에 신규 i18n 키를 스크립트로 일괄 추가한다.

**Tech Stack:** Vue 3 Composition API, Vitest + @vue/test-utils, vue-i18n

**참고 스펙:** [`docs/superpowers/specs/2026-07-03-pwa-install-footer-and-guide-design.md`](../specs/2026-07-03-pwa-install-footer-and-guide-design.md)

---

### Task 1: `usePWAInstall` 컴포저블

**Files:**
- Create: `frontend/src/composables/usePWAInstall.js`
- Test: `frontend/src/composables/usePWAInstall.test.js`

- [ ] **Step 1: 실패하는 테스트 작성**

`frontend/src/composables/usePWAInstall.test.js`:

```js
import { describe, it, expect, beforeEach, vi } from 'vitest'

describe('usePWAInstall', () => {
  beforeEach(() => {
    vi.resetModules()
    window.matchMedia = vi.fn().mockReturnValue({ matches: false })
  })

  it('초기 상태에서는 canInstall과 isInstalled 모두 false다', async () => {
    const { usePWAInstall } = await import('./usePWAInstall.js')
    const { canInstall, isInstalled } = usePWAInstall()
    expect(canInstall.value).toBe(false)
    expect(isInstalled.value).toBe(false)
  })

  it('display-mode: standalone이면 isInstalled가 true로 초기화된다', async () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: true })
    const { usePWAInstall } = await import('./usePWAInstall.js')
    const { isInstalled } = usePWAInstall()
    expect(isInstalled.value).toBe(true)
  })

  it('beforeinstallprompt 이벤트를 받으면 canInstall이 true가 되고 기본 동작이 막힌다', async () => {
    const { usePWAInstall } = await import('./usePWAInstall.js')
    const { canInstall } = usePWAInstall()

    const event = new Event('beforeinstallprompt')
    event.preventDefault = vi.fn()
    window.dispatchEvent(event)

    expect(event.preventDefault).toHaveBeenCalled()
    expect(canInstall.value).toBe(true)
  })

  it('appinstalled 이벤트를 받으면 isInstalled가 true, canInstall이 false가 된다', async () => {
    const { usePWAInstall } = await import('./usePWAInstall.js')
    const { canInstall, isInstalled } = usePWAInstall()

    const bip = new Event('beforeinstallprompt')
    bip.preventDefault = vi.fn()
    window.dispatchEvent(bip)
    expect(canInstall.value).toBe(true)

    window.dispatchEvent(new Event('appinstalled'))

    expect(isInstalled.value).toBe(true)
    expect(canInstall.value).toBe(false)
  })

  it('promptInstall은 캡처된 이벤트의 prompt()를 호출하고 canInstall을 false로 리셋한다', async () => {
    const { usePWAInstall } = await import('./usePWAInstall.js')
    const { canInstall, promptInstall } = usePWAInstall()

    const promptFn = vi.fn()
    const bip = new Event('beforeinstallprompt')
    bip.preventDefault = vi.fn()
    bip.prompt = promptFn
    bip.userChoice = Promise.resolve({ outcome: 'accepted' })
    window.dispatchEvent(bip)
    expect(canInstall.value).toBe(true)

    await promptInstall()

    expect(promptFn).toHaveBeenCalled()
    expect(canInstall.value).toBe(false)
  })

  it('캡처된 이벤트가 없으면 promptInstall은 아무 것도 하지 않는다', async () => {
    const { usePWAInstall } = await import('./usePWAInstall.js')
    const { promptInstall } = usePWAInstall()
    await expect(promptInstall()).resolves.toBeUndefined()
  })
})
```

- [ ] **Step 2: 테스트 실행해서 실패 확인**

Run: `cd frontend && npx vitest run src/composables/usePWAInstall.test.js`
Expected: FAIL — `usePWAInstall.js`가 없어서 import 에러 발생

- [ ] **Step 3: 최소 구현 작성**

`frontend/src/composables/usePWAInstall.js`:

```js
import { ref } from 'vue'

const canInstall = ref(false)
const isInstalled = ref(false)

let deferredPrompt = null
let initialized = false

function isStandalone() {
  const mediaStandalone = window.matchMedia?.('(display-mode: standalone)').matches
  return Boolean(mediaStandalone || window.navigator.standalone === true)
}

function init() {
  if (initialized) return
  initialized = true

  isInstalled.value = isStandalone()

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault()
    deferredPrompt = event
    canInstall.value = true
  })

  window.addEventListener('appinstalled', () => {
    isInstalled.value = true
    canInstall.value = false
    deferredPrompt = null
  })
}

/**
 * @composable usePWAInstall
 * @description beforeinstallprompt/appinstalled 이벤트를 캡처해
 *              PWA 설치 가능 여부와 설치 트리거를 제공한다.
 */
export function usePWAInstall() {
  init()

  async function promptInstall() {
    if (!deferredPrompt) return
    deferredPrompt.prompt()
    await deferredPrompt.userChoice
    deferredPrompt = null
    canInstall.value = false
  }

  return { canInstall, isInstalled, promptInstall }
}
```

- [ ] **Step 4: 테스트 실행해서 통과 확인**

Run: `cd frontend && npx vitest run src/composables/usePWAInstall.test.js`
Expected: PASS (6 tests)

- [ ] **Step 5: 커밋**

```bash
git add frontend/src/composables/usePWAInstall.js frontend/src/composables/usePWAInstall.test.js
git commit -m "feat(frontend): add usePWAInstall composable"
```

---

### Task 2: 21개 로케일에 i18n 키 추가

**Files:**
- Modify: `frontend/src/i18n/i18n.test.js`
- Create: `frontend/scripts/add-pwa-i18n-keys.mjs`
- Modify: `frontend/src/i18n/locales/*.json` (21개, 스크립트로 일괄 수정)

- [ ] **Step 1: 실패하는 테스트 추가**

`frontend/src/i18n/i18n.test.js` 파일 맨 끝에 추가:

```js

describe('i18n footer install', () => {
  it('모든 로케일 파일에 footer의 installPrompt/installButton이 있어야 한다', () => {
    const entries = Object.entries(locales)
    expect(entries.length).toBeGreaterThanOrEqual(21)
    const requiredKeys = ['installPrompt', 'installButton']
    for (const [path, mod] of entries) {
      const json = mod.default || mod
      expect(json.footer, `${path}에 footer 섹션 없음`).toBeTruthy()
      for (const key of requiredKeys) {
        expect(typeof json.footer[key], `${path}의 footer.${key} 없음`).toBe('string')
        expect(json.footer[key].length, `${path}의 footer.${key} 비어있음`).toBeGreaterThan(0)
      }
    }
  })
})

describe('i18n help.pwa', () => {
  it('모든 로케일 파일에 help의 PWA 설치 안내 키가 모두 있어야 한다', () => {
    const entries = Object.entries(locales)
    expect(entries.length).toBeGreaterThanOrEqual(21)
    const requiredKeys = ['pwaTitle', 'pwaIntro', 'pwaAndroidTitle', 'pwaAndroidDesc', 'pwaIOSTitle', 'pwaIOSDesc']
    for (const [path, mod] of entries) {
      const json = mod.default || mod
      expect(json.help, `${path}에 help 섹션 없음`).toBeTruthy()
      for (const key of requiredKeys) {
        expect(typeof json.help[key], `${path}의 help.${key} 없음`).toBe('string')
        expect(json.help[key].length, `${path}의 help.${key} 비어있음`).toBeGreaterThan(0)
      }
    }
  })
})
```

- [ ] **Step 2: 테스트 실행해서 실패 확인**

Run: `cd frontend && npx vitest run src/i18n/i18n.test.js`
Expected: FAIL — 21개 로케일 모두 `footer.installPrompt`/`help.pwaTitle` 등이 없다는 에러

- [ ] **Step 3: 일괄 추가 스크립트 작성**

`frontend/scripts/add-pwa-i18n-keys.mjs`:

```js
import { readFileSync, writeFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const localesDir = join(__dirname, '..', 'src', 'i18n', 'locales')

const translations = {
  ko: {
    footer: { installPrompt: '앱으로 설치하면 공유하기 기능으로 파일을 바로 보낼 수 있어요', installButton: '앱 설치' },
    help: {
      pwaTitle: '앱으로 설치하기',
      pwaIntro: '설치하면 홈 화면 아이콘으로 바로 실행하고, 다른 앱에서 공유 버튼을 눌러 이 앱을 선택하면 파일이 자동으로 업로드돼요.',
      pwaAndroidTitle: 'Android / 데스크톱 (Chrome, Edge)',
      pwaAndroidDesc: '주소창의 설치 아이콘이나 하단에 뜨는 설치 배너를 눌러주세요.',
      pwaIOSTitle: 'iOS (Safari)',
      pwaIOSDesc: "공유 버튼을 누른 뒤 '홈 화면에 추가'를 선택해주세요."
    }
  },
  en: {
    footer: { installPrompt: "Install the app to send files instantly using your device's share feature", installButton: 'Install App' },
    help: {
      pwaTitle: 'Install as an App',
      pwaIntro: 'Installing lets you launch from your home screen instantly, and sharing a file to this app from another app uploads it automatically.',
      pwaAndroidTitle: 'Android / Desktop (Chrome, Edge)',
      pwaAndroidDesc: 'Tap the install icon in the address bar or the install banner at the bottom of the screen.',
      pwaIOSTitle: 'iOS (Safari)',
      pwaIOSDesc: 'Tap the Share button, then choose "Add to Home Screen".'
    }
  },
  ja: {
    footer: { installPrompt: 'アプリをインストールすると、共有機能からすぐにファイルを送信できます', installButton: 'アプリをインストール' },
    help: {
      pwaTitle: 'アプリとしてインストール',
      pwaIntro: 'インストールするとホーム画面からすぐに起動でき、他のアプリでこのアプリを共有先に選ぶとファイルが自動でアップロードされます。',
      pwaAndroidTitle: 'Android / デスクトップ (Chrome, Edge)',
      pwaAndroidDesc: 'アドレスバーのインストールアイコン、または画面下部のインストールバナーをタップしてください。',
      pwaIOSTitle: 'iOS (Safari)',
      pwaIOSDesc: '共有ボタンをタップし、「ホーム画面に追加」を選択してください。'
    }
  },
  zh: {
    footer: { installPrompt: '安装应用后，即可通过分享功能直接发送文件', installButton: '安装应用' },
    help: {
      pwaTitle: '安装为应用',
      pwaIntro: '安装后可从主屏幕直接启动，在其他应用中选择分享到本应用即可自动上传文件。',
      pwaAndroidTitle: 'Android / 桌面版 (Chrome, Edge)',
      pwaAndroidDesc: '点击地址栏中的安装图标，或屏幕底部弹出的安装横幅。',
      pwaIOSTitle: 'iOS (Safari)',
      pwaIOSDesc: '点击分享按钮，然后选择"添加到主屏幕"。'
    }
  },
  ar: {
    footer: { installPrompt: 'ثبّت التطبيق لترسل الملفات فورًا عبر ميزة المشاركة', installButton: 'تثبيت التطبيق' },
    help: {
      pwaTitle: 'التثبيت كتطبيق',
      pwaIntro: 'بعد التثبيت يمكنك التشغيل مباشرة من الشاشة الرئيسية، ومشاركة ملف من تطبيق آخر إلى هذا التطبيق يرفعه تلقائيًا.',
      pwaAndroidTitle: 'Android / سطح المكتب (Chrome، Edge)',
      pwaAndroidDesc: 'اضغط على أيقونة التثبيت في شريط العنوان أو شعار التثبيت أسفل الشاشة.',
      pwaIOSTitle: 'iOS (Safari)',
      pwaIOSDesc: 'اضغط على زر المشاركة ثم اختر "إضافة إلى الشاشة الرئيسية".'
    }
  },
  cs: {
    footer: { installPrompt: 'Nainstalujte aplikaci a odesílejte soubory rovnou přes sdílení', installButton: 'Instalovat aplikaci' },
    help: {
      pwaTitle: 'Instalace jako aplikace',
      pwaIntro: 'Po instalaci ji spustíte přímo z domovské obrazovky a sdílením souboru z jiné aplikace do této aplikace se soubor automaticky nahraje.',
      pwaAndroidTitle: 'Android / počítač (Chrome, Edge)',
      pwaAndroidDesc: 'Klepněte na ikonu instalace v adresním řádku nebo na banner instalace ve spodní části obrazovky.',
      pwaIOSTitle: 'iOS (Safari)',
      pwaIOSDesc: 'Klepněte na tlačítko sdílení a poté vyberte „Přidat na plochu“.'
    }
  },
  de: {
    footer: { installPrompt: 'App installieren, um Dateien direkt über die Teilen-Funktion zu senden', installButton: 'App installieren' },
    help: {
      pwaTitle: 'Als App installieren',
      pwaIntro: 'Nach der Installation startest du direkt vom Startbildschirm, und wenn du eine Datei aus einer anderen App mit dieser App teilst, wird sie automatisch hochgeladen.',
      pwaAndroidTitle: 'Android / Desktop (Chrome, Edge)',
      pwaAndroidDesc: 'Tippe auf das Installationssymbol in der Adressleiste oder auf das Installationsbanner am unteren Bildschirmrand.',
      pwaIOSTitle: 'iOS (Safari)',
      pwaIOSDesc: 'Tippe auf die Teilen-Schaltfläche und wähle „Zum Home-Bildschirm“.'
    }
  },
  es: {
    footer: { installPrompt: 'Instala la app para enviar archivos al instante con la función de compartir', installButton: 'Instalar app' },
    help: {
      pwaTitle: 'Instalar como app',
      pwaIntro: 'Al instalarla podrás abrirla directamente desde la pantalla de inicio, y si compartes un archivo desde otra app hacia esta, se subirá automáticamente.',
      pwaAndroidTitle: 'Android / escritorio (Chrome, Edge)',
      pwaAndroidDesc: 'Toca el icono de instalación en la barra de direcciones o el banner de instalación en la parte inferior.',
      pwaIOSTitle: 'iOS (Safari)',
      pwaIOSDesc: 'Toca el botón de compartir y luego elige "Añadir a pantalla de inicio".'
    }
  },
  fa: {
    footer: { installPrompt: 'برنامه را نصب کنید تا بتوانید فایل‌ها را مستقیم از طریق اشتراک‌گذاری ارسال کنید', installButton: 'نصب برنامه' },
    help: {
      pwaTitle: 'نصب به‌عنوان برنامه',
      pwaIntro: 'پس از نصب می‌توانید مستقیم از صفحه اصلی اجرا کنید و با اشتراک‌گذاری فایل از برنامه دیگر به این برنامه، فایل به‌صورت خودکار آپلود می‌شود.',
      pwaAndroidTitle: 'اندروید / دسکتاپ (Chrome، Edge)',
      pwaAndroidDesc: 'روی نماد نصب در نوار آدرس یا بنر نصب در پایین صفحه ضربه بزنید.',
      pwaIOSTitle: 'iOS (Safari)',
      pwaIOSDesc: 'روی دکمه اشتراک‌گذاری ضربه بزنید و سپس «افزودن به صفحه اصلی» را انتخاب کنید.'
    }
  },
  fr: {
    footer: { installPrompt: "Installez l'application pour envoyer des fichiers directement via le partage", installButton: "Installer l'application" },
    help: {
      pwaTitle: 'Installer comme application',
      pwaIntro: "Une fois installée, elle se lance directement depuis l'écran d'accueil, et partager un fichier depuis une autre application vers celle-ci l'envoie automatiquement.",
      pwaAndroidTitle: 'Android / Bureau (Chrome, Edge)',
      pwaAndroidDesc: "Appuyez sur l'icône d'installation dans la barre d'adresse ou sur la bannière d'installation en bas de l'écran.",
      pwaIOSTitle: 'iOS (Safari)',
      pwaIOSDesc: 'Appuyez sur le bouton Partager, puis choisissez « Sur l\'écran d\'accueil ».'
    }
  },
  hu: {
    footer: { installPrompt: 'Telepítsd az alkalmazást, hogy a megosztás funkcióval azonnal küldhess fájlokat', installButton: 'Alkalmazás telepítése' },
    help: {
      pwaTitle: 'Telepítés alkalmazásként',
      pwaIntro: 'Telepítés után közvetlenül a kezdőképernyőről indíthatod, és ha egy másik alkalmazásból megosztasz egy fájlt ide, az automatikusan feltöltődik.',
      pwaAndroidTitle: 'Android / asztali (Chrome, Edge)',
      pwaAndroidDesc: 'Koppints a címsorban lévő telepítési ikonra vagy a képernyő alján megjelenő telepítési sávra.',
      pwaIOSTitle: 'iOS (Safari)',
      pwaIOSDesc: 'Koppints a Megosztás gombra, majd válaszd a „Főképernyőhöz adás” lehetőséget.'
    }
  },
  id: {
    footer: { installPrompt: 'Instal aplikasinya agar bisa langsung mengirim file lewat fitur berbagi', installButton: 'Instal Aplikasi' },
    help: {
      pwaTitle: 'Instal sebagai Aplikasi',
      pwaIntro: 'Setelah diinstal, kamu bisa langsung membukanya dari layar utama, dan membagikan file dari aplikasi lain ke aplikasi ini akan mengunggahnya secara otomatis.',
      pwaAndroidTitle: 'Android / Desktop (Chrome, Edge)',
      pwaAndroidDesc: 'Ketuk ikon instal di address bar atau banner instal di bagian bawah layar.',
      pwaIOSTitle: 'iOS (Safari)',
      pwaIOSDesc: 'Ketuk tombol Bagikan, lalu pilih "Tambah ke Layar Utama".'
    }
  },
  nl: {
    footer: { installPrompt: 'Installeer de app om bestanden direct te verzenden via de deelfunctie', installButton: 'App installeren' },
    help: {
      pwaTitle: 'Installeren als app',
      pwaIntro: 'Na installatie start je direct vanaf het startscherm, en als je een bestand vanuit een andere app naar deze app deelt, wordt het automatisch geüpload.',
      pwaAndroidTitle: 'Android / desktop (Chrome, Edge)',
      pwaAndroidDesc: 'Tik op het installatiepictogram in de adresbalk of de installatiebanner onderaan het scherm.',
      pwaIOSTitle: 'iOS (Safari)',
      pwaIOSDesc: 'Tik op de deelknop en kies vervolgens "Zet op beginscherm".'
    }
  },
  pl: {
    footer: { installPrompt: 'Zainstaluj aplikację, aby wysyłać pliki od razu przez funkcję udostępniania', installButton: 'Zainstaluj aplikację' },
    help: {
      pwaTitle: 'Zainstaluj jako aplikację',
      pwaIntro: 'Po instalacji uruchomisz ją bezpośrednio z ekranu głównego, a udostępnienie pliku z innej aplikacji do tej aplikacji automatycznie go prześle.',
      pwaAndroidTitle: 'Android / komputer (Chrome, Edge)',
      pwaAndroidDesc: 'Dotknij ikony instalacji na pasku adresu lub baner instalacji u dołu ekranu.',
      pwaIOSTitle: 'iOS (Safari)',
      pwaIOSDesc: 'Dotknij przycisku Udostępnij, a następnie wybierz „Dodaj do ekranu głównego”.'
    }
  },
  pt: {
    footer: { installPrompt: 'Instale o app para enviar arquivos direto pela função de compartilhar', installButton: 'Instalar app' },
    help: {
      pwaTitle: 'Instalar como app',
      pwaIntro: 'Depois de instalado, você abre direto da tela inicial, e compartilhar um arquivo de outro app para este app faz o upload automaticamente.',
      pwaAndroidTitle: 'Android / desktop (Chrome, Edge)',
      pwaAndroidDesc: 'Toque no ícone de instalação na barra de endereço ou no banner de instalação na parte inferior da tela.',
      pwaIOSTitle: 'iOS (Safari)',
      pwaIOSDesc: 'Toque no botão Compartilhar e escolha "Adicionar à Tela de Início".'
    }
  },
  ro: {
    footer: { installPrompt: 'Instalează aplicația pentru a trimite fișiere direct prin funcția de distribuire', installButton: 'Instalează aplicația' },
    help: {
      pwaTitle: 'Instalare ca aplicație',
      pwaIntro: 'După instalare, o poți deschide direct de pe ecranul de start, iar distribuirea unui fișier din altă aplicație către aceasta îl încarcă automat.',
      pwaAndroidTitle: 'Android / desktop (Chrome, Edge)',
      pwaAndroidDesc: 'Atinge pictograma de instalare din bara de adrese sau bannerul de instalare din partea de jos a ecranului.',
      pwaIOSTitle: 'iOS (Safari)',
      pwaIOSDesc: 'Atinge butonul de distribuire, apoi alege „Adaugă la ecranul de start”.'
    }
  },
  ru: {
    footer: { installPrompt: 'Установите приложение, чтобы сразу отправлять файлы через функцию «Поделиться»', installButton: 'Установить приложение' },
    help: {
      pwaTitle: 'Установить как приложение',
      pwaIntro: 'После установки приложение открывается прямо с главного экрана, а при отправке файла из другого приложения через «Поделиться» он загружается автоматически.',
      pwaAndroidTitle: 'Android / компьютер (Chrome, Edge)',
      pwaAndroidDesc: 'Нажмите на значок установки в адресной строке или на баннер установки внизу экрана.',
      pwaIOSTitle: 'iOS (Safari)',
      pwaIOSDesc: 'Нажмите кнопку «Поделиться», затем выберите «На экран «Домой»».'
    }
  },
  sv: {
    footer: { installPrompt: 'Installera appen för att skicka filer direkt via delningsfunktionen', installButton: 'Installera appen' },
    help: {
      pwaTitle: 'Installera som app',
      pwaIntro: 'Efter installationen kan du öppna appen direkt från hemskärmen, och om du delar en fil från en annan app till den här appen laddas den upp automatiskt.',
      pwaAndroidTitle: 'Android / dator (Chrome, Edge)',
      pwaAndroidDesc: 'Tryck på installationsikonen i adressfältet eller installationsbannern längst ner på skärmen.',
      pwaIOSTitle: 'iOS (Safari)',
      pwaIOSDesc: 'Tryck på delningsknappen och välj sedan "Lägg till på hemskärmen".'
    }
  },
  tr: {
    footer: { installPrompt: 'Uygulamayı yükleyerek paylaşım özelliğiyle dosyaları doğrudan gönderebilirsiniz', installButton: 'Uygulamayı Yükle' },
    help: {
      pwaTitle: 'Uygulama Olarak Yükle',
      pwaIntro: 'Yükledikten sonra doğrudan ana ekrandan açabilir, başka bir uygulamadan bu uygulamaya dosya paylaştığınızda otomatik olarak yüklenir.',
      pwaAndroidTitle: 'Android / Masaüstü (Chrome, Edge)',
      pwaAndroidDesc: 'Adres çubuğundaki yükleme simgesine veya ekranın altındaki yükleme bannerına dokunun.',
      pwaIOSTitle: 'iOS (Safari)',
      pwaIOSDesc: 'Paylaş düğmesine dokunun, ardından "Ana Ekrana Ekle" seçeneğini seçin.'
    }
  },
  uk: {
    footer: { installPrompt: 'Встановіть застосунок, щоб надсилати файли одразу через функцію «Поділитися»', installButton: 'Встановити застосунок' },
    help: {
      pwaTitle: 'Встановити як застосунок',
      pwaIntro: 'Після встановлення можна відкривати його прямо з головного екрана, а надсилання файлу з іншого застосунку в цей автоматично завантажує його.',
      pwaAndroidTitle: "Android / комп'ютер (Chrome, Edge)",
      pwaAndroidDesc: 'Торкніться значка встановлення в адресному рядку або банера встановлення внизу екрана.',
      pwaIOSTitle: 'iOS (Safari)',
      pwaIOSDesc: 'Торкніться кнопки «Поділитися», потім виберіть «На екран «Домівка»».'
    }
  },
  vi: {
    footer: { installPrompt: 'Cài đặt ứng dụng để gửi tệp ngay qua tính năng chia sẻ', installButton: 'Cài đặt ứng dụng' },
    help: {
      pwaTitle: 'Cài đặt như ứng dụng',
      pwaIntro: 'Sau khi cài đặt, bạn có thể mở trực tiếp từ màn hình chính, và khi chia sẻ tệp từ ứng dụng khác đến ứng dụng này, tệp sẽ tự động được tải lên.',
      pwaAndroidTitle: 'Android / Máy tính (Chrome, Edge)',
      pwaAndroidDesc: 'Chạm vào biểu tượng cài đặt trên thanh địa chỉ hoặc biểu ngữ cài đặt ở cuối màn hình.',
      pwaIOSTitle: 'iOS (Safari)',
      pwaIOSDesc: 'Chạm vào nút Chia sẻ, sau đó chọn "Thêm vào Màn hình chính".'
    }
  }
}

for (const [locale, t] of Object.entries(translations)) {
  const filePath = join(localesDir, `${locale}.json`)
  const json = JSON.parse(readFileSync(filePath, 'utf-8'))

  json.footer = {
    ...json.footer,
    installPrompt: t.footer.installPrompt,
    installButton: t.footer.installButton
  }

  json.help = {
    ...json.help,
    pwaTitle: t.help.pwaTitle,
    pwaIntro: t.help.pwaIntro,
    pwaAndroidTitle: t.help.pwaAndroidTitle,
    pwaAndroidDesc: t.help.pwaAndroidDesc,
    pwaIOSTitle: t.help.pwaIOSTitle,
    pwaIOSDesc: t.help.pwaIOSDesc
  }

  writeFileSync(filePath, JSON.stringify(json, null, 2) + '\n')
  console.log(`updated ${locale}.json`)
}
```

**중요:** `translations` 객체는 정확히 21개 키(ko, en, ja, zh, ar, cs, de, es, fa, fr, hu, id, nl, pl, pt, ro, ru, sv, tr, uk, vi)를 가져야 한다 — `frontend/src/i18n/locales/`에 있는 파일과 정확히 일치해야 한다. 실행 전 `ls frontend/src/i18n/locales/`로 21개 파일명을 재확인하고, 위 목록과 다르면 빠진 로케일의 번역을 추가한다.

- [ ] **Step 4: 스크립트 실행**

Run: `cd frontend && node scripts/add-pwa-i18n-keys.mjs`
Expected: 21줄의 `updated {locale}.json` 출력

- [ ] **Step 5: 테스트 실행해서 통과 확인**

Run: `cd frontend && npx vitest run src/i18n/i18n.test.js`
Expected: PASS (모든 describe 블록 통과, 기존 qr/shareScope/file/shareTargetConfirm 테스트도 계속 통과)

- [ ] **Step 6: 일회성 스크립트 삭제**

```bash
rm frontend/scripts/add-pwa-i18n-keys.mjs
rmdir frontend/scripts 2>/dev/null || true
```

- [ ] **Step 7: 커밋**

```bash
git add frontend/src/i18n/locales frontend/src/i18n/i18n.test.js
git commit -m "feat(frontend): add PWA install i18n keys to all locales"
```

---

### Task 3: `AppFooter.vue`에 설치 유도 UI 추가

**Files:**
- Modify: `frontend/src/components/AppFooter.vue`
- Test: `frontend/src/components/AppFooter.test.js` (신규)

- [ ] **Step 1: 실패하는 테스트 작성**

`frontend/src/components/AppFooter.test.js`:

```js
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref } from 'vue'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key) => key })
}))

const canInstall = ref(false)
const isInstalled = ref(false)
const promptInstall = vi.fn()

vi.mock('../composables/usePWAInstall.js', () => ({
  usePWAInstall: () => ({ canInstall, isInstalled, promptInstall })
}))

import AppFooter from './AppFooter.vue'

describe('AppFooter.vue', () => {
  beforeEach(() => {
    canInstall.value = false
    isInstalled.value = false
    promptInstall.mockClear()
  })

  it('canInstall이 false면 설치 유도 행을 렌더링하지 않는다', () => {
    const wrapper = mount(AppFooter)
    expect(wrapper.find('[data-testid="pwa-install-row"]').exists()).toBe(false)
  })

  it('canInstall이 true이고 isInstalled가 false면 설치 유도 행을 렌더링한다', () => {
    canInstall.value = true
    const wrapper = mount(AppFooter)
    const row = wrapper.find('[data-testid="pwa-install-row"]')
    expect(row.exists()).toBe(true)
    expect(row.text()).toContain('footer.installPrompt')
    expect(row.text()).toContain('footer.installButton')
  })

  it('isInstalled가 true면 canInstall이 true여도 렌더링하지 않는다', () => {
    canInstall.value = true
    isInstalled.value = true
    const wrapper = mount(AppFooter)
    expect(wrapper.find('[data-testid="pwa-install-row"]').exists()).toBe(false)
  })

  it('설치 버튼 클릭 시 promptInstall이 호출된다', async () => {
    canInstall.value = true
    const wrapper = mount(AppFooter)
    await wrapper.find('[data-testid="pwa-install-button"]').trigger('click')
    expect(promptInstall).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: 테스트 실행해서 실패 확인**

Run: `cd frontend && npx vitest run src/components/AppFooter.test.js`
Expected: FAIL — `data-testid="pwa-install-row"`가 존재하지 않음

- [ ] **Step 3: `AppFooter.vue` 수정**

`frontend/src/components/AppFooter.vue`의 `<script setup>`을 아래로 교체 (기존 1~7줄):

```vue
<script setup>
import { useI18n } from 'vue-i18n'
import { usePWAInstall } from '../composables/usePWAInstall.js'

const { t } = useI18n()
const { canInstall, isInstalled, promptInstall } = usePWAInstall()

const currentYear = new Date().getFullYear()
</script>
```

`<template>`의 `<footer ...>` 여는 태그 바로 다음(기존 10~11줄 사이)에 아래 블록을 추가:

```vue
    <div
      v-if="canInstall && !isInstalled"
      data-testid="pwa-install-row"
      class="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-sm text-text-secondary mb-3"
    >
      <span>{{ t('footer.installPrompt') }}</span>
      <button
        type="button"
        data-testid="pwa-install-button"
        class="px-3 py-1 rounded-full bg-primary text-white text-xs font-medium hover:bg-primary/90 transition-colors"
        @click="promptInstall"
      >
        {{ t('footer.installButton') }}
      </button>
    </div>
```

전체 파일은 다음과 같아야 한다:

```vue
<script setup>
import { useI18n } from 'vue-i18n'
import { usePWAInstall } from '../composables/usePWAInstall.js'

const { t } = useI18n()
const { canInstall, isInstalled, promptInstall } = usePWAInstall()

const currentYear = new Date().getFullYear()
</script>

<template>
  <footer class="border-t border-border px-6 py-6">
    <div
      v-if="canInstall && !isInstalled"
      data-testid="pwa-install-row"
      class="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-sm text-text-secondary mb-3"
    >
      <span>{{ t('footer.installPrompt') }}</span>
      <button
        type="button"
        data-testid="pwa-install-button"
        class="px-3 py-1 rounded-full bg-primary text-white text-xs font-medium hover:bg-primary/90 transition-colors"
        @click="promptInstall"
      >
        {{ t('footer.installButton') }}
      </button>
    </div>
    <div class="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-sm text-text-secondary">
      <a
        href="https://github.com/Kangchanghwan/only_ai_project/blob/master/PRIVACY.md"
        target="_blank"
        rel="noopener noreferrer"
        class="text-primary hover:underline"
      >{{ t('footer.privacyPolicy') }}</a>
      <span class="text-text-secondary/50">·</span>
      <a
        href="https://github.com/Kangchanghwan/only_ai_project"
        target="_blank"
        rel="noopener noreferrer"
        class="text-primary hover:underline"
      >{{ t('footer.sourceOnGitHub') }}</a>
      <span class="text-text-secondary/50">·</span>
      <span>
        {{ t('footer.createdBy') }}
        <a
          href="https://github.com/Kangchanghwan"
          target="_blank"
          rel="noopener noreferrer"
          class="text-primary hover:underline"
        >Kang Chang Hwan</a>
      </span>
      <span class="text-text-secondary/50">·</span>
      <span>&copy; {{ currentYear }}</span>
    </div>
  </footer>
</template>
```

- [ ] **Step 4: 테스트 실행해서 통과 확인**

Run: `cd frontend && npx vitest run src/components/AppFooter.test.js`
Expected: PASS (4 tests)

- [ ] **Step 5: 커밋**

```bash
git add frontend/src/components/AppFooter.vue frontend/src/components/AppFooter.test.js
git commit -m "feat(frontend): show PWA install prompt in footer when installable"
```

---

### Task 4: `HelpModal.vue`에 PWA 설치 안내 섹션 추가

**Files:**
- Modify: `frontend/src/components/HelpModal.vue`
- Test: `frontend/src/components/HelpModal.test.js` (신규)

- [ ] **Step 1: 실패하는 테스트 작성**

`frontend/src/components/HelpModal.test.js`:

```js
import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key) => key })
}))

import HelpModal from './HelpModal.vue'

describe('HelpModal.vue', () => {
  it('열려 있을 때 PWA 설치 안내 섹션을 렌더링한다', () => {
    const wrapper = mount(HelpModal, { props: { isOpen: true } })
    const text = wrapper.text()
    expect(text).toContain('help.pwaTitle')
    expect(text).toContain('help.pwaIntro')
    expect(text).toContain('help.pwaAndroidTitle')
    expect(text).toContain('help.pwaAndroidDesc')
    expect(text).toContain('help.pwaIOSTitle')
    expect(text).toContain('help.pwaIOSDesc')
  })
})
```

- [ ] **Step 2: 테스트 실행해서 실패 확인**

Run: `cd frontend && npx vitest run src/components/HelpModal.test.js`
Expected: FAIL — `help.pwaTitle` 등의 텍스트가 렌더링되지 않음

- [ ] **Step 3: `HelpModal.vue` 수정**

[`frontend/src/components/HelpModal.vue`](../../../frontend/src/components/HelpModal.vue)에서 "⚠️ 제한사항" `<section>`(기존 218~229줄)이 끝나는 `</section>` 바로 다음, "💡 팁" `<section>`(기존 232줄)이 시작하기 전에 아래 섹션을 삽입한다:

```vue
            <!-- 앱 설치 -->
            <section>
              <h3 class="text-lg font-semibold text-text-primary mb-3 flex items-center gap-2">
                📲 {{ t('help.pwaTitle') }}
              </h3>
              <div class="space-y-3">
                <p class="text-sm text-text-secondary">{{ t('help.pwaIntro') }}</p>
                <div class="bg-background border border-border rounded-lg p-4">
                  <h4 class="font-semibold text-text-primary mb-1">{{ t('help.pwaAndroidTitle') }}</h4>
                  <p class="text-sm text-text-secondary">{{ t('help.pwaAndroidDesc') }}</p>
                </div>
                <div class="bg-background border border-border rounded-lg p-4">
                  <h4 class="font-semibold text-text-primary mb-1">{{ t('help.pwaIOSTitle') }}</h4>
                  <p class="text-sm text-text-secondary">{{ t('help.pwaIOSDesc') }}</p>
                </div>
              </div>
            </section>
```

- [ ] **Step 4: 테스트 실행해서 통과 확인**

Run: `cd frontend && npx vitest run src/components/HelpModal.test.js`
Expected: PASS (1 test)

- [ ] **Step 5: 커밋**

```bash
git add frontend/src/components/HelpModal.vue frontend/src/components/HelpModal.test.js
git commit -m "feat(frontend): add PWA install guide section to HelpModal"
```

---

### Task 5: 전체 회귀 테스트 및 수동 QA

**Files:** 없음(검증 전용)

- [ ] **Step 1: 프론트엔드 전체 테스트 실행**

Run: `cd frontend && npm test -- --run`
Expected: 모든 테스트 PASS (기존 테스트 포함 회귀 없음)

- [ ] **Step 2: 개발 서버로 수동 확인**

Run: `cd frontend && npm run dev`

브라우저에서:
- 데스크톱 Chrome으로 접속 후 devtools > Application > Manifest에서 설치 가능 여부 확인, 또는 실제 `beforeinstallprompt`가 발생하면 푸터에 안내 문구+버튼이 나타나는지 확인
- 설치 버튼 클릭 시 네이티브 설치 다이얼로그가 뜨는지 확인
- 헤더의 도움말(❓) 버튼을 눌러 `HelpModal`을 열고 "📲 앱으로 설치하기" 섹션이 "⚠️ 제한사항"과 "💡 팁" 사이에 자연스럽게 보이는지, 다른 섹션과 스타일이 일치하는지 확인
- 언어 선택기로 English/日本語 등으로 전환해 새 섹션과 푸터 문구가 깨지지 않고 표시되는지 확인

- [ ] **Step 3: 최종 커밋 확인**

Run: `git log --oneline -6`
Expected: Task 1~4의 커밋이 순서대로 보임
