import { FastifyInstance, FastifyPluginOptions } from "fastify"
import { transcribeAudio } from "../utils/openaiTranscribe"
import { downloadTelegramFileAsBuffer } from "../utils/telegramFiles"
import { parseOperationFromText } from "../utils/openaiParseOperation"

type TelegramMessage = {
  message_id?: number
  from?: { id?: number | string | null } | null
  voice?: { file_id?: string | null } | null
  audio?: { file_id?: string | null } | null
}

type TelegramUpdate = {
  update_id?: number
  message?: TelegramMessage | null
}

const extensionByMime: Record<string, string> = {
  "audio/ogg": "ogg",
  "audio/opus": "ogg",
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/mp4": "m4a",
  "audio/x-m4a": "m4a",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
}

function resolveFileName(messageId: number | undefined, mimeType: string | null): string {
  const normalizedMime = (mimeType ?? "").split(";")[0].trim().toLowerCase()
  const extension = extensionByMime[normalizedMime] ?? "ogg"
  return `voice-${messageId ?? "unknown"}.${extension}`
}

export async function telegramWebhookRoutes(fastify: FastifyInstance, _opts: FastifyPluginOptions) {
  fastify.post("/telegram/webhook", async (request, reply) => {
    const update = request.body as TelegramUpdate
    const message = update?.message ?? null
    const fileId = message?.voice?.file_id ?? message?.audio?.file_id

    if (!fileId) {
      return reply.send({ ok: true })
    }

    const messageId = message?.message_id
    const telegramUserId = message?.from?.id

    try {
      const downloaded = await downloadTelegramFileAsBuffer(fileId)
      const filename = resolveFileName(messageId, downloaded.mimeType)
      const transcript = await transcribeAudio(downloaded.buffer, filename)
      fastify.log.info(`[voice] ${String(telegramUserId ?? "unknown")} ${String(messageId ?? "unknown")} ${transcript}`)
      try {
        const parsedOperation = await parseOperationFromText(transcript)
        fastify.log.info(`[parse] ${String(telegramUserId ?? "unknown")} ${String(messageId ?? "unknown")} ${JSON.stringify(parsedOperation)}`)
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return reply.send({ ok: true })
        }
        const messageText = error instanceof Error ? error.message : String(error)
        fastify.log.error(`[parse] error ${messageText}`)
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return reply.send({ ok: true })
      }
      const messageText = error instanceof Error ? error.message : String(error)
      fastify.log.error(`[voice] failed: ${messageText}`)
    }

    return reply.send({ ok: true })
  })
}
