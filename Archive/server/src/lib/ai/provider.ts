import { createOpenAI } from "@ai-sdk/openai"

// 创建自定义 OpenAI-compatible provider (Klee API)
export const klee = createOpenAI({
  baseURL: `https://${process.env.KLEE_BASE_URL}`,
  apiKey: process.env.KLEE_API_KEY ?? "",
  name: "klee",
})

// 获取模型实例的辅助函数
// 使用 .chat() 方法来调用标准的 chat completions endpoint
export function getKleeModel(modelName: string) {
  return klee.chat(modelName)
}
