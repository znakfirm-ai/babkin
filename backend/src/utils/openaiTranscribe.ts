import OpenAI, { toFile } from "openai"

export async function transcribeAudio(buffer: Buffer, filename: string): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set")
  }

  const client = new OpenAI({ apiKey })
  const file = await toFile(buffer, filename)
  const response = await client.audio.transcriptions.create({
    file,
    model: "whisper-1",
    language: "ru",
  })

  const text = typeof response === "string" ? response : response.text
  return text.trim()
}
