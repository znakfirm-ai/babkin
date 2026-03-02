import OpenAI from "openai"

export type OperationDraftResolved = {
  type: "expense" | "income" | "transfer" | "debt_received" | "debt_paid" | "goal_topup" | "unknown"
  amount?: number
  currency?: "RUB" | "KZT" | "USD" | "EUR"
  accountId?: string
  toAccountId?: string
  categoryId?: string
  incomeSourceId?: string
  debtorId?: string
  goalId?: string
  note?: string
  occurredAtISO?: string
  confidence: number
}

export type ParsedOperation =
  | { ok: true; data: OperationDraftResolved }
  | {
      ok: false
      reason: string
      questions?: Array<{ id: string; text: string; options: string[] }>
      partial?: Partial<OperationDraftResolved>
    }

export type OperationContext = {
  accounts: Array<{ id: string; name: string; currency?: string | null }>
  categories: Array<{ id: string; name: string; kind?: "income" | "expense" | null }>
  incomeSources: Array<{ id: string; name: string }>
  goals: Array<{ id: string; name: string }>
  debtors: Array<{ id: string; name: string; direction?: "receivable" | "payable" | null }>
}

type RawDraft = {
  type?: unknown
  amount?: unknown
  currency?: unknown
  accountId?: unknown
  toAccountId?: unknown
  categoryId?: unknown
  incomeSourceId?: unknown
  debtorId?: unknown
  goalId?: unknown
  note?: unknown
  occurredAtISO?: unknown
  confidence?: unknown
}

type RawQuestion = {
  id?: unknown
  text?: unknown
  options?: unknown
}

type RawParsed = {
  ok?: unknown
  data?: RawDraft | null
  reason?: unknown
  questions?: RawQuestion[] | null
  partial?: RawDraft | null
}

const OP_TYPES = new Set<OperationDraftResolved["type"]>([
  "expense",
  "income",
  "transfer",
  "debt_received",
  "debt_paid",
  "goal_topup",
  "unknown",
])

const CURRENCY_SET = new Set<NonNullable<OperationDraftResolved["currency"]>>(["RUB", "KZT", "USD", "EUR"])

const OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["ok", "data", "reason", "questions", "partial"],
  properties: {
    ok: { type: "boolean" },
    data: {
      anyOf: [
        { type: "null" },
        {
          type: "object",
          additionalProperties: false,
          required: [
            "type",
            "amount",
            "currency",
            "accountId",
            "toAccountId",
            "categoryId",
            "incomeSourceId",
            "debtorId",
            "goalId",
            "note",
            "occurredAtISO",
            "confidence",
          ],
          properties: {
            type: { type: "string" },
            amount: { anyOf: [{ type: "number" }, { type: "null" }] },
            currency: { anyOf: [{ type: "string" }, { type: "null" }] },
            accountId: { anyOf: [{ type: "string" }, { type: "null" }] },
            toAccountId: { anyOf: [{ type: "string" }, { type: "null" }] },
            categoryId: { anyOf: [{ type: "string" }, { type: "null" }] },
            incomeSourceId: { anyOf: [{ type: "string" }, { type: "null" }] },
            debtorId: { anyOf: [{ type: "string" }, { type: "null" }] },
            goalId: { anyOf: [{ type: "string" }, { type: "null" }] },
            note: { anyOf: [{ type: "string" }, { type: "null" }] },
            occurredAtISO: { anyOf: [{ type: "string" }, { type: "null" }] },
            confidence: { type: "number" },
          },
        },
      ],
    },
    reason: { anyOf: [{ type: "string" }, { type: "null" }] },
    questions: {
      anyOf: [
        { type: "null" },
        {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["id", "text", "options"],
            properties: {
              id: { type: "string" },
              text: { type: "string" },
              options: { type: "array", items: { type: "string" } },
            },
          },
        },
      ],
    },
    partial: {
      anyOf: [
        { type: "null" },
        {
          type: "object",
          additionalProperties: false,
          required: [
            "type",
            "amount",
            "currency",
            "accountId",
            "toAccountId",
            "categoryId",
            "incomeSourceId",
            "debtorId",
            "goalId",
            "note",
            "occurredAtISO",
            "confidence",
          ],
          properties: {
            type: { anyOf: [{ type: "string" }, { type: "null" }] },
            amount: { anyOf: [{ type: "number" }, { type: "null" }] },
            currency: { anyOf: [{ type: "string" }, { type: "null" }] },
            accountId: { anyOf: [{ type: "string" }, { type: "null" }] },
            toAccountId: { anyOf: [{ type: "string" }, { type: "null" }] },
            categoryId: { anyOf: [{ type: "string" }, { type: "null" }] },
            incomeSourceId: { anyOf: [{ type: "string" }, { type: "null" }] },
            debtorId: { anyOf: [{ type: "string" }, { type: "null" }] },
            goalId: { anyOf: [{ type: "string" }, { type: "null" }] },
            note: { anyOf: [{ type: "string" }, { type: "null" }] },
            occurredAtISO: { anyOf: [{ type: "string" }, { type: "null" }] },
            confidence: { anyOf: [{ type: "number" }, { type: "null" }] },
          },
        },
      ],
    },
  },
}

const DATE_WORDS_PATTERN =
  /(сегодня|вчера|позавчера|завтра|дата|числ[ао]?|январ|феврал|март|апрел|ма[йя]|июн|июл|август|сентябр|октябр|ноябр|декабр|\d{1,2}[./-]\d{1,2}([./-]\d{2,4})?|\d{4}-\d{2}-\d{2})/i

const todayIso = () => new Date().toISOString()

const toStringOrUndefined = (value: unknown) => {
  if (typeof value !== "string") return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

const normalizeType = (value: unknown): OperationDraftResolved["type"] => {
  if (typeof value !== "string") return "unknown"
  const normalized = value.trim() as OperationDraftResolved["type"]
  return OP_TYPES.has(normalized) ? normalized : "unknown"
}

const normalizeAmount = (value: unknown): number | undefined => {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined
  return parsed
}

const normalizeCurrency = (value: unknown): OperationDraftResolved["currency"] | undefined => {
  if (typeof value !== "string") return undefined
  const normalized = value.trim().toUpperCase() as NonNullable<OperationDraftResolved["currency"]>
  return CURRENCY_SET.has(normalized) ? normalized : undefined
}

const normalizeConfidence = (value: unknown): number => {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return 0
  return Math.max(0, Math.min(1, parsed))
}

const normalizeQuestions = (questions: RawQuestion[] | null | undefined): Array<{ id: string; text: string; options: string[] }> | undefined => {
  if (!Array.isArray(questions)) return undefined
  const normalized = questions
    .map((question) => {
      const id = toStringOrUndefined(question.id)
      const text = toStringOrUndefined(question.text)
      if (!id || !text || !Array.isArray(question.options)) return null
      const options = question.options
        .map((option) => (typeof option === "string" ? option.trim() : ""))
        .filter((option) => option.length > 0)
      if (options.length === 0) return null
      return { id, text, options }
    })
    .filter((item): item is { id: string; text: string; options: string[] } => item !== null)
  return normalized.length > 0 ? normalized : undefined
}

const defaultQuestion = (): Array<{ id: string; text: string; options: string[] }> => [
  {
    id: "operation_type",
    text: "Какую операцию имели в виду?",
    options: ["Расход", "Доход", "Перевод", "Долг", "Пополнение цели"],
  },
]

const normalizeDraft = (
  raw: RawDraft | null | undefined,
  context: OperationContext,
  sourceText: string,
): Partial<OperationDraftResolved> => {
  if (!raw || typeof raw !== "object") {
    return {}
  }

  const accountIds = new Set(context.accounts.map((account) => account.id))
  const expenseCategoryIds = new Set(context.categories.filter((category) => category.kind === "expense").map((category) => category.id))
  const incomeSourceIds = new Set(context.incomeSources.map((source) => source.id))
  const goalIds = new Set(context.goals.map((goal) => goal.id))
  const debtorReceivedIds = new Set(
    context.debtors
      .filter((debtor) => debtor.direction === "receivable" || debtor.direction === null || debtor.direction === undefined)
      .map((debtor) => debtor.id),
  )
  const debtorPaidIds = new Set(
    context.debtors
      .filter((debtor) => debtor.direction === "payable" || debtor.direction === null || debtor.direction === undefined)
      .map((debtor) => debtor.id),
  )

  const type = normalizeType(raw.type)
  const amount = normalizeAmount(raw.amount)
  const currency = normalizeCurrency(raw.currency)
  const accountIdCandidate = toStringOrUndefined(raw.accountId)
  const toAccountIdCandidate = toStringOrUndefined(raw.toAccountId)
  const categoryIdCandidate = toStringOrUndefined(raw.categoryId)
  const incomeSourceIdCandidate = toStringOrUndefined(raw.incomeSourceId)
  const debtorIdCandidate = toStringOrUndefined(raw.debtorId)
  const goalIdCandidate = toStringOrUndefined(raw.goalId)
  const hasExplicitDate = DATE_WORDS_PATTERN.test(sourceText)
  const occurredAtRaw = toStringOrUndefined(raw.occurredAtISO)
  const occurredAtISO = hasExplicitDate ? occurredAtRaw ?? todayIso() : todayIso()

  const accountId = accountIdCandidate && accountIds.has(accountIdCandidate) ? accountIdCandidate : undefined
  const toAccountId = toAccountIdCandidate && accountIds.has(toAccountIdCandidate) ? toAccountIdCandidate : undefined
  const categoryId = categoryIdCandidate && expenseCategoryIds.has(categoryIdCandidate) ? categoryIdCandidate : undefined
  const incomeSourceId =
    incomeSourceIdCandidate && incomeSourceIds.has(incomeSourceIdCandidate) ? incomeSourceIdCandidate : undefined

  const debtorPool = type === "debt_paid" ? debtorPaidIds : debtorReceivedIds
  const debtorId = debtorIdCandidate && debtorPool.has(debtorIdCandidate) ? debtorIdCandidate : undefined
  const goalId = goalIdCandidate && goalIds.has(goalIdCandidate) ? goalIdCandidate : undefined

  return {
    type,
    amount,
    currency,
    accountId,
    toAccountId,
    categoryId,
    incomeSourceId,
    debtorId,
    goalId,
    note: toStringOrUndefined(raw.note),
    occurredAtISO,
    confidence: normalizeConfidence(raw.confidence),
  }
}

const validateByType = (
  draft: Partial<OperationDraftResolved>,
): { ok: true } | { ok: false; reason: string; question: { id: string; text: string; options: string[] } } => {
  const type = draft.type ?? "unknown"
  if (type === "unknown") {
    return {
      ok: false,
      reason: "unknown_operation_type",
      question: defaultQuestion()[0],
    }
  }

  if (!draft.amount) {
    return {
      ok: false,
      reason: "missing_amount",
      question: { id: "amount", text: "Какую сумму записать?", options: ["1000", "2000", "5000"] },
    }
  }

  if (type === "expense") {
    if (!draft.accountId) {
      return {
        ok: false,
        reason: "missing_account",
        question: { id: "account", text: "С какого счёта списать?", options: ["Сбер", "Тинькофф", "Наличные"] },
      }
    }
    if (!draft.categoryId) {
      return {
        ok: false,
        reason: "missing_category",
        question: { id: "category", text: "Какая категория расхода?", options: ["Еда", "Транспорт", "Дом"] },
      }
    }
  }

  if (type === "income") {
    if (!draft.accountId) {
      return {
        ok: false,
        reason: "missing_account",
        question: { id: "account", text: "На какой счёт зачислить?", options: ["Сбер", "Тинькофф", "Наличные"] },
      }
    }
    if (!draft.incomeSourceId) {
      return {
        ok: false,
        reason: "missing_income_source",
        question: { id: "income_source", text: "Какой источник дохода?", options: ["Зарплата", "Бизнес", "Прочее"] },
      }
    }
  }

  if (type === "transfer") {
    if (!draft.accountId || !draft.toAccountId) {
      return {
        ok: false,
        reason: "missing_transfer_account",
        question: { id: "transfer_accounts", text: "Откуда и куда перевод?", options: ["Сбер → Тинькофф", "Наличные → Сбер"] },
      }
    }
    if (draft.accountId === draft.toAccountId) {
      return {
        ok: false,
        reason: "same_transfer_accounts",
        question: { id: "transfer_accounts", text: "Нужны разные счета для перевода", options: ["Сбер → Тинькофф", "Тинькофф → Сбер"] },
      }
    }
  }

  if (type === "debt_received" || type === "debt_paid") {
    if (!draft.accountId) {
      return {
        ok: false,
        reason: "missing_account",
        question: { id: "account", text: "Какой счёт использовать?", options: ["Сбер", "Тинькофф", "Наличные"] },
      }
    }
    if (!draft.debtorId) {
      return {
        ok: false,
        reason: "missing_debtor",
        question: { id: "debtor", text: "Какой долг выбрать?", options: ["Выбрать из списка долгов"] },
      }
    }
  }

  if (type === "goal_topup") {
    if (!draft.accountId) {
      return {
        ok: false,
        reason: "missing_account",
        question: { id: "account", text: "С какого счёта пополнить цель?", options: ["Сбер", "Тинькофф", "Наличные"] },
      }
    }
    if (!draft.goalId) {
      return {
        ok: false,
        reason: "missing_goal",
        question: { id: "goal", text: "Какую цель пополнить?", options: ["Выбрать цель"] },
      }
    }
  }

  return { ok: true }
}

const buildPromptContext = (context: OperationContext) => {
  const payload = {
    accounts: context.accounts.map((account) => ({
      id: account.id,
      name: account.name,
      currency: account.currency ?? null,
    })),
    categories: context.categories.map((category) => ({
      id: category.id,
      name: category.name,
      kind: category.kind ?? null,
    })),
    incomeSources: context.incomeSources.map((source) => ({ id: source.id, name: source.name })),
    goals: context.goals.map((goal) => ({ id: goal.id, name: goal.name })),
    debtors: context.debtors.map((debtor) => ({ id: debtor.id, name: debtor.name, direction: debtor.direction ?? null })),
  }
  return JSON.stringify(payload)
}

const parseResponseJSON = (value: string): RawParsed => {
  const parsed = JSON.parse(value) as unknown
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Parser response is not JSON object")
  }
  return parsed as RawParsed
}

export async function parseOperationFromText(text: string, context: OperationContext): Promise<ParsedOperation> {
  const sourceText = text.trim()
  if (!sourceText) {
    return { ok: false, reason: "empty_transcript", questions: defaultQuestion() }
  }

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set")
  }

  const client = new OpenAI({ apiKey })
  const contextPayload = buildPromptContext(context)
  const instructions =
    "Ты разбираешь голосовой ввод финансовых операций на русском языке. " +
    "Выбирай сущности только из переданных списков по id. " +
    "Нельзя придумывать новые id. Если уверенности нет — ok=false и вопросы. " +
    "Понимай сленг: 2к, две тысячи, пятёрка, тинёк, втб. " +
    "Для expense обязательны amount+accountId+categoryId. " +
    "Для income обязательны amount+accountId+incomeSourceId. " +
    "Для transfer обязательны amount+accountId+toAccountId. " +
    "Для debt_received/debt_paid обязательны amount+accountId+debtorId. " +
    "Для goal_topup обязательны amount+accountId+goalId. " +
    "Если дата в тексте не указана — ставь today."

  const response = await client.responses.create({
    model: "gpt-4.1-mini",
    instructions,
    input: `Текст пользователя: ${sourceText}\nСправочники пользователя JSON: ${contextPayload}`,
    text: {
      format: {
        type: "json_schema",
        name: "operation_draft_resolved",
        strict: true,
        schema: OUTPUT_SCHEMA,
      },
    },
  })

  const outputText = (response.output_text ?? "").trim()
  if (!outputText) {
    throw new Error("OpenAI parser returned empty output")
  }

  const raw = parseResponseJSON(outputText)
  const questions = normalizeQuestions(raw.questions)

  if (raw.ok !== true) {
    const reason = toStringOrUndefined(raw.reason) ?? "cannot_parse"
    const partial = normalizeDraft(raw.partial, context, sourceText)
    if (Object.keys(partial).length > 0) {
      return { ok: false, reason, questions: questions ?? defaultQuestion(), partial }
    }
    return { ok: false, reason, questions: questions ?? defaultQuestion() }
  }

  const normalized = normalizeDraft(raw.data, context, sourceText)
  const validated = validateByType(normalized)
  if (!validated.ok) {
    return {
      ok: false,
      reason: validated.reason,
      questions: [validated.question],
      partial: normalized,
    }
  }

  const draft: OperationDraftResolved = {
    type: normalized.type ?? "unknown",
    amount: normalized.amount,
    currency: normalized.currency,
    accountId: normalized.accountId,
    toAccountId: normalized.toAccountId,
    categoryId: normalized.categoryId,
    incomeSourceId: normalized.incomeSourceId,
    debtorId: normalized.debtorId,
    goalId: normalized.goalId,
    note: normalized.note,
    occurredAtISO: normalized.occurredAtISO ?? todayIso(),
    confidence: normalized.confidence ?? 0,
  }

  return { ok: true, data: draft }
}
