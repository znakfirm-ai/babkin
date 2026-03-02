import { FastifyInstance, FastifyPluginOptions } from "fastify"
import { randomUUID } from "crypto"
import { transcribeAudio } from "../utils/openaiTranscribe"
import { downloadTelegramFileAsBuffer } from "../utils/telegramFiles"
import { parseOperationFromText, type OperationDraft } from "../utils/openaiParseOperation"
import { env } from "../env"

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

type DraftEntry = {
  telegramUserId: string
  chatId: string
  messageId: number | null
  draft: OperationDraft
  transcript: string
  createdAtMs: number
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

const currencySignMap: Record<NonNullable<OperationDraft["currency"]>, string> = {
  RUB: "₽",
  KZT: "₸",
  USD: "$",
  EUR: "€",
}

const operationTypeLabels: Record<OperationDraft["type"], string> = {
  expense: "Расход",
  income: "Доход",
  transfer: "Перевод",
  debt_received: "Мне вернули долг",
  debt_paid: "Я вернул долг",
  goal_topup: "Пополнение цели",
  unknown: "Операция",
}

const formatAmountWithCurrency = (amount: number | undefined, currency: OperationDraft["currency"] | undefined) => {
  if (!Number.isFinite(amount) || amount === undefined) return null
  const normalizedAmount = Math.abs(amount)
  const formatted = normalizedAmount.toLocaleString("ru-RU")
  const sign = currency ? currencySignMap[currency] : ""
  return sign ? `${formatted} ${sign}` : formatted
}

const buildConfirmText = (draft: OperationDraft) => {
  const typeLabel = operationTypeLabels[draft.type] ?? operationTypeLabels.unknown
  const amountLabel = formatAmountWithCurrency(draft.amount, draft.currency)
  const head = amountLabel ? `${typeLabel} ${amountLabel}` : typeLabel
  const details: string[] = []
  if (draft.categoryHint) details.push(draft.categoryHint)
  if (draft.incomeSourceHint) details.push(draft.incomeSourceHint)
  if (draft.accountHint) details.push(draft.accountHint)
  if (draft.toAccountHint) details.push(draft.toAccountHint)
  if (draft.debtorHint) details.push(draft.debtorHint)
  if (draft.goalHint) details.push(draft.goalHint)
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
    fastify.log.warn(`[draft] forbidden callback: draft=${parsedAction.draftId} user=${callbackUserId ?? "unknown"} chat=${callbackChatId ?? "unknown"}`)
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
      buildConfirmText(draft.draft),
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
      try {
        const parsedOperation = await parseOperationFromText(transcript)
        fastify.log.info(`[parse] ${String(telegramUserId ?? "unknown")} ${String(messageId ?? "unknown")} ${JSON.stringify(parsedOperation)}`)
        if (!chatId || !telegramUserId) {
          fastify.log.warn(`[draft] missing identity fields: user=${String(telegramUserId ?? "unknown")} chat=${String(chatId ?? "unknown")}`)
          return reply.send({ ok: true })
        }
        if (parsedOperation.ok) {
          const draftId = randomUUID()
          draftStore.set(draftId, {
            telegramUserId,
            chatId,
            messageId: messageId ?? null,
            draft: parsedOperation.data,
            transcript,
            createdAtMs: Date.now(),
          })
          await sendTelegramMessage(
            fastify,
            chatId,
            buildConfirmText(parsedOperation.data),
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
