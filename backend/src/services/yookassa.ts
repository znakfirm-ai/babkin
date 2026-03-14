import { randomUUID } from "node:crypto"
import { env } from "../env"

export type YookassaPaymentStatus = "pending" | "waiting_for_capture" | "succeeded" | "canceled"

export type YookassaCreatePaymentInput = {
  amountValueRub: number
  description: string
  returnUrl?: string | null
  metadata: Record<string, string>
  paymentMethodId?: string | null
  savePaymentMethod: boolean
  customerEmail?: string | null
}

export type YookassaPaymentObject = {
  id: string
  status: YookassaPaymentStatus
  paid: boolean
  metadata?: Record<string, unknown>
  amount?: {
    value?: string
    currency?: string
  }
  confirmation?: {
    type?: string
    confirmation_url?: string
  }
  payment_method?: {
    id?: string
    type?: string
    saved?: boolean
  }
}

const normalizeRubAmount = (value: number): string => {
  const rounded = Math.round(value * 100) / 100
  return rounded.toFixed(2)
}

const ensureYookassaCredentials = () => {
  const shopId = env.YOOKASSA_SHOP_ID?.trim()
  const secretKey = env.YOOKASSA_SECRET_KEY?.trim()
  if (!shopId || !secretKey) {
    throw new Error("YOOKASSA credentials are not configured")
  }
  return { shopId, secretKey }
}

const resolveReceiptEmail = (value: string | null | undefined): string => {
  const trimmed = value?.trim()
  return trimmed && trimmed.length > 0 ? trimmed : "trial@babkin.finance"
}

const buildReceipt = (input: YookassaCreatePaymentInput) => {
  const isTrial = input.metadata.type === "trial"
  const amountValue = isTrial ? "1.00" : normalizeRubAmount(input.amountValueRub)
  const description = isTrial ? "Babkin Finance trial" : input.description

  return {
    customer: {
      email: resolveReceiptEmail(input.customerEmail),
    },
    items: [
      {
        description,
        quantity: "1.00",
        amount: {
          value: amountValue,
          currency: "RUB",
        },
        vat_code: 1,
        payment_mode: "full_payment",
        payment_subject: "service",
      },
    ],
  }
}

const mapCreatePaymentBody = (input: YookassaCreatePaymentInput) => ({
  amount: {
    value: normalizeRubAmount(input.amountValueRub),
    currency: "RUB",
  },
  capture: true,
  confirmation: input.returnUrl
    ? {
        type: "redirect",
        return_url: input.returnUrl,
      }
    : undefined,
  description: input.description,
  save_payment_method: input.savePaymentMethod,
  payment_method_data: input.paymentMethodId ? undefined : { type: "bank_card" },
  payment_method_id: input.paymentMethodId ?? undefined,
  metadata: input.metadata,
  receipt: buildReceipt(input),
})

export const createYookassaPayment = async (
  input: YookassaCreatePaymentInput,
): Promise<{ payment: YookassaPaymentObject; idempotenceKey: string; raw: unknown }> => {
  const { shopId, secretKey } = ensureYookassaCredentials()
  const idempotenceKey = randomUUID()
  const auth = Buffer.from(`${shopId}:${secretKey}`, "utf8").toString("base64")

  const response = await fetch("https://api.yookassa.ru/v3/payments", {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
      "Idempotence-Key": idempotenceKey,
    },
    body: JSON.stringify(mapCreatePaymentBody(input)),
  })

  const raw = (await response.json().catch(() => ({}))) as Record<string, unknown>
  if (!response.ok) {
    const description = typeof raw.description === "string" ? raw.description : `status_${response.status}`
    throw new Error(`yookassa_create_payment_failed:${description}`)
  }

  const id = typeof raw.id === "string" ? raw.id : ""
  if (!id) {
    throw new Error("yookassa_create_payment_invalid_response")
  }

  const statusRaw = typeof raw.status === "string" ? raw.status : "pending"
  const status: YookassaPaymentStatus =
    statusRaw === "waiting_for_capture" || statusRaw === "succeeded" || statusRaw === "canceled"
      ? statusRaw
      : "pending"

  return {
    payment: {
      id,
      status,
      paid: raw.paid === true,
      metadata: typeof raw.metadata === "object" && raw.metadata && !Array.isArray(raw.metadata)
        ? (raw.metadata as Record<string, unknown>)
        : undefined,
      amount: typeof raw.amount === "object" && raw.amount && !Array.isArray(raw.amount)
        ? (raw.amount as { value?: string; currency?: string })
        : undefined,
      confirmation: typeof raw.confirmation === "object" && raw.confirmation && !Array.isArray(raw.confirmation)
        ? (raw.confirmation as { type?: string; confirmation_url?: string })
        : undefined,
      payment_method: typeof raw.payment_method === "object" && raw.payment_method && !Array.isArray(raw.payment_method)
        ? (raw.payment_method as { id?: string; type?: string; saved?: boolean })
        : undefined,
    },
    idempotenceKey,
    raw,
  }
}

export const mapYookassaStatusToPaymentStatus = (status: string): "pending" | "waiting_for_capture" | "succeeded" | "canceled" | "failed" => {
  if (status === "waiting_for_capture") return "waiting_for_capture"
  if (status === "succeeded") return "succeeded"
  if (status === "canceled") return "canceled"
  if (status === "pending") return "pending"
  return "failed"
}
