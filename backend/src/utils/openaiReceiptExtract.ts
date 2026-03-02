import OpenAI from "openai"

export type ReceiptExtract = {
  merchant?: string
  total?: number
  currency?: "RUB" | "KZT" | "USD" | "EUR"
  occurredAtISO?: string
  items?: Array<{ name: string; qty?: number; price?: number; sum?: number }>
  rawText?: string
  confidence: number
}

type RawReceiptItem = {
  name?: unknown
  qty?: unknown
  price?: unknown
  sum?: unknown
}

type RawReceiptExtract = {
  merchant?: unknown
  total?: unknown
  currency?: unknown
  occurredAtISO?: unknown
  items?: unknown
  rawText?: unknown
  confidence?: unknown
}

const OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["merchant", "total", "currency", "occurredAtISO", "items", "rawText", "confidence"],
  properties: {
    merchant: { anyOf: [{ type: "string" }, { type: "null" }] },
    total: { anyOf: [{ type: "number" }, { type: "null" }] },
    currency: { anyOf: [{ type: "string" }, { type: "null" }] },
    occurredAtISO: { anyOf: [{ type: "string" }, { type: "null" }] },
    items: {
      anyOf: [
        { type: "null" },
        {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["name", "qty", "price", "sum"],
            properties: {
              name: { type: "string" },
              qty: { anyOf: [{ type: "number" }, { type: "null" }] },
              price: { anyOf: [{ type: "number" }, { type: "null" }] },
              sum: { anyOf: [{ type: "number" }, { type: "null" }] },
            },
          },
        },
      ],
    },
    rawText: { anyOf: [{ type: "string" }, { type: "null" }] },
    confidence: { type: "number" },
  },
}

const CURRENCY_SET = new Set<ReceiptExtract["currency"]>(["RUB", "KZT", "USD", "EUR"])

const normalizeString = (value: unknown): string | undefined => {
  if (typeof value !== "string") return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

const normalizeNumber = (value: unknown): number | undefined => {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined
  return parsed
}

const normalizeCurrency = (value: unknown): ReceiptExtract["currency"] | undefined => {
  if (typeof value !== "string") return undefined
  const normalized = value.trim().toUpperCase() as ReceiptExtract["currency"]
  return CURRENCY_SET.has(normalized) ? normalized : undefined
}

const normalizeConfidence = (value: unknown): number => {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return 0
  return Math.max(0, Math.min(1, parsed))
}

const normalizeItems = (value: unknown): ReceiptExtract["items"] => {
  if (!Array.isArray(value)) return undefined
  const items: Array<{ name: string; qty?: number; price?: number; sum?: number }> = []
  for (const item of value.slice(0, 15)) {
    const rawItem = item as RawReceiptItem
    const name = normalizeString(rawItem?.name)
    if (!name) continue
    const normalizedItem: { name: string; qty?: number; price?: number; sum?: number } = { name }
    const qty = normalizeNumber(rawItem?.qty)
    const price = normalizeNumber(rawItem?.price)
    const sum = normalizeNumber(rawItem?.sum)
    if (qty !== undefined) normalizedItem.qty = qty
    if (price !== undefined) normalizedItem.price = price
    if (sum !== undefined) normalizedItem.sum = sum
    items.push(normalizedItem)
  }
  return items.length > 0 ? items : undefined
}

const normalizeOccurredAtISO = (value: unknown): string | undefined => {
  if (typeof value !== "string") return undefined
  const trimmed = value.trim()
  if (!trimmed) return undefined
  const parsed = Date.parse(trimmed)
  if (!Number.isFinite(parsed)) return undefined
  return new Date(parsed).toISOString()
}

const resolveMimeType = (mimeType: string | null): string => {
  const normalized = mimeType?.split(";")[0].trim().toLowerCase()
  if (!normalized) return "image/jpeg"
  if (normalized.startsWith("image/")) return normalized
  return "image/jpeg"
}

export async function extractReceiptFromImage(image: Buffer, mimeType: string | null): Promise<ReceiptExtract> {
  if (!image || image.length === 0) {
    throw new Error("Receipt image buffer is empty")
  }

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set")
  }

  const client = new OpenAI({ apiKey })
  const imageMime = resolveMimeType(mimeType)
  const base64Image = image.toString("base64")
  const imageDataUrl = `data:${imageMime};base64,${base64Image}`

  const response = await client.responses.create({
    model: "gpt-4.1-mini",
    instructions:
      "Извлеки структуру чека на русском языке. Возвращай только JSON по схеме. " +
      "Не выдумывай данные: если не уверен, оставляй null и понижай confidence. " +
      "total — это ИТОГО/К ОПЛАТЕ. " +
      "occurredAtISO заполняй только если дата явно видна на чеке.",
    input: [
      {
        role: "user",
        content: [
          { type: "input_text", text: "Извлеки магазин, итог, валюту, дату и позиции из фото чека." },
          { type: "input_image", image_url: imageDataUrl, detail: "auto" },
        ],
      },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "receipt_extract",
        strict: true,
        schema: OUTPUT_SCHEMA,
      },
    },
  })

  const outputText = (response.output_text ?? "").trim()
  if (!outputText) {
    throw new Error("OpenAI receipt extractor returned empty output")
  }

  let raw: RawReceiptExtract
  try {
    raw = JSON.parse(outputText) as RawReceiptExtract
  } catch {
    throw new Error("OpenAI receipt extractor returned invalid JSON")
  }

  return {
    merchant: normalizeString(raw.merchant),
    total: normalizeNumber(raw.total),
    currency: normalizeCurrency(raw.currency),
    occurredAtISO: normalizeOccurredAtISO(raw.occurredAtISO),
    items: normalizeItems(raw.items),
    rawText: normalizeString(raw.rawText),
    confidence: normalizeConfidence(raw.confidence),
  }
}
