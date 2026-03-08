import { FastifyInstance, FastifyPluginOptions } from "fastify"
import { randomUUID } from "crypto"
import { prisma } from "../db/prisma"
import { env } from "../env"
import { createWorkspaceTransaction, type TransactionCreateInput } from "./transactions"
import { transcribeAudio } from "../utils/openaiTranscribe"
import { parseOperationFromText, type OperationContext, type OperationDraftResolved } from "../utils/openaiParseOperation"
import { extractReceiptFromImage, type ReceiptExtract } from "../utils/openaiReceiptExtract"
import { downloadTelegramFileAsBuffer } from "../utils/telegramFiles"

type TelegramPhotoSize = {
  file_id?: string | null
  file_size?: number | null
}

type TelegramDocument = {
  file_id?: string | null
  mime_type?: string | null
  file_size?: number | null
}

type TelegramMessage = {
  message_id?: number
  from?: { id?: number | string | null } | null
  chat?: { id?: number | string | null } | null
  text?: string | null
  photo?: TelegramPhotoSize[] | null
  document?: TelegramDocument | null
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
  userId: string
  telegramUserId: string
  chatId: string
  workspaceId: string
  messageId: number | null
  draft: OperationDraftResolved
  transcript: string
  createdAtMs: number
  lookup: DraftLookup
  status: "pending" | "applied"
}

type PendingEdit = {
  draftId: string
  field: "amount" | "category" | "account"
  startedAtMs: number
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
const pendingEditStore = new Map<string, PendingEdit>()
const EDIT_PAGE_SIZE = 10
const MAX_RECEIPT_IMAGE_BYTES = 8 * 1024 * 1024

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

const buildOperationSummary = (draft: OperationDraftResolved, lookup: DraftLookup) => {
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
  return `${head}${suffix}`
}

const buildConfirmText = (draft: OperationDraftResolved, lookup: DraftLookup) =>
  `Понял так: ${buildOperationSummary(draft, lookup)}. Создать?`

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

const pendingEditKey = (telegramUserId: string, chatId: string) => `${telegramUserId}:${chatId}`

const clearPendingEdit = (telegramUserId: string, chatId: string) => {
  pendingEditStore.delete(pendingEditKey(telegramUserId, chatId))
}

const setPendingEdit = (telegramUserId: string, chatId: string, pendingEdit: PendingEdit) => {
  pendingEditStore.set(pendingEditKey(telegramUserId, chatId), pendingEdit)
}

const getPendingEdit = (telegramUserId: string, chatId: string): PendingEdit | null =>
  pendingEditStore.get(pendingEditKey(telegramUserId, chatId)) ?? null

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

const backToEditKeyboard = (draftId: string) => ({
  inline_keyboard: [[{ text: "Назад", callback_data: `draft:${draftId}:edit_back` }]],
})

const parseActionNumber = (action: string, prefix: string): number | null => {
  if (!action.startsWith(prefix)) return null
  const value = Number.parseInt(action.slice(prefix.length), 10)
  if (!Number.isFinite(value) || value < 0) return null
  return value
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

const formatDateDMY = (value: Date): string => {
  const day = String(value.getDate()).padStart(2, "0")
  const month = String(value.getMonth() + 1).padStart(2, "0")
  const year = String(value.getFullYear())
  return `${day}.${month}.${year}`
}

const buildPickerKeyboard = (
  draftId: string,
  mode: "category" | "account",
  items: Array<{ id: string; name: string }>,
  offset: number,
) => {
  const safeOffset = Math.max(0, Math.min(offset, Math.max(0, items.length - 1)))
  const pageItems = items.slice(safeOffset, safeOffset + EDIT_PAGE_SIZE)
  const rows: Array<Array<{ text: string; callback_data: string }>> = []

  for (let index = 0; index < pageItems.length; index += 2) {
    const rowItems = pageItems.slice(index, index + 2)
    rows.push(
      rowItems.map((item, rowIndex) => ({
        text: item.name,
        callback_data: `draft:${draftId}:${mode === "category" ? "set_category" : "set_account"}:${safeOffset + index + rowIndex}`,
      })),
    )
  }

  const navRow: Array<{ text: string; callback_data: string }> = []
  if (safeOffset > 0) {
    const prevOffset = Math.max(0, safeOffset - EDIT_PAGE_SIZE)
    navRow.push({
      text: "◀ Назад",
      callback_data: `draft:${draftId}:${mode === "category" ? "cat_page" : "acc_page"}:${prevOffset}`,
    })
  }
  if (safeOffset + EDIT_PAGE_SIZE < items.length) {
    navRow.push({
      text: "Далее ▶",
      callback_data: `draft:${draftId}:${mode === "category" ? "cat_page" : "acc_page"}:${safeOffset + EDIT_PAGE_SIZE}`,
    })
  }
  if (navRow.length > 0) {
    rows.push(navRow)
  }
  rows.push([{ text: "Назад", callback_data: `draft:${draftId}:edit_back` }])

  return { inline_keyboard: rows }
}

async function loadCategoryOptions(
  workspaceId: string,
  draftType: OperationDraftResolved["type"],
): Promise<Array<{ id: string; name: string }>> {
  const categories = await prisma.categories.findMany({
    where: {
      workspace_id: workspaceId,
      ...(draftType === "expense" ? { kind: "expense" } : {}),
    },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  })
  return categories.map((category) => ({ id: category.id, name: category.name }))
}

async function loadAccountOptions(workspaceId: string): Promise<Array<{ id: string; name: string }>> {
  const accounts = await prisma.accounts.findMany({
    where: { workspace_id: workspaceId, is_archived: false, archived_at: null },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  })
  return accounts.map((account) => ({ id: account.id, name: account.name }))
}

function buildCreateInputFromDraft(draft: OperationDraftResolved): TransactionCreateInput | null {
  const amount = draft.amount
  if (!amount || !Number.isFinite(amount) || amount <= 0) return null

  const happenedAt = draft.occurredAtISO
  const note = draft.note

  if (draft.type === "expense") {
    if (!draft.accountId || !draft.categoryId) return null
    return {
      kind: "expense",
      amount,
      accountId: draft.accountId,
      categoryId: draft.categoryId,
      note,
      happenedAt,
    }
  }

  if (draft.type === "income") {
    if (!draft.accountId || !draft.incomeSourceId) return null
    return {
      kind: "income",
      amount,
      accountId: draft.accountId,
      incomeSourceId: draft.incomeSourceId,
      note,
      happenedAt,
    }
  }

  if (draft.type === "transfer") {
    if (!draft.accountId || !draft.toAccountId || draft.accountId === draft.toAccountId) return null
    return {
      kind: "transfer",
      amount,
      fromAccountId: draft.accountId,
      toAccountId: draft.toAccountId,
      note,
      happenedAt,
    }
  }

  if (draft.type === "debt_received") {
    if (!draft.debtorId || !draft.accountId) return null
    return {
      kind: "transfer",
      amount,
      debtorId: draft.debtorId,
      toAccountId: draft.accountId,
      note,
      happenedAt,
    }
  }

  if (draft.type === "debt_paid") {
    if (!draft.debtorId || !draft.accountId) return null
    return {
      kind: "expense",
      amount,
      accountId: draft.accountId,
      debtorId: draft.debtorId,
      note,
      happenedAt,
    }
  }

  if (draft.type === "goal_topup") {
    if (!draft.goalId || !draft.accountId) return null
    return {
      kind: "transfer",
      amount,
      fromAccountId: draft.accountId,
      goalId: draft.goalId,
      note,
      happenedAt,
    }
  }

  return null
}

async function loadOperationContextByTelegramUserId(
  telegramUserId: string,
): Promise<{ userId: string; workspaceId: string; context: OperationContext } | null> {
  const user = await prisma.users.findUnique({
    where: { telegram_user_id: telegramUserId },
    select: { id: true, active_workspace_id: true },
  })
  const workspaceId = user?.active_workspace_id ?? null
  if (!workspaceId || !user?.id) return null

  const accounts = await prisma.accounts.findMany({
    where: { workspace_id: workspaceId, is_archived: false, archived_at: null },
    select: { id: true, name: true, currency: true },
  })

  const categories = await prisma.categories.findMany({
    where: { workspace_id: workspaceId, is_archived: false, archived_at: null },
    select: { id: true, name: true, kind: true },
  })

  const incomeSources = await prisma.income_sources.findMany({
    where: { workspace_id: workspaceId, is_archived: false, archived_at: null },
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
    userId: user.id,
    workspaceId,
    context: {
      accounts: accounts.map((account) => ({ id: account.id, name: account.name, currency: account.currency })),
      categories: categories.map((category) => ({ id: category.id, name: category.name, kind: category.kind })),
      incomeSources: incomeSources.map((source) => ({ id: source.id, name: source.name })),
      goals: goals.map((goal) => ({ id: goal.id, name: goal.name })),
      debtors: debtors.map((debtor) => ({
        id: debtor.id,
        name: debtor.name,
        direction: debtor.direction === "PAYABLE" ? "payable" : "receivable",
      })),
    },
  }
}

async function sendDraftConfirm(
  fastify: FastifyInstance,
  draftId: string,
  draftEntry: DraftEntry,
): Promise<void> {
  await sendTelegramMessage(
    fastify,
    draftEntry.chatId,
    buildConfirmText(draftEntry.draft, draftEntry.lookup),
    buildConfirmKeyboard(draftId),
  )
}

async function handlePendingAmountEditMessage(
  fastify: FastifyInstance,
  telegramUserId: string,
  chatId: string,
  text: string,
): Promise<boolean> {
  const pendingEdit = getPendingEdit(telegramUserId, chatId)
  if (!pendingEdit || pendingEdit.field !== "amount") return false

  const draftEntry = draftStore.get(pendingEdit.draftId)
  if (!draftEntry) {
    clearPendingEdit(telegramUserId, chatId)
    await sendTelegramMessage(fastify, chatId, "Черновик не найден.")
    return true
  }

  if (draftEntry.telegramUserId !== telegramUserId || draftEntry.chatId !== chatId) {
    clearPendingEdit(telegramUserId, chatId)
    fastify.log.warn(
      `[draft] forbidden pending edit: draft=${pendingEdit.draftId} user=${telegramUserId} chat=${chatId}`,
    )
    return true
  }

  if (draftEntry.status === "applied") {
    clearPendingEdit(telegramUserId, chatId)
    await sendTelegramMessage(fastify, chatId, "Уже создано ✅")
    return true
  }

  const parsedAmount = parseEditedAmount(text)
  if (!parsedAmount) {
    await sendTelegramMessage(fastify, chatId, "Не понял сумму, попробуй ещё раз")
    return true
  }

  draftEntry.draft = {
    ...draftEntry.draft,
    amount: parsedAmount,
    currency: draftEntry.draft.currency ?? "RUB",
  }
  draftStore.set(pendingEdit.draftId, draftEntry)
  clearPendingEdit(telegramUserId, chatId)
  fastify.log.info(`[edit:set] ${telegramUserId} ${pendingEdit.draftId} amount ${String(parsedAmount)}`)
  await sendDraftConfirm(fastify, pendingEdit.draftId, draftEntry)
  return true
}

async function handleParsedOperationResult(
  fastify: FastifyInstance,
  params: {
    parsedOperation: Awaited<ReturnType<typeof parseOperationFromText>>
    telegramUserId: string
    chatId: string
    workspaceId: string
    userId: string
    context: OperationContext
    messageId: number | undefined
    sourceText: string
    unresolvedMessage: string
    receiptOccurredAtISO?: string
  },
): Promise<void> {
  const {
    parsedOperation,
    telegramUserId,
    chatId,
    workspaceId,
    userId,
    context,
    messageId,
    sourceText,
    unresolvedMessage,
    receiptOccurredAtISO,
  } = params
  fastify.log.info(`[parse] ${telegramUserId} ${String(messageId ?? "unknown")} ${JSON.stringify(parsedOperation)}`)

  if (!parsedOperation.ok) {
    await sendTelegramMessage(fastify, chatId, unresolvedMessage)
    return
  }

  const draftId = randomUUID()
  let draftData = parsedOperation.data
  if (receiptOccurredAtISO) {
    const receiptDate = new Date(receiptOccurredAtISO)
    if (Number.isFinite(receiptDate.getTime())) {
      const now = new Date()
      const twoYearsAgo = new Date(now)
      twoYearsAgo.setFullYear(now.getFullYear() - 2)
      if (receiptDate < twoYearsAgo) {
        const newDateISO = now.toISOString()
        const receiptDateLabel = formatDateDMY(receiptDate)
        const dateNoteLine = `Дата на чеке: ${receiptDateLabel}`
        draftData = {
          ...draftData,
          occurredAtISO: newDateISO,
          note: draftData.note ? `${draftData.note}\n${dateNoteLine}` : dateNoteLine,
        }
        fastify.log.info(
          `[receipt-date-adjusted] ${telegramUserId} ${draftId} ${receiptOccurredAtISO} -> ${newDateISO}`,
        )
      }
    }
  }
  const lookup = toLookup(context)
  draftStore.set(draftId, {
    userId,
    telegramUserId,
    chatId,
    workspaceId,
    messageId: messageId ?? null,
    draft: draftData,
    transcript: sourceText,
    createdAtMs: Date.now(),
    lookup,
    status: "pending",
  })
  await sendTelegramMessage(
    fastify,
    chatId,
    buildConfirmText(draftData, lookup),
    buildConfirmKeyboard(draftId),
  )
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

  const callbackUserId = toStringId(callbackQuery.from?.id)
  const callbackChatId = toStringId(callbackQuery.message?.chat?.id)
  const draft = draftStore.get(parsedAction.draftId)

  if (!draft) {
    if (callbackUserId && callbackChatId) {
      clearPendingEdit(callbackUserId, callbackChatId)
    }
    if (callbackChatId) {
      await sendTelegramMessage(fastify, callbackChatId, "Черновик не найден.")
    }
    return
  }

  if (!callbackUserId || !callbackChatId || callbackUserId !== draft.telegramUserId || callbackChatId !== draft.chatId) {
    if (callbackUserId && callbackChatId) {
      clearPendingEdit(callbackUserId, callbackChatId)
    }
    fastify.log.warn(
      `[draft] forbidden callback: draft=${parsedAction.draftId} user=${callbackUserId ?? "unknown"} chat=${callbackChatId ?? "unknown"}`,
    )
    return
  }

  const action = parsedAction.action
  const isEditAction =
    action === "edit" ||
    action === "edit_amount" ||
    action === "edit_category" ||
    action === "edit_account" ||
    action === "edit_back" ||
    action.startsWith("cat_page:") ||
    action.startsWith("acc_page:") ||
    action.startsWith("set_category:") ||
    action.startsWith("set_account:")

  if (draft.status === "applied" && isEditAction) {
    clearPendingEdit(callbackUserId, callbackChatId)
    await sendTelegramMessage(fastify, draft.chatId, "Уже создано ✅")
    return
  }

  if (parsedAction.action === "confirm") {
    if (draft.status === "applied") {
      await sendTelegramMessage(fastify, draft.chatId, "Уже создано ✅")
      return
    }
    const createInput = buildCreateInputFromDraft(draft.draft)
    if (!createInput) {
      await sendTelegramMessage(fastify, draft.chatId, "Не получилось создать, попробуй ещё раз")
      return
    }
    try {
      await createWorkspaceTransaction(draft.workspaceId, createInput, draft.userId)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      fastify.log.error(`[apply] error ${draft.telegramUserId} ${parsedAction.draftId} ${message}`)
      await sendTelegramMessage(fastify, draft.chatId, "Не получилось создать, попробуй ещё раз")
      return
    }
    clearPendingEdit(callbackUserId, callbackChatId)
    draft.status = "applied"
    draftStore.set(parsedAction.draftId, draft)
    fastify.log.info(
      `[applied] ${draft.telegramUserId} ${parsedAction.draftId} ${draft.draft.type} ${String(draft.draft.amount ?? 0)} ${JSON.stringify({
        accountId: draft.draft.accountId ?? null,
        toAccountId: draft.draft.toAccountId ?? null,
        categoryId: draft.draft.categoryId ?? null,
        incomeSourceId: draft.draft.incomeSourceId ?? null,
        debtorId: draft.draft.debtorId ?? null,
        goalId: draft.draft.goalId ?? null,
      })}`,
    )
    await sendTelegramMessage(
      fastify,
      draft.chatId,
      `Создано ✅ ${buildOperationSummary(draft.draft, draft.lookup)}`,
    )
    return
  }

  if (parsedAction.action === "cancel") {
    clearPendingEdit(callbackUserId, callbackChatId)
    draftStore.delete(parsedAction.draftId)
    fastify.log.info(`[cancel] ${draft.telegramUserId} ${parsedAction.draftId}`)
    await sendTelegramMessage(fastify, draft.chatId, "Отменено.")
    return
  }

  if (parsedAction.action === "edit") {
    clearPendingEdit(callbackUserId, callbackChatId)
    fastify.log.info(`[edit] ${draft.telegramUserId} ${parsedAction.draftId}`)
    await sendTelegramMessage(fastify, draft.chatId, "Что исправить?", buildEditKeyboard(parsedAction.draftId))
    return
  }

  if (parsedAction.action === "edit_amount") {
    setPendingEdit(callbackUserId, callbackChatId, {
      draftId: parsedAction.draftId,
      field: "amount",
      startedAtMs: Date.now(),
    })
    fastify.log.info(`[edit] ${draft.telegramUserId} ${parsedAction.draftId} amount`)
    await sendTelegramMessage(
      fastify,
      draft.chatId,
      "Введи новую сумму (например 2000).",
      backToEditKeyboard(parsedAction.draftId),
    )
    return
  }

  if (parsedAction.action === "edit_category") {
    setPendingEdit(callbackUserId, callbackChatId, {
      draftId: parsedAction.draftId,
      field: "category",
      startedAtMs: Date.now(),
    })
    fastify.log.info(`[edit] ${draft.telegramUserId} ${parsedAction.draftId} category`)
    const categoryOptions = await loadCategoryOptions(draft.workspaceId, draft.draft.type)
    if (categoryOptions.length === 0) {
      await sendTelegramMessage(fastify, draft.chatId, "Категории не найдены.")
      return
    }
    await sendTelegramMessage(
      fastify,
      draft.chatId,
      "Выбери категорию:",
      buildPickerKeyboard(parsedAction.draftId, "category", categoryOptions, 0),
    )
    return
  }

  if (parsedAction.action === "edit_account") {
    setPendingEdit(callbackUserId, callbackChatId, {
      draftId: parsedAction.draftId,
      field: "account",
      startedAtMs: Date.now(),
    })
    fastify.log.info(`[edit] ${draft.telegramUserId} ${parsedAction.draftId} account`)
    const accountOptions = await loadAccountOptions(draft.workspaceId)
    if (accountOptions.length === 0) {
      await sendTelegramMessage(fastify, draft.chatId, "Счета не найдены.")
      return
    }
    await sendTelegramMessage(
      fastify,
      draft.chatId,
      "Выбери счёт:",
      buildPickerKeyboard(parsedAction.draftId, "account", accountOptions, 0),
    )
    return
  }

  const categoryPageOffset = parseActionNumber(parsedAction.action, "cat_page:")
  if (categoryPageOffset !== null) {
    setPendingEdit(callbackUserId, callbackChatId, {
      draftId: parsedAction.draftId,
      field: "category",
      startedAtMs: Date.now(),
    })
    const categoryOptions = await loadCategoryOptions(draft.workspaceId, draft.draft.type)
    if (categoryOptions.length === 0) {
      await sendTelegramMessage(fastify, draft.chatId, "Категории не найдены.")
      return
    }
    await sendTelegramMessage(
      fastify,
      draft.chatId,
      "Выбери категорию:",
      buildPickerKeyboard(parsedAction.draftId, "category", categoryOptions, categoryPageOffset),
    )
    return
  }

  const accountPageOffset = parseActionNumber(parsedAction.action, "acc_page:")
  if (accountPageOffset !== null) {
    setPendingEdit(callbackUserId, callbackChatId, {
      draftId: parsedAction.draftId,
      field: "account",
      startedAtMs: Date.now(),
    })
    const accountOptions = await loadAccountOptions(draft.workspaceId)
    if (accountOptions.length === 0) {
      await sendTelegramMessage(fastify, draft.chatId, "Счета не найдены.")
      return
    }
    await sendTelegramMessage(
      fastify,
      draft.chatId,
      "Выбери счёт:",
      buildPickerKeyboard(parsedAction.draftId, "account", accountOptions, accountPageOffset),
    )
    return
  }

  const setCategoryIndex = parseActionNumber(parsedAction.action, "set_category:")
  if (setCategoryIndex !== null) {
    clearPendingEdit(callbackUserId, callbackChatId)
    const categoryOptions = await loadCategoryOptions(draft.workspaceId, draft.draft.type)
    const selectedCategory = categoryOptions[setCategoryIndex] ?? null
    if (!selectedCategory) {
      await sendTelegramMessage(fastify, draft.chatId, "Категория не найдена.")
      return
    }
    draft.draft = { ...draft.draft, categoryId: selectedCategory.id }
    draft.lookup.categories[selectedCategory.id] = selectedCategory.name
    draftStore.set(parsedAction.draftId, draft)
    fastify.log.info(`[edit:set] ${draft.telegramUserId} ${parsedAction.draftId} category ${selectedCategory.id}`)
    await sendDraftConfirm(fastify, parsedAction.draftId, draft)
    return
  }

  const setAccountIndex = parseActionNumber(parsedAction.action, "set_account:")
  if (setAccountIndex !== null) {
    clearPendingEdit(callbackUserId, callbackChatId)
    const accountOptions = await loadAccountOptions(draft.workspaceId)
    const selectedAccount = accountOptions[setAccountIndex] ?? null
    if (!selectedAccount) {
      await sendTelegramMessage(fastify, draft.chatId, "Счёт не найден.")
      return
    }
    draft.draft = { ...draft.draft, accountId: selectedAccount.id }
    draft.lookup.accounts[selectedAccount.id] = selectedAccount.name
    draftStore.set(parsedAction.draftId, draft)
    fastify.log.info(`[edit:set] ${draft.telegramUserId} ${parsedAction.draftId} account ${selectedAccount.id}`)
    await sendDraftConfirm(fastify, parsedAction.draftId, draft)
    return
  }

  if (parsedAction.action === "edit_back") {
    clearPendingEdit(callbackUserId, callbackChatId)
    fastify.log.info(`[edit] ${draft.telegramUserId} ${parsedAction.draftId} back`)
    await sendDraftConfirm(fastify, parsedAction.draftId, draft)
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
    const messageText = message?.text?.trim()
    const telegramUserId = toStringId(message?.from?.id)
    const chatId = toStringId(message?.chat?.id)
    if (messageText && telegramUserId && chatId) {
      const wasPendingEditHandled = await handlePendingAmountEditMessage(fastify, telegramUserId, chatId, messageText)
      if (wasPendingEditHandled) {
        return reply.send({ ok: true })
      }
    }

    const voiceFileId = message?.voice?.file_id ?? message?.audio?.file_id ?? null
    const photoList = Array.isArray(message?.photo) ? message.photo : []
    const largestPhoto = photoList.length > 0 ? photoList[photoList.length - 1] : null
    const photoFileId = largestPhoto?.file_id ?? null
    const photoFileSize = largestPhoto?.file_size ?? null
    const document = message?.document ?? null
    const documentMime = document?.mime_type?.toLowerCase() ?? null
    const imageDocumentFileId = document?.file_id && documentMime?.startsWith("image/") ? document.file_id : null
    const imageDocumentSize = document?.file_size ?? null
    const receiptFileId = photoFileId ?? imageDocumentFileId
    const receiptFileSize = photoFileId ? photoFileSize : imageDocumentSize

    if (!voiceFileId && !receiptFileId) {
      return reply.send({ ok: true })
    }

    const messageId = message?.message_id
    if (!chatId || !telegramUserId) {
      fastify.log.warn(
        `[draft] missing identity fields: user=${String(telegramUserId ?? "unknown")} chat=${String(chatId ?? "unknown")}`,
      )
      return reply.send({ ok: true })
    }

    if (receiptFileId) {
      if (typeof receiptFileSize === "number" && receiptFileSize > MAX_RECEIPT_IMAGE_BYTES) {
        fastify.log.warn(
          `[receipt] file too large before download: user=${telegramUserId} message=${String(messageId ?? "unknown")} size=${String(receiptFileSize)}`,
        )
        await sendTelegramMessage(fastify, chatId, "Слишком большое фото, пришли меньше")
        return reply.send({ ok: true })
      }

      try {
        const downloaded = await downloadTelegramFileAsBuffer(receiptFileId)
        if (downloaded.buffer.length > MAX_RECEIPT_IMAGE_BYTES) {
          fastify.log.warn(
            `[receipt] file too large after download: user=${telegramUserId} message=${String(messageId ?? "unknown")} size=${String(downloaded.buffer.length)}`,
          )
          await sendTelegramMessage(fastify, chatId, "Слишком большое фото, пришли меньше")
          return reply.send({ ok: true })
        }
        const receipt = await extractReceiptFromImage(downloaded.buffer, downloaded.mimeType)
        fastify.log.info(`[receipt] ${telegramUserId} ${String(messageId ?? "unknown")} ${JSON.stringify(receipt)}`)

        const loadedContext = await loadOperationContextByTelegramUserId(telegramUserId)
        if (!loadedContext) {
          fastify.log.warn(`[parse] no active workspace context for telegram user ${telegramUserId}`)
          await sendTelegramMessage(fastify, chatId, "Не понял чек, уточни")
          return reply.send({ ok: true })
        }
        const { userId, workspaceId, context } = loadedContext
        const receiptParseText = buildReceiptParseText(receipt)

        try {
          const parsedOperation = await parseOperationFromText(receiptParseText, context)
          await handleParsedOperationResult(fastify, {
            parsedOperation,
            telegramUserId,
            chatId,
            userId,
            workspaceId,
            context,
            messageId,
            sourceText: receiptParseText,
            unresolvedMessage: "Не понял чек, уточни",
            receiptOccurredAtISO: receipt.occurredAtISO,
          })
        } catch (error) {
          if (error instanceof DOMException && error.name === "AbortError") {
            return reply.send({ ok: true })
          }
          const parseErrorText = error instanceof Error ? error.message : String(error)
          fastify.log.error(`[parse] error ${parseErrorText}`)
          await sendTelegramMessage(
            fastify,
            chatId,
            "Не понял чек, уточни",
          )
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return reply.send({ ok: true })
        }
        const receiptErrorText = error instanceof Error ? error.message : String(error)
        fastify.log.error(`[receipt] failed: ${receiptErrorText}`)
        await sendTelegramMessage(fastify, chatId, "Не получилось обработать фото чека")
      }

      return reply.send({ ok: true })
    }

    if (voiceFileId) {
      try {
        const downloaded = await downloadTelegramFileAsBuffer(voiceFileId)
        const filename = resolveFileName(messageId, downloaded.mimeType)
        const transcript = await transcribeAudio(downloaded.buffer, filename)
        fastify.log.info(`[voice] ${String(telegramUserId ?? "unknown")} ${String(messageId ?? "unknown")} ${transcript}`)

        const loadedContext = await loadOperationContextByTelegramUserId(telegramUserId)
        if (!loadedContext) {
          fastify.log.warn(`[parse] no active workspace context for telegram user ${telegramUserId}`)
          await sendTelegramMessage(fastify, chatId, "Не понял, уточни")
          return reply.send({ ok: true })
        }
        const { userId, workspaceId, context } = loadedContext

        try {
          const parsedOperation = await parseOperationFromText(transcript, context)
          await handleParsedOperationResult(fastify, {
            parsedOperation,
            telegramUserId,
            chatId,
            userId,
            workspaceId,
            context,
            messageId,
            sourceText: transcript,
            unresolvedMessage: "Не понял, уточни",
          })
        } catch (error) {
          if (error instanceof DOMException && error.name === "AbortError") {
            return reply.send({ ok: true })
          }
          const parseErrorText = error instanceof Error ? error.message : String(error)
          fastify.log.error(`[parse] error ${parseErrorText}`)
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return reply.send({ ok: true })
        }
        const voiceErrorText = error instanceof Error ? error.message : String(error)
        fastify.log.error(`[voice] failed: ${voiceErrorText}`)
      }
    }

    return reply.send({ ok: true })
  })
}
