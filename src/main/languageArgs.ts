import { Language } from '../shared/types'

/** System-prompt suffix steering pi's reply language to the UI language. */
const ZH_REPLY_PROMPT =
  'Always respond in Simplified Chinese (简体中文), unless the user explicitly writes in another language.'

/**
 * Extra CLI args for the UI language: Chinese gets an appended system prompt,
 * English stays at pi's default (no flag at all).
 */
export function buildLanguageArgs(language: Language): string[] {
  return language === 'zh' ? ['--append-system-prompt', ZH_REPLY_PROMPT] : []
}
