import { beforeEach, describe, expect, it } from 'vitest'
import { QueuedMessage, useAppStore } from './index'

const sessionId = 'queue-steer-test'

const message = (id: string): QueuedMessage => ({ id, text: id })

beforeEach(() => {
  useAppStore.setState({
    queuedMessages: {
      [sessionId]: [message('Q1'), message('Q2'), message('Q3')]
    },
    steeringQueuedIds: {},
    busy: { [sessionId]: true }
  })
})

describe('queued Steer ownership', () => {
  it('keeps a reserved head in the queue until the ACK resolves', () => {
    expect(useAppStore.getState().reserveQueuedMessage(sessionId, 'Q1')).toBe(true)
    expect(useAppStore.getState().shiftQueuedMessage(sessionId)).toBeUndefined()

    useAppStore.getState().releaseQueuedMessage(sessionId, 'Q1')
    expect(useAppStore.getState().shiftQueuedMessage(sessionId)?.id).toBe('Q1')
    expect(useAppStore.getState().queuedMessages[sessionId].map((item) => item.id)).toEqual(['Q2', 'Q3'])
  })

  it('preserves FIFO when a middle item is reserved and then fails', () => {
    expect(useAppStore.getState().reserveQueuedMessage(sessionId, 'Q2')).toBe(true)
    expect(useAppStore.getState().shiftQueuedMessage(sessionId)?.id).toBe('Q1')
    expect(useAppStore.getState().shiftQueuedMessage(sessionId)).toBeUndefined()

    useAppStore.getState().releaseQueuedMessage(sessionId, 'Q2')
    expect(useAppStore.getState().shiftQueuedMessage(sessionId)?.id).toBe('Q2')
    expect(useAppStore.getState().shiftQueuedMessage(sessionId)?.id).toBe('Q3')
  })

  it('rejects a duplicate reservation for one queued item', () => {
    expect(useAppStore.getState().reserveQueuedMessage(sessionId, 'Q1')).toBe(true)
    expect(useAppStore.getState().reserveQueuedMessage(sessionId, 'Q1')).toBe(false)
    expect(useAppStore.getState().queuedMessages[sessionId].map((item) => item.id)).toEqual(['Q1', 'Q2', 'Q3'])
  })
})
