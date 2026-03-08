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
  [...items].sort((left, right) => {
    const leftCreatedAt = parseCreatedAtMs(left.createdAt)
    const rightCreatedAt = parseCreatedAtMs(right.createdAt)

    if (leftCreatedAt !== null && rightCreatedAt !== null && leftCreatedAt !== rightCreatedAt) {
      return leftCreatedAt - rightCreatedAt
    }

    if (leftCreatedAt !== null && rightCreatedAt === null) return -1
    if (leftCreatedAt === null && rightCreatedAt !== null) return 1

    if (left.id === right.id) return 0
    return left.id < right.id ? -1 : 1
  })
