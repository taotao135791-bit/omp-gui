import { describe, it, expect } from 'vitest'
import { buildLanguageArgs } from '../languageArgs'

describe('buildLanguageArgs', () => {
  it('appends a Simplified Chinese system prompt for zh', () => {
    const args = buildLanguageArgs('zh')
    expect(args).toHaveLength(2)
    expect(args[0]).toBe('--append-system-prompt')
    expect(args[1]).toContain('Simplified Chinese')
    expect(args[1]).toContain('简体中文')
  })

  it('adds no flag for en', () => {
    expect(buildLanguageArgs('en')).toEqual([])
  })
})
