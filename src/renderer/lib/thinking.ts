import { RuntimeModelInfo, ThinkingLevel, THINKING_LEVEL_ORDER } from '@shared/types'

/**
 * Which thinking levels the picker may offer. Current profile: the model's
 * own capability set when the catalog knows it ('off' is universal);
 * capability unknown → the full set. Legacy Pi accepts off..xhigh (no max).
 */
export function thinkingOptionsFor(
  profile: 'current' | 'legacy',
  catalogEntry: Pick<RuntimeModelInfo, 'thinking'> | undefined
): readonly ThinkingLevel[] {
  if (profile !== 'current') {
    return THINKING_LEVEL_ORDER.filter((l) => l !== 'max')
  }
  if (catalogEntry && catalogEntry.thinking.length > 0) {
    const supported = new Set(catalogEntry.thinking)
    return THINKING_LEVEL_ORDER.filter((l) => l === 'off' || supported.has(l))
  }
  return THINKING_LEVEL_ORDER
}
