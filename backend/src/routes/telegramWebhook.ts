import { FastifyInstance, FastifyPluginOptions } from "fastify"
import { randomUUID } from "crypto"
import { prisma } from "../db/prisma"
import { env } from "../env"
import { transcribeAudio } from "../utils/openaiTranscribe"
import { parseOperationFromText, type OperationContext, type OperationDraftResolved } from "../utils/openaiParseOperation"
import { downloadTelegramFileAsBuffer } from "../utils/telegramFiles"

type TelegramMessage = {
  message_id?: number
  from?: { id?: number | string | null } | null
  chat?: { id?: number | string | null } | null
  voice?: { file_id?: string | null } | null
  audio?: { file_id?: string | null } | null
}

type TelegramCallbackQuery = {
  id?: string
  data?: string | null
  from?: { id?: number | string | null } | null
  message?: TelegramMessage | null
}

type TelegramUpdate = {
  update_id?: number
  message?: TelegramMessage | null
  callback_query?: TelegramCallbackQuery | null
}

type DraftLookup = {
  accounts: Record<string, string>
  categories: Record<string, string>
  incomeSources: Record<string, string>
  goals: Record<string, string>
  debtors: Record<string, string>
}

type DraftEntry = {
  telegramUserId: string
  chatId: string
  messageId: number | null
  draft: OperationDraftResolved
  transcript: string
  createdAtMs: number
  lookup: DraftLookup
}

const extensionByMime: Record<string, string> = {
  "audio/ogg": "ogg",
  "audio/opus": "ogg",
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/mp4": "m4a",
  "audio/x-m4a": "m4a",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
}

const draftStore = new Map<string, DraftEntry>()

function resolveFileName(messageId: number | undefined, mimeType: string | null): string {
  const normalizedMime = (mimeType ?? "").split(";")[0].trim().toLowerCase()
  const extension = extensionByMime[normalizedMime] ?? "ogg"
  return `voice-${messageId ?? "unknown"}.${extension}`
}

const toStringId = (value: number | string | null | undefined): string | null => {
  if (typeof value === "number" && Number.isFinite(value)) return String(value)
  if (typeof value === "string" && value.trim().length > 0) return value.trim()
  return null
}

const currencySignMap: Record<NonNullable<OperationDraftResolved["currency"]>, string> = {
  RUB: "₽",
  KZT: "₸",
  USD: "$",
  EUR: "€",
}

const operationTypeLabels: Record<OperationDraftResolved["type"], string> = {
  expense: "Расход",
  income: "Доход",
  transfer: "Перевод",
  debt_received: "Мне вернули долг",
  debt_paid: "Я вернул долг",
  goal_topup: "Пополнение цели",
  unknown: "Операция",
}

const formatAmountWithCurrency = (
  amount: number | undefined,
  currency: OperationDraftResolved["currency"] | undefined,
) => {
  if (!Number.isFinite(amount) || amount === undefined) return null
  const normalizedAmount = Math.abs(amount)
  const formatted = normalizedAmount.toLocaleString("ru-RU")
  const sign = currency ? currencySignMap[currency] : ""
  return sign ? `${formatted} ${sign}` : formatted
}

const toLookup = (context: OperationContext): DraftLookup => ({
  accounts: Object.fromEntries(context.accounts.map((account) => [account.id, account.name])),
  categories: Object.fromEntries(context.categories.map((category) => [category.id, category.name])),
  incomeSources: Object.fromEntries(context.incomeSources.map((source) => [source.id, source.name])),
  goals: Object.fromEntries(context.goals.map((goal) => [goal.id, goal.name])),
  debtors: Object.fromEntries(context.debtors.map((debtor) => [debtor.id, debtor.name])),
})

const buildConfirmText = (draft: OperationDraftResolved, lookup: DraftLookup) => {
  const typeLabel = operationTypeLabels[draft.type] ?? operationTypeLabels.unknown
  const amountLabel = formatAmountWithCurrency(draft.amount, draft.currency)
  const head = amountLabel ? `${typeLabel} ${amountLabel}` : typeLabel
  const details: string[] = []

  if (draft.categoryId && lookup.categories[draft.categoryId]) details.push(lookup.categories[draft.categoryId])
  if (draft.incomeSourceId && lookup.incomeSources[draft.incomeSourceId]) details.push(lookup.incomeSources[draft.incomeSourceId])
  if (draft.debtorId && lookup.debtors[draft.debtorId]) details.push(lookup.debtors[draft.debtorId])
  if (draft.goalId && lookup.goals[draft.goalId]) details.push(lookup.goals[draft.goalId])
  if (draft.accountId && lookup.accounts[draft.accountId]) details.push(lookup.accounts[draft.accountId])
  if (draft.toAccountId && lookup.accounts[draft.toAccountId]) details.push(lookup.accounts[draft.toAccountId])

  const suffix = details.length > 0 ? ` • ${details.join(" • ")}` : ""
  return `Понял так: ${head}${suffix}. Создать?`
}

const buildConfirmKeyboard = (draftId: string) => ({
  inline_keyboard: [
    [
      { text: "✅ Создать", callback_data: `draft:${draftId}:confirm` },
      { text: "✏️ Редактировать", callback_data: `draft:${draftId}:edit` },
      { text: "❌ Отмена", callback_data: `draft:${draftId}:cancel` },
    ],
  ],
})

const buildEditKeyboard = (draftId: string) => ({
  inline_keyboard: [
    [
      { text: "Сумма", callback_data: `draft:${draftId}:edit_amount` },
      { text: "Категория", callback_data: `draft:${draftId}:edit_category` },
    ],
    [
      { text: "Счёт", callback_data: `draft:${draftId}:edit_account` },
      { text: "Назад", callback_data: `draft:${draftId}:edit_back` },
    ],
  ],
})

async function callTelegramApi(
  fastify: FastifyInstance,
  method: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const botToken = env.BOT_TOKEN
  if (!botToken) {
    fastify.log.warn(`[telegram] BOT_TOKEN missing, skip ${method}`)
    return
  }

  try {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
    if (!response.ok) {
      const text = await response.text().catch(() => "")
      fastify.log.error(`[telegram] ${method} failed: ${response.status} ${text}`)
      return
    }
    const result = (await response.json().catch(() => ({}))) as { ok?: boolean; description?: string }
    if (result.ok === false) {
      fastify.log.error(`[telegram] ${method} error: ${result.description ?? "unknown"}`)
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return
    }
    const message = error instanceof Error ? error.message : String(error)
    fastify.log.error(`[telegram] ${method} request error: ${message}`)
  }
}

async function sendTelegramMessage(
  fastify: FastifyInstance,
  chatId: string,
  text: string,
  replyMarkup?: Record<string, unknown>,
): Promise<void> {
  const payload: Record<string, unknown> = { chat_id: chatId, text }
  if (replyMarkup) {
    payload.reply_markup = replyMarkup
  }
  await callTelegramApi(fastify, "sendMessage", payload)
}

async function answerCallbackQuery(fastify: FastifyInstance, callbackQueryId: string): Promise<void> {
  await callTelegramApi(fastify, "answerCallbackQuery", { callback_query_id: callbackQueryId })
}

const parseDraftAction = (value: string | null | undefined): { draftId: string; action: string } | null => {
  if (!value) return null
  const parts = value.split(":")
  if (parts.length < 3) return null
  if (parts[0] !== "draft") return null
  const draftId = parts[1]?.trim()
  const action = parts.slice(2).join(":").trim()
  if (!draftId || !action) return null
  return { draftId, action }
}

async function loadOperationContextByTelegramUserId(telegramUserId: string): Promise<OperationContext | null> {
  const user = await prisma.users.findUnique({
    where: { telegram_user_id: telegramUserId },
    select: { active_workspace_id: true },
  })
  const workspaceId = user?.active_workspace_id ?? null
  if (!workspaceId) return null

  const accounts = await prisma.accounts.findMany({
    where: { workspace_id: workspaceId, is_archived: false, archived_at: null },
    select: { id: true, name: true, currency: true },
  })

  const categories = await prisma.categories.findMany({
    where: { workspace_id: workspaceId },
    select: { id: true, name: true, kind: true },
  })

  const incomeSources = await prisma.income_sources.findMany({
    where: { workspace_id: workspaceId },
    select: { id: true, name: true },
  })

  const goals = await prisma.goals.findMany({
    where: { workspace_id: workspaceId },
    select: { id: true, name: true },
  })

  const debtors = await prisma.debtors.findMany({
    where: { workspace_id: workspaceId },
    select: { id: true, name: true, direction: true },
  })

  return {
    accounts: accounts.map((account) => ({ id: account.id, name: account.name, currency: account.currency })),
    categories: categories.map((category) => ({ id: category.id, name: category.name, kind: category.kind })),
    incomeSources: incomeSources.map((source) => ({ id: source.id, name: source.name })),
    goals: goals.map((goal) => ({ id: goal.id, name: goal.name })),
    debtors: debtors.map((debtor) => ({ id: debtor.id, name: debtor.name, direction: debtor.direction === "PAYABLE" ? "payable" : "receivable" })),
  }
}

async function handleDraftCallback(
  fastify: FastifyInstance,
  callbackQuery: TelegramCallbackQuery,
): Promise<void> {
  const callbackQueryId = callbackQuery.id?.trim()
  if (callbackQueryId) {
    await answerCallbackQuery(fastify, callbackQueryId)
  }

  const parsedAction = parseDraftAction(callbackQuery.data)
  if (!parsedAction) return

  const draft = draftStore.get(parsedAction.draftId)
  const callbackUserId = toStringId(callbackQuery.from?.id)
  const callbackChatId = toStringId(callbackQuery.message?.chat?.id)

  if (!draft) {
    if (callbackChatId) {
      await sendTelegramMessage(fastify, callbackChatId, "Черновик не найден.")
    }
    return
  }

  if (!callbackUserId || !callbackChatId || callbackUserId !== draft.telegramUserId || callbackChatId !== draft.chatId) {
    fastify.log.warn(
      `[draft] forbidden callback: draft=${parsedAction.draftId} user=${callbackUserId ?? "unknown"} chat=${callbackChatId ?? "unknown"}`,
    )
    return
  }

  if (parsedAction.action === "confirm") {
    fastify.log.info(`[confirm] ${draft.telegramUserId} ${parsedAction.draftId} ${JSON.stringify(draft.draft)}`)
    await sendTelegramMessage(
      fastify,
      draft.chatId,
      `Ок, на следующем шаге будем создавать. Draft ${parsedAction.draftId} подтвержден.`,
    )
    return
  }

  if (parsedAction.action === "cancel") {
    draftStore.delete(parsedAction.draftId)
    fastify.log.info(`[cancel] ${draft.telegramUserId} ${parsedAction.draftId}`)
    await sendTelegramMessage(fastify, draft.chatId, "Отменено.")
    return
  }

  if (parsedAction.action === "edit") {
    fastify.log.info(`[edit] ${draft.telegramUserId} ${parsedAction.draftId}`)
    await sendTelegramMessage(fastify, draft.chatId, "Что исправить?", buildEditKeyboard(parsedAction.draftId))
    return
  }

  if (parsedAction.action === "edit_amount") {
    fastify.log.info(`[edit_amount] ${draft.telegramUserId} ${parsedAction.draftId}`)
    await sendTelegramMessage(fastify, draft.chatId, "Ок, редактирование суммы сделаем следующим шагом")
    return
  }

  if (parsedAction.action === "edit_category") {
    fastify.log.info(`[edit_category] ${draft.telegramUserId} ${parsedAction.draftId}`)
    await sendTelegramMessage(fastify, draft.chatId, "Ок, редактирование категории сделаем следующим шагом")
    return
  }

  if (parsedAction.action === "edit_account") {
    fastify.log.info(`[edit_account] ${draft.telegramUserId} ${parsedAction.draftId}`)
    await sendTelegramMessage(fastify, draft.chatId, "Ок, редактирование счёта сделаем следующим шагом")
    return
  }

  if (parsedAction.action === "edit_back") {
    fastify.log.info(`[edit_back] ${draft.telegramUserId} ${parsedAction.draftId}`)
    await sendTelegramMessage(
      fastify,
      draft.chatId,
      buildConfirmText(draft.draft, draft.lookup),
      buildConfirmKeyboard(parsedAction.draftId),
    )
  }
}

export async function telegramWebhookRoutes(fastify: FastifyInstance, _opts: FastifyPluginOptions) {
  fastify.post("/telegram/webhook", async (request, reply) => {
    const update = request.body as TelegramUpdate
    const callbackQuery = update?.callback_query ?? null
    if (callbackQuery) {
      try {
        await handleDraftCallback(fastify, callbackQuery)
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return reply.send({ ok: true })
        }
        const messageText = error instanceof Error ? error.message : String(error)
        fastify.log.error(`[callback] failed: ${messageText}`)
      }
      return reply.send({ ok: true })
    }

    const message = update?.message ?? null
    const fileId = message?.voice?.file_id ?? message?.audio?.file_id

    if (!fileId) {
      return reply.send({ ok: true })
    }

    const messageId = message?.message_id
    const telegramUserId = toStringId(message?.from?.id)
    const chatId = toStringId(message?.chat?.id)

    try {
      const downloaded = await downloadTelegramFileAsBuffer(fileId)
      const filename = resolveFileName(messageId, downloaded.mimeType)
      const transcript = await transcribeAudio(downloaded.buffer, filename)
      fastify.log.info(`[voice] ${String(telegramUserId ?? "unknown")} ${String(messageId ?? "unknown")} ${transcript}`)

      if (!chatId || !telegramUserId) {
        fastify.log.warn(
          `[draft] missing identity fields: user=${String(telegramUserId ?? "unknown")} chat=${String(chatId ?? "unknown")}`,
        )
        return reply.send({ ok: true })
      }

      const context = await loadOperationContextByTelegramUserId(telegramUserId)
      if (!context) {
        fastify.log.warn(`[parse] no active workspace context for telegram user ${telegramUserId}`)
        await sendTelegramMessage(fastify, chatId, "Не понял, уточни")
        return reply.send({ ok: true })
      }

      try {
        const parsedOperation = await parseOperationFromText(transcript, context)
        fastify.log.info(`[parse] ${telegramUserId} ${String(messageId ?? "unknown")} ${JSON.stringify(parsedOperation)}`)

        if (parsedOperation.ok) {
          const draftId = randomUUID()
          const lookup = toLookup(context)
          draftStore.set(draftId, {
            telegramUserId,
            chatId,
            messageId: messageId ?? null,
            draft: parsedOperation.data,
            transcript,
            createdAtMs: Date.now(),
            lookup,
          })
          await sendTelegramMessage(
            fastify,
            chatId,
            buildConfirmText(parsedOperation.data, lookup),
            buildConfirmKeyboard(draftId),
          )
        } else {
          await sendTelegramMessage(fastify, chatId, "Не понял, уточни")
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return reply.send({ ok: true })
        }
        const messageText = error instanceof Error ? error.message : String(error)
        fastify.log.error(`[parse] error ${messageText}`)
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return reply.send({ ok: true })
      }
      const messageText = error instanceof Error ? error.message : String(error)
      fastify.log.error(`[voice] failed: ${messageText}`)
    }

    return reply.send({ ok: true })
  })
}
