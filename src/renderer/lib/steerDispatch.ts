import { PromptImage } from '@shared/types'

export type SteerSource = 'composer' | 'queue'

export type SteerDispatchResult =
  | { source: SteerSource; ok: true }
  | { source: SteerSource; ok: false; error?: unknown }

/**
 * Normalize the renderer's only Steer acknowledgement boundary.
 * Transcript and trajectory callers should act only after this returns ok.
 */
export async function dispatchSteer({
  sessionId,
  text,
  images,
  source,
  steer
}: {
  sessionId: string
  text: string
  images?: PromptImage[]
  source: SteerSource
  steer: (sessionId: string, text: string, images?: PromptImage[]) => Promise<boolean>
}): Promise<SteerDispatchResult> {
  try {
    const accepted = await steer(sessionId, text, images)
    return accepted ? { source, ok: true } : { source, ok: false }
  } catch (error) {
    return { source, ok: false, error }
  }
}
