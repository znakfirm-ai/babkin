export const normalizeEntityName = (name: string) => name.trim().toLowerCase()

export const isEntityNameTooLong = (name: string, maxLength: number) => Array.from(name).length > maxLength

type NameRecord = {
  id: string
  name: string
}

export const hasEntityNameConflict = <T extends NameRecord>(
  items: T[],
  candidateName: string,
  excludeId?: string,
) => {
  const normalizedCandidate = normalizeEntityName(candidateName)
  return items.some((item) => item.id !== excludeId && normalizeEntityName(item.name) === normalizedCandidate)
}
