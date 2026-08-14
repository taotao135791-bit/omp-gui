import { describe, it, expect } from 'vitest'
import { headTailLines, formatHiddenLines } from './retention'

describe('headTailLines', () => {
  it('returns the whole text when it fits the budget', () => {
    const text = 'one\ntwo\nthree'
    const result = headTailLines(text, 5, 5)
    expect(result.truncated).toBe(false)
    expect(result.head).toBe(text)
    expect(result.hidden).toBe(0)
  })

  it('keeps head and tail with an exact hidden count', () => {
    const lines = Array.from({ length: 100 }, (_, i) => `line ${i}`)
    const result = headTailLines(lines.join('\n'), 3, 2)
    expect(result.truncated).toBe(true)
    expect(result.head.split('\n')).toEqual(['line 0', 'line 1', 'line 2'])
    expect(result.tail.split('\n')).toEqual(['line 98', 'line 99'])
    expect(result.hidden).toBe(95)
  })

  it('never cuts a multi-byte codepoint (splits on line boundaries)', () => {
    const text = '你好世界\n第二行\n第三行\n第四行'
    const result = headTailLines(text, 1, 1)
    expect(result.truncated).toBe(true)
    expect(result.head).toBe('你好世界')
    expect(result.tail).toBe('第四行')
  })

  it('formats the hidden-line notice', () => {
    expect(formatHiddenLines(42381)).toBe('… 42,381 lines hidden …')
  })
})
