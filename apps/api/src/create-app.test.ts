import { createHash } from 'node:crypto'

import { describe, expect, it, vi } from 'vitest'

import { createApp } from './create-app.js'
import type {
  AppConfig,
  ReplyRecord,
  Repository,
  RequestRecord,
  TelegramClient,
  UserRecord,
  WebhookUpdateStatus,
} from './domain.js'

const TEST_CONFIG: AppConfig = {
  telegramOperatorChatId: 424242,
  telegramWebhookSecret: 'test-webhook-secret',
}

interface StoredWebhookUpdate {
  updateId: number
  status: WebhookUpdateStatus
  requestId: string | null
  messageId: number | null
}

class InMemoryRepository implements Repository {
  readonly usersByName = new Map<string, UserRecord>()
  readonly usersByTokenHash = new Map<string, UserRecord>()
  readonly requests = new Map<string, RequestRecord>()
  readonly replies = new Map<string, ReplyRecord>()
  readonly telegramMessagesByRequest = new Map<
    string,
    { operatorChatId: number; sentMessageId: number }
  >()
  readonly telegramMessagesBySentId = new Map<string, string>()
  readonly webhookUpdates = new Map<number, StoredWebhookUpdate>()

  private userSequence = 0
  private requestSequence = 0

  async claimUser(input: {
    username: string
    usernameNormalized: string
    tokenHash: string
  }): Promise<{ user: UserRecord; claimed: boolean }> {
    const existing = this.usersByName.get(input.usernameNormalized)
    if (existing) {
      return { user: existing, claimed: false }
    }

    const user: UserRecord = {
      id: `user-${++this.userSequence}`,
      username: input.username,
      usernameNormalized: input.usernameNormalized,
      tokenHash: input.tokenHash,
      createdAt: new Date('2026-08-07T00:00:00.000Z'),
    }
    this.usersByName.set(user.usernameNormalized, user)
    this.usersByTokenHash.set(user.tokenHash, user)
    return { user, claimed: true }
  }

  async findUserByTokenHash(tokenHash: string): Promise<UserRecord | null> {
    return this.usersByTokenHash.get(tokenHash) ?? null
  }

  async createRequest(userId: string, message: string): Promise<RequestRecord> {
    const now = new Date('2026-08-07T00:00:00.000Z')
    const request: RequestRecord = {
      id: `req_${(++this.requestSequence).toString(16).padStart(16, '0')}`,
      userId,
      message,
      status: 'pending',
      createdAt: now,
      updatedAt: now,
    }
    this.requests.set(request.id, request)
    return request
  }

  async getRequestForUser(requestId: string, userId: string): Promise<RequestRecord | null> {
    const request = this.requests.get(requestId)
    return request?.userId === userId ? request : null
  }

  async getReply(requestId: string): Promise<ReplyRecord | null> {
    return this.replies.get(requestId) ?? null
  }

  async storeTelegramMessage(
    requestId: string,
    operatorChatId: number,
    sentMessageId: number,
  ): Promise<void> {
    this.telegramMessagesByRequest.set(requestId, { operatorChatId, sentMessageId })
    this.telegramMessagesBySentId.set(`${operatorChatId}:${sentMessageId}`, requestId)
  }

  async findRequestByTelegramMessage(
    operatorChatId: number,
    sentMessageId: number,
  ): Promise<string | null> {
    return this.telegramMessagesBySentId.get(`${operatorChatId}:${sentMessageId}`) ?? null
  }

  async hasWebhookUpdate(updateId: number): Promise<boolean> {
    return this.webhookUpdates.has(updateId)
  }

  async recordWebhookUpdate(input: {
    updateId: number
    status: WebhookUpdateStatus
    requestId?: string | null
    messageId?: number | null
  }): Promise<boolean> {
    if (this.webhookUpdates.has(input.updateId)) {
      return false
    }
    this.webhookUpdates.set(input.updateId, {
      updateId: input.updateId,
      status: input.status,
      requestId: input.requestId ?? null,
      messageId: input.messageId ?? null,
    })
    return true
  }

  async addReply(input: {
    requestId: string
    replyText: string
    telegramUpdateId?: number | null
    telegramMessageId?: number | null
  }): Promise<boolean> {
    if (this.replies.has(input.requestId)) {
      return false
    }

    const request = this.requests.get(input.requestId)
    if (!request) {
      throw new Error(`unknown request: ${input.requestId}`)
    }

    const reply: ReplyRecord = {
      requestId: input.requestId,
      replyText: input.replyText,
      telegramUpdateId: input.telegramUpdateId ?? null,
      telegramMessageId: input.telegramMessageId ?? null,
      createdAt: new Date('2026-08-07T00:00:01.000Z'),
    }
    this.replies.set(reply.requestId, reply)
    request.status = 'replied'
    request.updatedAt = reply.createdAt
    return true
  }

  async recordReplyFromWebhook(input: {
    updateId: number
    requestId: string
    replyText: string
    telegramMessageId?: number | null
  }): Promise<{ duplicate: boolean; created: boolean }> {
    if (this.webhookUpdates.has(input.updateId)) {
      return { duplicate: true, created: false }
    }
    if (!this.requests.has(input.requestId)) {
      throw new Error(`unknown request: ${input.requestId}`)
    }

    this.webhookUpdates.set(input.updateId, {
      updateId: input.updateId,
      status: 'processed',
      requestId: input.requestId,
      messageId: input.telegramMessageId ?? null,
    })
    const created = await this.addReply({
      requestId: input.requestId,
      replyText: input.replyText,
      telegramUpdateId: input.updateId,
      telegramMessageId: input.telegramMessageId,
    })
    return { duplicate: false, created }
  }
}

class FakeTelegram implements TelegramClient {
  readonly calls: Array<{ chatId: number; text: string }> = []

  constructor(private readonly sentMessageId = 4321) {}

  async sendMessage(chatId: number, text: string): Promise<number> {
    this.calls.push({ chatId, text })
    return this.sentMessageId
  }
}

interface SetupOverrides {
  repository?: InMemoryRepository
  telegram?: FakeTelegram
  sleep?: (milliseconds: number) => Promise<void>
  generateToken?: () => string
  now?: () => number
}

function setup(overrides: SetupOverrides = {}) {
  const repository = overrides.repository ?? new InMemoryRepository()
  const telegram = overrides.telegram ?? new FakeTelegram()
  let tokenSequence = 0
  const generateToken = overrides.generateToken ?? (() => `test-token-${++tokenSequence}`)
  const app = createApp({
    repository,
    telegram,
    config: TEST_CONFIG,
    generateToken,
    ...(overrides.sleep ? { sleep: overrides.sleep } : {}),
    ...(overrides.now ? { now: overrides.now } : {}),
  })
  return { app, repository, telegram }
}

type TestApp = ReturnType<typeof createApp>

async function readJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T
}

async function postJson(
  app: TestApp,
  path: string,
  body: unknown,
  headers: Record<string, string> = {},
): Promise<Response> {
  return app.request(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
}

async function login(app: TestApp, username: string) {
  const response = await postJson(app, '/cli/login', { username })
  expect(response.status).toBe(200)
  return readJson<{
    username_normalized: string
    claimed: boolean
    token: string | null
  }>(response)
}

function authorization(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` }
}

async function createRequest(app: TestApp, token: string, message = 'question') {
  const response = await postJson(app, '/cli/requests', { message }, authorization(token))
  expect(response.status).toBe(200)
  return readJson<{ request_id: string }>(response)
}

async function postWebhook(
  app: TestApp,
  body: unknown,
  secret: string | null = TEST_CONFIG.telegramWebhookSecret,
): Promise<Response> {
  return postJson(
    app,
    '/telegram/webhook',
    body,
    secret === null ? {} : { 'X-Telegram-Bot-Api-Secret-Token': secret },
  )
}

describe('HTTP surface', () => {
  it('registers only the four archived endpoints', async () => {
    const { app } = setup()
    const routes = app.routes
      .map(({ method, path }) => `${method} ${path.replace(/:[^/]+/g, ':request_id')}`)
      .sort()

    expect(routes).toEqual(
      [
        'GET /cli/requests/:request_id',
        'POST /cli/login',
        'POST /cli/requests',
        'POST /telegram/webhook',
      ].sort(),
    )
    expect((await app.request('/')).status).toBe(404)
    expect((await app.request('/openapi.json')).status).toBe(404)
  })
})

describe('POST /cli/login', () => {
  it('claims a normalized username once and persists only the token hash', async () => {
    const { app, repository } = setup({ generateToken: () => 'test-token-secret' })

    const first = await postJson(app, '/cli/login', { username: ' Alice Smith ' })
    expect(first.status).toBe(200)
    expect(await readJson(first)).toEqual({
      username_normalized: 'alice-smith',
      claimed: true,
      token: 'test-token-secret',
    })

    const stored = repository.usersByName.get('alice-smith')
    expect(stored).toBeDefined()
    expect(stored?.tokenHash).toBe(
      createHash('sha256').update('test-token-secret', 'utf8').digest('hex'),
    )
    expect(stored).not.toHaveProperty('token')

    const second = await postJson(app, '/cli/login', { username: 'alice smith' })
    expect(second.status).toBe(200)
    expect(await readJson(second)).toEqual({
      username_normalized: 'alice-smith',
      claimed: false,
      token: null,
    })
    expect(repository.usersByName.size).toBe(1)
  })

  it.each([
    ['missing username', {}],
    ['empty username', { username: '' }],
    ['non-string username', { username: 42 }],
    ['username longer than 128 characters', { username: 'a'.repeat(129) }],
    ['non-object body', []],
  ])('rejects %s with 422', async (_label, body) => {
    const { app } = setup()
    const response = await postJson(app, '/cli/login', body)
    expect(response.status).toBe(422)
    expect(await readJson<{ detail: unknown }>(response)).toHaveProperty('detail')
  })

  it('accepts a username at the 128-character upper boundary', async () => {
    const { app } = setup()
    const username = 'a'.repeat(128)
    const response = await postJson(app, '/cli/login', { username })
    expect(response.status).toBe(200)
    expect(await readJson<{ username_normalized: string }>(response)).toMatchObject({
      username_normalized: username,
    })
  })

  it('returns 400 when a non-empty input normalizes to an empty username', async () => {
    const { app } = setup()
    const response = await postJson(app, '/cli/login', { username: ' ... !!! ' })
    expect(response.status).toBe(400)
    expect(await readJson(response)).toEqual({ detail: 'username is required' })
  })

  it.each([undefined, 'text/plain'])(
    'requires a JSON content type (%s)',
    async (contentType) => {
      const { app } = setup()
      const response = await app.request('/cli/login', {
        method: 'POST',
        ...(contentType ? { headers: { 'Content-Type': contentType } } : {}),
        body: JSON.stringify({ username: 'alice' }),
      })

      expect(response.status).toBe(422)
      expect(await readJson<{ detail: unknown }>(response)).toHaveProperty('detail')
    },
  )
})

describe('bearer authentication', () => {
  it.each([
    ['missing header', undefined, 'missing bearer token'],
    ['wrong scheme', 'bearer bad-token', 'missing bearer token'],
    ['empty bearer token', 'Bearer ', 'invalid bearer token'],
    ['unknown token', 'Bearer bad-token', 'invalid bearer token'],
  ])('rejects a request with %s', async (_label, header, detail) => {
    const { app } = setup()
    const headers: Record<string, string> = header ? { Authorization: header } : {}
    const response = await postJson(app, '/cli/requests', { message: 'hello' }, headers)
    expect(response.status).toBe(401)
    expect(await readJson(response)).toEqual({ detail })
  })
})

describe('POST /cli/requests', () => {
  it('creates a request and sends the exact operator message', async () => {
    const { app, repository, telegram } = setup()
    const claimed = await login(app, 'Alice')
    const token = claimed.token as string

    const response = await postJson(
      app,
      '/cli/requests',
      { message: 'how are you?' },
      authorization(token),
    )
    expect(response.status).toBe(200)
    expect(await readJson(response)).toEqual({ request_id: 'req_0000000000000001' })
    expect(telegram.calls).toEqual([
      { chatId: TEST_CONFIG.telegramOperatorChatId, text: 'From: alice\n\nhow are you?' },
    ])
    expect(repository.telegramMessagesByRequest.get('req_0000000000000001')).toEqual({
      operatorChatId: TEST_CONFIG.telegramOperatorChatId,
      sentMessageId: 4321,
    })
  })

  it.each([
    ['missing message', {}],
    ['empty message', { message: '' }],
    ['non-string message', { message: 42 }],
    ['message longer than 4000 characters', { message: 'x'.repeat(4001) }],
  ])('rejects %s with 422', async (_label, body) => {
    const { app, telegram } = setup()
    const claimed = await login(app, 'alice')
    const response = await postJson(
      app,
      '/cli/requests',
      body,
      authorization(claimed.token as string),
    )
    expect(response.status).toBe(422)
    expect(telegram.calls).toHaveLength(0)
  })

  it('accepts a message at the 4000-character upper boundary', async () => {
    const { app } = setup()
    const claimed = await login(app, 'alice')
    const response = await postJson(
      app,
      '/cli/requests',
      { message: 'x'.repeat(4000) },
      authorization(claimed.token as string),
    )
    expect(response.status).toBe(200)
  })
})

describe('GET /cli/requests/:request_id', () => {
  it('returns exact pending and replied representations', async () => {
    const { app, repository } = setup()
    const claimed = await login(app, 'alice')
    const token = claimed.token as string
    const { request_id: requestId } = await createRequest(app, token)

    const pending = await app.request(`/cli/requests/${requestId}`, {
      headers: authorization(token),
    })
    expect(pending.status).toBe(200)
    expect(await readJson(pending)).toEqual({
      request_id: requestId,
      status: 'pending',
      reply: null,
    })

    await repository.addReply({ requestId, replyText: 'answer' })
    const replied = await app.request(`/cli/requests/${requestId}`, {
      headers: authorization(token),
    })
    expect(replied.status).toBe(200)
    expect(await readJson(replied)).toEqual({
      request_id: requestId,
      status: 'replied',
      reply: 'answer',
    })
  })

  it('returns the same 404 for an unknown or foreign-owned request', async () => {
    const { app } = setup()
    const alice = await login(app, 'alice')
    const { request_id: requestId } = await createRequest(app, alice.token as string)
    const bob = await login(app, 'bob')

    for (const [id, token] of [
      [requestId, bob.token as string],
      ['req_does_not_exist', alice.token as string],
    ] as const) {
      const response = await app.request(`/cli/requests/${id}`, {
        headers: authorization(token),
      })
      expect(response.status).toBe(404)
      expect(await readJson(response)).toEqual({ detail: 'request not found' })
    }
  })

  it.each(['wait=not-a-boolean', 'timeout_seconds=not-a-number'])(
    'rejects invalid query input %s with 422',
    async (query) => {
      const { app } = setup()
      const claimed = await login(app, 'alice')
      const token = claimed.token as string
      const { request_id: requestId } = await createRequest(app, token)
      const response = await app.request(`/cli/requests/${requestId}?${query}`, {
        headers: authorization(token),
      })
      expect(response.status).toBe(422)
      expect(await readJson<{ detail: unknown }>(response)).toHaveProperty('detail')
    },
  )

  it('polls through injected sleep until a reply appears', async () => {
    const repository = new InMemoryRepository()
    let requestId: string | undefined
    let currentTime = 0
    const sleep = vi.fn(async (milliseconds: number) => {
      currentTime += milliseconds
      if (requestId && !repository.replies.has(requestId)) {
        await repository.addReply({ requestId, replyText: 'delayed reply' })
      }
    })
    const { app } = setup({ repository, sleep, now: () => currentTime })
    const claimed = await login(app, 'alice')
    const created = await createRequest(app, claimed.token as string)
    requestId = created.request_id

    const response = await app.request(
      `/cli/requests/${requestId}?wait=true&timeout_seconds=5`,
      { headers: authorization(claimed.token as string) },
    )
    expect(response.status).toBe(200)
    expect(await readJson(response)).toEqual({
      request_id: requestId,
      status: 'replied',
      reply: 'delayed reply',
    })
    expect(sleep).toHaveBeenCalledTimes(1)
    expect(sleep).toHaveBeenCalledWith(250)
  })

  it('caps polling at 60 seconds and returns pending on timeout', async () => {
    let currentTime = 0
    const sleep = vi.fn(async (_milliseconds: number) => {
      currentTime += 60_000
    })
    const { app } = setup({ sleep, now: () => currentTime })
    const claimed = await login(app, 'alice')
    const { request_id: requestId } = await createRequest(app, claimed.token as string)

    const response = await app.request(
      `/cli/requests/${requestId}?wait=true&timeout_seconds=999`,
      { headers: authorization(claimed.token as string) },
    )
    expect(response.status).toBe(200)
    expect(await readJson(response)).toEqual({
      request_id: requestId,
      status: 'pending',
      reply: null,
    })
    expect(sleep).toHaveBeenCalledTimes(1)
  })
})

describe('POST /telegram/webhook', () => {
  it.each([
    ['missing secret', null],
    ['wrong secret', 'wrong'],
  ])('rejects a webhook with %s', async (_label, secret) => {
    const { app, repository } = setup()
    const response = await postWebhook(app, { update_id: 1 }, secret)
    expect(response.status).toBe(401)
    expect(await readJson(response)).toEqual({ detail: 'invalid telegram webhook secret' })
    expect(repository.webhookUpdates.size).toBe(0)
  })

  it.each([
    ['missing update_id', {}],
    ['string update_id', { update_id: '1' }],
    ['non-integer update_id', { update_id: 1.5 }],
  ])('rejects %s with 400', async (_label, body) => {
    const { app } = setup()
    const response = await postWebhook(app, body)
    expect(response.status).toBe(400)
    expect(await readJson(response)).toEqual({ detail: 'missing update_id' })
  })

  it('deduplicates an already recorded update before processing its message', async () => {
    const { app, repository } = setup()
    const first = await postWebhook(app, {
      update_id: 10,
      message: { message_id: 100, chat: { id: 999 }, text: 'ignored' },
    })
    expect(await readJson(first)).toEqual({ ok: true, ignored: true })

    const duplicate = await postWebhook(app, {
      update_id: 10,
      message: {
        message_id: 101,
        chat: { id: TEST_CONFIG.telegramOperatorChatId },
        text: '/reply missing must not run',
      },
    })
    expect(duplicate.status).toBe(200)
    expect(await readJson(duplicate)).toEqual({ ok: true, duplicate: true })
    expect(repository.webhookUpdates.size).toBe(1)
  })

  it('returns duplicate when a concurrent request records the update first', async () => {
    const repository = new InMemoryRepository()
    const { app } = setup({ repository })
    const claimed = await login(app, 'alice')
    const { request_id: requestId } = await createRequest(app, claimed.token as string)

    vi.spyOn(repository, 'hasWebhookUpdate').mockResolvedValue(false)
    vi.spyOn(repository, 'recordReplyFromWebhook').mockResolvedValue({
      duplicate: true,
      created: false,
    })

    const response = await postWebhook(app, {
      update_id: 10,
      message: {
        message_id: 101,
        chat: { id: TEST_CONFIG.telegramOperatorChatId },
        text: `/reply ${requestId} must not be stored`,
      },
    })

    expect(response.status).toBe(200)
    expect(await readJson(response)).toEqual({ ok: true, duplicate: true })
    expect(repository.replies.has(requestId)).toBe(false)
  })

  it.each([
    [
      'foreign chat',
      { update_id: 11, message: { message_id: 110, chat: { id: 999 }, text: 'nope' } },
    ],
    [
      'uncorrelated operator message',
      {
        update_id: 12,
        message: {
          message_id: 120,
          chat: { id: TEST_CONFIG.telegramOperatorChatId },
          text: 'no target',
        },
      },
    ],
  ])('records and ignores a %s', async (_label, body) => {
    const { app, repository } = setup()
    const response = await postWebhook(app, body)
    expect(response.status).toBe(200)
    expect(await readJson(response)).toEqual({ ok: true, ignored: true })
    expect(repository.webhookUpdates.get(body.update_id)?.status).toBe('ignored')
  })

  it('maps a normal Telegram reply to the sent bot message', async () => {
    const { app, repository } = setup()
    const claimed = await login(app, 'alice')
    const token = claimed.token as string
    const { request_id: requestId } = await createRequest(app, token, 'how are you?')

    const webhook = await postWebhook(app, {
      update_id: 20,
      message: {
        message_id: 501,
        chat: { id: TEST_CONFIG.telegramOperatorChatId },
        text: 'doing well',
        reply_to_message: { message_id: 4321 },
      },
    })
    expect(webhook.status).toBe(200)
    expect(await readJson(webhook)).toEqual({ ok: true, request_id: requestId, created: true })
    expect(repository.webhookUpdates.get(20)).toMatchObject({
      status: 'processed',
      requestId,
      messageId: 501,
    })
    expect(repository.replies.get(requestId)).toMatchObject({
      replyText: 'doing well',
      telegramUpdateId: 20,
      telegramMessageId: 501,
    })

    const result = await app.request(`/cli/requests/${requestId}`, {
      headers: authorization(token),
    })
    expect(await readJson(result)).toEqual({
      request_id: requestId,
      status: 'replied',
      reply: 'doing well',
    })
  })

  it('supports reply commands and preserves the first reply', async () => {
    const { app, repository } = setup()
    const claimed = await login(app, 'bob')
    const token = claimed.token as string
    const { request_id: requestId } = await createRequest(app, token)

    const first = await postWebhook(app, {
      update_id: 30,
      message: {
        message_id: 601,
        chat: { id: TEST_CONFIG.telegramOperatorChatId },
        text: `/reply ${requestId} answer`,
      },
    })
    expect(await readJson(first)).toEqual({ ok: true, request_id: requestId, created: true })

    const second = await postWebhook(app, {
      update_id: 31,
      message: {
        message_id: 602,
        chat: { id: TEST_CONFIG.telegramOperatorChatId },
        text: `/reply ${requestId} different`,
      },
    })
    expect(await readJson(second)).toEqual({ ok: true, request_id: requestId, created: false })
    expect(repository.webhookUpdates.get(30)?.status).toBe('processed')
    expect(repository.webhookUpdates.get(31)?.status).toBe('processed')
    expect(repository.replies.get(requestId)?.replyText).toBe('answer')

    const result = await app.request(`/cli/requests/${requestId}`, {
      headers: authorization(token),
    })
    expect(await readJson<{ reply: string }>(result)).toMatchObject({ reply: 'answer' })
  })
})
