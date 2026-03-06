import { Prisma, PrismaClient, CategoryKind } from "@prisma/client"

type SeedOptions = {
  seedAccounts?: boolean
  seedCategories?: boolean
  seedIncomeSources?: boolean
}

type SeedClient = PrismaClient | Prisma.TransactionClient

export type DefaultsNormalizationReport = {
  created: {
    categories: number
    accounts: number
    incomeSources: number
  }
  promotedLegacy: {
    categories: number
    accounts: number
    incomeSources: number
  }
  skippedConflicts: {
    categories: number
    accounts: number
    incomeSources: number
  }
}

export const DEFAULT_WORKSPACE_CATEGORIES: Array<{ name: string; kind: CategoryKind; icon: string }> = [
  { name: "Еда", kind: "expense", icon: "groceries" },
  { name: "Транспорт", kind: "expense", icon: "transport" },
  { name: "Здоровье", kind: "expense", icon: "health" },
  { name: "Одежда", kind: "expense", icon: "clothes" },
  { name: "Подписки", kind: "expense", icon: "subscriptions" },
  { name: "Развлечения", kind: "expense", icon: "entertainment" },
  { name: "Маркетплейсы", kind: "expense", icon: "marketplace" },
  { name: "Прочие", kind: "expense", icon: "refund" },
  { name: "Зарплата", kind: "income", icon: "salary" },
  { name: "Бизнес", kind: "income", icon: "business" },
  { name: "Прочие", kind: "income", icon: "gift_income" },
]

export const DEFAULT_WORKSPACE_ACCOUNTS = [
  { name: "Банк", type: "bank", currency: "RUB", balance: 0, color: "#2563eb", icon: "bank" },
  { name: "Наличные", type: "cash", currency: "RUB", balance: 0, color: "#EEF2F7", icon: "cash" },
] as const

export const DEFAULT_WORKSPACE_INCOME_SOURCES = [
  { name: "Зарплата", icon: "salary" },
  { name: "Бизнес", icon: "business" },
  { name: "Прочие", icon: "gift_income" },
] as const

export const buildDefaultCategorySeed = (workspaceId: string) =>
  DEFAULT_WORKSPACE_CATEGORIES.map((category) => ({
    workspace_id: workspaceId,
    name: category.name,
    kind: category.kind,
    icon: category.icon,
    is_default: true,
  }))

export const buildDefaultAccountSeed = (workspaceId: string) =>
  DEFAULT_WORKSPACE_ACCOUNTS.map((account) => ({
    workspace_id: workspaceId,
    name: account.name,
    type: account.type,
    currency: account.currency,
    balance: account.balance,
    color: account.color,
    icon: account.icon,
    is_default: true,
  }))

export const buildDefaultIncomeSourceSeed = (workspaceId: string) =>
  DEFAULT_WORKSPACE_INCOME_SOURCES.map((source) => ({
    workspace_id: workspaceId,
    name: source.name,
    icon: source.icon,
    is_default: true,
  }))

const LEGACY_PROMOTION_WINDOW_MS = 15 * 60 * 1000
const LEGACY_PROMOTION_UPDATE_DRIFT_MS = 5 * 60 * 1000

const DEFAULT_REPORT: DefaultsNormalizationReport = {
  created: { categories: 0, accounts: 0, incomeSources: 0 },
  promotedLegacy: { categories: 0, accounts: 0, incomeSources: 0 },
  skippedConflicts: { categories: 0, accounts: 0, incomeSources: 0 },
}

const normalizeName = (value: string) => value.trim().toLocaleLowerCase("ru-RU")

const categoryKey = (item: { kind: CategoryKind; name: string }) => `${item.kind}:${normalizeName(item.name)}`

const accountKey = (item: { name: string; type: string; currency: string }) =>
  `${normalizeName(item.name)}:${item.type.trim().toLowerCase()}:${item.currency.trim().toUpperCase()}`

const incomeSourceKey = (item: { name: string }) => normalizeName(item.name)

const isLegacyTimestampSafe = (createdAt: Date, updatedAt: Date, workspaceCreatedAt: Date | null) => {
  if (!workspaceCreatedAt) return false
  const createdDelta = createdAt.getTime() - workspaceCreatedAt.getTime()
  if (createdDelta < 0 || createdDelta > LEGACY_PROMOTION_WINDOW_MS) return false
  const updatedDelta = updatedAt.getTime() - workspaceCreatedAt.getTime()
  if (updatedDelta < 0 || updatedDelta > LEGACY_PROMOTION_WINDOW_MS) return false
  const updateDrift = Math.abs(updatedAt.getTime() - createdAt.getTime())
  return updateDrift <= LEGACY_PROMOTION_UPDATE_DRIFT_MS
}

const toNumber = (value: Prisma.Decimal | number) => (typeof value === "number" ? value : Number(value))

const CATEGORY_LEGACY_ICONS = new Map<string, Set<string | null>>([
  [categoryKey({ kind: "expense", name: "Еда" }), new Set([null, "groceries"])],
  [categoryKey({ kind: "expense", name: "Транспорт" }), new Set([null, "transport"])],
  [categoryKey({ kind: "expense", name: "Здоровье" }), new Set([null, "health"])],
  [categoryKey({ kind: "expense", name: "Развлечения" }), new Set([null, "entertainment"])],
  [categoryKey({ kind: "income", name: "Зарплата" }), new Set([null, "salary"])],
  [categoryKey({ kind: "income", name: "Бизнес" }), new Set([null, "business"])],
  [categoryKey({ kind: "income", name: "Прочие" }), new Set([null, "other", "gift_income"])],
])

const ACCOUNT_LEGACY_SIGNATURES = new Map<string, Set<string>>([
  [accountKey({ name: "Банк", type: "bank", currency: "RUB" }), new Set(["#2563eb|bank|0", "null|null|0"])],
  [accountKey({ name: "Наличные", type: "cash", currency: "RUB" }), new Set(["#EEF2F7|cash|0", "null|null|0"])],
])

const INCOME_SOURCE_LEGACY_ICONS = new Map<string, Set<string | null>>([
  [incomeSourceKey({ name: "Зарплата" }), new Set([null, "salary"])],
  [incomeSourceKey({ name: "Бизнес" }), new Set([null, "business"])],
  [incomeSourceKey({ name: "Прочие" }), new Set([null, "other", "gift_income"])],
])

const cloneReport = (): DefaultsNormalizationReport => ({
  created: { ...DEFAULT_REPORT.created },
  promotedLegacy: { ...DEFAULT_REPORT.promotedLegacy },
  skippedConflicts: { ...DEFAULT_REPORT.skippedConflicts },
})

const canPromoteLegacyCategory = (
  item: { kind: CategoryKind; name: string; icon: string },
  record: { icon: string | null; created_at: Date; updated_at: Date },
  workspaceCreatedAt: Date | null,
) => {
  if (!isLegacyTimestampSafe(record.created_at, record.updated_at, workspaceCreatedAt)) return false
  const allowedIcons = CATEGORY_LEGACY_ICONS.get(categoryKey(item))
  if (!allowedIcons) return false
  return allowedIcons.has(record.icon ?? null)
}

const canPromoteLegacyIncomeSource = (
  item: { name: string; icon: string },
  record: { icon: string | null; created_at: Date; updated_at: Date },
  workspaceCreatedAt: Date | null,
) => {
  if (!isLegacyTimestampSafe(record.created_at, record.updated_at, workspaceCreatedAt)) return false
  const allowedIcons = INCOME_SOURCE_LEGACY_ICONS.get(incomeSourceKey(item))
  if (!allowedIcons) return false
  return allowedIcons.has(record.icon ?? null)
}

const canPromoteLegacyAccount = (
  item: { name: string; type: string; currency: string; color: string; icon: string },
  record: { color: string | null; icon: string | null; balance: Prisma.Decimal; created_at: Date; updated_at: Date },
  workspaceCreatedAt: Date | null,
) => {
  if (!isLegacyTimestampSafe(record.created_at, record.updated_at, workspaceCreatedAt)) return false
  const allowedSignatures = ACCOUNT_LEGACY_SIGNATURES.get(accountKey(item))
  if (!allowedSignatures) return false
  const balance = toNumber(record.balance)
  if (!Number.isFinite(balance) || balance !== 0) return false
  const signature = `${record.color ?? "null"}|${record.icon ?? "null"}|${balance}`
  return allowedSignatures.has(signature)
}

const loadWorkspaceCreatedAt = async (db: SeedClient, workspaceId: string) => {
  const workspace = await db.workspaces.findUnique({
    where: { id: workspaceId },
    select: { created_at: true },
  })
  return workspace?.created_at ?? null
}

export const hasDefaultsNormalizationChanges = (report: DefaultsNormalizationReport) =>
  report.created.categories > 0 ||
  report.created.accounts > 0 ||
  report.created.incomeSources > 0 ||
  report.promotedLegacy.categories > 0 ||
  report.promotedLegacy.accounts > 0 ||
  report.promotedLegacy.incomeSources > 0

export const hasDefaultsNormalizationConflicts = (report: DefaultsNormalizationReport) =>
  report.skippedConflicts.categories > 0 ||
  report.skippedConflicts.accounts > 0 ||
  report.skippedConflicts.incomeSources > 0

export async function seedWorkspaceDefaults(
  db: SeedClient,
  workspaceId: string,
  options: SeedOptions = { seedAccounts: true, seedCategories: true, seedIncomeSources: true },
) {
  const seedAccounts = options.seedAccounts ?? true
  const seedCategories = options.seedCategories ?? true
  const seedIncomeSources = options.seedIncomeSources ?? true
  const workspaceCreatedAt = await loadWorkspaceCreatedAt(db, workspaceId)
  const report = cloneReport()

  if (seedAccounts) {
    const existingAccounts = await db.accounts.findMany({
      where: { workspace_id: workspaceId, archived_at: null, is_archived: false },
      select: {
        id: true,
        name: true,
        type: true,
        currency: true,
        balance: true,
        color: true,
        icon: true,
        is_default: true,
        created_at: true,
        updated_at: true,
      },
    })

    for (const defaultAccount of DEFAULT_WORKSPACE_ACCOUNTS) {
      const key = accountKey(defaultAccount)
      const matching = existingAccounts.filter((item) => accountKey(item) === key)
      if (matching.some((item) => item.is_default)) continue

      const nonDefault = matching.filter((item) => !item.is_default)
      if (nonDefault.length === 1 && canPromoteLegacyAccount(defaultAccount, nonDefault[0], workspaceCreatedAt)) {
        await db.accounts.update({
          where: { id: nonDefault[0].id },
          data: { is_default: true },
        })
        report.promotedLegacy.accounts += 1
        continue
      }

      if (matching.length > 0) {
        report.skippedConflicts.accounts += 1
        continue
      }

      await db.accounts.create({
        data: {
          workspace_id: workspaceId,
          name: defaultAccount.name,
          type: defaultAccount.type,
          currency: defaultAccount.currency,
          balance: defaultAccount.balance,
          color: defaultAccount.color,
          icon: defaultAccount.icon,
          is_default: true,
        },
      })
      report.created.accounts += 1
    }
  }

  if (seedCategories) {
    const existingCategories = await db.categories.findMany({
      where: { workspace_id: workspaceId },
      select: {
        id: true,
        name: true,
        kind: true,
        icon: true,
        is_default: true,
        created_at: true,
        updated_at: true,
      },
    })

    for (const defaultCategory of DEFAULT_WORKSPACE_CATEGORIES) {
      const key = categoryKey(defaultCategory)
      const matching = existingCategories.filter((item) => categoryKey(item) === key)
      if (matching.some((item) => item.is_default)) continue

      const nonDefault = matching.filter((item) => !item.is_default)
      if (nonDefault.length === 1 && canPromoteLegacyCategory(defaultCategory, nonDefault[0], workspaceCreatedAt)) {
        await db.categories.update({
          where: { id: nonDefault[0].id },
          data: { is_default: true },
        })
        report.promotedLegacy.categories += 1
        continue
      }

      if (matching.length > 0) {
        report.skippedConflicts.categories += 1
        continue
      }

      await db.categories.create({
        data: {
          workspace_id: workspaceId,
          name: defaultCategory.name,
          kind: defaultCategory.kind,
          icon: defaultCategory.icon,
          is_default: true,
        },
      })
      report.created.categories += 1
    }
  }

  if (seedIncomeSources) {
    const existingIncomeSources = await db.income_sources.findMany({
      where: { workspace_id: workspaceId },
      select: {
        id: true,
        name: true,
        icon: true,
        is_default: true,
        created_at: true,
        updated_at: true,
      },
    })

    for (const defaultSource of DEFAULT_WORKSPACE_INCOME_SOURCES) {
      const key = incomeSourceKey(defaultSource)
      const matching = existingIncomeSources.filter((item) => incomeSourceKey(item) === key)
      if (matching.some((item) => item.is_default)) continue

      const nonDefault = matching.filter((item) => !item.is_default)
      if (nonDefault.length === 1 && canPromoteLegacyIncomeSource(defaultSource, nonDefault[0], workspaceCreatedAt)) {
        await db.income_sources.update({
          where: { id: nonDefault[0].id },
          data: { is_default: true },
        })
        report.promotedLegacy.incomeSources += 1
        continue
      }

      if (matching.length > 0) {
        report.skippedConflicts.incomeSources += 1
        continue
      }

      await db.income_sources.create({
        data: {
          workspace_id: workspaceId,
          name: defaultSource.name,
          icon: defaultSource.icon,
          is_default: true,
        },
      })
      report.created.incomeSources += 1
    }
  }

  return report
}
