import { FastifyInstance } from "fastify"
import {
  BotUserStage,
  PaymentProvider,
  PaymentStatus,
  PaymentType,
  Prisma,
  SubscriptionEventType,
  SubscriptionPlanCode,
  SubscriptionStatus,
  bot_user_states,
  subscriptions,
} from "@prisma/client"
import { prisma } from "../db/prisma"
import { env } from "../env"
import { getSubscriptionPlanConfig } from "../config/subscriptionPlans"
import { createYookassaPayment, mapYookassaStatusToPaymentStatus } from "./yookassa"
import { resolveTelegramBotUsername } from "../utils/telegramBotUsername"

const MINUTE_MS = 60_000
const DAY_MS = 24 * 60 * MINUTE_MS

type PaymentLikeStatus = "pending" | "waiting_for_capture" | "succeeded" | "canceled" | "failed"

type TelegramReplyMarkup = {
  inline_keyboard: Array<Array<{ text: string; url: string }>>
}

type YookassaWebhookObject = {
  id?: string
  status?: string
  metadata?: Record<string, unknown>
  payment_method?: {
    id?: string
  }
}

type YookassaWebhookPayload = {
  event?: string
  object?: YookassaWebhookObject
}

type ProcessWebhookResult = {
  handled: boolean
}

type TrialCheckoutResult = {
  planCode: SubscriptionPlanCode
  confirmationUrl: string
}

export type UserAccessStatus = {
  hasPersonalAccess: boolean
  hasSharedAccess: boolean
  isTrialActive: boolean
  isPaidActive: boolean
  planCode: SubscriptionPlanCode | null
  accessEndsAt: Date | null
  hasUsedTrial: boolean
  canStartTrial: boolean
}

const parseBooleanFromEnv = (value: string | undefined): boolean => value === "1" || value === "true"

const addMinutes = (source: Date, minutes: number): Date => new Date(source.getTime() + Math.max(0, minutes) * MINUTE_MS)

const addMonths = (source: Date, months: number): Date => {
  const next = new Date(source)
  next.setMonth(next.getMonth() + months)
  return next
}

const getTrialDurationMinutes = (): number => {
  if (!parseBooleanFromEnv(env.SUBSCRIPTIONS_TEST_MODE)) return 3 * 24 * 60
  return Math.max(1, env.SUBSCRIPTION_TRIAL_DURATION_MINUTES_TEST ?? 2)
}

const getRenewalDelayMinutes = (): number => {
  if (!parseBooleanFromEnv(env.SUBSCRIPTIONS_TEST_MODE)) return getTrialDurationMinutes()
  return Math.max(1, env.SUBSCRIPTION_RENEWAL_DELAY_MINUTES_TEST ?? 2)
}

const getReminderLeadMs = (): number => {
  if (!parseBooleanFromEnv(env.SUBSCRIPTIONS_TEST_MODE)) return DAY_MS
  return MINUTE_MS
}

const resolveMiniAppUrl = async (): Promise<string> => {
  if (env.MINI_APP_URL) return env.MINI_APP_URL
  if (env.TELEGRAM_BOT_USERNAME) return `https://t.me/${env.TELEGRAM_BOT_USERNAME}`
  const username = await resolveTelegramBotUsername()
  if (username) return `https://t.me/${username}`
  return "https://t.me"
}

const resolveTrialReturnUrl = async (): Promise<string> => {
  if (env.TELEGRAM_BOT_USERNAME) return `https://t.me/${env.TELEGRAM_BOT_USERNAME}`
  return resolveMiniAppUrl()
}

const buildOpenAppKeyboard = async (): Promise<TelegramReplyMarkup> => ({
  inline_keyboard: [[{ text: "📊 Открыть приложение", url: await resolveMiniAppUrl() }]],
})

const toPaymentStatusEnum = (status: PaymentLikeStatus): PaymentStatus => {
  if (status === "waiting_for_capture") return PaymentStatus.waiting_for_capture
  if (status === "succeeded") return PaymentStatus.succeeded
  if (status === "canceled") return PaymentStatus.canceled
  if (status === "failed") return PaymentStatus.failed
  return PaymentStatus.pending
}

const sendTelegramMessage = async (
  fastify: FastifyInstance,
  chatId: string,
  text: string,
  replyMarkup?: TelegramReplyMarkup,
): Promise<void> => {
  try {
    await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        disable_web_page_preview: true,
        reply_markup: replyMarkup,
      }),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    fastify.log.error(`[subscriptions] telegram send failed: ${message}`)
  }
}

const sendTelegramMessageToUser = async (
  fastify: FastifyInstance,
  userId: string,
  text: string,
  replyMarkup?: TelegramReplyMarkup,
): Promise<void> => {
  const user = await prisma.users.findUnique({
    where: { id: userId },
    select: { telegram_user_id: true },
  })
  if (!user?.telegram_user_id) return
  await sendTelegramMessage(fastify, user.telegram_user_id, text, replyMarkup)
}

const ensureBotUserState = async (userId: string): Promise<bot_user_states> =>
  prisma.bot_user_states.upsert({
    where: { user_id: userId },
    create: { user_id: userId },
    update: {},
  })

const shouldBeActiveStage = (access: UserAccessStatus): boolean => access.isTrialActive || access.isPaidActive

export const syncBotUserStateWithSubscriptionAccess = async (
  userId: string,
  access?: UserAccessStatus,
): Promise<void> => {
  const resolvedAccess = access ?? (await getUserAccessStatus(userId))
  const userState = await ensureBotUserState(userId)
  if (shouldBeActiveStage(resolvedAccess) && userState.stage !== BotUserStage.ACTIVE_PAID) {
    await prisma.bot_user_states.update({
      where: { user_id: userId },
      data: { stage: BotUserStage.ACTIVE_PAID },
    })
    return
  }
  if (!shouldBeActiveStage(resolvedAccess) && userState.stage === BotUserStage.ACTIVE_PAID) {
    await prisma.bot_user_states.update({
      where: { user_id: userId },
      data: { stage: BotUserStage.TRIAL_LIMITED },
    })
  }
}

const getLatestLiveSubscription = async (userId: string): Promise<subscriptions | null> =>
  prisma.subscriptions.findFirst({
    where: {
      user_id: userId,
      status: {
        in: [SubscriptionStatus.trialing, SubscriptionStatus.active, SubscriptionStatus.past_due, SubscriptionStatus.pending_initial_payment],
      },
    },
    orderBy: [{ updated_at: "desc" }],
  })

export const getUserAccessStatus = async (userId: string): Promise<UserAccessStatus> => {
  const now = new Date()
  const [latestSubscription, trialHistoryCount] = await Promise.all([
    getLatestLiveSubscription(userId),
    prisma.subscriptions.count({
      where: {
        user_id: userId,
        OR: [{ trial_started_at: { not: null } }, { status: SubscriptionStatus.trialing }],
      },
    }),
  ])

  const isTrialActive = Boolean(
    latestSubscription &&
      latestSubscription.status === SubscriptionStatus.trialing &&
      (!latestSubscription.trial_ends_at || latestSubscription.trial_ends_at > now),
  )
  const isPaidActive = Boolean(
    latestSubscription &&
      latestSubscription.status === SubscriptionStatus.active &&
      (!latestSubscription.current_period_ends_at || latestSubscription.current_period_ends_at > now),
  )

  const planCode = isTrialActive || isPaidActive ? latestSubscription?.plan_code ?? null : null
  const hasSharedAccess = planCode ? getSubscriptionPlanConfig(planCode).hasSharedAccess : false
  const hasUsedTrial = trialHistoryCount > 0

  return {
    hasPersonalAccess: isTrialActive || isPaidActive,
    hasSharedAccess,
    isTrialActive,
    isPaidActive,
    planCode,
    accessEndsAt: isTrialActive
      ? latestSubscription?.trial_ends_at ?? null
      : isPaidActive
        ? latestSubscription?.current_period_ends_at ?? null
        : null,
    hasUsedTrial,
    canStartTrial: !isTrialActive && !isPaidActive && !hasUsedTrial,
  }
}

const createSubscriptionEvent = async (
  tx: Prisma.TransactionClient,
  subscriptionId: string,
  eventType: SubscriptionEventType,
  payload?: Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput,
): Promise<void> => {
  await tx.subscription_events.create({
    data: {
      subscription_id: subscriptionId,
      event_type: eventType,
      payload_json: payload ?? Prisma.JsonNull,
    },
  })
}

const markSubscriptionPastDue = async (
  tx: Prisma.TransactionClient,
  subscriptionId: string,
  payload: Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput,
): Promise<void> => {
  await tx.subscriptions.update({
    where: { id: subscriptionId },
    data: {
      status: SubscriptionStatus.past_due,
      next_renewal_at: null,
    },
  })
  await createSubscriptionEvent(tx, subscriptionId, SubscriptionEventType.recurring_payment_failed, payload)
}

const createTrialSubscriptionDraft = async (
  userId: string,
  workspaceId: string | null,
  planCode: SubscriptionPlanCode,
): Promise<subscriptions> =>
  prisma.subscriptions.create({
    data: {
      user_id: userId,
      workspace_id: workspaceId,
      plan_code: planCode,
      status: SubscriptionStatus.pending_initial_payment,
      provider: PaymentProvider.yookassa,
    },
  })

export const createTrialCheckout = async (
  params: {
    userId: string
    telegramUserId: string
    workspaceId: string | null
    planCode: SubscriptionPlanCode
  },
): Promise<TrialCheckoutResult> => {
  const access = await getUserAccessStatus(params.userId)
  if (!access.canStartTrial) {
    throw new Error("trial_not_available")
  }

  const plan = getSubscriptionPlanConfig(params.planCode)
  const subscription = await createTrialSubscriptionDraft(params.userId, params.workspaceId, params.planCode)
  const returnUrl = await resolveTrialReturnUrl()

  try {
    const createdPayment = await createYookassaPayment({
      amountValueRub: plan.trialPriceRub,
      description: "Babkin Finance trial 3 days",
      returnUrl,
      savePaymentMethod: true,
      metadata: {
        telegram_user_id: params.telegramUserId,
        user_id: params.userId,
        plan_code: params.planCode,
        type: "trial",
        subscription_id: subscription.id,
      },
    })

    const paymentStatus = toPaymentStatusEnum(mapYookassaStatusToPaymentStatus(createdPayment.payment.status))
    await prisma.$transaction(async (tx) => {
      await tx.payments.create({
        data: {
          subscription_id: subscription.id,
          user_id: params.userId,
          workspace_id: params.workspaceId,
          provider: PaymentProvider.yookassa,
          provider_payment_id: createdPayment.payment.id,
          provider_idempotence_key: createdPayment.idempotenceKey,
          type: PaymentType.trial,
          status: paymentStatus,
          amount_value: new Prisma.Decimal(plan.trialPriceRub),
          amount_currency: "RUB",
          plan_code: params.planCode,
          is_trial: true,
          provider_payment_method_id: createdPayment.payment.payment_method?.id ?? null,
          raw_payload_json: createdPayment.raw as Prisma.InputJsonValue,
        },
      })
      await createSubscriptionEvent(tx, subscription.id, SubscriptionEventType.trial_payment_created, {
        providerPaymentId: createdPayment.payment.id,
        idempotenceKey: createdPayment.idempotenceKey,
      } satisfies Prisma.JsonObject)
    })

    const confirmationUrl = createdPayment.payment.confirmation?.confirmation_url
    if (!confirmationUrl) {
      throw new Error("yookassa_confirmation_url_missing")
    }
    return {
      planCode: params.planCode,
      confirmationUrl,
    }
  } catch (error) {
    await prisma.subscriptions.update({
      where: { id: subscription.id },
      data: { status: SubscriptionStatus.expired, ended_at: new Date() },
    })
    throw error
  }
}

const processTrialPaymentSucceeded = async (
  tx: Prisma.TransactionClient,
  paymentRecord: {
    id: string
    user_id: string
    subscription_id: string
    status: PaymentStatus
    provider_payment_method_id: string | null
  },
  subscription: subscriptions,
  paymentMethodId: string | null,
): Promise<{ activatedNow: boolean }> => {
  const now = new Date()
  const alreadyActivated = subscription.status === SubscriptionStatus.trialing || subscription.status === SubscriptionStatus.active
  const trialStartedAt = subscription.trial_started_at ?? now
  const trialEndsAt = subscription.trial_ends_at ?? addMinutes(trialStartedAt, getTrialDurationMinutes())
  const renewalAt = addMinutes(trialStartedAt, getRenewalDelayMinutes())

  await tx.subscriptions.update({
    where: { id: subscription.id },
    data: {
      status: SubscriptionStatus.trialing,
      provider_payment_method_id: paymentMethodId ?? paymentRecord.provider_payment_method_id ?? subscription.provider_payment_method_id,
      trial_started_at: trialStartedAt,
      trial_ends_at: trialEndsAt,
      next_renewal_at: renewalAt,
      reminder_sent_at: null,
    },
  })
  await createSubscriptionEvent(tx, subscription.id, SubscriptionEventType.trial_payment_succeeded, {
    paymentId: paymentRecord.id,
  } satisfies Prisma.JsonObject)
  if (!alreadyActivated) {
    await createSubscriptionEvent(tx, subscription.id, SubscriptionEventType.trial_activated, {
      trialEndsAt: trialEndsAt.toISOString(),
    } satisfies Prisma.JsonObject)
  }
  return { activatedNow: !alreadyActivated }
}

const processRecurringPaymentSucceeded = async (
  tx: Prisma.TransactionClient,
  paymentRecord: { id: string; subscription_id: string },
  subscription: subscriptions,
): Promise<void> => {
  const now = new Date()
  const periodEnd = addMonths(now, 1)
  await tx.subscriptions.update({
    where: { id: subscription.id },
    data: {
      status: SubscriptionStatus.active,
      current_period_starts_at: now,
      current_period_ends_at: periodEnd,
      next_renewal_at: periodEnd,
      reminder_sent_at: null,
    },
  })
  await createSubscriptionEvent(tx, subscription.id, SubscriptionEventType.recurring_payment_succeeded, {
    paymentId: paymentRecord.id,
    periodEnd: periodEnd.toISOString(),
  } satisfies Prisma.JsonObject)
}

export const processYookassaWebhook = async (
  fastify: FastifyInstance,
  payloadRaw: unknown,
): Promise<ProcessWebhookResult> => {
  const payload = (payloadRaw ?? {}) as YookassaWebhookPayload
  const event = typeof payload.event === "string" ? payload.event : ""
  const paymentObject = payload.object ?? {}
  const providerPaymentId = typeof paymentObject.id === "string" ? paymentObject.id : ""
  if (!event || !providerPaymentId) {
    return { handled: false }
  }

  if (event !== "payment.succeeded") {
    return { handled: true }
  }

  const paymentMethodId =
    paymentObject.payment_method && typeof paymentObject.payment_method.id === "string"
      ? paymentObject.payment_method.id
      : null

  const transactionResult = await prisma.$transaction(async (tx) => {
    const paymentRecord = await tx.payments.findUnique({
      where: { provider_payment_id: providerPaymentId },
    })
    if (!paymentRecord) {
      return { userId: null as string | null, trialActivatedNow: false }
    }

    if (paymentRecord.status === PaymentStatus.succeeded) {
      return { userId: paymentRecord.user_id, trialActivatedNow: false }
    }

    const subscription = await tx.subscriptions.findUnique({
      where: { id: paymentRecord.subscription_id },
    })
    if (!subscription) {
      return { userId: paymentRecord.user_id, trialActivatedNow: false }
    }

    await tx.payments.update({
      where: { id: paymentRecord.id },
      data: {
        status: PaymentStatus.succeeded,
        paid_at: new Date(),
        provider_payment_method_id: paymentMethodId ?? paymentRecord.provider_payment_method_id,
        raw_payload_json: payloadRaw as Prisma.InputJsonValue,
      },
    })

    if (paymentRecord.type === PaymentType.trial) {
      const trialResult = await processTrialPaymentSucceeded(tx, paymentRecord, subscription, paymentMethodId)
      return { userId: paymentRecord.user_id, trialActivatedNow: trialResult.activatedNow }
    }

    if (paymentRecord.type === PaymentType.recurring) {
      await processRecurringPaymentSucceeded(tx, paymentRecord, subscription)
      return { userId: paymentRecord.user_id, trialActivatedNow: false }
    }

    return { userId: paymentRecord.user_id, trialActivatedNow: false }
  })

  if (transactionResult.userId) {
    const access = await getUserAccessStatus(transactionResult.userId)
    await syncBotUserStateWithSubscriptionAccess(transactionResult.userId, access)
    if (transactionResult.trialActivatedNow) {
      await sendTelegramMessageToUser(
        fastify,
        transactionResult.userId,
        "Пробный период активирован ✅\n\nДоступ уже открыт. Можно отменить в любой момент. Мы напомним перед списанием.",
        await buildOpenAppKeyboard(),
      )
    }
  }

  return { handled: true }
}

const attemptRecurringPayment = async (
  fastify: FastifyInstance,
  subscription: subscriptions,
): Promise<void> => {
  const plan = getSubscriptionPlanConfig(subscription.plan_code)

  if (!subscription.provider_payment_method_id) {
    await prisma.$transaction(async (tx) => {
      await markSubscriptionPastDue(tx, subscription.id, {
        reason: "missing_payment_method_id",
      } satisfies Prisma.JsonObject)
    })
    await sendTelegramMessageToUser(
      fastify,
      subscription.user_id,
      "Не удалось продлить доступ автоматически. Проверьте оплату в приложении.",
      await buildOpenAppKeyboard(),
    )
    return
  }

  const existingPending = await prisma.payments.findFirst({
    where: {
      subscription_id: subscription.id,
      type: PaymentType.recurring,
      status: { in: [PaymentStatus.pending, PaymentStatus.waiting_for_capture] },
      created_at: { gte: new Date(Date.now() - 10 * MINUTE_MS) },
    },
    select: { id: true },
  })
  if (existingPending) return

  const recurringPayment = await createYookassaPayment({
    amountValueRub: plan.recurringPriceRub,
    description: `Babkin Finance ${plan.code} recurring`,
    returnUrl: null,
    paymentMethodId: subscription.provider_payment_method_id,
    savePaymentMethod: false,
    metadata: {
      user_id: subscription.user_id,
      plan_code: plan.code,
      type: "recurring",
      subscription_id: subscription.id,
    },
  })

  const mappedStatus = mapYookassaStatusToPaymentStatus(recurringPayment.payment.status)
  await prisma.$transaction(async (tx) => {
    await tx.payments.create({
      data: {
        subscription_id: subscription.id,
        user_id: subscription.user_id,
        workspace_id: subscription.workspace_id,
        provider: PaymentProvider.yookassa,
        provider_payment_id: recurringPayment.payment.id,
        provider_idempotence_key: recurringPayment.idempotenceKey,
        type: PaymentType.recurring,
        status: toPaymentStatusEnum(mappedStatus),
        amount_value: new Prisma.Decimal(plan.recurringPriceRub),
        amount_currency: "RUB",
        plan_code: subscription.plan_code,
        is_trial: false,
        provider_payment_method_id: subscription.provider_payment_method_id,
        raw_payload_json: recurringPayment.raw as Prisma.InputJsonValue,
      },
    })
    await tx.subscriptions.update({
      where: { id: subscription.id },
      data: { next_renewal_at: null },
    })
    await createSubscriptionEvent(tx, subscription.id, SubscriptionEventType.recurring_payment_created, {
      providerPaymentId: recurringPayment.payment.id,
    } satisfies Prisma.JsonObject)
  })

  if (mappedStatus === "succeeded") {
    await processYookassaWebhook(fastify, {
      event: "payment.succeeded",
      object: recurringPayment.payment,
    } satisfies YookassaWebhookPayload)
    return
  }

  if (mappedStatus === "canceled" || mappedStatus === "failed") {
    await prisma.$transaction(async (tx) => {
      await tx.payments.update({
        where: { provider_payment_id: recurringPayment.payment.id },
        data: { status: toPaymentStatusEnum(mappedStatus), raw_payload_json: recurringPayment.raw as Prisma.InputJsonValue },
      })
      await markSubscriptionPastDue(tx, subscription.id, {
        providerPaymentId: recurringPayment.payment.id,
        status: mappedStatus,
      } satisfies Prisma.JsonObject)
    })
    await sendTelegramMessageToUser(
      fastify,
      subscription.user_id,
      "Автосписание не прошло. Доступ может быть ограничен — проверьте оплату в приложении.",
      await buildOpenAppKeyboard(),
    )
  }
}

export const processDueRenewals = async (fastify: FastifyInstance): Promise<void> => {
  const dueSubscriptions = await prisma.subscriptions.findMany({
    where: {
      provider: PaymentProvider.yookassa,
      cancel_at_period_end: false,
      status: { in: [SubscriptionStatus.trialing, SubscriptionStatus.active] },
      next_renewal_at: { lte: new Date() },
    },
    orderBy: { next_renewal_at: "asc" },
    take: 20,
  })

  for (const subscription of dueSubscriptions) {
    try {
      await attemptRecurringPayment(fastify, subscription)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      fastify.log.error(`[subscriptions] recurring charge failed: subscriptionId=${subscription.id} error=${message}`)
      await prisma.$transaction(async (tx) => {
        await markSubscriptionPastDue(tx, subscription.id, {
          reason: "recurring_charge_exception",
          message,
        } satisfies Prisma.JsonObject)
      })
      await sendTelegramMessageToUser(
        fastify,
        subscription.user_id,
        "Автосписание не прошло. Доступ может быть ограничен — проверьте оплату в приложении.",
        await buildOpenAppKeyboard(),
      )
    }
  }
}

export const processUpcomingRenewalReminders = async (fastify: FastifyInstance): Promise<void> => {
  const leadMs = getReminderLeadMs()
  const threshold = new Date(Date.now() + leadMs)

  const subscriptionsForReminder = await prisma.subscriptions.findMany({
    where: {
      provider: PaymentProvider.yookassa,
      status: SubscriptionStatus.trialing,
      cancel_at_period_end: false,
      trial_ends_at: { lte: threshold },
      reminder_sent_at: null,
    },
    orderBy: { trial_ends_at: "asc" },
    take: 20,
  })

  for (const subscription of subscriptionsForReminder) {
    await sendTelegramMessageToUser(
      fastify,
      subscription.user_id,
      "Напоминание: пробный период скоро закончится, затем начнётся списание по подписке.\n\nМожно отменить в любой момент. Мы напомним перед списанием.",
      await buildOpenAppKeyboard(),
    )
    await prisma.subscriptions.update({
      where: { id: subscription.id },
      data: { reminder_sent_at: new Date() },
    })
  }
}

let maintenanceTickInFlight = false

export const runSubscriptionMaintenanceTick = async (fastify: FastifyInstance): Promise<void> => {
  if (maintenanceTickInFlight) return
  maintenanceTickInFlight = true
  try {
    await processUpcomingRenewalReminders(fastify)
    await processDueRenewals(fastify)
  } finally {
    maintenanceTickInFlight = false
  }
}
