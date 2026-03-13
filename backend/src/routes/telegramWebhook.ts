import { FastifyInstance, FastifyPluginOptions } from "fastify"
import {
  BotOperationDraftStatus,
  BotOperationSourceType,
  BotSessionMode,
  BotUserStage,
  Prisma,
  bot_operation_drafts,
  bot_sessions,
  bot_user_states,
} from "@prisma/client"
import { prisma } from "../db/prisma"
import { env } from "../env"
import { seedWorkspaceDefaults } from "../defaults/workspaceDefaults"
import { createWorkspaceTransaction } from "./transactions"
import { transcribeAudio } from "../utils/openaiTranscribe"
import { parseOperationFromText, type OperationContext, type OperationDraftResolved, type ParsedOperation } from "../utils/openaiParseOperation"
import { extractReceiptFromImage, type ReceiptExtract } from "../utils/openaiReceiptExtract"
import { downloadTelegramFileAsBuffer } from "../utils/telegramFiles"
import { resolveTelegramBotUsername } from "../utils/telegramBotUsername"

type TelegramPhotoSize = {
  file_id?: string | null
  file_size?: number | null
}

type TelegramDocument = {
  file_id?: string | null
  mime_type?: string | null
  file_size?: number | null
}

type TelegramChat = {
  id?: number | string | null
}

type TelegramUser = {
  id?: number | string | null
  first_name?: string | null
  username?: string | null
}

type TelegramMessage = {
  message_id?: number
  from?: TelegramUser | null
  chat?: TelegramChat | null
  text?: string | null
  photo?: TelegramPhotoSize[] | null
  document?: TelegramDocument | null
  voice?: { file_id?: string | null } | null
  audio?: { file_id?: string | null; mime_type?: string | null } | null
}

type TelegramCallbackQuery = {
  id?: string
  data?: string | null
  from?: TelegramUser | null
  message?: TelegramMessage | null
}

type TelegramUpdate = {
  update_id?: number
  message?: TelegramMessage | null
  callback_query?: TelegramCallbackQuery | null
}

type TelegramSendMessageResult = {
  message_id?: number
}

type CaptureSourceInput =
  | {
      kind: "text"
      text: string
      sourceMessageId: number | null
    }
  | {
      kind: "voice"
      fileId: string
      fileNameHint: string
      sourceMessageId: number | null
    }
  | {
      kind: "receipt"
      fileId: string
      sourceMessageId: number | null
    }

type PendingCaptureInput = {
  kind: CaptureSourceInput["kind"]
  text?: string
  fileId?: string
  fileNameHint?: string
  sourceMessageId?: number | null
}

type OnboardingSessionState = {
  completedSaves: number
}

type DraftPayload = {
  transientUserMessageIds: number[]
}

type DraftType = "expense" | "income" | "transfer" | "debt_received" | "debt_paid" | "goal_topup" | "unknown"

type DraftLookupMemory = {
  signature: string
  tokens: string[]
  type: DraftType
  fromEntityId: string | null
  toEntityId: string | null
  categoryId: string | null
  incomeSourceId: string | null
}

type DraftSemanticHints = {
  signature: string
  tokens: string[]
  explicitType: DraftType | null
  explicitAccountId: string | null
  explicitCategoryId: string | null
  explicitIncomeSourceId: string | null
  explicitReceivableDebtorId: string | null
  explicitPayableDebtorId: string | null
  explicitGoalId: string | null
}

type DraftShape = {
  type: DraftType
  amount: number | null
  fromEntityId: string | null
  toEntityId: string | null
  categoryId: string | null
  incomeSourceId: string | null
  happenedAt: Date
  description: string | null
  confidence: number | null
}

type PickerKind = "acc" | "cat" | "src" | "from" | "to" | "ws"

type InlineKeyboardButton = {
  text: string
  callback_data?: string
  url?: string
  web_app?: { url: string }
}

type WorkspaceOption = {
  id: string
  name: string
}

type BotOperationContext = OperationContext & {
  workspaceLabel: string
}

type CreatedTransaction = Awaited<ReturnType<typeof createWorkspaceTransaction>>

const ACTIVE_DRAFT_STATUSES: BotOperationDraftStatus[] = [
  BotOperationDraftStatus.pending_review,
  BotOperationDraftStatus.awaiting_field_input,
  BotOperationDraftStatus.awaiting_choice,
  BotOperationDraftStatus.saving,
]

const EDIT_PAGE_SIZE = 10
const MAX_RECEIPT_IMAGE_BYTES = 8 * 1024 * 1024

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

const currencySignMap: Record<string, string> = {
  RUB: "₽",
  KZT: "₸",
  USD: "$",
  EUR: "€",
}

const operationTypeLabels: Record<DraftType, string> = {
  expense: "Расход",
  income: "Доход",
  transfer: "Перевод",
  debt_received: "Мне должны",
  debt_paid: "Я должен",
  goal_topup: "Цель",
  unknown: "Не выбран",
}

const TELEGRAM_STARTAPP_PREFIX = "dl1_"
const TELEGRAM_STARTAPP_MAX_LENGTH = 512

const semanticStopWords = new Set([
  "на",
  "в",
  "из",
  "по",
  "к",
  "и",
  "или",
  "за",
  "через",
  "для",
  "со",
  "с",
  "от",
  "до",
  "про",
  "под",
  "без",
  "во",
  "при",
  "это",
  "мне",
  "мой",
  "моя",
  "мой",
  "руб",
  "рублей",
  "р",
  "рф",
  "коп",
  "копеек",
  "сегодня",
  "вчера",
  "позавчера",
  "счета",
  "счет",
  "счёт",
  "категория",
  "источник",
  "доход",
  "расход",
  "перевод",
  "долг",
  "долга",
  "долги",
  "цель",
  "цели",
])

const toStringId = (value: number | string | null | undefined): string | null => {
  if (typeof value === "number" && Number.isFinite(value)) return String(value)
  if (typeof value === "string" && value.trim().length > 0) return value.trim()
  return null
}

const toSafeText = (value: string | null | undefined): string | null => {
  const trimmed = value?.trim()
  return trimmed && trimmed.length > 0 ? trimmed : null
}

const parseDraftType = (value: string | null | undefined): DraftType => {
  if (
    value === "expense" ||
    value === "income" ||
    value === "transfer" ||
    value === "debt_received" ||
    value === "debt_paid" ||
    value === "goal_topup"
  ) {
    return value
  }
  return "unknown"
}

const parseAmount = (value: Prisma.Decimal | null | undefined): number | null => {
  if (!value) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

const formatAmountWithCurrency = (amount: number | null | undefined, currencyCode: string | null | undefined): string => {
  if (!Number.isFinite(amount)) return "—"
  const amountLabel = Math.abs(amount as number).toLocaleString("ru-RU")
  const sign = currencyCode ? currencySignMap[currencyCode] ?? currencyCode : "₽"
  return `${amountLabel} ${sign}`
}

const formatDateDMY = (value: Date): string => {
  const day = String(value.getDate()).padStart(2, "0")
  const month = String(value.getMonth() + 1).padStart(2, "0")
  const year = String(value.getFullYear())
  return `${day}.${month}.${year}`
}

const startOfToday = () => {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0, 0)
}

const yesterday = () => {
  const date = startOfToday()
  date.setDate(date.getDate() - 1)
  return date
}

const resolveFileNameHint = (messageId: number | undefined, mimeType: string | null): string => {
  const normalizedMime = (mimeType ?? "").split(";")[0].trim().toLowerCase()
  const extension = extensionByMime[normalizedMime] ?? "ogg"
  return `voice-${messageId ?? "unknown"}.${extension}`
}

const parseEditedAmount = (input: string): number | null => {
  const compact = input
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/₽/g, "")
    .replace(/руб(лей|ля|ль)?/g, "")
    .replace(/р\./g, "")
    .replace(/р/g, "")

  if (!compact) return null

  const match = compact.match(/(\d+(?:[.,]\d+)?)([kк])?/) 
  if (!match) return null

  const rawValue = Number(match[1].replace(",", "."))
  if (!Number.isFinite(rawValue) || rawValue <= 0) return null

  const multiplier = match[2] ? 1000 : 1
  const value = rawValue * multiplier
  if (!Number.isFinite(value) || value <= 0) return null

  return value
}

const parseOnboardingSessionState = (value: Prisma.JsonValue | null): OnboardingSessionState | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  const raw = value as Record<string, unknown>
  const onboardingRaw = raw.onboardingSession
  if (!onboardingRaw || typeof onboardingRaw !== "object" || Array.isArray(onboardingRaw)) return null
  const onboardingObj = onboardingRaw as Record<string, unknown>
  const completedSavesRaw = onboardingObj.completedSaves
  if (typeof completedSavesRaw !== "number" || !Number.isFinite(completedSavesRaw) || completedSavesRaw < 0) return null
  return { completedSaves: Math.floor(completedSavesRaw) }
}

const unwrapPendingCaptureInputValue = (value: Prisma.JsonValue | null): Prisma.JsonValue | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value
  const raw = value as Record<string, unknown>
  const wrappedPending = raw.pendingCaptureInput
  if (wrappedPending && typeof wrappedPending === "object" && !Array.isArray(wrappedPending)) {
    return wrappedPending as Prisma.JsonValue
  }
  return value
}

const parsePendingCaptureInput = (value: Prisma.JsonValue | null): PendingCaptureInput | null => {
  const unwrappedValue = unwrapPendingCaptureInputValue(value)
  if (!unwrappedValue || typeof unwrappedValue !== "object" || Array.isArray(unwrappedValue)) return null
  const raw = unwrappedValue as Record<string, unknown>
  const kindRaw = typeof raw.kind === "string" ? raw.kind : null
  if (kindRaw !== "text" && kindRaw !== "voice" && kindRaw !== "receipt") return null

  const sourceMessageIdRaw = raw.sourceMessageId
  const sourceMessageId = typeof sourceMessageIdRaw === "number" && Number.isFinite(sourceMessageIdRaw)
    ? sourceMessageIdRaw
    : null

  if (kindRaw === "text") {
    const text = typeof raw.text === "string" ? raw.text.trim() : ""
    if (!text) return null
    return { kind: "text", text, sourceMessageId }
  }

  if (kindRaw === "voice") {
    const fileId = typeof raw.fileId === "string" ? raw.fileId.trim() : ""
    if (!fileId) return null
    const fileNameHint = typeof raw.fileNameHint === "string" && raw.fileNameHint.trim().length > 0
      ? raw.fileNameHint.trim()
      : "voice.ogg"
    return { kind: "voice", fileId, fileNameHint, sourceMessageId }
  }

  const fileId = typeof raw.fileId === "string" ? raw.fileId.trim() : ""
  if (!fileId) return null
  return { kind: "receipt", fileId, sourceMessageId }
}

const toPendingCaptureInputJson = (input: CaptureSourceInput | PendingCaptureInput): Prisma.JsonObject => {
  if (input.kind === "text") {
    return {
      kind: input.kind,
      text: input.text,
      sourceMessageId: input.sourceMessageId,
    }
  }

  if (input.kind === "voice") {
    return {
      kind: input.kind,
      fileId: input.fileId,
      fileNameHint: input.fileNameHint,
      sourceMessageId: input.sourceMessageId,
    }
  }

  return {
    kind: input.kind,
    fileId: input.fileId,
    sourceMessageId: input.sourceMessageId,
  }
}

const buildSessionPendingInputJson = (
  onboardingSession: OnboardingSessionState | null,
  pendingCaptureInput: CaptureSourceInput | PendingCaptureInput | null,
)=> {
  if (!onboardingSession && !pendingCaptureInput) {
    return Prisma.JsonNull
  }

  const result: Prisma.JsonObject = {}
  if (onboardingSession) {
    result.onboardingSession = {
      completedSaves: onboardingSession.completedSaves,
    }
  }
  if (pendingCaptureInput) {
    result.pendingCaptureInput = toPendingCaptureInputJson(pendingCaptureInput)
  }
  return result
}

const parseDraftPayload = (value: Prisma.JsonValue | null): DraftPayload => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { transientUserMessageIds: [] }
  }
  const raw = value as Record<string, unknown>
  const idsRaw = raw.transientUserMessageIds
  if (!Array.isArray(idsRaw)) {
    return { transientUserMessageIds: [] }
  }
  const transientUserMessageIds = idsRaw
    .map((item) => (typeof item === "number" && Number.isFinite(item) ? item : null))
    .filter((item): item is number => item !== null)
  return { transientUserMessageIds }
}

const serializeDraftPayload = (payload: DraftPayload): Prisma.JsonObject => ({
  transientUserMessageIds: payload.transientUserMessageIds,
})

const withTransientMessage = (payload: DraftPayload, messageId: number): DraftPayload => {
  if (payload.transientUserMessageIds.includes(messageId)) return payload
  return {
    transientUserMessageIds: [...payload.transientUserMessageIds, messageId],
  }
}

const buildReceiptParseText = (receipt: ReceiptExtract): string => {
  const segments: string[] = ["Чек"]
  if (receipt.merchant) {
    segments.push(`Магазин: ${receipt.merchant}`)
  }
  if (receipt.total) {
    const currency = receipt.currency ? ` ${receipt.currency}` : ""
    segments.push(`Итого: ${receipt.total}${currency}`)
  }
  if (receipt.occurredAtISO) {
    segments.push(`Дата: ${receipt.occurredAtISO}`)
  }
  if (receipt.items && receipt.items.length > 0) {
    const itemNames = receipt.items
      .map((item) => item.name.trim())
      .filter((name) => name.length > 0)
      .slice(0, 12)
    if (itemNames.length > 0) {
      segments.push(`Позиции: ${itemNames.join(", ")}`)
    }
  }
  if (receipt.rawText) {
    const normalizedText = receipt.rawText.trim().slice(0, 600)
    if (normalizedText.length > 0) {
      segments.push(`Текст: ${normalizedText}`)
    }
  }
  return `${segments.join(". ")}.`
}

const resolveMiniAppUrl = async (): Promise<string> => {
  if (env.MINI_APP_URL) return env.MINI_APP_URL
  const username = await resolveTelegramBotUsername()
  if (username) {
    // Use Telegram main mini app link base; concrete context goes through startapp payload.
    return `https://t.me/${username}`
  }
  return "https://t.me"
}

const resolvePaywallUrl = async (): Promise<string> => {
  if (env.BOT_PAYWALL_URL) return env.BOT_PAYWALL_URL
  return resolveMiniAppUrl()
}

async function callTelegramApi<T>(
  fastify: FastifyInstance,
  method: string,
  payload: Record<string, unknown>,
): Promise<T | null> {
  try {
    const response = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })

    const body = (await response.json().catch(() => ({}))) as {
      ok?: boolean
      result?: T
      description?: string
    }

    if (!response.ok || body.ok === false) {
      fastify.log.error(
        `[telegram] ${method} failed: status=${response.status} description=${body.description ?? "unknown"}`,
      )
      return null
    }

    return body.result ?? null
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return null
    }
    const message = error instanceof Error ? error.message : String(error)
    fastify.log.error(`[telegram] ${method} request error: ${message}`)
    return null
  }
}

async function sendTelegramMessage(
  fastify: FastifyInstance,
  chatId: string,
  text: string,
  replyMarkup?: Record<string, unknown>,
  parseMode?: "HTML",
): Promise<number | null> {
  const payload: Record<string, unknown> = {
    chat_id: chatId,
    text,
    disable_web_page_preview: true,
  }
  if (replyMarkup) {
    payload.reply_markup = replyMarkup
  }
  if (parseMode) {
    payload.parse_mode = parseMode
  }
  const result = await callTelegramApi<TelegramSendMessageResult>(fastify, "sendMessage", payload)
  return typeof result?.message_id === "number" ? result.message_id : null
}

async function editTelegramMessage(
  fastify: FastifyInstance,
  chatId: string,
  messageId: number,
  text: string,
  replyMarkup?: Record<string, unknown>,
  parseMode?: "HTML",
): Promise<boolean> {
  const payload: Record<string, unknown> = {
    chat_id: chatId,
    message_id: messageId,
    text,
    disable_web_page_preview: true,
  }
  if (replyMarkup) {
    payload.reply_markup = replyMarkup
  }
  if (parseMode) {
    payload.parse_mode = parseMode
  }
  const result = await callTelegramApi<TelegramSendMessageResult>(fastify, "editMessageText", payload)
  return result !== null
}

async function deleteTelegramMessage(fastify: FastifyInstance, chatId: string, messageId: number): Promise<void> {
  await callTelegramApi(fastify, "deleteMessage", {
    chat_id: chatId,
    message_id: messageId,
  })
}

async function answerCallbackQuery(fastify: FastifyInstance, callbackQueryId: string): Promise<void> {
  await callTelegramApi(fastify, "answerCallbackQuery", { callback_query_id: callbackQueryId })
}

async function upsertTelegramUser(profile: {
  telegramUserId: string
  firstName?: string | null
  username?: string | null
}) {
  return prisma.users.upsert({
    where: { telegram_user_id: profile.telegramUserId },
    create: {
      telegram_user_id: profile.telegramUserId,
      first_name: toSafeText(profile.firstName),
      username: toSafeText(profile.username),
    },
    update: {
      first_name: toSafeText(profile.firstName),
      username: toSafeText(profile.username),
    },
    select: {
      id: true,
      telegram_user_id: true,
      active_workspace_id: true,
    },
  })
}

async function ensureWorkspaceForUser(userId: string): Promise<string> {
  const current = await prisma.users.findUnique({
    where: { id: userId },
    select: { active_workspace_id: true },
  })
  if (current?.active_workspace_id) {
    return current.active_workspace_id
  }

  return prisma.$transaction(async (tx) => {
    const lockedUser = await tx.users.findUnique({
      where: { id: userId },
      select: { active_workspace_id: true },
    })

    if (lockedUser?.active_workspace_id) {
      return lockedUser.active_workspace_id
    }

    const workspace = await tx.workspaces.create({
      data: {
        type: "personal",
        name: null,
        created_by_user_id: userId,
      },
      select: { id: true },
    })

    await seedWorkspaceDefaults(tx, workspace.id)

    await tx.workspace_members.upsert({
      where: {
        workspace_id_user_id: {
          workspace_id: workspace.id,
          user_id: userId,
        },
      },
      create: {
        workspace_id: workspace.id,
        user_id: userId,
        role: "owner",
      },
      update: {
        role: "owner",
      },
    })

    await tx.users.update({
      where: { id: userId },
      data: { active_workspace_id: workspace.id },
    })

    return workspace.id
  })
}

async function ensureBotUserState(userId: string): Promise<bot_user_states> {
  return prisma.bot_user_states.upsert({
    where: { user_id: userId },
    create: { user_id: userId },
    update: {},
  })
}

async function reconcileSuccessfulOperationsCount(userId: string, userState: bot_user_states): Promise<bot_user_states> {
  const actualSuccessfulCount = await prisma.bot_operation_drafts.count({
    where: {
      user_id: userId,
      status: BotOperationDraftStatus.applied,
    },
  })

  if (actualSuccessfulCount === userState.successful_operations_count) {
    return userState
  }

  return prisma.bot_user_states.update({
    where: { user_id: userId },
    data: { successful_operations_count: actualSuccessfulCount },
  })
}

async function ensureBotSession(userId: string): Promise<bot_sessions> {
  return prisma.bot_sessions.upsert({
    where: { user_id: userId },
    create: { user_id: userId },
    update: {},
  })
}

async function loadOperationContext(workspaceId: string): Promise<BotOperationContext> {
  const [workspace, accounts, categories, incomeSources, goals, debtors] = await Promise.all([
    prisma.workspaces.findUnique({
      where: { id: workspaceId },
      select: { name: true, type: true },
    }),
    prisma.accounts.findMany({
      where: { workspace_id: workspaceId, is_archived: false, archived_at: null },
      select: { id: true, name: true, currency: true },
      orderBy: { sort_order: "asc" },
    }),
    prisma.categories.findMany({
      where: { workspace_id: workspaceId, is_archived: false, archived_at: null },
      select: { id: true, name: true, kind: true },
      orderBy: { sort_order: "asc" },
    }),
    prisma.income_sources.findMany({
      where: { workspace_id: workspaceId, is_archived: false, archived_at: null },
      select: { id: true, name: true },
      orderBy: { sort_order: "asc" },
    }),
    prisma.goals.findMany({
      where: { workspace_id: workspaceId, status: "active" },
      select: { id: true, name: true },
      orderBy: [{ sort_order: "asc" }, { created_at: "asc" }],
    }),
    prisma.debtors.findMany({
      where: { workspace_id: workspaceId, status: "active" },
      select: { id: true, name: true, direction: true },
      orderBy: [{ direction: "asc" }, { sort_order: "asc" }, { created_at: "asc" }],
    }),
  ])

  return {
    accounts,
    categories,
    incomeSources,
    goals,
    debtors: debtors.map((debtor) => ({
      id: debtor.id,
      name: debtor.name,
      direction: debtor.direction === "PAYABLE" ? "payable" : "receivable",
    })),
    workspaceLabel: workspace ? resolveWorkspaceDisplayName(workspace) : "Личное",
  }
}

const readActiveDraft = async (session: bot_sessions): Promise<bot_operation_drafts | null> => {
  if (session.active_draft_id) {
    const draftBySession = await prisma.bot_operation_drafts.findFirst({
      where: {
        id: session.active_draft_id,
        user_id: session.user_id,
        status: { in: ACTIVE_DRAFT_STATUSES },
      },
    })
    if (draftBySession) return draftBySession
  }

  const fallback = await prisma.bot_operation_drafts.findFirst({
    where: {
      user_id: session.user_id,
      status: { in: ACTIVE_DRAFT_STATUSES },
    },
    orderBy: { updated_at: "desc" },
  })

  if (fallback && fallback.id !== session.active_draft_id) {
    await prisma.bot_sessions.update({
      where: { id: session.id },
      data: { active_draft_id: fallback.id },
    })
  }

  if (!fallback && session.active_draft_id) {
    await prisma.bot_sessions.update({
      where: { id: session.id },
      data: { active_draft_id: null },
    })
  }

  return fallback
}

const mapSourceType = (inputKind: CaptureSourceInput["kind"]): BotOperationSourceType => {
  if (inputKind === "voice") return BotOperationSourceType.voice
  if (inputKind === "receipt") return BotOperationSourceType.receipt
  return BotOperationSourceType.text
}

const mapParsedToDraftShape = (
  parsed: ParsedOperation,
): DraftShape => {
  const source = parsed.ok ? parsed.data : parsed.partial ?? {}

  const resolvedType: DraftType =
    source.type === "expense" ||
    source.type === "income" ||
    source.type === "transfer" ||
    source.type === "debt_received" ||
    source.type === "debt_paid" ||
    source.type === "goal_topup"
      ? source.type
      : "unknown"

  const happenedAt = (() => {
    const raw = source.occurredAtISO
    if (!raw) return startOfToday()
    const parsedDate = new Date(raw)
    if (!Number.isFinite(parsedDate.getTime())) return startOfToday()
    return parsedDate
  })()

  return {
    type: resolvedType,
    amount: source.amount && Number.isFinite(source.amount) ? source.amount : null,
    fromEntityId:
      resolvedType === "debt_received"
        ? source.debtorId ?? null
        : source.accountId ?? null,
    toEntityId:
      resolvedType === "debt_received"
        ? source.accountId ?? null
        : resolvedType === "debt_paid"
          ? source.debtorId ?? null
          : resolvedType === "goal_topup"
            ? source.goalId ?? null
            : source.toAccountId ?? null,
    categoryId: source.categoryId ?? null,
    incomeSourceId: source.incomeSourceId ?? null,
    happenedAt,
    description: source.note?.trim() ? source.note.trim() : null,
    confidence: Number.isFinite(Number(source.confidence)) ? Number(source.confidence) : null,
  }
}

const normalizeSemanticText = (value: string): string =>
  value
    .toLocaleLowerCase("ru-RU")
    .replace(/ё/g, "е")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()

const extractSemanticTokens = (value: string): string[] => {
  const normalized = normalizeSemanticText(value)
  if (!normalized) return []
  const unique = new Set<string>()
  normalized.split(" ").forEach((token) => {
    if (!token) return
    if (/^\d+(?:[.,]\d+)?[кk]?$/u.test(token)) return
    if (token.length < 2) return
    if (semanticStopWords.has(token)) return
    unique.add(token)
  })
  return Array.from(unique).sort()
}

const calculateTokenSimilarity = (first: string[], second: string[]): number => {
  if (first.length === 0 || second.length === 0) return 0
  const firstSet = new Set(first)
  const secondSet = new Set(second)
  let intersection = 0
  firstSet.forEach((token) => {
    if (secondSet.has(token)) intersection += 1
  })
  const union = new Set([...firstSet, ...secondSet]).size
  if (union === 0) return 0
  return intersection / union
}

const detectDraftTypeFromText = (text: string): DraftType | null => {
  if (/(на\s+цель|в\s+цель|цель|пополнить\s+цель|отложил|отложила|откладываю)/iu.test(text)) return "goal_topup"
  if (/(отдал|отдала|погасил|погасила|вернул\s+долг\s+к|вернула\s+долг\s+к|вернул\s+к|вернула\s+к)/iu.test(text)) {
    return "debt_paid"
  }
  if (/(возврат\s+долга\s+от|долг\s+от|вернула|вернул|возврат\s+от|вернула\s+долг|вернул\s+долг)/iu.test(text)) {
    return "debt_received"
  }
  if (/(перевод|перевести|перекин|между счетами|со счета|на счет|→|->)/iu.test(text)) return "transfer"
  if (/(доход|зарплат|преми|кэшб|кешб|поступил|получил|пришло|аванс)/iu.test(text)) return "income"
  if (/(расход|потрат|купил|оплат|трат|списал)/iu.test(text)) return "expense"
  return null
}

const resolveEntityCandidateByText = (
  sourceText: string,
  sourceTokens: string[],
  items: Array<{ id: string; name: string }>,
): { id: string; score: number } | null => {
  const normalizedSource = normalizeSemanticText(sourceText)
  let best: { id: string; score: number } | null = null
  items.forEach((item) => {
    const normalizedName = normalizeSemanticText(item.name)
    if (!normalizedName) return
    const nameTokens = extractSemanticTokens(item.name)
    if (nameTokens.length === 0) return
    const containsFullName = normalizedSource.includes(normalizedName)
    const tokenScore = calculateTokenSimilarity(sourceTokens, nameTokens)
    const score = containsFullName ? 1 : tokenScore
    if (!best || score > best.score) {
      best = { id: item.id, score }
    }
  })
  return best
}

const extractDraftDescriptionCandidate = (sourceText: string, snippetsToStrip: string[]): string | null => {
  let cleaned = sourceText
  cleaned = cleaned.replace(/\b\d+(?:[.,]\d+)?\s*(?:к|кк|₽|р|руб(?:\.|лей|ля|ль)?)?\b/giu, " ")
  cleaned = cleaned.replace(
    /\b(возврат|долг|долга|долги|вернул|вернула|отдал|отдала|погасил|погасила|пополнить|пополнил|пополнила|цель|на|в|к)\b/giu,
    " ",
  )
  snippetsToStrip.forEach((snippet) => {
    const normalized = snippet.trim()
    if (!normalized) return
    cleaned = cleaned.replace(new RegExp(normalized.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "giu"), " ")
  })
  cleaned = cleaned.replace(/\s+/g, " ").trim().replace(/^[-,:;.\s]+|[-,:;.\s]+$/g, "")
  return cleaned.length >= 3 ? cleaned.slice(0, 300) : null
}

const resolveEarlyDebtGoalDraft = (sourceText: string, context: OperationContext): DraftShape | null => {
  const tokens = extractSemanticTokens(sourceText)
  if (tokens.length === 0) return null

  const accountCandidate = resolveEntityCandidateByText(sourceText, tokens, context.accounts)
  const defaultAccountId = accountCandidate?.score && accountCandidate.score >= 0.9
    ? accountCandidate.id
    : context.accounts[0]?.id ?? null
  const amount = parseEditedAmount(sourceText)
  const happenedAt = startOfToday()

  const payableDebtorCandidate = resolveEntityCandidateByText(
    sourceText,
    tokens,
    context.debtors
      .filter((debtor) => debtor.direction === "payable")
      .map((debtor) => ({ id: debtor.id, name: debtor.name })),
  )
  const receivableDebtorCandidate = resolveEntityCandidateByText(
    sourceText,
    tokens,
    context.debtors
      .filter((debtor) => debtor.direction !== "payable")
      .map((debtor) => ({ id: debtor.id, name: debtor.name })),
  )
  const goalCandidate = resolveEntityCandidateByText(sourceText, tokens, context.goals)

  const payableDebtorId = payableDebtorCandidate && payableDebtorCandidate.score >= 0.72 ? payableDebtorCandidate.id : null
  const receivableDebtorId =
    receivableDebtorCandidate && receivableDebtorCandidate.score >= 0.72 ? receivableDebtorCandidate.id : null
  const goalId = goalCandidate && goalCandidate.score >= 0.72 ? goalCandidate.id : null

  const hasGoalIntent = /(цел[ьи]|на\s+цель|в\s+цель|пополн(ить|ю|ил|ила)|отложил|отложила|откладываю)/iu.test(sourceText)
  const hasDebtPaidIntent = /(отдал|отдала|погасил|погасила|вернул\s+долг\s+к|вернула\s+долг\s+к|вернул\s+к|вернула\s+к)/iu.test(
    sourceText,
  )
  const hasDebtReceivedIntent = /(возврат(\s+долга)?\s+от|долг\s+от|вернула|вернул|вернули)/iu.test(sourceText)

  if (hasGoalIntent && goalId) {
    return {
      type: "goal_topup",
      amount,
      fromEntityId: defaultAccountId,
      toEntityId: goalId,
      categoryId: null,
      incomeSourceId: null,
      happenedAt,
      description: extractDraftDescriptionCandidate(sourceText, [context.goals.find((goal) => goal.id === goalId)?.name ?? ""]),
      confidence: 0.9,
    }
  }

  if (hasDebtPaidIntent && payableDebtorId) {
    return {
      type: "debt_paid",
      amount,
      fromEntityId: defaultAccountId,
      toEntityId: payableDebtorId,
      categoryId: null,
      incomeSourceId: null,
      happenedAt,
      description: extractDraftDescriptionCandidate(
        sourceText,
        [context.debtors.find((debtor) => debtor.id === payableDebtorId)?.name ?? ""],
      ),
      confidence: 0.88,
    }
  }

  if (hasDebtReceivedIntent && receivableDebtorId) {
    return {
      type: "debt_received",
      amount,
      fromEntityId: receivableDebtorId,
      toEntityId: defaultAccountId,
      categoryId: null,
      incomeSourceId: null,
      happenedAt,
      description: extractDraftDescriptionCandidate(
        sourceText,
        [context.debtors.find((debtor) => debtor.id === receivableDebtorId)?.name ?? ""],
      ),
      confidence: 0.88,
    }
  }

  return null
}

const buildDraftSemanticHints = (
  sourceText: string,
  context: OperationContext,
): DraftSemanticHints => {
  const tokens = extractSemanticTokens(sourceText)
  const signature = tokens.join("|")
  const explicitAccount = resolveEntityCandidateByText(sourceText, tokens, context.accounts)
  const explicitCategory = resolveEntityCandidateByText(
    sourceText,
    tokens,
    context.categories
      .filter((item) => item.kind === "expense")
      .map((item) => ({ id: item.id, name: item.name })),
  )
  const explicitIncomeSource = resolveEntityCandidateByText(sourceText, tokens, context.incomeSources)
  const explicitReceivableDebtor = resolveEntityCandidateByText(
    sourceText,
    tokens,
    context.debtors
      .filter((debtor) => debtor.direction !== "payable")
      .map((debtor) => ({ id: debtor.id, name: debtor.name })),
  )
  const explicitPayableDebtor = resolveEntityCandidateByText(
    sourceText,
    tokens,
    context.debtors
      .filter((debtor) => debtor.direction !== "receivable")
      .map((debtor) => ({ id: debtor.id, name: debtor.name })),
  )
  const explicitGoal = resolveEntityCandidateByText(sourceText, tokens, context.goals)

  return {
    signature,
    tokens,
    explicitType: detectDraftTypeFromText(sourceText),
    explicitAccountId: explicitAccount && explicitAccount.score >= 0.95 ? explicitAccount.id : null,
    explicitCategoryId: explicitCategory && explicitCategory.score >= 0.95 ? explicitCategory.id : null,
    explicitIncomeSourceId: explicitIncomeSource && explicitIncomeSource.score >= 0.95 ? explicitIncomeSource.id : null,
    explicitReceivableDebtorId:
      explicitReceivableDebtor && explicitReceivableDebtor.score >= 0.95 ? explicitReceivableDebtor.id : null,
    explicitPayableDebtorId:
      explicitPayableDebtor && explicitPayableDebtor.score >= 0.95 ? explicitPayableDebtor.id : null,
    explicitGoalId: explicitGoal && explicitGoal.score >= 0.95 ? explicitGoal.id : null,
  }
}

const parseDraftLookupMemory = (value: Prisma.JsonValue | null): DraftLookupMemory | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  const raw = value as Record<string, unknown>
  const signature = typeof raw.signature === "string" ? raw.signature.trim() : ""
  const tokensRaw = Array.isArray(raw.tokens) ? raw.tokens : []
  const tokens = tokensRaw
    .map((token) => (typeof token === "string" ? token.trim() : ""))
    .filter((token) => token.length > 0)
  const type = parseDraftType(typeof raw.type === "string" ? raw.type : null)
  const fromEntityId = toStringId(typeof raw.fromEntityId === "string" ? raw.fromEntityId : null)
  const toEntityId = toStringId(typeof raw.toEntityId === "string" ? raw.toEntityId : null)
  const categoryId = toStringId(typeof raw.categoryId === "string" ? raw.categoryId : null)
  const incomeSourceId = toStringId(typeof raw.incomeSourceId === "string" ? raw.incomeSourceId : null)
  if (!signature && tokens.length === 0) return null
  return {
    signature,
    tokens,
    type,
    fromEntityId,
    toEntityId,
    categoryId,
    incomeSourceId,
  }
}

const serializeDraftLookupMemory = (lookup: DraftLookupMemory): Prisma.JsonObject => ({
  signature: lookup.signature,
  tokens: lookup.tokens,
  type: lookup.type,
  fromEntityId: lookup.fromEntityId,
  toEntityId: lookup.toEntityId,
  categoryId: lookup.categoryId,
  incomeSourceId: lookup.incomeSourceId,
})

const normalizeLookupFromDraft = (draft: {
  lookup_json: Prisma.JsonValue | null
  source_raw: string | null
  type: string | null
  from_entity_id: string | null
  to_entity_id: string | null
  category_id: string | null
  income_source_id: string | null
}): DraftLookupMemory | null => {
  const parsedLookup = parseDraftLookupMemory(draft.lookup_json)
  if (parsedLookup) return parsedLookup
  const tokens = extractSemanticTokens(draft.source_raw ?? "")
  if (tokens.length === 0) return null
  return {
    signature: tokens.join("|"),
    tokens,
    type: parseDraftType(draft.type),
    fromEntityId: draft.from_entity_id ?? null,
    toEntityId: draft.to_entity_id ?? null,
    categoryId: draft.category_id ?? null,
    incomeSourceId: draft.income_source_id ?? null,
  }
}

const loadDraftMemoryHint = async (
  userId: string,
  workspaceId: string,
  hints: DraftSemanticHints,
): Promise<DraftLookupMemory | null> => {
  if (!hints.signature && hints.tokens.length === 0) return null

  const historyDrafts = await prisma.bot_operation_drafts.findMany({
    where: {
      user_id: userId,
      workspace_id: workspaceId,
      status: BotOperationDraftStatus.applied,
    },
    select: {
      lookup_json: true,
      source_raw: true,
      type: true,
      from_entity_id: true,
      to_entity_id: true,
      category_id: true,
      income_source_id: true,
      updated_at: true,
    },
    orderBy: { updated_at: "desc" },
    take: 120,
  })

  let bestScore = 0
  let bestLookup: DraftLookupMemory | null = null
  historyDrafts.forEach((draft) => {
    const lookup = normalizeLookupFromDraft(draft)
    if (!lookup) return
    const score =
      hints.signature && lookup.signature === hints.signature
        ? 1
        : calculateTokenSimilarity(hints.tokens, lookup.tokens)
    if (score < 0.52) return
    if (score > bestScore) {
      bestScore = score
      bestLookup = lookup
    }
  })

  return bestLookup
}

const loadTransactionHistoryHint = async (
  userId: string,
  workspaceId: string,
  hints: DraftSemanticHints,
): Promise<DraftLookupMemory | null> => {
  if (hints.tokens.length === 0) return null
  const recentTransactions = await prisma.transactions.findMany({
    where: {
      workspace_id: workspaceId,
      created_by_user_id: userId,
    },
    select: {
      kind: true,
      note: true,
      account_id: true,
      from_account_id: true,
      to_account_id: true,
      category_id: true,
      income_source_id: true,
      goal_id: true,
      debtor_id: true,
      account: { select: { name: true } },
      from_account: { select: { name: true } },
      to_account: { select: { name: true } },
      category: { select: { name: true } },
      income_source: { select: { name: true } },
      goal: { select: { name: true } },
      debtor: { select: { name: true, direction: true } },
    },
    orderBy: { created_at: "desc" },
    take: 120,
  })

  let bestScore = 0
  let bestLookup: DraftLookupMemory | null = null
  recentTransactions.forEach((transaction) => {
    const type: DraftType = (() => {
      if (transaction.kind === "income") return "income"
      if (transaction.kind === "expense") {
        if (transaction.debtor_id && transaction.debtor?.direction === "PAYABLE") return "debt_paid"
        return "expense"
      }
      if (transaction.goal_id) return "goal_topup"
      if (transaction.debtor_id && transaction.debtor?.direction === "RECEIVABLE") return "debt_received"
      return "transfer"
    })()
    const referenceTokens = extractSemanticTokens(
      [
        transaction.note,
        transaction.category?.name,
        transaction.income_source?.name,
        transaction.goal?.name,
        transaction.debtor?.name,
        transaction.account?.name,
        transaction.from_account?.name,
        transaction.to_account?.name,
      ]
        .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
        .join(" "),
    )
    const score = calculateTokenSimilarity(hints.tokens, referenceTokens)
    if (score < 0.5) return
    const lookup: DraftLookupMemory = {
      signature: referenceTokens.join("|"),
      tokens: referenceTokens,
      type,
      fromEntityId:
        type === "debt_received"
          ? transaction.debtor_id ?? null
          : transaction.account_id ?? transaction.from_account_id ?? null,
      toEntityId:
        type === "goal_topup"
          ? transaction.goal_id ?? null
          : type === "debt_paid"
            ? transaction.debtor_id ?? null
            : type === "debt_received"
              ? transaction.to_account_id ?? null
              : transaction.to_account_id ?? null,
      categoryId: type === "expense" ? transaction.category_id ?? null : null,
      incomeSourceId: type === "income" ? transaction.income_source_id ?? null : null,
    }
    if (score > bestScore) {
      bestScore = score
      bestLookup = lookup
    }
  })

  return bestLookup
}

const resolveSemanticEntityId = (
  sourceText: string,
  sourceTokens: string[],
  items: Array<{ id: string; name: string }>,
): string | null => {
  const match = resolveEntityCandidateByText(sourceText, sourceTokens, items)
  if (!match || match.score < 0.52) return null
  return match.id
}

const applyDraftPrefillHints = (
  sourceText: string,
  mapped: DraftShape,
  context: OperationContext,
  hints: DraftSemanticHints,
  memoryHint: DraftLookupMemory | null,
  transactionHint: DraftLookupMemory | null,
) => {
  const accountIds = new Set(context.accounts.map((account) => account.id))
  const categoryIds = new Set(context.categories.filter((category) => category.kind === "expense").map((category) => category.id))
  const incomeSourceIds = new Set(context.incomeSources.map((source) => source.id))
  const receivableDebtorIds = new Set(
    context.debtors
      .filter((debtor) => debtor.direction !== "payable")
      .map((debtor) => debtor.id),
  )
  const payableDebtorIds = new Set(
    context.debtors
      .filter((debtor) => debtor.direction !== "receivable")
      .map((debtor) => debtor.id),
  )
  const goalIds = new Set(context.goals.map((goal) => goal.id))
  const firstAccountId = context.accounts[0]?.id ?? null
  const firstReceivableDebtorId = context.debtors.find((debtor) => debtor.direction !== "payable")?.id ?? null
  const firstPayableDebtorId = context.debtors.find((debtor) => debtor.direction !== "receivable")?.id ?? null
  const firstGoalId = context.goals[0]?.id ?? null

  const semanticAccountId = resolveSemanticEntityId(sourceText, hints.tokens, context.accounts)
  const semanticCategoryId = resolveSemanticEntityId(
    sourceText,
    hints.tokens,
    context.categories
      .filter((item) => item.kind === "expense")
      .map((item) => ({ id: item.id, name: item.name })),
  )
  const semanticIncomeSourceId = resolveSemanticEntityId(sourceText, hints.tokens, context.incomeSources)
  const semanticReceivableDebtorId = resolveSemanticEntityId(
    sourceText,
    hints.tokens,
    context.debtors
      .filter((debtor) => debtor.direction !== "payable")
      .map((debtor) => ({ id: debtor.id, name: debtor.name })),
  )
  const semanticPayableDebtorId = resolveSemanticEntityId(
    sourceText,
    hints.tokens,
    context.debtors
      .filter((debtor) => debtor.direction !== "receivable")
      .map((debtor) => ({ id: debtor.id, name: debtor.name })),
  )
  const semanticGoalId = resolveSemanticEntityId(sourceText, hints.tokens, context.goals)

  const nextType =
    mapped.type !== "unknown"
      ? mapped.type
      : hints.explicitType ?? memoryHint?.type ?? transactionHint?.type ?? "unknown"

  let nextFromEntityId: string | null = null
  let nextToEntityId: string | null = null
  let nextCategoryId: string | null = null
  let nextIncomeSourceId: string | null = null

  if (nextType === "income") {
    nextFromEntityId =
      hints.explicitAccountId ??
      mapped.fromEntityId ??
      semanticAccountId ??
      memoryHint?.fromEntityId ??
      transactionHint?.fromEntityId ??
      firstAccountId
    if (!nextFromEntityId || !accountIds.has(nextFromEntityId)) nextFromEntityId = firstAccountId

    nextIncomeSourceId =
      hints.explicitIncomeSourceId ??
      mapped.incomeSourceId ??
      semanticIncomeSourceId ??
      memoryHint?.incomeSourceId ??
      transactionHint?.incomeSourceId ??
      null
    if (nextIncomeSourceId && !incomeSourceIds.has(nextIncomeSourceId)) nextIncomeSourceId = null
  } else if (nextType === "expense") {
    nextFromEntityId =
      hints.explicitAccountId ??
      mapped.fromEntityId ??
      semanticAccountId ??
      memoryHint?.fromEntityId ??
      transactionHint?.fromEntityId ??
      firstAccountId
    if (!nextFromEntityId || !accountIds.has(nextFromEntityId)) nextFromEntityId = firstAccountId

    nextCategoryId =
      hints.explicitCategoryId ??
      mapped.categoryId ??
      semanticCategoryId ??
      memoryHint?.categoryId ??
      transactionHint?.categoryId ??
      null
    if (nextCategoryId && !categoryIds.has(nextCategoryId)) nextCategoryId = null
  } else if (nextType === "transfer") {
    nextFromEntityId =
      hints.explicitAccountId ??
      mapped.fromEntityId ??
      semanticAccountId ??
      memoryHint?.fromEntityId ??
      transactionHint?.fromEntityId ??
      firstAccountId
    if (!nextFromEntityId || !accountIds.has(nextFromEntityId)) nextFromEntityId = firstAccountId

    nextToEntityId = mapped.toEntityId ?? memoryHint?.toEntityId ?? transactionHint?.toEntityId ?? null
    if (nextToEntityId && !accountIds.has(nextToEntityId)) nextToEntityId = null
    if (nextToEntityId === nextFromEntityId) {
      nextToEntityId = context.accounts.find((account) => account.id !== nextFromEntityId)?.id ?? null
    }
  } else if (nextType === "debt_received") {
    nextFromEntityId =
      hints.explicitReceivableDebtorId ??
      mapped.fromEntityId ??
      semanticReceivableDebtorId ??
      memoryHint?.fromEntityId ??
      transactionHint?.fromEntityId ??
      firstReceivableDebtorId
    if (!nextFromEntityId || !receivableDebtorIds.has(nextFromEntityId)) nextFromEntityId = firstReceivableDebtorId

    nextToEntityId =
      hints.explicitAccountId ??
      mapped.toEntityId ??
      semanticAccountId ??
      memoryHint?.toEntityId ??
      transactionHint?.toEntityId ??
      firstAccountId
    if (!nextToEntityId || !accountIds.has(nextToEntityId)) nextToEntityId = firstAccountId
  } else if (nextType === "debt_paid") {
    nextFromEntityId =
      hints.explicitAccountId ??
      mapped.fromEntityId ??
      semanticAccountId ??
      memoryHint?.fromEntityId ??
      transactionHint?.fromEntityId ??
      firstAccountId
    if (!nextFromEntityId || !accountIds.has(nextFromEntityId)) nextFromEntityId = firstAccountId

    nextToEntityId =
      hints.explicitPayableDebtorId ??
      mapped.toEntityId ??
      semanticPayableDebtorId ??
      memoryHint?.toEntityId ??
      transactionHint?.toEntityId ??
      firstPayableDebtorId
    if (!nextToEntityId || !payableDebtorIds.has(nextToEntityId)) nextToEntityId = firstPayableDebtorId
  } else if (nextType === "goal_topup") {
    nextFromEntityId =
      hints.explicitAccountId ??
      mapped.fromEntityId ??
      semanticAccountId ??
      memoryHint?.fromEntityId ??
      transactionHint?.fromEntityId ??
      firstAccountId
    if (!nextFromEntityId || !accountIds.has(nextFromEntityId)) nextFromEntityId = firstAccountId

    nextToEntityId =
      hints.explicitGoalId ??
      mapped.toEntityId ??
      semanticGoalId ??
      memoryHint?.toEntityId ??
      transactionHint?.toEntityId ??
      firstGoalId
    if (!nextToEntityId || !goalIds.has(nextToEntityId)) nextToEntityId = firstGoalId
  } else {
    nextFromEntityId =
      hints.explicitAccountId ??
      mapped.fromEntityId ??
      semanticAccountId ??
      memoryHint?.fromEntityId ??
      transactionHint?.fromEntityId ??
      firstAccountId
    if (nextFromEntityId && !accountIds.has(nextFromEntityId)) nextFromEntityId = firstAccountId
    nextToEntityId = mapped.toEntityId ?? null
    nextCategoryId = mapped.categoryId ?? null
    nextIncomeSourceId = mapped.incomeSourceId ?? null
  }

  const confidence = Math.max(
    mapped.confidence ?? 0,
    hints.explicitAccountId ||
      hints.explicitCategoryId ||
      hints.explicitIncomeSourceId ||
      hints.explicitReceivableDebtorId ||
      hints.explicitPayableDebtorId ||
      hints.explicitGoalId
      ? 0.86
      : 0,
    memoryHint ? 0.72 : 0,
    transactionHint ? 0.66 : 0,
  )

  return {
    ...mapped,
    type: nextType,
    fromEntityId: nextFromEntityId,
    toEntityId: nextToEntityId,
    categoryId: nextCategoryId,
    incomeSourceId: nextIncomeSourceId,
    confidence,
  }
}

const buildPickerRows = (
  prefix: string,
  items: Array<{ id: string; name: string }>,
  offset: number,
): Array<Array<{ text: string; callback_data: string }>> => {
  const safeOffset = Math.max(0, Math.min(offset, Math.max(0, items.length - 1)))
  const pageItems = items.slice(safeOffset, safeOffset + EDIT_PAGE_SIZE)
  const rows: Array<Array<{ text: string; callback_data: string }>> = []

  for (let index = 0; index < pageItems.length; index += 2) {
    const rowItems = pageItems.slice(index, index + 2)
    rows.push(
      rowItems.map((item, rowIndex) => ({
        text: item.name,
        callback_data: `bot:set:${prefix}:${safeOffset + index + rowIndex}`,
      })),
    )
  }

  const navRow: Array<{ text: string; callback_data: string }> = []
  if (safeOffset > 0) {
    const prevOffset = Math.max(0, safeOffset - EDIT_PAGE_SIZE)
    navRow.push({ text: "◀", callback_data: `bot:page:${prefix}:${prevOffset}` })
  }
  if (safeOffset + EDIT_PAGE_SIZE < items.length) {
    navRow.push({ text: "▶", callback_data: `bot:page:${prefix}:${safeOffset + EDIT_PAGE_SIZE}` })
  }
  if (navRow.length > 0) {
    rows.push(navRow)
  }

  rows.push([
    { text: "Назад", callback_data: "bot:back:review" },
    { text: "Отмена", callback_data: "bot:cancel" },
  ])

  return rows
}

const buildReviewKeyboard = (type: DraftType) => {
  const rows: InlineKeyboardButton[][] = []

  if (type === "transfer") {
    rows.push([
      { text: "💳 Откуда", callback_data: "bot:pick:from" },
      { text: "🏦 Куда", callback_data: "bot:pick:to" },
      { text: "📅 Дата", callback_data: "bot:pick:date" },
    ])
  } else if (type === "income") {
    rows.push([
      { text: "💳 Счёт", callback_data: "bot:pick:acc" },
      { text: "📂 Источник", callback_data: "bot:pick:src" },
      { text: "📅 Дата", callback_data: "bot:pick:date" },
    ])
  } else if (type === "debt_received") {
    rows.push([
      { text: "👤 Откуда", callback_data: "bot:pick:from" },
      { text: "💳 Куда", callback_data: "bot:pick:to" },
      { text: "📅 Дата", callback_data: "bot:pick:date" },
    ])
  } else if (type === "debt_paid") {
    rows.push([
      { text: "💳 Откуда", callback_data: "bot:pick:from" },
      { text: "👤 Куда", callback_data: "bot:pick:to" },
      { text: "📅 Дата", callback_data: "bot:pick:date" },
    ])
  } else if (type === "goal_topup") {
    rows.push([
      { text: "💳 Откуда", callback_data: "bot:pick:from" },
      { text: "🎯 Куда", callback_data: "bot:pick:to" },
      { text: "📅 Дата", callback_data: "bot:pick:date" },
    ])
  } else {
    rows.push([
      { text: "💳 Счёт", callback_data: "bot:pick:acc" },
      { text: "📂 Категория", callback_data: "bot:pick:cat" },
      { text: "📅 Дата", callback_data: "bot:pick:date" },
    ])
  }

  rows.push([
    { text: "📝 Описание", callback_data: "bot:edit:description" },
    { text: "🗂️ Аккаунт", callback_data: "bot:pick:workspace" },
  ])
  rows.push([
    { text: "🔁 Тип", callback_data: "bot:pick:type" },
    { text: "💰 Сумма", callback_data: "bot:edit:amount" },
  ])

  rows.push([{ text: "✅ Сохранить", callback_data: "bot:save" }])
  rows.push([{ text: "❌ Отмена", callback_data: "bot:cancel" }])

  return { inline_keyboard: rows }
}

const buildTypeKeyboard = () => ({
  inline_keyboard: [
    [
      { text: "↘️ Расход", callback_data: "bot:set:type:expense" },
      { text: "↗️ Доход", callback_data: "bot:set:type:income" },
    ],
    [
      { text: "↔️ Перевод", callback_data: "bot:set:type:transfer" },
      { text: "⬅️ Мне должны", callback_data: "bot:set:type:debt_received" },
    ],
    [
      { text: "➡️ Я должен", callback_data: "bot:set:type:debt_paid" },
      { text: "🎯 Цель", callback_data: "bot:set:type:goal_topup" },
    ],
    [
      { text: "Назад", callback_data: "bot:back:review" },
      { text: "Отмена", callback_data: "bot:cancel" },
    ],
  ],
})

const buildDateKeyboard = (openAppUrl: string) => ({
  inline_keyboard: [
    [
      { text: "Сегодня", callback_data: "bot:set:date:today" },
      { text: "Вчера", callback_data: "bot:set:date:yesterday" },
    ],
    [buildOpenAppButton(openAppUrl)],
    [
      { text: "Назад", callback_data: "bot:back:review" },
      { text: "Отмена", callback_data: "bot:cancel" },
    ],
  ],
})

const buildAmountPromptKeyboard = () => ({
  inline_keyboard: [[{ text: "Назад", callback_data: "bot:back:review" }, { text: "Отмена", callback_data: "bot:cancel" }]],
})

const buildDescriptionPromptKeyboard = () => ({
  inline_keyboard: [
    [
      { text: "Очистить", callback_data: "bot:clear:description" },
      { text: "Назад", callback_data: "bot:back:review" },
    ],
    [{ text: "Отмена", callback_data: "bot:cancel" }],
  ],
})

const buildUnfinishedKeyboard = () => ({
  inline_keyboard: [
    [{ text: "Продолжить текущую", callback_data: "bot:unfinished:continue" }],
    [{ text: "Отменить текущую", callback_data: "bot:unfinished:cancel" }],
    [{ text: "Создать новую", callback_data: "bot:unfinished:new" }],
  ],
})

const buildResultKeyboard = (openAppUrl: string) => ({
  inline_keyboard: [
    [buildOpenAppButton(openAppUrl)],
  ],
})

const buildStartKeyboard = (openAppUrl: string) => ({
  inline_keyboard: [
    [{ text: "Начать", callback_data: "bot:start:begin" }],
    [{ text: "Как это работает", callback_data: "bot:start:how" }],
    [{ text: "Открыть приложение", url: openAppUrl }],
  ],
})

const buildHowItWorksKeyboard = (openAppUrl: string) => ({
  inline_keyboard: [
    [{ text: "Попробовать", callback_data: "bot:start:try" }],
    [{ text: "Открыть приложение", url: openAppUrl }],
  ],
})

const buildRetryKeyboard = (openAppUrl: string) => ({
  inline_keyboard: [
    [{ text: "Попробовать снова", callback_data: "bot:new" }],
    [{ text: "Открыть приложение", url: openAppUrl }],
  ],
})

const buildPaywallKeyboard = (paywallUrl: string, openAppUrl: string) => ({
  inline_keyboard: [
    [{ text: "Открыть пробный доступ 1 ₽", url: paywallUrl }],
    [{ text: "Открыть приложение", url: openAppUrl }],
    [{ text: "Позже", callback_data: "bot:paywall:later" }],
  ],
})

const buildCapturePromptText = () => "Отправь текст, голос или фото чека — я соберу черновик операции."

const buildOnboardingStartText = () =>
  [
    "<b>Покажу, как это работает — это займёт пару секунд.</b>",
    "Без регистраций, сразу к делу.",
    "<b>Нажмите любую тестовую кнопку\nили напишите любой расход сами 👇</b>",
    "<i>(операция ниже — просто пример)</i>",
  ].join("\n\n")

const buildOnboardingStartKeyboard = () => ({
  inline_keyboard: [
    [
      { text: "🚕 Такси 500", callback_data: "bot:onboard:sample:taxi" },
      { text: "🍔 Еда 350", callback_data: "bot:onboard:sample:food" },
    ],
    [{ text: "🛍 Маркетплейсы 1200", callback_data: "bot:onboard:sample:market" }],
  ],
})

const buildOnboardingAfterFirstSaveText = () =>
  [
    "<b>Отлично! Первая операция записана 👍</b>",
    "Теперь попробуем добавить доход.",
    "<b>Скажите или напишите:</b>",
    "<i>Зарплата 80 000</i>",
  ].join("\n\n")

const resolveOnboardingSampleText = (sampleKey: string): string | null => {
  if (sampleKey === "taxi") return "Такси 500"
  if (sampleKey === "food") return "Еда 350"
  if (sampleKey === "market") return "Маркетплейсы 1200"
  return null
}

const buildStartText = () =>
  [
    "Я помогу вести финансы голосом, текстом и по фото чеков.",
    "Без длинной регистрации — можно сразу записать первую операцию.",
  ].join("\n\n")

const buildHowItWorksText = () =>
  [
    "1) Отправь текст / голос / фото.",
    "2) Я распознаю операцию и соберу черновик.",
    "3) Проверь поля и сохрани.",
    "4) Подробности и аналитика — в mini app.",
  ].join("\n")

const resolveWorkspaceDisplayName = (workspace: { name: string | null; type: "personal" | "family" }): string => {
  const normalized = workspace.name?.trim()
  if (normalized && normalized.length > 0) return normalized
  if (workspace.type === "family") return "Семейный бюджет"
  return "Личное"
}

async function loadUserWorkspaces(userId: string): Promise<WorkspaceOption[]> {
  const memberships = await prisma.workspace_members.findMany({
    where: { user_id: userId },
    select: {
      workspaces: {
        select: { id: true, name: true, type: true },
      },
    },
    orderBy: { workspaces: { created_at: "asc" } },
  })

  return memberships.map((membership) => ({
    id: membership.workspaces.id,
    name: resolveWorkspaceDisplayName(membership.workspaces),
  }))
}

const RU_MONTHS = [
  "января",
  "февраля",
  "марта",
  "апреля",
  "мая",
  "июня",
  "июля",
  "августа",
  "сентября",
  "октября",
  "ноября",
  "декабря",
] as const

const formatDateLongRu = (value: Date): string => {
  const day = value.getDate()
  const month = RU_MONTHS[value.getMonth()] ?? ""
  const year = value.getFullYear()
  return `${day} ${month} ${year}`
}

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;")

const resolveOperationIcon = (type: DraftType): string => {
  if (type === "debt_received") return "⬅️"
  if (type === "debt_paid") return "➡️"
  if (type === "goal_topup") return "🎯"
  if (type === "income") return "↗️"
  if (type === "transfer") return "↔️"
  return "↘️"
}

const buildMiniAppDeepLink = (
  baseUrl: string,
  params: Record<string, string | null>,
): string => {
  try {
    const url = new URL(baseUrl)
    const normalizedEntries = Object.entries(params).filter(
      ([, value]) => typeof value === "string" && value.trim().length > 0,
    ) as Array<[string, string]>

    // Telegram mini app links should pass context via startapp, not custom top-level query keys.
    if (url.hostname === "t.me") {
      const rawPayload = JSON.stringify({
        w: params.workspaceId?.trim() ?? null,
        t: params.targetType?.trim() ?? null,
        i: params.targetId?.trim() ?? null,
        x: params.transactionId?.trim() ?? null,
      })
      const encodedPayload = Buffer.from(rawPayload, "utf8")
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/g, "")
      const payload = `${TELEGRAM_STARTAPP_PREFIX}${encodedPayload}`
      if (payload.length > 0) {
        if (payload.length <= TELEGRAM_STARTAPP_MAX_LENGTH) {
          url.searchParams.set("startapp", payload)
        }
      }
      ;["workspaceId", "targetType", "targetId", "transactionId"].forEach((key) => {
        url.searchParams.delete(key)
      })
      return url.toString()
    }

    normalizedEntries.forEach(([key, value]) => {
      url.searchParams.set(key, value.trim())
    })
    return url.toString()
  } catch {
    return baseUrl
  }
}

const shouldUseWebAppButton = (openAppUrl: string): boolean => {
  try {
    const parsedUrl = new URL(openAppUrl)
    if (parsedUrl.protocol !== "https:") return false
    return parsedUrl.hostname !== "t.me"
  } catch {
    return false
  }
}

const buildOpenAppButton = (openAppUrl: string): InlineKeyboardButton =>
  shouldUseWebAppButton(openAppUrl)
    ? { text: "Открыть в приложении", web_app: { url: openAppUrl } }
    : { text: "Открыть в приложении", url: openAppUrl }

const resolveDraftTarget = (
  draft: bot_operation_drafts,
): { targetType: string; targetId: string | null } => {
  const rawType = (draft.type ?? "").trim()
  if (rawType === "income") {
    return {
      targetType: "incomeSource",
      targetId: draft.income_source_id ?? null,
    }
  }
  if (rawType === "transfer") {
    return {
      targetType: "account",
      targetId: draft.to_entity_id ?? null,
    }
  }
  if (rawType === "debt_received") {
    return {
      targetType: "debtor",
      targetId: draft.from_entity_id ?? draft.to_entity_id ?? null,
    }
  }
  if (rawType === "debt_paid") {
    return {
      targetType: "debtor",
      targetId: draft.to_entity_id ?? draft.from_entity_id ?? null,
    }
  }
  if (rawType === "goal_topup") {
    return {
      targetType: "goal",
      targetId: draft.to_entity_id ?? null,
    }
  }
  return {
    targetType: "category",
    targetId: draft.category_id ?? null,
  }
}

const resolveAccountName = (context: OperationContext, accountId: string | null): string => {
  if (!accountId) return "—"
  return context.accounts.find((item) => item.id === accountId)?.name ?? "—"
}

const resolveCategoryName = (context: OperationContext, categoryId: string | null): string => {
  if (!categoryId) return "—"
  return context.categories.find((item) => item.id === categoryId)?.name ?? "—"
}

const resolveSourceName = (context: OperationContext, sourceId: string | null): string => {
  if (!sourceId) return "—"
  return context.incomeSources.find((item) => item.id === sourceId)?.name ?? "—"
}

const resolveDebtorName = (context: OperationContext, debtorId: string | null): string => {
  if (!debtorId) return "—"
  return context.debtors.find((item) => item.id === debtorId)?.name ?? "—"
}

const resolveGoalName = (context: OperationContext, goalId: string | null): string => {
  if (!goalId) return "—"
  return context.goals.find((item) => item.id === goalId)?.name ?? "—"
}

const buildDraftReviewText = (
  draft: bot_operation_drafts,
  context: OperationContext,
  workspaceLabel: string,
): string => {
  const type = parseDraftType(draft.type)
  const amount = parseAmount(draft.amount)
  const icon = resolveOperationIcon(type)
  const amountLabel = formatAmountWithCurrency(amount, context.accounts[0]?.currency ?? "RUB")
  const accountLabel = resolveAccountName(context, draft.from_entity_id)
  const categoryOrSourceLabel = type === "income"
    ? resolveSourceName(context, draft.income_source_id)
    : resolveCategoryName(context, draft.category_id)
  const detailLabel = type === "income" ? "Источник" : "Категория"
  const transferToLabel = resolveAccountName(context, draft.to_entity_id)
  const debtFromLabel = resolveDebtorName(context, draft.from_entity_id)
  const debtToLabel = resolveDebtorName(context, draft.to_entity_id)
  const goalLabel = resolveGoalName(context, draft.to_entity_id)
  const dateLabel = draft.happened_at ? formatDateLongRu(draft.happened_at) : "—"
  const descriptionLabel = draft.description?.trim() ? draft.description.trim() : "—"

  const lines: string[] = [
    "Проверь, пожалуйста:",
    "",
    `${icon} ${operationTypeLabels[type]} · <b>${escapeHtml(amountLabel)}</b>`,
    `↳ 🗂️ Аккаунт · <b>${escapeHtml(workspaceLabel)}</b>`,
    "",
  ]

  if (type === "transfer") {
    lines.push(`💳 Откуда · <b>${escapeHtml(accountLabel)}</b>`)
    lines.push(`🏦 Куда · <b>${escapeHtml(transferToLabel)}</b>`)
  } else if (type === "debt_received") {
    lines.push(`👤 Откуда · <b>${escapeHtml(debtFromLabel)}</b>`)
    lines.push(`💳 Куда · <b>${escapeHtml(transferToLabel)}</b>`)
  } else if (type === "debt_paid") {
    lines.push(`💳 Откуда · <b>${escapeHtml(accountLabel)}</b>`)
    lines.push(`👤 Куда · <b>${escapeHtml(debtToLabel)}</b>`)
  } else if (type === "goal_topup") {
    lines.push(`💳 Откуда · <b>${escapeHtml(accountLabel)}</b>`)
    lines.push(`🎯 Куда · <b>${escapeHtml(goalLabel)}</b>`)
  } else {
    lines.push(`💳 Счёт · <b>${escapeHtml(accountLabel)}</b>`)
    lines.push(`📂 ${detailLabel} · <b>${escapeHtml(categoryOrSourceLabel)}</b>`)
  }

  lines.push(`📅 Дата · <b>${escapeHtml(dateLabel)}</b>`)
  lines.push(`📝 Описание · <b>${escapeHtml(descriptionLabel)}</b>`)

  return lines.join("\n")
}

const buildSavedSummaryText = (draft: bot_operation_drafts, context: BotOperationContext): string => {
  const type = parseDraftType(draft.type)
  const icon = resolveOperationIcon(type)
  const amount = parseAmount(draft.amount)
  const currency = context.accounts.find((item) => item.id === draft.from_entity_id || item.id === draft.to_entity_id)?.currency ?? context.accounts[0]?.currency ?? "RUB"
  const amountLabel = formatAmountWithCurrency(amount, currency)

  const fromLabel =
    type === "income"
      ? resolveSourceName(context, draft.income_source_id)
      : type === "debt_received"
        ? resolveDebtorName(context, draft.from_entity_id)
        : resolveAccountName(context, draft.from_entity_id)
  const toLabel =
    type === "income"
      ? resolveAccountName(context, draft.from_entity_id)
      : type === "transfer" || type === "debt_received"
        ? resolveAccountName(context, draft.to_entity_id)
        : type === "debt_paid"
          ? resolveDebtorName(context, draft.to_entity_id)
          : type === "goal_topup"
            ? resolveGoalName(context, draft.to_entity_id)
            : resolveCategoryName(context, draft.category_id)

  return `${icon} <b>${escapeHtml(amountLabel)}</b> · ${escapeHtml(fromLabel)} → ${escapeHtml(toLabel)}\n↳ 🗂️ ${escapeHtml(context.workspaceLabel)}`
}

const canSaveDraft = (draft: bot_operation_drafts): { ok: true } | { ok: false; missing: string } => {
  const type = parseDraftType(draft.type)
  const amount = parseAmount(draft.amount)
  if (type === "unknown") return { ok: false, missing: "тип" }
  if (!amount || amount <= 0) return { ok: false, missing: "сумма" }
  if (!draft.happened_at) return { ok: false, missing: "дата" }

  if (type === "expense") {
    if (!draft.from_entity_id) return { ok: false, missing: "счёт" }
    if (!draft.category_id) return { ok: false, missing: "категория" }
    return { ok: true }
  }

  if (type === "income") {
    if (!draft.from_entity_id) return { ok: false, missing: "счёт" }
    if (!draft.income_source_id) return { ok: false, missing: "источник" }
    return { ok: true }
  }

  if (type === "debt_received") {
    if (!draft.from_entity_id) return { ok: false, missing: "должник" }
    if (!draft.to_entity_id) return { ok: false, missing: "счёт" }
    return { ok: true }
  }

  if (type === "debt_paid") {
    if (!draft.from_entity_id) return { ok: false, missing: "счёт" }
    if (!draft.to_entity_id) return { ok: false, missing: "кредитор" }
    return { ok: true }
  }

  if (type === "goal_topup") {
    if (!draft.from_entity_id) return { ok: false, missing: "счёт" }
    if (!draft.to_entity_id) return { ok: false, missing: "цель" }
    return { ok: true }
  }

  if (!draft.from_entity_id || !draft.to_entity_id) {
    return { ok: false, missing: "счета перевода" }
  }
  if (draft.from_entity_id === draft.to_entity_id) {
    return { ok: false, missing: "разные счета" }
  }
  return { ok: true }
}

async function upsertDraftLiveMessage(
  fastify: FastifyInstance,
  params: {
    session: bot_sessions
    draft: bot_operation_drafts
    chatId: string
    text: string
    keyboard?: Record<string, unknown>
    parseMode?: "HTML"
  },
): Promise<number | null> {
  const { draft, chatId, text, keyboard, parseMode } = params
  let session = params.session

  const candidateMessageId = draft.live_message_id ?? session.active_message_id ?? null
  if (candidateMessageId) {
    const edited = await editTelegramMessage(fastify, chatId, candidateMessageId, text, keyboard, parseMode)
    if (edited) {
      if (draft.live_message_id !== candidateMessageId) {
        await prisma.bot_operation_drafts.update({
          where: { id: draft.id },
          data: { live_message_id: candidateMessageId },
        })
      }
      if (session.active_message_id !== candidateMessageId) {
        session = await prisma.bot_sessions.update({
          where: { id: session.id },
          data: { active_message_id: candidateMessageId },
        })
      }
      return candidateMessageId
    }
  }

  const createdMessageId = await sendTelegramMessage(fastify, chatId, text, keyboard, parseMode)
  if (!createdMessageId) return null

  await prisma.bot_operation_drafts.update({
    where: { id: draft.id },
    data: { live_message_id: createdMessageId },
  })

  await prisma.bot_sessions.update({
    where: { id: session.id },
    data: { active_message_id: createdMessageId },
  })

  return createdMessageId
}

async function renderDraftReview(
  fastify: FastifyInstance,
  session: bot_sessions,
  draft: bot_operation_drafts,
  openAppUrl: string,
): Promise<void> {
  const context = await loadOperationContext(draft.workspace_id)
  const type = parseDraftType(draft.type)
  const text = buildDraftReviewText(draft, context, context.workspaceLabel)
  const keyboard = buildReviewKeyboard(type)

  await upsertDraftLiveMessage(fastify, {
    session,
    draft,
    chatId: draft.chat_id,
    text,
    keyboard,
    parseMode: "HTML",
  })

  await prisma.bot_sessions.update({
    where: { id: session.id },
    data: {
      mode: BotSessionMode.draft_review,
      awaiting_input_type: null,
    },
  })
}

async function renderUnfinishedDraftBlock(
  fastify: FastifyInstance,
  session: bot_sessions,
  draft: bot_operation_drafts,
): Promise<void> {
  await upsertDraftLiveMessage(fastify, {
    session,
    draft,
    chatId: draft.chat_id,
    text: "У тебя есть незавершённая операция. Что сделать?",
    keyboard: buildUnfinishedKeyboard(),
  })

  await prisma.bot_sessions.update({
    where: { id: session.id },
    data: {
      mode: BotSessionMode.unfinished_draft_block,
    },
  })
}

async function cancelDraft(session: bot_sessions, draft: bot_operation_drafts): Promise<void> {
  const onboardingSession = parseOnboardingSessionState(session.pending_input_json)
  await prisma.$transaction([
    prisma.bot_operation_drafts.update({
      where: { id: draft.id },
      data: { status: BotOperationDraftStatus.cancelled },
    }),
    prisma.bot_sessions.update({
      where: { id: session.id },
      data: {
        active_draft_id: null,
        mode: BotSessionMode.idle,
        awaiting_input_type: null,
        pending_input_json: buildSessionPendingInputJson(onboardingSession, null),
        active_message_id: null,
      },
    }),
  ])
}

async function cleanupCancelledDraftMessages(
  fastify: FastifyInstance,
  draft: bot_operation_drafts,
  extraMessageIds: Array<number | null | undefined> = [],
): Promise<void> {
  const payload = parseDraftPayload(draft.payload_json)
  const messageIds = new Set<number>()
  if (typeof draft.source_message_id === "number") {
    messageIds.add(draft.source_message_id)
  }
  if (typeof draft.live_message_id === "number") {
    messageIds.add(draft.live_message_id)
  }
  payload.transientUserMessageIds.forEach((messageId) => {
    messageIds.add(messageId)
  })
  extraMessageIds.forEach((messageId) => {
    if (typeof messageId === "number" && Number.isFinite(messageId)) {
      messageIds.add(messageId)
    }
  })

  for (const messageId of messageIds) {
    await deleteTelegramMessage(fastify, draft.chat_id, messageId)
  }
}

async function sendEphemeralMessage(
  fastify: FastifyInstance,
  chatId: string,
  text: string,
  ttlMs = 4000,
): Promise<void> {
  const messageId = await sendTelegramMessage(fastify, chatId, text)
  if (typeof messageId !== "number") return
  setTimeout(() => {
    void deleteTelegramMessage(fastify, chatId, messageId)
  }, ttlMs)
}

async function cleanupDraftMessages(
  fastify: FastifyInstance,
  draft: bot_operation_drafts,
): Promise<void> {
  const payload = parseDraftPayload(draft.payload_json)

  if (typeof draft.source_message_id === "number") {
    await deleteTelegramMessage(fastify, draft.chat_id, draft.source_message_id)
  }

  for (const messageId of payload.transientUserMessageIds) {
    await deleteTelegramMessage(fastify, draft.chat_id, messageId)
  }
}

async function maybePromptPaywall(
  fastify: FastifyInstance,
  userState: bot_user_states,
  chatId: string,
): Promise<number> {
  const nextCount = userState.successful_operations_count + 1
  const shouldPrompt =
    nextCount >= 3 &&
    !userState.paywall_prompted_at &&
    (userState.stage === BotUserStage.NEW_USER || userState.stage === BotUserStage.TRIAL_FREE_USAGE)

  const updatedState = await prisma.bot_user_states.update({
    where: { user_id: userState.user_id },
    data: {
      successful_operations_count: { increment: 1 },
      stage: shouldPrompt ? BotUserStage.TRIAL_PAYWALL : userState.stage,
      paywall_prompted_at: shouldPrompt ? new Date() : userState.paywall_prompted_at,
    },
  })

  if (!shouldPrompt) return nextCount

  const openAppUrl = await resolveMiniAppUrl()
  const paywallUrl = await resolvePaywallUrl()
  await sendTelegramMessage(
    fastify,
    chatId,
    "Ты уже записал несколько операций. Чтобы продолжить тест бота и приложения без ограничений — открой пробный доступ на 7 дней за 1 ₽.",
    buildPaywallKeyboard(paywallUrl, openAppUrl),
  )

  await prisma.bot_user_states.update({
    where: { user_id: updatedState.user_id },
    data: { stage: BotUserStage.TRIAL_PAYWALL },
  })
  return nextCount
}

async function setDraftAmount(
  draftId: string,
  amount: number,
): Promise<bot_operation_drafts> {
  return prisma.bot_operation_drafts.update({
    where: { id: draftId },
    data: {
      amount: new Prisma.Decimal(amount),
      status: BotOperationDraftStatus.pending_review,
    },
  })
}

async function setDraftDescription(
  draftId: string,
  description: string | null,
): Promise<bot_operation_drafts> {
  return prisma.bot_operation_drafts.update({
    where: { id: draftId },
    data: {
      description,
      status: BotOperationDraftStatus.pending_review,
    },
  })
}

async function parseInputToText(
  fastify: FastifyInstance,
  input: CaptureSourceInput,
): Promise<{ normalizedText: string; receiptOccurredAtISO?: string } | null> {
  if (input.kind === "text") {
    return { normalizedText: input.text.trim() }
  }

  if (input.kind === "voice") {
    const downloaded = await downloadTelegramFileAsBuffer(input.fileId)
    const transcript = await transcribeAudio(downloaded.buffer, input.fileNameHint)
    return { normalizedText: transcript }
  }

  const downloaded = await downloadTelegramFileAsBuffer(input.fileId)
  if (downloaded.buffer.length > MAX_RECEIPT_IMAGE_BYTES) {
    return null
  }
  const receipt = await extractReceiptFromImage(downloaded.buffer, downloaded.mimeType)
  return {
    normalizedText: buildReceiptParseText(receipt),
    receiptOccurredAtISO: receipt.occurredAtISO,
  }
}

async function ensureSingleActiveDraft(userId: string): Promise<void> {
  await prisma.bot_operation_drafts.updateMany({
    where: {
      user_id: userId,
      status: { in: ACTIVE_DRAFT_STATUSES },
    },
    data: {
      status: BotOperationDraftStatus.superseded,
    },
  })
}

async function markOnboardingSessionStarted(userId: string): Promise<void> {
  const activeDraft = await prisma.bot_operation_drafts.findFirst({
    where: {
      user_id: userId,
      status: { in: ACTIVE_DRAFT_STATUSES },
    },
    select: { id: true },
  })
  if (activeDraft) {
    return
  }

  const existingSession = await prisma.bot_sessions.findUnique({
    where: { user_id: userId },
    select: { pending_input_json: true },
  })
  const pendingCaptureInput = parsePendingCaptureInput(existingSession?.pending_input_json ?? null)

  await prisma.bot_sessions.upsert({
    where: { user_id: userId },
    create: {
      user_id: userId,
      pending_input_json: buildSessionPendingInputJson({ completedSaves: 0 }, pendingCaptureInput),
    },
    update: {
      pending_input_json: buildSessionPendingInputJson({ completedSaves: 0 }, pendingCaptureInput),
    },
  })
}
async function processCaptureInput(
  fastify: FastifyInstance,
  params: {
    telegramUserId: string
    firstName?: string | null
    username?: string | null
    chatId: string
    input: CaptureSourceInput
  },
): Promise<void> {
  const { telegramUserId, firstName, username, chatId, input } = params

  const user = await upsertTelegramUser({ telegramUserId, firstName, username })
  const initialUserState = await ensureBotUserState(user.id)
  let userState = await reconcileSuccessfulOperationsCount(user.id, initialUserState)
  let session = await ensureBotSession(user.id)
  const onboardingSession = parseOnboardingSessionState(session.pending_input_json)

  const workspaceId = await ensureWorkspaceForUser(user.id)
  if (userState.stage === BotUserStage.NEW_USER) {
    userState = await prisma.bot_user_states.update({
      where: { user_id: user.id },
      data: { stage: BotUserStage.TRIAL_FREE_USAGE },
    })
  }

  const activeDraft = await readActiveDraft(session)
  if (activeDraft) {
    await prisma.bot_sessions.update({
      where: { id: session.id },
      data: {
        mode: BotSessionMode.unfinished_draft_block,
        pending_input_json: buildSessionPendingInputJson(onboardingSession, input),
      },
    })
    await renderUnfinishedDraftBlock(fastify, session, activeDraft)

    if (typeof input.sourceMessageId === "number") {
      await deleteTelegramMessage(fastify, chatId, input.sourceMessageId)
    }
    return
  }

  const processingText =
    input.kind === "voice"
      ? "Обрабатываю голос…"
      : input.kind === "receipt"
        ? "Считываю чек…"
        : "Распознаю операцию…"

  const processingMessageId = await sendTelegramMessage(fastify, chatId, processingText)

  await ensureSingleActiveDraft(user.id)

  session = await prisma.bot_sessions.update({
    where: { id: session.id },
    data: {
      mode: BotSessionMode.processing_input,
      active_draft_id: null,
      awaiting_input_type: null,
      pending_input_json: buildSessionPendingInputJson(onboardingSession, null),
      active_message_id: processingMessageId ?? session.active_message_id,
    },
  })

  const context = await loadOperationContext(workspaceId)
  const openAppUrl = await resolveMiniAppUrl()

  let parsedTextResult: { normalizedText: string; receiptOccurredAtISO?: string } | null = null
  try {
    parsedTextResult = await parseInputToText(fastify, input)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    fastify.log.error(`[bot:capture] input parse error: ${message}`)
  }

  if (!parsedTextResult || !parsedTextResult.normalizedText.trim()) {
    if (processingMessageId) {
      await editTelegramMessage(
        fastify,
        chatId,
        processingMessageId,
        "Не удалось распознать ввод. Попробуй ещё раз.",
        buildRetryKeyboard(openAppUrl),
      )
    } else {
      await sendTelegramMessage(fastify, chatId, "Не удалось распознать ввод. Попробуй ещё раз.", buildRetryKeyboard(openAppUrl))
    }

    await prisma.bot_sessions.update({
      where: { id: session.id },
      data: { mode: BotSessionMode.capture_error, active_message_id: processingMessageId ?? null },
    })
    return
  }

  const semanticHints = buildDraftSemanticHints(parsedTextResult.normalizedText, context)
  const earlyIntentMapped = resolveEarlyDebtGoalDraft(parsedTextResult.normalizedText, context)
  let mapped: DraftShape
  if (earlyIntentMapped) {
    mapped = earlyIntentMapped
  } else {
    let parsed: ParsedOperation
    try {
      parsed = await parseOperationFromText(parsedTextResult.normalizedText, context)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      fastify.log.error(`[bot:capture] model parse error: ${message}`)

      if (processingMessageId) {
        await editTelegramMessage(
          fastify,
          chatId,
          processingMessageId,
          "Не удалось распознать операцию. Попробуй ещё раз или открой приложение.",
          buildRetryKeyboard(openAppUrl),
        )
      } else {
        await sendTelegramMessage(
          fastify,
          chatId,
          "Не удалось распознать операцию. Попробуй ещё раз или открой приложение.",
          buildRetryKeyboard(openAppUrl),
        )
      }

      await prisma.bot_sessions.update({
        where: { id: session.id },
        data: { mode: BotSessionMode.capture_error, active_message_id: processingMessageId ?? null },
      })
      return
    }

    mapped = mapParsedToDraftShape(parsed)
  }

  const [memoryHint, transactionHint] = await Promise.all([
    loadDraftMemoryHint(user.id, workspaceId, semanticHints),
    loadTransactionHistoryHint(user.id, workspaceId, semanticHints),
  ])
  const resolvedMapped = applyDraftPrefillHints(
    parsedTextResult.normalizedText,
    mapped,
    context,
    semanticHints,
    memoryHint,
    transactionHint,
  )

  const draftLookup: DraftLookupMemory = {
    signature: semanticHints.signature,
    tokens: semanticHints.tokens,
    type: resolvedMapped.type,
    fromEntityId: resolvedMapped.fromEntityId,
    toEntityId: resolvedMapped.toEntityId,
    categoryId: resolvedMapped.categoryId,
    incomeSourceId: resolvedMapped.incomeSourceId,
  }
  let draft: bot_operation_drafts
  try {
    draft = await prisma.bot_operation_drafts.create({
      data: {
        user_id: user.id,
        workspace_id: workspaceId,
        session_id: session.id,
        type: resolvedMapped.type,
        amount: resolvedMapped.amount !== null ? new Prisma.Decimal(resolvedMapped.amount) : null,
        from_entity_id: resolvedMapped.fromEntityId,
        to_entity_id: resolvedMapped.toEntityId,
        category_id: resolvedMapped.categoryId,
        income_source_id: resolvedMapped.incomeSourceId,
        happened_at: resolvedMapped.happenedAt,
        description: resolvedMapped.description,
        source_type: mapSourceType(input.kind),
        source_raw: parsedTextResult.normalizedText.slice(0, 4000),
        parsed_confidence: resolvedMapped.confidence,
        status: BotOperationDraftStatus.pending_review,
        chat_id: chatId,
        source_message_id: input.sourceMessageId,
        live_message_id: processingMessageId,
        lookup_json: serializeDraftLookupMemory(draftLookup),
        payload_json: serializeDraftPayload({ transientUserMessageIds: [] }),
      },
    })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const blockedDraft = await readActiveDraft(session)
      if (blockedDraft) {
        await prisma.bot_sessions.update({
          where: { id: session.id },
          data: {
            mode: BotSessionMode.unfinished_draft_block,
            pending_input_json: buildSessionPendingInputJson(onboardingSession, input),
            active_draft_id: blockedDraft.id,
          },
        })
        await renderUnfinishedDraftBlock(fastify, session, blockedDraft)
        return
      }
    }
    const message = error instanceof Error ? error.message : String(error)
    fastify.log.error(`[bot:capture] draft create error: ${message}`)
    if (processingMessageId) {
      await editTelegramMessage(
        fastify,
        chatId,
        processingMessageId,
        "Не удалось создать черновик. Попробуй ещё раз.",
        buildRetryKeyboard(openAppUrl),
      )
    } else {
      await sendTelegramMessage(
        fastify,
        chatId,
        "Не удалось создать черновик. Попробуй ещё раз.",
        buildRetryKeyboard(openAppUrl),
      )
    }
    await prisma.bot_sessions.update({
      where: { id: session.id },
      data: { mode: BotSessionMode.capture_error },
    })
    return
  }

  session = await prisma.bot_sessions.update({
    where: { id: session.id },
    data: {
      active_draft_id: draft.id,
      mode: BotSessionMode.draft_review,
      awaiting_input_type: null,
      pending_input_json: buildSessionPendingInputJson(onboardingSession, null),
      active_message_id: processingMessageId ?? session.active_message_id,
    },
  })

  await renderDraftReview(fastify, session, draft, openAppUrl)

  if (userState.stage === BotUserStage.TRIAL_PAYWALL) {
    await prisma.bot_user_states.update({
      where: { user_id: userState.user_id },
      data: { stage: BotUserStage.TRIAL_LIMITED },
    })
  }
}

async function handleAwaitingFieldMessage(
  fastify: FastifyInstance,
  params: {
    session: bot_sessions
    draft: bot_operation_drafts
    text: string
    chatId: string
    userMessageId: number | null
  },
): Promise<boolean> {
  const { session, draft, text, chatId, userMessageId } = params

  const awaiting = session.awaiting_input_type
  if (!awaiting || (awaiting !== "amount" && awaiting !== "description")) {
    return false
  }

  if (typeof userMessageId === "number") {
    await deleteTelegramMessage(fastify, chatId, userMessageId)
    const payload = parseDraftPayload(draft.payload_json)
    const nextPayload = withTransientMessage(payload, userMessageId)
    await prisma.bot_operation_drafts.update({
      where: { id: draft.id },
      data: { payload_json: serializeDraftPayload(nextPayload) },
    })
  }

  if (awaiting === "amount") {
    const amount = parseEditedAmount(text)
    if (!amount) {
      await upsertDraftLiveMessage(fastify, {
        session,
        draft,
        chatId,
        text: "Не понял сумму. Введи число, например 2000.",
        keyboard: buildAmountPromptKeyboard(),
      })
      return true
    }

    const updatedDraft = await setDraftAmount(draft.id, amount)
    await prisma.bot_sessions.update({
      where: { id: session.id },
      data: { mode: BotSessionMode.draft_review, awaiting_input_type: null },
    })

    const openAppUrl = await resolveMiniAppUrl()
    await renderDraftReview(fastify, session, updatedDraft, openAppUrl)
    return true
  }

  const normalizedDescription = text.trim().slice(0, 300)
  const updatedDraft = await setDraftDescription(draft.id, normalizedDescription.length > 0 ? normalizedDescription : null)

  await prisma.bot_sessions.update({
    where: { id: session.id },
    data: { mode: BotSessionMode.draft_review, awaiting_input_type: null },
  })

  const openAppUrl = await resolveMiniAppUrl()
  await renderDraftReview(fastify, session, updatedDraft, openAppUrl)
  return true
}

async function renderPicker(
  fastify: FastifyInstance,
  params: {
    session: bot_sessions
    draft: bot_operation_drafts
    kind: PickerKind
    offset: number
    openAppUrl: string
  },
): Promise<void> {
  const { session, draft, kind, offset, openAppUrl } = params
  const context = await loadOperationContext(draft.workspace_id)

  const type = parseDraftType(draft.type)
  let items: Array<{ id: string; name: string }> = []
  let title = ""

  if (kind === "ws") {
    items = await loadUserWorkspaces(session.user_id)
    title = "Выбери аккаунт"
  }

  if (kind === "cat") {
    if (type !== "expense") {
      await upsertDraftLiveMessage(fastify, {
        session,
        draft,
        chatId: draft.chat_id,
        text: "Сначала выбери тип операции: расход.",
        keyboard: buildTypeKeyboard(),
      })
      return
    }
    items = context.categories.filter((item) => item.kind === "expense")
    title = "Выбери категорию"
  }

  if (kind === "src") {
    if (type !== "income") {
      await upsertDraftLiveMessage(fastify, {
        session,
        draft,
        chatId: draft.chat_id,
        text: "Сначала выбери тип операции: доход.",
        keyboard: buildTypeKeyboard(),
      })
      return
    }
    items = context.incomeSources
    title = "Выбери источник"
  }

  if (kind === "acc") {
    if (type === "transfer" || type === "debt_received" || type === "debt_paid" || type === "goal_topup") {
      await upsertDraftLiveMessage(fastify, {
        session,
        draft,
        chatId: draft.chat_id,
        text: "Для этого типа выбери поля «Откуда» и «Куда».",
        keyboard: buildReviewKeyboard(type),
      })
      return
    }
    items = context.accounts
    title = "Выбери счёт"
  }

  if (kind === "from") {
    if (type !== "transfer" && type !== "debt_received" && type !== "debt_paid" && type !== "goal_topup") {
      await upsertDraftLiveMessage(fastify, {
        session,
        draft,
        chatId: draft.chat_id,
        text: "Сначала выбери подходящий тип операции.",
        keyboard: buildTypeKeyboard(),
      })
      return
    }
    if (type === "debt_received") {
      items = context.debtors
        .filter((debtor) => debtor.direction !== "payable")
        .map((debtor) => ({ id: debtor.id, name: debtor.name }))
      title = "Выбери должника «Откуда»"
    } else {
      items = context.accounts
      title = "Выбери счёт «Откуда»"
    }
  }

  if (kind === "to") {
    if (type !== "transfer" && type !== "debt_received" && type !== "debt_paid" && type !== "goal_topup") {
      await upsertDraftLiveMessage(fastify, {
        session,
        draft,
        chatId: draft.chat_id,
        text: "Сначала выбери подходящий тип операции.",
        keyboard: buildTypeKeyboard(),
      })
      return
    }
    if (type === "debt_paid") {
      items = context.debtors
        .filter((debtor) => debtor.direction !== "receivable")
        .map((debtor) => ({ id: debtor.id, name: debtor.name }))
      title = "Выбери кредитора «Куда»"
    } else if (type === "goal_topup") {
      items = context.goals
      title = "Выбери цель «Куда»"
    } else {
      items = context.accounts
      title = "Выбери счёт «Куда»"
    }
  }

  if (items.length === 0) {
    await upsertDraftLiveMessage(fastify, {
      session,
      draft,
      chatId: draft.chat_id,
      text: "Список пуст. Открой приложение, чтобы добавить нужные элементы.",
      keyboard: buildReviewKeyboard(type),
    })
    return
  }

  await upsertDraftLiveMessage(fastify, {
    session,
    draft,
    chatId: draft.chat_id,
    text: title,
    keyboard: { inline_keyboard: buildPickerRows(kind, items, offset) },
  })

  await prisma.bot_sessions.update({
    where: { id: session.id },
    data: {
      mode: BotSessionMode.awaiting_choice,
      awaiting_input_type: kind,
    },
  })
}

async function saveDraft(
  fastify: FastifyInstance,
  params: {
    session: bot_sessions
    draft: bot_operation_drafts
    userState: bot_user_states
  },
): Promise<void> {
  const { session, draft, userState } = params
  const onboardingSession = parseOnboardingSessionState(session.pending_input_json)
  const validation = canSaveDraft(draft)
  const openAppUrl = await resolveMiniAppUrl()

  if (!validation.ok) {
    await upsertDraftLiveMessage(fastify, {
      session,
      draft,
      chatId: draft.chat_id,
      text: `Не хватает поля: ${validation.missing}.`,
      keyboard: buildReviewKeyboard(parseDraftType(draft.type)),
    })
    return
  }

  const lockResult = await prisma.bot_operation_drafts.updateMany({
    where: {
      id: draft.id,
      status: {
        in: [
          BotOperationDraftStatus.pending_review,
          BotOperationDraftStatus.awaiting_field_input,
          BotOperationDraftStatus.awaiting_choice,
        ],
      },
    },
    data: {
      status: BotOperationDraftStatus.saving,
    },
  })
  if (lockResult.count === 0) {
    return
  }

  const savingDraft = await prisma.bot_operation_drafts.findUnique({
    where: { id: draft.id },
  })
  if (!savingDraft) {
    return
  }

  await prisma.bot_sessions.update({
    where: { id: session.id },
    data: { mode: BotSessionMode.saving },
  })

  await upsertDraftLiveMessage(fastify, {
    session,
    draft: savingDraft,
    chatId: savingDraft.chat_id,
    text: "Сохраняю операцию…",
  })

  try {
    const type = parseDraftType(savingDraft.type)
    const amount = parseAmount(savingDraft.amount) ?? 0
    const happenedAt = (savingDraft.happened_at ?? startOfToday()).toISOString()
    let createdTransaction: CreatedTransaction

    if (type === "expense") {
      createdTransaction = await createWorkspaceTransaction(savingDraft.workspace_id, {
        kind: "expense",
        amount,
        accountId: savingDraft.from_entity_id ?? undefined,
        categoryId: savingDraft.category_id ?? undefined,
        happenedAt,
        description: savingDraft.description ?? undefined,
      }, session.user_id)
    } else if (type === "income") {
      createdTransaction = await createWorkspaceTransaction(savingDraft.workspace_id, {
        kind: "income",
        amount,
        accountId: savingDraft.from_entity_id ?? undefined,
        incomeSourceId: savingDraft.income_source_id ?? undefined,
        happenedAt,
        description: savingDraft.description ?? undefined,
      }, session.user_id)
    } else if (type === "debt_received") {
      createdTransaction = await createWorkspaceTransaction(
        savingDraft.workspace_id,
        {
          kind: "transfer",
          amount,
          toAccountId: savingDraft.to_entity_id ?? undefined,
          debtorId: savingDraft.from_entity_id ?? undefined,
          happenedAt,
          description: savingDraft.description ?? undefined,
        },
        session.user_id,
      )
    } else if (type === "debt_paid") {
      createdTransaction = await createWorkspaceTransaction(
        savingDraft.workspace_id,
        {
          kind: "expense",
          amount,
          accountId: savingDraft.from_entity_id ?? undefined,
          debtorId: savingDraft.to_entity_id ?? undefined,
          happenedAt,
          description: savingDraft.description ?? undefined,
        },
        session.user_id,
      )
    } else if (type === "goal_topup") {
      createdTransaction = await createWorkspaceTransaction(
        savingDraft.workspace_id,
        {
          kind: "transfer",
          amount,
          fromAccountId: savingDraft.from_entity_id ?? undefined,
          goalId: savingDraft.to_entity_id ?? undefined,
          happenedAt,
          description: savingDraft.description ?? undefined,
        },
        session.user_id,
      )
    } else {
      createdTransaction = await createWorkspaceTransaction(savingDraft.workspace_id, {
        kind: "transfer",
        amount,
        fromAccountId: savingDraft.from_entity_id ?? undefined,
        toAccountId: savingDraft.to_entity_id ?? undefined,
        happenedAt,
        description: savingDraft.description ?? undefined,
      }, session.user_id)
    }

    const finalLookup = normalizeLookupFromDraft({
      lookup_json: savingDraft.lookup_json,
      source_raw: savingDraft.source_raw,
      type: savingDraft.type,
      from_entity_id: savingDraft.from_entity_id,
      to_entity_id: savingDraft.to_entity_id,
      category_id: savingDraft.category_id,
      income_source_id: savingDraft.income_source_id,
    }) ?? {
      signature: "",
      tokens: [],
      type: parseDraftType(savingDraft.type),
      fromEntityId: savingDraft.from_entity_id ?? null,
      toEntityId: savingDraft.to_entity_id ?? null,
      categoryId: savingDraft.category_id ?? null,
      incomeSourceId: savingDraft.income_source_id ?? null,
    }

    const updatedDraft = await prisma.bot_operation_drafts.update({
      where: { id: draft.id },
      data: {
        status: BotOperationDraftStatus.applied,
        lookup_json: serializeDraftLookupMemory({
          ...finalLookup,
          type: parseDraftType(savingDraft.type),
          fromEntityId: savingDraft.from_entity_id ?? null,
          toEntityId: savingDraft.to_entity_id ?? null,
          categoryId: savingDraft.category_id ?? null,
          incomeSourceId: savingDraft.income_source_id ?? null,
        }),
      },
    })

    await cleanupDraftMessages(fastify, updatedDraft)

    const context = await loadOperationContext(updatedDraft.workspace_id)
    const summaryText = buildSavedSummaryText(updatedDraft, context)
    const target = resolveDraftTarget(updatedDraft)
    const deepLink = buildMiniAppDeepLink(openAppUrl, {
      workspaceId: updatedDraft.workspace_id,
      targetType: target.targetType,
      targetId: target.targetId,
      transactionId: createdTransaction.id,
    })
    const openButtonMode = shouldUseWebAppButton(deepLink) ? "web_app" : "url"
    fastify.log.info(
      `[bot:save] open-app button mode=${openButtonMode} targetType=${target.targetType} workspaceId=${updatedDraft.workspace_id} transactionId=${createdTransaction.id}`,
    )

    await upsertDraftLiveMessage(fastify, {
      session,
      draft: updatedDraft,
      chatId: updatedDraft.chat_id,
      text: summaryText,
      keyboard: buildResultKeyboard(deepLink),
      parseMode: "HTML",
    })

    const nextOnboardingSession =
      onboardingSession
        ? onboardingSession.completedSaves + 1 >= 2
          ? null
          : { completedSaves: onboardingSession.completedSaves + 1 }
        : null

    await prisma.bot_sessions.update({
      where: { id: session.id },
      data: {
        active_draft_id: null,
        mode: BotSessionMode.idle,
        awaiting_input_type: null,
        pending_input_json: buildSessionPendingInputJson(nextOnboardingSession, null),
        active_message_id: null,
      },
    })

    await maybePromptPaywall(fastify, userState, updatedDraft.chat_id)
    if (onboardingSession && onboardingSession.completedSaves === 0) {
      await sendTelegramMessage(fastify, updatedDraft.chat_id, buildOnboardingAfterFirstSaveText(), undefined, "HTML")
    }
    return
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    fastify.log.error(`[bot:save] failed: ${message}`)

    await prisma.bot_operation_drafts.update({
      where: { id: draft.id },
      data: { status: BotOperationDraftStatus.failed },
    })

    await prisma.bot_sessions.update({
      where: { id: session.id },
      data: { mode: BotSessionMode.save_error },
    })

    await upsertDraftLiveMessage(fastify, {
      session,
      draft: savingDraft,
      chatId: savingDraft.chat_id,
      text: "Не получилось сохранить. Попробуй ещё раз или открой приложение.",
      keyboard: buildRetryKeyboard(openAppUrl),
    })
    return
  }
}

async function processPendingInputIfExists(
  fastify: FastifyInstance,
  params: {
    session: bot_sessions
    telegramUserId: string
    firstName?: string | null
    username?: string | null
    chatId: string
    pendingInputOverride?: PendingCaptureInput | null
  },
): Promise<void> {
  const pending = params.pendingInputOverride ?? parsePendingCaptureInput(params.session.pending_input_json)
  if (!pending) {
    await sendTelegramMessage(fastify, params.chatId, buildCapturePromptText())
    return
  }

  const pendingInput: CaptureSourceInput = pending.kind === "text"
    ? {
        kind: "text",
        text: pending.text ?? "",
        sourceMessageId: pending.sourceMessageId ?? null,
      }
    : pending.kind === "voice"
      ? {
          kind: "voice",
          fileId: pending.fileId ?? "",
          fileNameHint: pending.fileNameHint ?? "voice.ogg",
          sourceMessageId: pending.sourceMessageId ?? null,
        }
      : {
          kind: "receipt",
          fileId: pending.fileId ?? "",
          sourceMessageId: pending.sourceMessageId ?? null,
        }

  await processCaptureInput(fastify, {
    telegramUserId: params.telegramUserId,
    firstName: params.firstName,
    username: params.username,
    chatId: params.chatId,
    input: pendingInput,
  })
}

async function handleDraftCallback(
  fastify: FastifyInstance,
  callbackQuery: TelegramCallbackQuery,
): Promise<void> {
  const callbackQueryId = callbackQuery.id?.trim()
  if (callbackQueryId) {
    await answerCallbackQuery(fastify, callbackQueryId)
  }

  const data = callbackQuery.data?.trim()
  if (!data || !data.startsWith("bot:")) return

  const callbackUserId = toStringId(callbackQuery.from?.id)
  const callbackChatId = toStringId(callbackQuery.message?.chat?.id)
  const callbackMessageId =
    typeof callbackQuery.message?.message_id === "number" && Number.isFinite(callbackQuery.message.message_id)
      ? callbackQuery.message.message_id
      : null
  if (!callbackUserId || !callbackChatId) return

  const user = await upsertTelegramUser({
    telegramUserId: callbackUserId,
    firstName: callbackQuery.from?.first_name,
    username: callbackQuery.from?.username,
  })
  const session = await ensureBotSession(user.id)
  let userState = await ensureBotUserState(user.id)

  const openAppUrl = await resolveMiniAppUrl()

  if (data === "bot:start:begin" || data === "bot:start:try") {
    await sendTelegramMessage(fastify, callbackChatId, buildCapturePromptText())
    return
  }

  if (data === "bot:start:how") {
    await sendTelegramMessage(fastify, callbackChatId, buildHowItWorksText(), buildHowItWorksKeyboard(openAppUrl))
    return
  }

  if (data.startsWith("bot:onboard:sample:")) {
    const sampleKey = data.slice("bot:onboard:sample:".length)
    const sampleText = resolveOnboardingSampleText(sampleKey)
    if (!sampleText) return
    await processCaptureInput(fastify, {
      telegramUserId: callbackUserId,
      firstName: callbackQuery.from?.first_name,
      username: callbackQuery.from?.username,
      chatId: callbackChatId,
      input: {
        kind: "text",
        text: sampleText,
        sourceMessageId: null,
      },
    })
    return
  }

  if (data === "bot:new" || data === "bot:new:text") {
    await sendTelegramMessage(fastify, callbackChatId, buildCapturePromptText())
    return
  }

  if (data === "bot:new:voice") {
    await sendTelegramMessage(fastify, callbackChatId, "Отправь голосовое сообщение, и я соберу черновик операции.")
    return
  }

  if (data === "bot:new:receipt") {
    await sendTelegramMessage(fastify, callbackChatId, "Пришли фото чека, и я предложу черновик операции.")
    return
  }

  if (data === "bot:paywall:later") {
    userState = await prisma.bot_user_states.update({
      where: { user_id: user.id },
      data: { stage: BotUserStage.TRIAL_LIMITED },
    })
    await sendTelegramMessage(fastify, callbackChatId, "Ок, продолжим без оплаты. Когда будешь готов — кнопка всегда в меню.")
    return
  }

  const draft = await readActiveDraft(session)
  if (!draft) {
    await sendTelegramMessage(fastify, callbackChatId, "Активного черновика нет. Отправь новую операцию.")
    return
  }

  if (data === "bot:unfinished:continue") {
    await renderDraftReview(fastify, session, draft, openAppUrl)
    return
  }

  if (data === "bot:unfinished:cancel") {
    await cancelDraft(session, draft)
    await cleanupCancelledDraftMessages(fastify, draft, [callbackMessageId])
    await sendEphemeralMessage(fastify, callbackChatId, "Отменил, можете добавлять новую операцию ✍️")
    return
  }

  if (data === "bot:unfinished:new") {
    const pendingInput = parsePendingCaptureInput(session.pending_input_json)
    await cancelDraft(session, draft)
    await cleanupCancelledDraftMessages(fastify, draft, [callbackMessageId])
    await processPendingInputIfExists(fastify, {
      session,
      telegramUserId: callbackUserId,
      firstName: callbackQuery.from?.first_name,
      username: callbackQuery.from?.username,
      chatId: callbackChatId,
      pendingInputOverride: pendingInput,
    })
    return
  }

  if (data === "bot:cancel") {
    await cancelDraft(session, draft)
    await cleanupCancelledDraftMessages(fastify, draft, [callbackMessageId])
    return
  }

  if (data === "bot:save") {
    await saveDraft(fastify, { session, draft, userState })
    return
  }

  if (data === "bot:pick:type") {
    await upsertDraftLiveMessage(fastify, {
      session,
      draft,
      chatId: draft.chat_id,
      text: "Выбери тип операции",
      keyboard: buildTypeKeyboard(),
    })
    await prisma.bot_sessions.update({
      where: { id: session.id },
      data: { mode: BotSessionMode.awaiting_choice, awaiting_input_type: "type" },
    })
    return
  }

  if (data === "bot:pick:date") {
    await upsertDraftLiveMessage(fastify, {
      session,
      draft,
      chatId: draft.chat_id,
      text: "Выбери дату",
      keyboard: buildDateKeyboard(openAppUrl),
    })
    await prisma.bot_sessions.update({
      where: { id: session.id },
      data: { mode: BotSessionMode.awaiting_choice, awaiting_input_type: "date" },
    })
    return
  }

  if (data === "bot:edit:amount") {
    await upsertDraftLiveMessage(fastify, {
      session,
      draft,
      chatId: draft.chat_id,
      text: "Введи сумму (например, 2000)",
      keyboard: buildAmountPromptKeyboard(),
    })

    await prisma.bot_sessions.update({
      where: { id: session.id },
      data: { mode: BotSessionMode.awaiting_field_input, awaiting_input_type: "amount" },
    })
    return
  }

  if (data === "bot:edit:description") {
    await upsertDraftLiveMessage(fastify, {
      session,
      draft,
      chatId: draft.chat_id,
      text: "Введи описание операции",
      keyboard: buildDescriptionPromptKeyboard(),
    })

    await prisma.bot_sessions.update({
      where: { id: session.id },
      data: { mode: BotSessionMode.awaiting_field_input, awaiting_input_type: "description" },
    })
    return
  }

  if (data === "bot:clear:description") {
    const updatedDraft = await setDraftDescription(draft.id, null)
    await prisma.bot_sessions.update({
      where: { id: session.id },
      data: { mode: BotSessionMode.draft_review, awaiting_input_type: null },
    })
    await renderDraftReview(fastify, session, updatedDraft, openAppUrl)
    return
  }

  if (data === "bot:pick:acc") {
    await renderPicker(fastify, { session, draft, kind: "acc", offset: 0, openAppUrl })
    return
  }
  if (data === "bot:pick:workspace") {
    await renderPicker(fastify, { session, draft, kind: "ws", offset: 0, openAppUrl })
    return
  }

  if (data === "bot:pick:cat") {
    await renderPicker(fastify, { session, draft, kind: "cat", offset: 0, openAppUrl })
    return
  }

  if (data === "bot:pick:src") {
    await renderPicker(fastify, { session, draft, kind: "src", offset: 0, openAppUrl })
    return
  }

  if (data === "bot:pick:from") {
    await renderPicker(fastify, { session, draft, kind: "from", offset: 0, openAppUrl })
    return
  }

  if (data === "bot:pick:to") {
    await renderPicker(fastify, { session, draft, kind: "to", offset: 0, openAppUrl })
    return
  }

  if (data === "bot:back:review") {
    await renderDraftReview(fastify, session, draft, openAppUrl)
    return
  }

  if (data.startsWith("bot:set:type:")) {
    const nextTypeRaw = data.slice("bot:set:type:".length)
    const nextType: DraftType =
      nextTypeRaw === "expense" ||
      nextTypeRaw === "income" ||
      nextTypeRaw === "transfer" ||
      nextTypeRaw === "debt_received" ||
      nextTypeRaw === "debt_paid" ||
      nextTypeRaw === "goal_topup"
        ? nextTypeRaw
        : "unknown"

    if (nextType === "unknown") return

    const context = await loadOperationContext(draft.workspace_id)
    const accountIds = new Set(context.accounts.map((item) => item.id))
    const receivableDebtorIds = new Set(
      context.debtors.filter((item) => item.direction !== "payable").map((item) => item.id),
    )
    const payableDebtorIds = new Set(
      context.debtors.filter((item) => item.direction !== "receivable").map((item) => item.id),
    )
    const goalIds = new Set(context.goals.map((item) => item.id))

    let nextFromEntityId = draft.from_entity_id
    let nextToEntityId = draft.to_entity_id
    if (nextType === "expense" || nextType === "income") {
      nextFromEntityId = nextFromEntityId && accountIds.has(nextFromEntityId) ? nextFromEntityId : null
      nextToEntityId = null
    } else if (nextType === "transfer") {
      nextFromEntityId = nextFromEntityId && accountIds.has(nextFromEntityId) ? nextFromEntityId : null
      nextToEntityId = nextToEntityId && accountIds.has(nextToEntityId) ? nextToEntityId : null
    } else if (nextType === "debt_received") {
      nextFromEntityId = nextFromEntityId && receivableDebtorIds.has(nextFromEntityId) ? nextFromEntityId : null
      nextToEntityId = nextToEntityId && accountIds.has(nextToEntityId) ? nextToEntityId : null
    } else if (nextType === "debt_paid") {
      nextFromEntityId = nextFromEntityId && accountIds.has(nextFromEntityId) ? nextFromEntityId : null
      nextToEntityId = nextToEntityId && payableDebtorIds.has(nextToEntityId) ? nextToEntityId : null
    } else if (nextType === "goal_topup") {
      nextFromEntityId = nextFromEntityId && accountIds.has(nextFromEntityId) ? nextFromEntityId : null
      nextToEntityId = nextToEntityId && goalIds.has(nextToEntityId) ? nextToEntityId : null
    }

    const updatedDraft = await prisma.bot_operation_drafts.update({
      where: { id: draft.id },
      data: {
        type: nextType,
        category_id: nextType === "expense" ? draft.category_id : null,
        income_source_id: nextType === "income" ? draft.income_source_id : null,
        from_entity_id: nextFromEntityId,
        to_entity_id: nextToEntityId,
      },
    })

    await renderDraftReview(fastify, session, updatedDraft, openAppUrl)
    return
  }

  if (data.startsWith("bot:set:date:")) {
    const rawDateChoice = data.slice("bot:set:date:".length)
    const nextDate = rawDateChoice === "yesterday" ? yesterday() : startOfToday()
    const updatedDraft = await prisma.bot_operation_drafts.update({
      where: { id: draft.id },
      data: { happened_at: nextDate },
    })
    await renderDraftReview(fastify, session, updatedDraft, openAppUrl)
    return
  }

  if (data.startsWith("bot:page:")) {
    const chunks = data.split(":")
    const kindRaw = chunks[2] as PickerKind | undefined
    const offset = Number.parseInt(chunks[3] ?? "0", 10)
    if (!kindRaw || Number.isNaN(offset)) return
    await renderPicker(fastify, { session, draft, kind: kindRaw, offset, openAppUrl })
    return
  }

  if (data.startsWith("bot:set:")) {
    const chunks = data.split(":")
    const kindRaw = chunks[2] as PickerKind | undefined
    const index = Number.parseInt(chunks[3] ?? "-1", 10)
    if (!kindRaw || Number.isNaN(index) || index < 0) return

    const context = await loadOperationContext(draft.workspace_id)

    if (kindRaw === "cat") {
      const options = context.categories.filter((item) => item.kind === "expense")
      const selected = options[index]
      if (!selected) return
      const updatedDraft = await prisma.bot_operation_drafts.update({
        where: { id: draft.id },
        data: { category_id: selected.id },
      })
      await renderDraftReview(fastify, session, updatedDraft, openAppUrl)
      return
    }

    if (kindRaw === "src") {
      const selected = context.incomeSources[index]
      if (!selected) return
      const updatedDraft = await prisma.bot_operation_drafts.update({
        where: { id: draft.id },
        data: { income_source_id: selected.id },
      })
      await renderDraftReview(fastify, session, updatedDraft, openAppUrl)
      return
    }

    if (kindRaw === "acc") {
      const selected = context.accounts[index]
      if (!selected) return
      const updatedDraft = await prisma.bot_operation_drafts.update({
        where: { id: draft.id },
        data: { from_entity_id: selected.id },
      })
      await renderDraftReview(fastify, session, updatedDraft, openAppUrl)
      return
    }

    if (kindRaw === "from") {
      const type = parseDraftType(draft.type)
      const options =
        type === "debt_received"
          ? context.debtors
              .filter((debtor) => debtor.direction !== "payable")
              .map((debtor) => ({ id: debtor.id, name: debtor.name }))
          : context.accounts
      const selected = options[index]
      if (!selected) return
      const updatedDraft = await prisma.bot_operation_drafts.update({
        where: { id: draft.id },
        data: { from_entity_id: selected.id },
      })
      await renderDraftReview(fastify, session, updatedDraft, openAppUrl)
      return
    }

    if (kindRaw === "to") {
      const type = parseDraftType(draft.type)
      const options =
        type === "debt_paid"
          ? context.debtors
              .filter((debtor) => debtor.direction !== "receivable")
              .map((debtor) => ({ id: debtor.id, name: debtor.name }))
          : type === "goal_topup"
            ? context.goals
            : context.accounts
      const selected = options[index]
      if (!selected) return
      const updatedDraft = await prisma.bot_operation_drafts.update({
        where: { id: draft.id },
        data: { to_entity_id: selected.id },
      })
      await renderDraftReview(fastify, session, updatedDraft, openAppUrl)
      return
    }

    if (kindRaw === "ws") {
      const workspaceOptions = await loadUserWorkspaces(session.user_id)
      const selected = workspaceOptions[index]
      if (!selected) return

      const updatedDraft = await prisma.bot_operation_drafts.update({
        where: { id: draft.id },
        data: {
          workspace_id: selected.id,
          from_entity_id: null,
          to_entity_id: null,
          category_id: null,
          income_source_id: null,
        },
      })
      await renderDraftReview(fastify, session, updatedDraft, openAppUrl)
      return
    }
  }
}

async function handleStartCommand(fastify: FastifyInstance, message: TelegramMessage): Promise<void> {
  const chatId = toStringId(message.chat?.id)
  const telegramUserId = toStringId(message.from?.id)
  if (!chatId || !telegramUserId) return

  const user = await upsertTelegramUser({
    telegramUserId,
    firstName: message.from?.first_name,
    username: message.from?.username,
  })
  await ensureBotUserState(user.id)
  await markOnboardingSessionStarted(user.id)
  await sendTelegramMessage(fastify, chatId, buildOnboardingStartText(), buildOnboardingStartKeyboard(), "HTML")
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
        fastify.log.error(`[bot:callback] failed: ${messageText}`)
      }
      return reply.send({ ok: true })
    }

    const message = update?.message ?? null
    if (!message) {
      return reply.send({ ok: true })
    }

    const chatId = toStringId(message.chat?.id)
    const telegramUserId = toStringId(message.from?.id)
    if (!chatId || !telegramUserId) {
      return reply.send({ ok: true })
    }

    const messageText = message.text?.trim() ?? ""

    if (messageText.startsWith("/start")) {
      await handleStartCommand(fastify, message)
      return reply.send({ ok: true })
    }

    const user = await upsertTelegramUser({
      telegramUserId,
      firstName: message.from?.first_name,
      username: message.from?.username,
    })
    const session = await ensureBotSession(user.id)
    const activeDraft = await readActiveDraft(session)

    if (activeDraft && messageText.length > 0) {
      const wasFieldHandled = await handleAwaitingFieldMessage(fastify, {
        session,
        draft: activeDraft,
        text: messageText,
        chatId,
        userMessageId: message.message_id ?? null,
      })

      if (wasFieldHandled) {
        return reply.send({ ok: true })
      }
    }

    if (messageText.length > 0) {
      await processCaptureInput(fastify, {
        telegramUserId,
        firstName: message.from?.first_name,
        username: message.from?.username,
        chatId,
        input: {
          kind: "text",
          text: messageText,
          sourceMessageId: message.message_id ?? null,
        },
      })
      return reply.send({ ok: true })
    }

    const voiceFileId = message.voice?.file_id ?? message.audio?.file_id ?? null
    if (voiceFileId) {
      const fileNameHint = resolveFileNameHint(message.message_id, message.audio?.mime_type ?? null)
      await processCaptureInput(fastify, {
        telegramUserId,
        firstName: message.from?.first_name,
        username: message.from?.username,
        chatId,
        input: {
          kind: "voice",
          fileId: voiceFileId,
          fileNameHint,
          sourceMessageId: message.message_id ?? null,
        },
      })
      return reply.send({ ok: true })
    }

    const photoList = Array.isArray(message.photo) ? message.photo : []
    const largestPhoto = photoList.length > 0 ? photoList[photoList.length - 1] : null
    const photoFileId = largestPhoto?.file_id ?? null
    const photoFileSize = largestPhoto?.file_size ?? null

    const document = message.document ?? null
    const documentMime = document?.mime_type?.toLowerCase() ?? null
    const imageDocumentFileId = document?.file_id && documentMime?.startsWith("image/") ? document.file_id : null
    const imageDocumentSize = document?.file_size ?? null

    const receiptFileId = photoFileId ?? imageDocumentFileId
    const receiptFileSize = photoFileId ? photoFileSize : imageDocumentSize

    if (receiptFileId) {
      if (typeof receiptFileSize === "number" && receiptFileSize > MAX_RECEIPT_IMAGE_BYTES) {
        await sendTelegramMessage(fastify, chatId, "Слишком большое фото, пришли меньше")
        return reply.send({ ok: true })
      }

      await processCaptureInput(fastify, {
        telegramUserId,
        firstName: message.from?.first_name,
        username: message.from?.username,
        chatId,
        input: {
          kind: "receipt",
          fileId: receiptFileId,
          sourceMessageId: message.message_id ?? null,
        },
      })
      return reply.send({ ok: true })
    }

    return reply.send({ ok: true })
  })
}
