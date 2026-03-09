import type { Language } from "@tiptap-pro/extension-ai"

export const SUPPORTED_LANGUAGES: Array<{
  label: string
  value: Language
}> = [
  { label: "English", value: "en" },
  { label: "Korean", value: "ko" },
  { label: "Chinese", value: "zh" },
  { label: "Japanese", value: "ja" },
  { label: "Spanish", value: "es" },
  { label: "Russian", value: "ru" },
  { label: "French", value: "fr" },
  { label: "Portuguese", value: "pt" },
  { label: "German", value: "de" },
  { label: "Italian", value: "it" },
  { label: "Dutch", value: "nl" },
  { label: "Indonesian", value: "id" },
  { label: "Vietnamese", value: "vi" },
  { label: "Turkish", value: "tr" },
  { label: "Arabic", value: "ar" },
]

export const SUPPORTED_TONES: Array<{ label: string; value: string }> = [
  { label: "Academic", value: "academic" },
  { label: "Business", value: "business" },
  { label: "Casual", value: "casual" },
  { label: "Childfriendly", value: "childfriendly" },
  { label: "Confident", value: "confident" },
  { label: "Conversational", value: "conversational" },
  { label: "Creative", value: "creative" },
  { label: "Emotional", value: "emotional" },
  { label: "Excited", value: "excited" },
  { label: "Formal", value: "formal" },
  { label: "Friendly", value: "friendly" },
  { label: "Funny", value: "funny" },
  { label: "Numorous", value: "humorous" },
  { label: "Informative", value: "informative" },
  { label: "Inspirational", value: "inspirational" },
  { label: "Memeify", value: "memeify" },
  { label: "Narrative", value: "narrative" },
  { label: "Objective", value: "objective" },
  { label: "Persuasive", value: "persuasive" },
  { label: "Poetic", value: "poetic" },
]
