import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { MicIcon, GlobeIcon } from 'lucide-react'
import {
  PromptInput,
  PromptInputTextarea,
  PromptInputToolbar,
  PromptInputSubmit,
  PromptInputButton,
  PromptInputTools,
  PromptInputModelSelect,
  PromptInputModelSelectTrigger,
  PromptInputModelSelectContent,
  PromptInputModelSelectItem,
  PromptInputModelSelectValue,
} from '@/components/ai-elements/prompt-input'
import { AnimatedGridPattern } from '@/components/magicui/animated-grid-pattern'
import { cn } from '@/lib/utils'
import { Avatar } from '@radix-ui/react-avatar'
import { AvatarFallback, AvatarImage } from '@/components/ui/avatar'

function AgentInitial() {
  const [selectedModel, setSelectedModel] = useState('gpt-4o')
  const models = [
    { id: 'gpt-4o', name: 'GPT-4o' },
    { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo' },
    { id: 'claude-2', name: 'Claude 2' },
  ]
  return (
    <>
      <div className="flex flex-col items-center justify-center h-full p-6 max-w-3xl w-full mx-auto z-10">
        <div className="flex flex-col items-center w-full pb-10 gap-2">
          <Avatar className="h-24 w-24">
            <AvatarImage
              src="https://github.com/shadcn.png"
              alt="@shadcn"
              className="rounded-full"
            />
            <AvatarFallback>CN</AvatarFallback>
          </Avatar>
          <div className="text-4xl font-bold">Coding Assistant</div>
          <div className="text-muted-foreground">Created by Author Name</div>
          <div className="text-center">
            This is a detailed description of the agent. It explains the agent's purpose,
            capabilities, and any other relevant information that users might find useful.
          </div>
        </div>
        <PromptInput onSubmit={() => {}} className="items-center mx-auto">
          <PromptInputTextarea onChange={() => {}} value={''} />
          <PromptInputToolbar>
            <PromptInputTools>
              <PromptInputButton>
                <MicIcon size={16} />
              </PromptInputButton>
              <PromptInputButton>
                <GlobeIcon size={16} />
                <span>Search</span>
              </PromptInputButton>
              <PromptInputModelSelect onValueChange={setSelectedModel} value={selectedModel}>
                <PromptInputModelSelectTrigger>
                  <PromptInputModelSelectValue placeholder="Select model" />
                </PromptInputModelSelectTrigger>
                <PromptInputModelSelectContent>
                  {models.map((model) => (
                    <PromptInputModelSelectItem key={model.id} value={model.id}>
                      {model.name}
                    </PromptInputModelSelectItem>
                  ))}
                </PromptInputModelSelectContent>
              </PromptInputModelSelect>
            </PromptInputTools>
            <PromptInputSubmit disabled={false} status={'ready'} />
          </PromptInputToolbar>
        </PromptInput>
      </div>
      <AnimatedGridPattern
        numSquares={10}
        maxOpacity={0.1}
        duration={1}
        repeatDelay={10}
        className={cn('[mask-image:radial-gradient(800px_circle_at_center,white,transparent)]')}
      />
    </>
  )
}

export const Route = createFileRoute('/_authenticated/(misc)/agent-initial/$agentId')({
  component: AgentInitial,
})
