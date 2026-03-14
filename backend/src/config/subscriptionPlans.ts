import { SubscriptionPlanCode } from "@prisma/client"

export type SubscriptionPlanConfig = {
  code: SubscriptionPlanCode
  title: string
  trialPriceRub: number
  recurringPriceRub: number
  hasSharedAccess: boolean
  icon: string
}

const subscriptionPlans: Record<SubscriptionPlanCode, SubscriptionPlanConfig> = {
  personal_monthly: {
    code: SubscriptionPlanCode.personal_monthly,
    title: "Личный доступ",
    trialPriceRub: 1,
    recurringPriceRub: 290,
    hasSharedAccess: false,
    icon: "👤",
  },
  personal_shared_monthly: {
    code: SubscriptionPlanCode.personal_shared_monthly,
    title: "Личный + совместный",
    trialPriceRub: 1,
    recurringPriceRub: 490,
    hasSharedAccess: true,
    icon: "👥",
  },
}

export const getSubscriptionPlanConfig = (planCode: SubscriptionPlanCode): SubscriptionPlanConfig => subscriptionPlans[planCode]

export const listSubscriptionPlanConfigs = (): SubscriptionPlanConfig[] => [
  subscriptionPlans.personal_monthly,
  subscriptionPlans.personal_shared_monthly,
]
