type EntityWithStableOrder = {
  id: string
  createdAt?: string | null
}

const parseCreatedAtMs = (createdAt: string | null | undefined): number | null => {
  if (!createdAt) return null
  const parsed = Date.parse(createdAt)
  return Number.isNaN(parsed) ? null : parsed
}

export const sortByCreatedAtOrId = <T extends EntityWithStableOrder>(items: T[]): T[] =>
  (() => {
    const withCreatedAt = items.map((item) => ({ item, createdAtMs: parseCreatedAtMs(item.createdAt) }))
    const hasFullCreatedAt = withCreatedAt.every((entry) => entry.createdAtMs !== null)
    if (!hasFullCreatedAt) return [...items]

    return [...withCreatedAt]
      .sort((left, right) => (left.createdAtMs as number) - (right.createdAtMs as number))
      .map((entry) => entry.item)
  })()
