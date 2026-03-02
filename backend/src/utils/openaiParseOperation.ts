import OpenAI from "openai"

export type OperationDraft = {
  type: "expense" | "income" | "transfer" | "debt_received" | "debt_paid" | "goal_topup" | "unknown"
  amount?: number
  currency?: "RUB" | "KZT" | "USD" | "EUR"
  accountHint?: string
  toAccountHint?: string
  categoryHint?: string
  incomeSourceHint?: string
  debtorHint?: string
  goalHint?: string
  note?: string
  occurredAtISO?: string
  confidence: number
}

export type ParsedOperation =
  | { ok: true; data: OperationDraft }
  | { ok: false; reason: string; questions?: Array<{ id: string; text: string; options: string[] }>; partial?: Partial<OperationDraft> }

type Question = { id: string; text: string; options: string[] }

type RawOperationDraft = {
  type?: unknown
  amount?: unknown
  currency?: unknown
  accountHint?: unknown
  toAccountHint?: unknown
  categoryHint?: unknown
  incomeSourceHint?: unknown
  debtorHint?: unknown
  goalHint?: unknown
  note?: unknown
  occurredAtISO?: unknown
  confidence?: unknown
}

type RawParserOutput = {
  ok?: unknown
  data?: RawOperationDraft | null
  reason?: unknown
  questions?: Array<{ id?: unknown; text?: unknown; options?: unknown }> | null
  partial?: RawOperationDraft | null
}

const OPERATION_TYPES = new Set<OperationDraft["type"]>([
  "expense",
  "income",
  "transfer",
  "debt_received",
  "debt_paid",
  "goal_topup",
  "unknown",
])

const CURRENCIES = new Set<NonNullable<OperationDraft["currency"]>>(["RUB", "KZT", "USD", "EUR"])

const MODEL_INSTRUCTIONS = [
  "Ты парсер голосовых финансовых заметок на русском языке.",
  "Верни строго JSON по заданной схеме, без markdown и пояснений.",
  "Понимай сленг и разговорные формы: 2к, 2000, две тысячи, пятёрка, тинёк, втб.",
  "Игнорируй шум и повторы. Если рядом с шумными числами есть более правдоподобная сумма операции — выбирай её.",
  "Не выдумывай сущности. accountHint/categoryHint/incomeSourceHint/debtorHint/goalHint заполняй только из текста.",
  "Если неясен тип операции или сумма, верни ok=false, reason и минимум один уточняющий вопрос с вариантами.",
  "occurredAtISO: если дата не указана явно, используй сегодня.",
  "confidence всегда 0..1.",
].join(" ")

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
            "accountHint",
            "toAccountHint",
            "categoryHint",
            "incomeSourceHint",
            "debtorHint",
            "goalHint",
            "note",
            "occurredAtISO",
            "confidence",
          ],
          properties: {
            type: { type: "string" },
            amount: { anyOf: [{ type: "number" }, { type: "null" }] },
            currency: { anyOf: [{ type: "string" }, { type: "null" }] },
            accountHint: { anyOf: [{ type: "string" }, { type: "null" }] },
            toAccountHint: { anyOf: [{ type: "string" }, { type: "null" }] },
            categoryHint: { anyOf: [{ type: "string" }, { type: "null" }] },
            incomeSourceHint: { anyOf: [{ type: "string" }, { type: "null" }] },
            debtorHint: { anyOf: [{ type: "string" }, { type: "null" }] },
            goalHint: { anyOf: [{ type: "string" }, { type: "null" }] },
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
            "accountHint",
            "toAccountHint",
            "categoryHint",
            "incomeSourceHint",
            "debtorHint",
            "goalHint",
            "note",
            "occurredAtISO",
            "confidence",
          ],
          properties: {
            type: { anyOf: [{ type: "string" }, { type: "null" }] },
            amount: { anyOf: [{ type: "number" }, { type: "null" }] },
            currency: { anyOf: [{ type: "string" }, { type: "null" }] },
            accountHint: { anyOf: [{ type: "string" }, { type: "null" }] },
            toAccountHint: { anyOf: [{ type: "string" }, { type: "null" }] },
            categoryHint: { anyOf: [{ type: "string" }, { type: "null" }] },
            incomeSourceHint: { anyOf: [{ type: "string" }, { type: "null" }] },
            debtorHint: { anyOf: [{ type: "string" }, { type: "null" }] },
            goalHint: { anyOf: [{ type: "string" }, { type: "null" }] },
            note: { anyOf: [{ type: "string" }, { type: "null" }] },
            occurredAtISO: { anyOf: [{ type: "string" }, { type: "null" }] },
            confidence: { anyOf: [{ type: "number" }, { type: "null" }] },
          },
        },
      ],
    },
  },
}

const trimOrUndefined = (value: unknown) => {
  if (typeof value !== "string") return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

const todayIso = () => new Date().toISOString()

const toOperationType = (value: unknown): OperationDraft["type"] => {
  if (typeof value !== "string") return "unknown"
  const normalized = value.trim() as OperationDraft["type"]
  return OPERATION_TYPES.has(normalized) ? normalized : "unknown"
}

const toCurrency = (value: unknown): OperationDraft["currency"] | undefined => {
  if (typeof value !== "string") return undefined
  const normalized = value.trim().toUpperCase() as NonNullable<OperationDraft["currency"]>
  return CURRENCIES.has(normalized) ? normalized : undefined
}

const toConfidence = (value: unknown): number => {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return 0
  return Math.max(0, Math.min(1, parsed))
}

const toAmount = (value: unknown): number | undefined => {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined
  return parsed
}

const normalizeDraft = (raw: RawOperationDraft | null | undefined): Partial<OperationDraft> => {
  if (!raw || typeof raw !== "object") return {}
  const type = toOperationType(raw.type)
  const occurredAtISO = trimOrUndefined(raw.occurredAtISO) ?? todayIso()

  return {
    type,
    amount: toAmount(raw.amount),
    currency: toCurrency(raw.currency),
    accountHint: trimOrUndefined(raw.accountHint),
    toAccountHint: trimOrUndefined(raw.toAccountHint),
    categoryHint: trimOrUndefined(raw.categoryHint),
    incomeSourceHint: trimOrUndefined(raw.incomeSourceHint),
    debtorHint: trimOrUndefined(raw.debtorHint),
    goalHint: trimOrUndefined(raw.goalHint),
    note: trimOrUndefined(raw.note),
    occurredAtISO,
    confidence: toConfidence(raw.confidence),
  }
}

const normalizeQuestions = (questions: RawParserOutput["questions"]): Question[] | undefined => {
  if (!Array.isArray(questions)) return undefined
  const normalized = questions
    .map((item): Question | null => {
      const id = trimOrUndefined(item?.id)
      const text = trimOrUndefined(item?.text)
      if (!id || !text || !Array.isArray(item?.options)) return null
      const options = item.options
        .map((option) => (typeof option === "string" ? option.trim() : ""))
        .filter((option) => option.length > 0)
      if (options.length === 0) return null
      return { id, text, options }
    })
    .filter((item): item is Question => item !== null)

  return normalized.length > 0 ? normalized : undefined
}

const fallbackQuestion = (): Question => ({
  id: "operation_type",
  text: "Какую операцию вы имели в виду?",
  options: ["Расход", "Доход", "Перевод", "Долг", "Пополнение цели"],
})

const parseJson = (value: string): RawParserOutput => {
  const parsed = JSON.parse(value) as unknown
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Parser returned non-object JSON")
  }
  return parsed as RawParserOutput
}

export async function parseOperationFromText(text: string): Promise<ParsedOperation> {
  const source = text.trim()
  if (!source) {
    return { ok: false, reason: "empty_transcript", questions: [fallbackQuestion()] }
  }

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set")
  }

  const client = new OpenAI({ apiKey })
  const response = await client.responses.create({
    model: "gpt-4.1-mini",
    instructions: MODEL_INSTRUCTIONS,
    input: source,
    text: {
      format: {
        type: "json_schema",
        name: "operation_parse_result",
        strict: true,
        schema: OUTPUT_SCHEMA,
      },
    },
  })

  const rawText = (response.output_text ?? "").trim()
  if (!rawText) {
    throw new Error("OpenAI parser returned empty output")
  }

  const raw = parseJson(rawText)
  const ok = raw.ok === true

  if (ok) {
    const normalized = normalizeDraft(raw.data)
    const draft: OperationDraft = {
      type: normalized.type ?? "unknown",
      amount: normalized.amount,
      currency: normalized.currency,
      accountHint: normalized.accountHint,
      toAccountHint: normalized.toAccountHint,
      categoryHint: normalized.categoryHint,
      incomeSourceHint: normalized.incomeSourceHint,
      debtorHint: normalized.debtorHint,
      goalHint: normalized.goalHint,
      note: normalized.note,
      occurredAtISO: normalized.occurredAtISO ?? todayIso(),
      confidence: normalized.confidence ?? 0,
    }
    if (draft.type === "unknown" || draft.amount === undefined) {
      return {
        ok: false,
        reason: draft.amount === undefined ? "missing_amount" : "unknown_operation_type",
        partial: draft,
        questions: [fallbackQuestion()],
      }
    }
    return { ok: true, data: draft }
  }

  const questions = normalizeQuestions(raw.questions) ?? [fallbackQuestion()]
  const reason = trimOrUndefined(raw.reason) ?? "cannot_parse"
  const partial = normalizeDraft(raw.partial)
  return Object.keys(partial).length > 0
    ? { ok: false, reason, questions, partial }
    : { ok: false, reason, questions }
}
