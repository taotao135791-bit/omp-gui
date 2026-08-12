import { describe, it, expect } from 'vitest'
import { isValidModelSelector, splitModelSelector } from '../omp/settings/RuntimeSettings'

/**
 * Slash-containing model selectors (real upstream shapes) must round-trip
 * through validation and splitting untouched.
 */
describe('model selector validation & splitting', () => {
  it('accepts simple provider/model selectors', () => {
    expect(splitModelSelector('openai/gpt-x')).toEqual({ provider: 'openai', modelId: 'gpt-x' })
    expect(splitModelSelector('deepseek/deepseek-v4-flash')).toEqual({
      provider: 'deepseek',
      modelId: 'deepseek-v4-flash'
    })
  })

  it('accepts selectors whose model id contains slashes', () => {
    expect(splitModelSelector('openrouter/deepseek/deepseek-v4-flash-0731')).toEqual({
      provider: 'openrouter',
      modelId: 'deepseek/deepseek-v4-flash-0731'
    })
    expect(splitModelSelector('openrouter/z-ai/glm-5.2')).toEqual({
      provider: 'openrouter',
      modelId: 'z-ai/glm-5.2'
    })
    expect(splitModelSelector('provider/foo/bar/baz')).toEqual({
      provider: 'provider',
      modelId: 'foo/bar/baz'
    })
  })

  it('accepts upstream-legal characters (dots, dashes, underscores, colons)', () => {
    expect(isValidModelSelector('openai/gpt-5.2')).toBe(true)
    expect(isValidModelSelector('x/y_z-1.5')).toBe(true)
    // Legacy pi uses provider/id:thinking as a spawn pattern.
    expect(isValidModelSelector('openai/gpt-4o:high')).toBe(true)
  })

  it('rejects unsafe shapes without touching upstream naming rules', () => {
    expect(isValidModelSelector('')).toBe(false)
    expect(isValidModelSelector('-rf')).toBe(false) // flag-like
    expect(isValidModelSelector('--model')).toBe(false)
    expect(isValidModelSelector('a\0b')).toBe(false) // null byte
    expect(isValidModelSelector('a\nb')).toBe(false) // control char
    expect(isValidModelSelector('x'.repeat(301))).toBe(false) // unbounded
  })

  it('splitting refuses provider-less or model-less selectors', () => {
    expect(splitModelSelector('noslash')).toBeNull()
    expect(splitModelSelector('provider/')).toBeNull()
    expect(splitModelSelector('/model')).toBeNull()
  })
})
