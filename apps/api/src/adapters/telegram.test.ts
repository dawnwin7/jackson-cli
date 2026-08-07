import { describe, expect, it, vi } from 'vitest'

import { TelegramAdapter, TelegramSendError } from './telegram.js'

describe('TelegramAdapter', () => {
  it('returns deterministic message IDs in test mode without using fetch', async () => {
    const fetchImpl = vi.fn<typeof fetch>()
    const adapter = new TelegramAdapter({
      botToken: 'test-token',
      testMode: true,
      fetchImpl,
    })

    await expect(adapter.sendMessage(424242, 'first')).resolves.toBe(1000)
    await expect(adapter.sendMessage(424242, 'second')).resolves.toBe(1001)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('calls Telegram sendMessage with the exact URL and JSON body', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(JSON.stringify({ ok: true, result: { message_id: 4321 } }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      )
    const adapter = new TelegramAdapter({
      botToken: 'bot-secret',
      apiBaseUrl: 'https://telegram.example.test/',
      fetchImpl,
    })

    await expect(adapter.sendMessage(424242, 'From: alice\n\nhello')).resolves.toBe(4321)
    expect(fetchImpl).toHaveBeenCalledOnce()
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://telegram.example.test/botbot-secret/sendMessage',
      expect.objectContaining({
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chat_id: 424242, text: 'From: alice\n\nhello' }),
        signal: expect.any(AbortSignal),
      }),
    )
  })

  it('aborts a Telegram request after ten seconds', async () => {
    vi.useFakeTimers()
    try {
      const fetchImpl = vi.fn<typeof fetch>((_input, init) => {
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(init.signal?.reason ?? new DOMException('aborted', 'AbortError'))
          })
        })
      })
      const adapter = new TelegramAdapter({ botToken: 'bot-secret', fetchImpl })
      const request = adapter.sendMessage(424242, 'hello')
      const assertion = expect(request).rejects.toMatchObject({ name: 'AbortError' })

      await vi.advanceTimersByTimeAsync(10_000)
      await assertion
      expect(fetchImpl.mock.calls[0]?.[1]?.signal?.aborted).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })

  it.each([
    [
      'a Telegram API error',
      new Response(JSON.stringify({ ok: false, description: 'bot blocked' }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      }),
      'bot blocked',
    ],
    [
      'a missing message ID',
      new Response(JSON.stringify({ ok: true, result: {} }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
      'telegram sendMessage response missing message_id',
    ],
    [
      'a non-JSON response',
      new Response('not-json', { status: 200 }),
      'telegram returned non-json response',
    ],
  ])('turns %s into TelegramSendError', async (_label, response, message) => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(response)
    const adapter = new TelegramAdapter({ botToken: 'bot-secret', fetchImpl })

    const promise = adapter.sendMessage(424242, 'hello')
    await expect(promise).rejects.toBeInstanceOf(TelegramSendError)
    await expect(promise).rejects.toThrow(message)
  })
})
