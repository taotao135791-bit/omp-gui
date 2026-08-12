import { describe, it, expect } from 'vitest'
import { thinkingOptionsFor } from './thinking'

describe('thinkingOptionsFor', () => {
  it('offers only the model-supported levels (plus off) on current profile', () => {
    expect(thinkingOptionsFor('current', { thinking: ['medium', 'high'] })).toEqual([
      'off',
      'medium',
      'high'
    ])
    expect(thinkingOptionsFor('current', { thinking: ['low', 'high', 'max'] })).toEqual([
      'off',
      'low',
      'high',
      'max'
    ])
  })

  it('orders by the canonical intensity order, not the catalog order', () => {
    expect(thinkingOptionsFor('current', { thinking: ['max', 'low'] })).toEqual(['off', 'low', 'max'])
  })

  it('falls back to the full set when the model is unknown to the catalog', () => {
    expect(thinkingOptionsFor('current', undefined)).toEqual([
      'off',
      'minimal',
      'low',
      'medium',
      'high',
      'xhigh',
      'max'
    ])
    expect(thinkingOptionsFor('current', { thinking: [] })).toHaveLength(7)
  })

  it('legacy profile never offers max', () => {
    expect(thinkingOptionsFor('legacy', undefined)).toEqual([
      'off',
      'minimal',
      'low',
      'medium',
      'high',
      'xhigh'
    ])
    expect(thinkingOptionsFor('legacy', { thinking: ['max'] })).not.toContain('max')
  })
})
