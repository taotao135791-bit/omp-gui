import { StringDecoder } from 'node:string_decoder'

/**
 * Transport layer for pi/omp `--mode rpc`: strict LF-only JSONL over
 * stdio — one line == one JSON object, both directions.
 *
 * Reader guarantees (mirroring pi's own jsonl.js, verified against the
 * installed 0.80.3 — see docs/protocol-facts.md):
 * - StringDecoder stitching, so multi-byte UTF-8 characters split across
 *   stream chunks never corrupt a line;
 * - partial reads: an arbitrary byte split only delays a line;
 * - several frames in one chunk are all surfaced;
 * - a trailing `\r` is stripped from each line.
 *
 * Safety valve absent from pi itself: a single line may not exceed
 * MAX_LINE_BYTES. An oversize line produces a transport-level error event
 * (and is dropped up to the next LF) instead of growing memory without
 * bound or crashing the host.
 *
 * Seam for future protocol versions: pi 0.80.3 has **no** `ready` frame,
 * **no** handshake/negotiation and **no** `rpc_chunk` framing, so none of
 * that is fabricated here. If a future pi advertises them, this is where
 * they attach: a `negotiate()` step before the first `serializeCommand`
 * write, and/or a frame codec wrapping `push()`, without OmpSession or
 * OmpProtocol changing.
 *
 * Pure Node — no Electron imports — so it is unit-testable in isolation.
 */

/** Maximum accepted size of one JSONL frame, in bytes (16 MB). */
export const MAX_LINE_BYTES = 16 * 1024 * 1024

export type TransportEvent =
  | { kind: 'line'; line: string }
  /** Transport-level problem (e.g. oversize line); the stream stays open. */
  | { kind: 'error'; message: string }

/**
 * Incremental Buffer → JSONL lines reader. Feed stdout chunks to `push()`,
 * call `flush()` at EOF to surface a trailing line without a final LF.
 */
export class LineReader {
  private decoder = new StringDecoder('utf8')
  private buffer = ''
  /** Byte length of `buffer` (tracked incrementally; byteLength is O(n)). */
  private pendingBytes = 0
  /** Dropping the remainder of an oversize line until its LF arrives. */
  private dropping = false

  push(chunk: Buffer): TransportEvent[] {
    const events: TransportEvent[] = []
    let text = this.decoder.write(chunk)

    if (this.dropping) {
      const idx = text.indexOf('\n')
      if (idx === -1) return events // still inside the oversize line
      text = text.slice(idx + 1)
      this.dropping = false
      this.buffer = ''
      this.pendingBytes = 0
    }

    this.pendingBytes += chunk.length
    const combined = this.buffer + text
    const parts = combined.split('\n')
    this.buffer = parts.pop() ?? ''
    if (parts.length > 0) {
      // Complete lines were consumed; the exact byte count of the short
      // remainder is cheap to recompute and keeps `pendingBytes` honest.
      this.pendingBytes = Buffer.byteLength(this.buffer, 'utf8')
      for (const part of parts) {
        const line = part.endsWith('\r') ? part.slice(0, -1) : part
        if (line.trim().length > 0) events.push({ kind: 'line', line })
      }
    }

    if (this.pendingBytes > MAX_LINE_BYTES) {
      events.push({
        kind: 'error',
        message: `RPC line exceeded the ${MAX_LINE_BYTES}-byte limit; dropping it`
      })
      this.buffer = ''
      this.pendingBytes = 0
      this.dropping = true
    }
    return events
  }

  /** EOF: emit a residual line that never got its terminating LF. */
  flush(): TransportEvent[] {
    const tail = this.decoder.end()
    const events: TransportEvent[] = []
    if (!this.dropping) {
      let rest = this.buffer + tail
      if (rest.endsWith('\r')) rest = rest.slice(0, -1)
      if (rest.trim().length > 0) events.push({ kind: 'line', line: rest })
    }
    this.buffer = ''
    this.pendingBytes = 0
    this.dropping = false
    return events
  }
}

/**
 * Split a stream chunk into complete lines, keeping the remainder in
 * `buffer`. Strips a trailing `\r` per line and skips blank lines.
 * String-level helper — prefer LineReader for Buffer streams.
 */
export function drainLines(buffer: string, chunk: string): { lines: string[]; rest: string } {
  const combined = buffer + chunk
  const parts = combined.split('\n')
  const rest = parts.pop() || ''
  const lines: string[] = []
  for (const part of parts) {
    const line = part.endsWith('\r') ? part.slice(0, -1) : part
    if (line.trim().length > 0) lines.push(line)
  }
  return { lines, rest }
}

/** Serialize a command object into one LF-terminated JSONL frame for stdin. */
export function serializeCommand(command: Record<string, unknown>): string {
  return JSON.stringify(command) + '\n'
}

/**
 * Bounded text capture for a noisy stream (ring buffer, default 10 KB).
 * Used for session stderr: the CLI writes progress/diagnostic noise there,
 * so it is never streamed to the chat; only the tail is surfaced when the
 * process dies abnormally. (Re-exported by OmpProcess, its owner.)
 */
export class StderrRing {
  private buffer = ''

  constructor(private readonly maxChars = 10_000) {}

  push(chunk: Buffer | string): void {
    this.buffer += typeof chunk === 'string' ? chunk : chunk.toString('utf-8')
    if (this.buffer.length > this.maxChars) {
      this.buffer = this.buffer.slice(-this.maxChars)
    }
  }

  /** Last `maxLines` lines of the captured output ('' when empty). */
  tail(maxLines = 3): string {
    return this.buffer.trim().split('\n').slice(-maxLines).join('\n')
  }
}
