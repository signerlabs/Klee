import { Extension } from "@tiptap/core"

export interface UiState {
  aiGenerationIsSelection: boolean
  aiGenerationIsLoading: boolean
  aiGenerationActive: boolean
  aiGenerationHasMessage: boolean
  commentInputVisible: boolean
  lockDragHandle: boolean
  isDragging: boolean
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    uiState: {
      aiGenerationSetIsSelection: (value: boolean) => ReturnType
      aiGenerationSetIsLoading: (value: boolean) => ReturnType
      aiGenerationShow: () => ReturnType
      aiGenerationHide: () => ReturnType
      aiGenerationHasMessage: (value: boolean) => ReturnType

      commentInputShow: () => ReturnType
      commentInputHide: () => ReturnType

      setLockDragHandle: (value: boolean) => ReturnType

      resetUiState: () => ReturnType
      setIsDragging: (value: boolean) => ReturnType
    }
  }

  interface Storage {
    uiState: UiState
  }
}

export const defaultUiState: UiState = {
  aiGenerationIsSelection: false,
  aiGenerationIsLoading: false,
  aiGenerationActive: false,
  aiGenerationHasMessage: false,
  commentInputVisible: false,
  lockDragHandle: false,
  isDragging: false,
} as const

export const UiState = Extension.create<UiState>({
  name: "uiState",

  addStorage() {
    return {
      uiState: { ...defaultUiState },
    }
  },

  addCommands() {
    const createBooleanSetter =
      (key: keyof UiState) => (value: boolean) => () => {
        this.storage[key] = value
        return true
      }

    const createToggle = (key: keyof UiState, value: boolean) => () => () => {
      this.storage[key] = value
      return true
    }

    return {
      // AI Generation commands
      aiGenerationSetIsSelection: createBooleanSetter(
        "aiGenerationIsSelection"
      ),
      aiGenerationSetIsLoading: createBooleanSetter("aiGenerationIsLoading"),
      aiGenerationHasMessage: createBooleanSetter("aiGenerationHasMessage"),
      aiGenerationShow: createToggle("aiGenerationActive", true),
      aiGenerationHide: createToggle("aiGenerationActive", false),

      // Comment input commands
      commentInputShow: createToggle("commentInputVisible", true),
      commentInputHide: createToggle("commentInputVisible", false),

      // Drag handle commands
      setLockDragHandle: createBooleanSetter("lockDragHandle"),
      setIsDragging: createBooleanSetter("isDragging"),

      // Reset command
      resetUiState: () => () => {
        Object.assign(this.storage, { ...defaultUiState })
        return true
      },
    }
  },

  onCreate() {
    this.storage = { ...defaultUiState }
  },
})
