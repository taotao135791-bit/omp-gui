/**
 * UTF-8-safe line head/tail retention for large tool outputs — adapted from the
 * byte-retention concept in DeepSeek Harness `packages/util/output-retention`
 * (TextRetainer), re-expressed for the renderer where outputs are already JS
 * strings.
 *
 * Copyright (c) 2026 DeepSeek
 * MIT License — see THIRD_PARTY_NOTICES.md.
 *
 * Source commit: 47f943859bef60e4160492346772ded9b24f765a
 * Modifications: the upstream retainer is byte-oriented (process/body safety);
 * the renderer already holds a decoded string, so this adapter splits on line
 * boundaries — which is UTF-8-safe by construction (JS strings split on `\n`
 * never cut a multi-byte codepoint) — and reports the hidden line count rather
 * than an omitted-byte count.
 */

export interface HeadTail {
  /** The retained head lines (at most `headLines`). */
  head: string
  /** The retained tail lines (at most `tailLines`, only when truncation happened). */
  tail: string
  /** Number of whole lines hidden between head and tail (0 = nothing hidden). */
  hidden: number
  /** True when any line was omitted. */
  truncated: boolean
}

/** Split a string into lines, preserving trailing content exactly. */
function splitLines(text: string): string[] {
  if (text.length === 0) return []
  const lines = text.split('\n')
  // A trailing '' from a final newline is a real empty last line; keep it only
  // if the source actually ended with a newline (so round-tripping is exact).
  return lines
}

/**
 * Keep the first `headLines` and last `tailLines` lines of a potentially huge
 * tool output, with an exact hidden-line count. When the input fits inside the
 * budget, `head` is the whole text, `tail` is empty and `truncated` is false —
 * callers render the full text in that case.
 */
export function headTailLines(text: string, headLines: number, tailLines: number): HeadTail {
  const lines = splitLines(text)
  const total = lines.length
  const keepHead = Math.max(0, headLines)
  const keepTail = Math.max(0, tailLines)

  if (total <= keepHead + keepTail) {
    return { head: text, tail: '', hidden: 0, truncated: false }
  }

  const head = lines.slice(0, keepHead).join('\n')
  const tail = lines.slice(total - keepTail).join('\n')
  return {
    head,
    tail,
    hidden: total - keepHead - keepTail,
    truncated: true
  }
}

/** Format the hidden-line notice shown between head and tail. */
export function formatHiddenLines(hidden: number): string {
  return `… ${hidden.toLocaleString()} lines hidden …`
}
