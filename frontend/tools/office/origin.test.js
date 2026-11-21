import { describe, it, expect } from 'vitest'
import { resolveEditorOrigin } from './origin.js'

const loc = (href) => new URL(href)

describe('/tools/office editor origin', () => {
  it('uses the build-time origin', () => {
    expect(resolveEditorOrigin('https://editor.example.com/', loc('https://www.clipboardapp.org/tools/office/'))).toBe('https://editor.example.com')
  })
  it('ignores ?ed= on the real site', () => {
    expect(resolveEditorOrigin('', loc('https://www.clipboardapp.org/tools/office/?ed=https://evil.example'))).toBeNull()
    expect(resolveEditorOrigin('https://editor.example.com', loc('https://www.clipboardapp.org/tools/office/?ed=https://evil.example'))).toBe('https://editor.example.com')
  })
  it('allows ?ed= (also http) on localhost', () => {
    expect(resolveEditorOrigin('', loc('http://localhost:5173/tools/office/?ed=http://127.0.0.1:8091'))).toBe('http://127.0.0.1:8091')
  })
  it('returns null without a usable origin', () => {
    expect(resolveEditorOrigin(undefined, loc('https://www.clipboardapp.org/tools/office/'))).toBeNull()
    expect(resolveEditorOrigin('http://editor.example.com', loc('https://www.clipboardapp.org/tools/office/'))).toBeNull()
    expect(resolveEditorOrigin('not a url', loc('https://www.clipboardapp.org/tools/office/'))).toBeNull()
  })
})
