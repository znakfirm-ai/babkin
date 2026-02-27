export const getTransactionErrorMessage = (error: unknown, fallback = "Не удалось сохранить") => {
  const message = error instanceof Error ? error.message : String(error ?? "")
  const isBusy =
    message.includes("P2028") ||
    message.includes("Unable to start a transaction") ||
    message.includes("/transactions failed: 500")
  if (isBusy) return "Сервер занят, попробуйте ещё раз"
  if (error instanceof Error && error.message) return error.message
  return fallback
}
