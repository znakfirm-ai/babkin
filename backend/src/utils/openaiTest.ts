import OpenAI from "openai"

export async function runOpenAITest(): Promise<void> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set")
  }

  const client = new OpenAI({ apiKey })

  try {
    const response = await client.responses.create({
      model: "gpt-4.1-mini",
      input: "Ответь одним словом: работает?",
    })

    const output = response.output_text?.trim() || "(empty response)"
    console.log(`[openai-test] ${output}`)
  } catch (error) {
    const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
    console.error(`[openai-test] request failed: ${message}`)
  }
}
