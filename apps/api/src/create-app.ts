import { Hono, type Context } from 'hono'
import { z, type ZodError } from 'zod'

import type { AppConfig, Repository, TelegramClient, UserRecord } from './domain.js'
import {
  generateToken as generateSecureToken,
  hashToken,
  normalizeUsername,
} from './services/tokens.js'

const loginBodySchema = z.object({
  username: z.string().min(1).max(128),
})

const createRequestBodySchema = z.object({
  message: z.string().min(1).max(4000),
})

const webhookBodySchema = z.object({}).loose()
const replyCommandPattern = /^\/reply\s+(?<requestId>\S+)(?:\s+(?<reply>[\s\S]*))?$/

export interface CreateAppDependencies {
  repository: Repository
  telegram: TelegramClient
  config: AppConfig
  generateToken?: () => string
  sleep?: (milliseconds: number) => Promise<void>
  now?: () => number
}

export function createApp({
  repository,
  telegram,
  config,
  generateToken = generateSecureToken,
  sleep = defaultSleep,
  now = Date.now,
}: CreateAppDependencies) {
  const app = new Hono()

  app.post('/cli/login', async (context) => {
    const parsed = loginBodySchema.safeParse(await readJsonBody(context))
    if (!parsed.success) {
      return validationError(context, 'body', parsed.error)
    }

    let usernameNormalized: string
    try {
      usernameNormalized = normalizeUsername(parsed.data.username)
    } catch (error) {
      return context.json(
        { detail: error instanceof Error ? error.message : 'username is required' },
        400,
      )
    }

    const token = generateToken()
    const { user, claimed } = await repository.claimUser({
      username: parsed.data.username,
      usernameNormalized,
      tokenHash: hashToken(token),
    })

    return context.json({
      username_normalized: user.usernameNormalized,
      claimed,
      token: claimed ? token : null,
    })
  })

  app.post('/cli/requests', async (context) => {
    const authenticated = await authenticate(context, repository)
    if ('response' in authenticated) {
      return authenticated.response
    }

    const parsed = createRequestBodySchema.safeParse(await readJsonBody(context))
    if (!parsed.success) {
      return validationError(context, 'body', parsed.error)
    }

    const created = await repository.createRequest(authenticated.user.id, parsed.data.message)
    const sentMessageId = await telegram.sendMessage(
      config.telegramOperatorChatId,
      `From: ${authenticated.user.usernameNormalized}\n\n${parsed.data.message}`,
    )
    await repository.storeTelegramMessage(
      created.id,
      config.telegramOperatorChatId,
      sentMessageId,
    )

    return context.json({ request_id: created.id })
  })

  app.get('/cli/requests/:request_id', async (context) => {
    const authenticated = await authenticate(context, repository)
    if ('response' in authenticated) {
      return authenticated.response
    }

    const wait = parseBooleanQuery(context.req.query('wait'), false)
    const timeoutSeconds = parseFloatQuery(context.req.query('timeout_seconds'), 15)
    if (wait === null || timeoutSeconds === null) {
      return context.json({ detail: 'invalid query parameters' }, 422)
    }

    const requestId = context.req.param('request_id')
    const deadline = now() + Math.min(timeoutSeconds, 60) * 1000

    while (true) {
      const request = await repository.getRequestForUser(requestId, authenticated.user.id)
      if (!request) {
        return context.json({ detail: 'request not found' }, 404)
      }

      const reply = await repository.getReply(requestId)
      if (reply) {
        return context.json({
          request_id: requestId,
          status: 'replied',
          reply: reply.replyText,
        })
      }

      if (!wait || now() >= deadline) {
        return context.json({
          request_id: requestId,
          status: 'pending',
          reply: null,
        })
      }

      await sleep(250)
    }
  })

  app.post('/telegram/webhook', async (context) => {
    if (
      context.req.header('X-Telegram-Bot-Api-Secret-Token') !== config.telegramWebhookSecret
    ) {
      return context.json({ detail: 'invalid telegram webhook secret' }, 401)
    }

    const parsed = webhookBodySchema.safeParse(await readJsonBody(context))
    if (!parsed.success) {
      return validationError(context, 'body', parsed.error)
    }

    const payload = parsed.data
    const updateId = payload.update_id
    if (!Number.isSafeInteger(updateId)) {
      return context.json({ detail: 'missing update_id' }, 400)
    }

    if (await repository.hasWebhookUpdate(updateId as number)) {
      return context.json({ ok: true, duplicate: true })
    }

    const message = asRecord(payload.message) ?? {}
    const chat = asRecord(message.chat) ?? {}
    const messageId = integerOrNull(message.message_id)

    if (chat.id !== config.telegramOperatorChatId) {
      const recorded = await repository.recordWebhookUpdate({
        updateId: updateId as number,
        status: 'ignored',
        messageId,
      })
      if (!recorded) {
        return context.json({ ok: true, duplicate: true })
      }
      return context.json({ ok: true, ignored: true })
    }

    const text = messageText(message)
    let requestId: string | null = null
    let replyText = text

    const replyToMessage = asRecord(message.reply_to_message)
    const replyToMessageId = integerOrNull(replyToMessage?.message_id)
    if (replyToMessageId !== null) {
      requestId = await repository.findRequestByTelegramMessage(
        config.telegramOperatorChatId,
        replyToMessageId,
      )
    }

    const command = parseReplyCommand(text)
    if (requestId === null && command) {
      requestId = command.requestId
      replyText = command.reply
    } else if (command?.reply) {
      replyText = command.reply
    }

    if (!requestId) {
      const recorded = await repository.recordWebhookUpdate({
        updateId: updateId as number,
        status: 'ignored',
        messageId,
      })
      if (!recorded) {
        return context.json({ ok: true, duplicate: true })
      }
      return context.json({ ok: true, ignored: true })
    }

    if (!replyText) {
      replyText = text
    }

    const result = await repository.recordReplyFromWebhook({
      updateId: updateId as number,
      requestId,
      replyText,
      telegramMessageId: messageId,
    })
    if (result.duplicate) {
      return context.json({ ok: true, duplicate: true })
    }

    return context.json({ ok: true, request_id: requestId, created: result.created })
  })

  return app
}

async function authenticate(
  context: Context,
  repository: Repository,
): Promise<{ user: UserRecord } | { response: Response }> {
  const authorization = context.req.header('Authorization')
  if (!authorization) {
    return { response: context.json({ detail: 'missing bearer token' }, 401) }
  }

  // Fetch normalizes a header value of `Bearer ` to `Bearer`.
  if (authorization === 'Bearer') {
    return { response: context.json({ detail: 'invalid bearer token' }, 401) }
  }
  if (!authorization.startsWith('Bearer ')) {
    return { response: context.json({ detail: 'missing bearer token' }, 401) }
  }

  const token = authorization.slice('Bearer '.length).trim()
  const user = await repository.findUserByTokenHash(hashToken(token))
  if (!user) {
    return { response: context.json({ detail: 'invalid bearer token' }, 401) }
  }
  return { user }
}

async function readJsonBody(context: Context): Promise<unknown> {
  const contentType = context.req.header('content-type')?.split(';', 1)[0]?.trim().toLowerCase()
  if (contentType !== 'application/json' && !contentType?.endsWith('+json')) {
    return undefined
  }

  try {
    return await context.req.json()
  } catch {
    return undefined
  }
}

function validationError(context: Context, location: 'body', error: ZodError) {
  return context.json(
    {
      detail: error.issues.map((issue) => ({
        type: issue.code,
        loc: [location, ...issue.path],
        msg: issue.message,
      })),
    },
    422,
  )
}

function parseBooleanQuery(value: string | undefined, fallback: boolean): boolean | null {
  if (value === undefined) {
    return fallback
  }

  switch (value.toLowerCase()) {
    case '1':
    case 'on':
    case 'true':
    case 'yes':
      return true
    case '0':
    case 'off':
    case 'false':
    case 'no':
      return false
    default:
      return null
  }
}

function parseFloatQuery(value: string | undefined, fallback: number): number | null {
  if (value === undefined) {
    return fallback
  }
  if (value.trim() === '') {
    return null
  }

  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null
  }
  return value as Record<string, unknown>
}

function integerOrNull(value: unknown): number | null {
  return Number.isSafeInteger(value) ? (value as number) : null
}

function messageText(message: Record<string, unknown>): string {
  const value = message.text || message.caption || ''
  return String(value).trim()
}

function parseReplyCommand(text: string): { requestId: string; reply: string } | null {
  const match = replyCommandPattern.exec(text.trim())
  if (!match?.groups) {
    return null
  }
  return {
    requestId: match.groups.requestId as string,
    reply: (match.groups.reply ?? '').trim(),
  }
}

function defaultSleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}
