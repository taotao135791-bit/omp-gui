/**
 * Atomic file replacement — vendored and minimally adapted from DeepSeek
 * Harness `packages/util/atomic-write/src/index.ts`.
 *
 * Copyright (c) 2026 DeepSeek
 * MIT License — see THIRD_PARTY_NOTICES.md.
 *
 * Source commit: 47f943859bef60e4160492346772ded9b24f765a
 * Modifications: removed the Cordis `invariant.ts` companion and `withFileLock`
 * (not needed here); `writeFileAtomic` is kept verbatim apart from this header.
 *
 * `writeFileAtomic` writes a random-suffix sibling with exclusive create and the
 * caller's permission bits, then renames it over the target, so readers observe
 * either the old or the new complete content and a replaced file ends up with
 * exactly the stated mode. OMP GUI uses it for GUI-owned metadata sidecars so a
 * crash mid-write can never leave a half-written JSON file.
 */

import { randomBytes } from 'node:crypto'
import { mkdir, rename, rm, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

export interface WriteFileAtomicOptions {
  /** Permission bits stamped on the fresh temp inode and carried through the rename. */
  mode: number
  /** Permission bits for parent directories this call creates (subject to umask). */
  dirMode?: number
}

/**
 * Replace `filename` with `content` in one atomic step, creating parent
 * directories. The content is first written to a random-suffix sibling opened
 * with exclusive create (`wx`): the open refuses to follow a symlink planted at
 * the temp path, and the fresh inode carries `options.mode` through the rename.
 * The rename also replaces a symlinked target itself instead of writing through
 * to its referent. On any failure the temp file is removed and the failure
 * rethrown. Crash durability (fsync) is out of scope.
 */
export async function writeFileAtomic(
  filename: string,
  content: string,
  options: WriteFileAtomicOptions
): Promise<void> {
  await mkdir(dirname(filename), {
    recursive: true,
    ...(options.dirMode === undefined ? {} : { mode: options.dirMode })
  })
  const temp = `${filename}.${randomBytes(6).toString('hex')}.tmp`
  try {
    await writeFile(temp, content, { mode: options.mode, flag: 'wx' })
    await rename(temp, filename)
  } catch (error) {
    await rm(temp, { force: true })
    throw error
  }
}
