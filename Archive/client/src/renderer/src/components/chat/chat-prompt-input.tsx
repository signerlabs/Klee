import { useCallback, useEffect, type Dispatch, type FormEvent, type SetStateAction } from 'react'
import { GlobeIcon } from 'lucide-react'
import type { ChatStatus } from 'ai'
import {
  PromptInput,
  PromptInputAttachment,
  PromptInputAttachments,
  PromptInputBody,
  PromptInputButton,
  PromptInputModelSelect,
  PromptInputModelSelectContent,
  PromptInputModelSelectItem,
  PromptInputModelSelectTrigger,
  PromptInputModelSelectValue,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputToolbar,
  PromptInputTools,
  type PromptInputMessage,
} from '@/components/ai-elements/prompt-input'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { llmModels } from '@config/models'
import { useMode } from '@/contexts/ModeContext'
import { useInstalledModels } from '@/hooks/ollama-models/queries/useInstalledModels'
import { getModelDisplayName } from '@/lib/ollama-client'

type ChatPromptInputProps = {
  input: string
  setInput: Dispatch<SetStateAction<string>>
  model: string
  setModel: Dispatch<SetStateAction<string>>
  webSearch: boolean
  setWebSearch: Dispatch<SetStateAction<boolean>>
  status?: ChatStatus
  isUsingAgent?: boolean // 是否使用 Agent 配置（禁用 model 和 webSearch 控件）
  onSubmit: (
    message: PromptInputMessage,
    event?: FormEvent<HTMLFormElement>
  ) => void | Promise<void>
}

export function ChatPromptInput({
  input,
  setInput,
  model,
  setModel,
  webSearch,
  setWebSearch,
  status,
  isUsingAgent = false,
  onSubmit,
}: ChatPromptInputProps) {
  const { isPrivateMode } = useMode()
  const { data: installedModels, isLoading: isLoadingModels } = useInstalledModels()

  // 根据模式选择显示的模型列表
  const availableModels = isPrivateMode
    ? // Private Mode: 显示已安装的本地模型（过滤掉 embedding 模型）
      (installedModels || [])
        .filter((m) => {
          // 过滤掉 embedding 模型（通常包含 'embed' 关键字）
          const modelName = m.name.toLowerCase()
          return !modelName.includes('embed')
        })
        .map((m) => ({
          name: getModelDisplayName(m.name), // 使用友好的显示名称
          value: m.name, // Ollama 模型使用 name 作为标识符
        }))
    : // Cloud Mode: 显示云端模型
      llmModels

  // 自动设置默认模型（当模型列表变化或当前模型不在列表中时）
  useEffect(() => {
    // 如果模型列表为空，不做处理
    if (availableModels.length === 0) return

    // 如果当前模型不在可用列表中，或者没有选中模型，设置为第一个模型
    const modelExists = availableModels.some((m) => m.value === model)
    if (!model || !modelExists) {
      setModel(availableModels[0].value)
    }
  }, [availableModels, model, setModel])

  const handleSubmit = useCallback(
    (message: PromptInputMessage, event?: FormEvent<HTMLFormElement>) => {
      return onSubmit(message, event)
    },
    [onSubmit]
  )

  return (
    <PromptInput multiple onSubmit={handleSubmit} className="bg-background">
      <PromptInputBody>
        <PromptInputAttachments>
          {(attachment) => <PromptInputAttachment data={attachment} />}
        </PromptInputAttachments>
        <PromptInputTextarea onChange={(e) => setInput(e.target.value)} value={input} />
      </PromptInputBody>
      <PromptInputToolbar>
        <PromptInputTools>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex">
                <PromptInputButton
                  variant={webSearch ? 'default' : 'ghost'}
                  onClick={() => setWebSearch(!webSearch)}
                  disabled={isUsingAgent || isPrivateMode}
                >
                  <GlobeIcon size={16} />
                  <span>Search</span>
                </PromptInputButton>
              </span>
            </TooltipTrigger>
            {(isUsingAgent || isPrivateMode) && (
              <TooltipContent>
                {isUsingAgent
                  ? 'Web Search is controlled by the selected Agent.'
                  : 'Web Search is not available in Private Mode.'}
              </TooltipContent>
            )}
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex">
                <PromptInputModelSelect
                  onValueChange={(value) => {
                    setModel(value)
                  }}
                  value={model}
                  disabled={isUsingAgent || (isPrivateMode && availableModels.length === 0)}
                >
                  <PromptInputModelSelectTrigger
                    disabled={isUsingAgent || (isPrivateMode && availableModels.length === 0)}
                  >
                    <PromptInputModelSelectValue
                      placeholder={
                        isPrivateMode && availableModels.length === 0
                          ? 'No models installed'
                          : isLoadingModels
                            ? 'Loading models...'
                            : undefined
                      }
                    />
                  </PromptInputModelSelectTrigger>
                  <PromptInputModelSelectContent>
                    {availableModels.length === 0 && isPrivateMode ? (
                      <div className="px-2 py-4 text-sm text-muted-foreground text-center">
                        No models installed. Please download models from Marketplace.
                      </div>
                    ) : (
                      availableModels.map((chatModel) => (
                        <PromptInputModelSelectItem key={chatModel.value} value={chatModel.value}>
                          {chatModel.name}
                        </PromptInputModelSelectItem>
                      ))
                    )}
                  </PromptInputModelSelectContent>
                </PromptInputModelSelect>
              </span>
            </TooltipTrigger>
            {(isUsingAgent || (isPrivateMode && availableModels.length === 0)) && (
              <TooltipContent>
                {isUsingAgent
                  ? 'Model is controlled by the selected Agent'
                  : 'No models installed. Please download models from Marketplace.'}
              </TooltipContent>
            )}
          </Tooltip>
        </PromptInputTools>
        <PromptInputSubmit disabled={!input} status={status} />
      </PromptInputToolbar>
    </PromptInput>
  )
}
