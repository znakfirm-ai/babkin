import { env } from "../env"

export async function downloadTelegramFileAsBuffer(fileId: string): Promise<{ buffer: Buffer; mimeType: string | null }> {
  if (!fileId.trim()) {
    throw new Error("Telegram file_id is required")
  }

  const botToken = env.BOT_TOKEN
  if (!botToken) {
    throw new Error("BOT_TOKEN is not configured")
  }

  const getFileUrl = `https://api.telegram.org/bot${botToken}/getFile?file_id=${encodeURIComponent(fileId)}`
  const getFileResponse = await fetch(getFileUrl)
  if (!getFileResponse.ok) {
    throw new Error(`Telegram getFile failed: ${getFileResponse.status}`)
  }

  const getFilePayload = (await getFileResponse.json()) as {
    ok?: boolean
    result?: { file_path?: string | null }
    description?: string
  }
  const filePath = getFilePayload.result?.file_path
  if (!getFilePayload.ok || !filePath) {
    throw new Error(`Telegram getFile returned no file_path${getFilePayload.description ? `: ${getFilePayload.description}` : ""}`)
  }

  const fileUrl = `https://api.telegram.org/file/bot${botToken}/${filePath}`
  const fileResponse = await fetch(fileUrl)
  if (!fileResponse.ok) {
    throw new Error(`Telegram file download failed: ${fileResponse.status}`)
  }

  const arrayBuffer = await fileResponse.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)
  const mimeType = fileResponse.headers.get("content-type")

  return { buffer, mimeType }
}
