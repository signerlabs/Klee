import * as React from 'react'
import { LibraryBig, Notebook, X, ChevronDown, Sparkles, Share } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { SidebarGroup, SidebarGroupLabel } from '@/components/ui/sidebar'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Link } from '@tanstack/react-router'
import { useMode } from '@/contexts/ModeContext'
import { FolderCode } from 'lucide-react'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'

interface ChatConfigProps {
  agents?: Array<{ id: string; name: string; description: string; icon: string }>
  knowledgeBases: Array<{ id: string; name: string; enabled: boolean }>
  notes: Array<{ id: string; name: string; enabled: boolean }>
  selectedAgent?: string
  setSelectedAgent?: (value: string | undefined) => void
  selectedKnowledgeBases: string[]
  setSelectedKnowledgeBases: React.Dispatch<React.SetStateAction<string[]>>
  selectedNotes: string[]
  setSelectedNotes: React.Dispatch<React.SetStateAction<string[]>>
  chatId?: string
}

export function ChatConfig({
  agents,
  knowledgeBases,
  notes,
  selectedAgent,
  setSelectedAgent,
  selectedKnowledgeBases,
  setSelectedKnowledgeBases,
  selectedNotes,
  setSelectedNotes,
  chatId,
}: ChatConfigProps) {
  const { isPrivateMode } = useMode()
  const [activeTab, setActiveTab] = React.useState<string>('customized')

  // Handle tab change: clear agent when switching to customized
  const handleTabChange = (value: string) => {
    setActiveTab(value)
    if (value === 'customized' && setSelectedAgent) {
      // Clear agent selection when switching to customized mode
      setSelectedAgent(undefined)
    }
  }

  return (
    <>
      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full p-2">
        <TabsList className="w-full">
          <TabsTrigger value="customized">Customized</TabsTrigger>
          <TabsTrigger value="agent">Agent</TabsTrigger>
        </TabsList>
        <TabsContent value="customized">
          {/* Knowledge Bases */}
          <SidebarGroup>
            <SidebarGroupLabel className="gap-2">
              <LibraryBig className="h-4 w-4" />
              Knowledge Bases
            </SidebarGroupLabel>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="w-full justify-between">
                  <span className="truncate">
                    {selectedKnowledgeBases.length > 0
                      ? `${selectedKnowledgeBases.length} selected`
                      : 'Select knowledge bases...'}
                  </span>
                  <ChevronDown className="h-4 w-4 opacity-50" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                {knowledgeBases.map((kb) => (
                  <DropdownMenuItem
                    key={kb.id}
                    className="flex items-center gap-2"
                    onSelect={(e) => {
                      e.preventDefault()
                      setSelectedKnowledgeBases((prev) =>
                        prev.includes(kb.id) ? prev.filter((id) => id !== kb.id) : [...prev, kb.id]
                      )
                    }}
                  >
                    <Checkbox
                      checked={selectedKnowledgeBases.includes(kb.id)}
                      className="pointer-events-none"
                    />
                    <span>{kb.name}</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            {selectedKnowledgeBases.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-4">
                {selectedKnowledgeBases.map((id) => {
                  const kb = knowledgeBases.find((k) => k.id === id)
                  return kb ? (
                    <Badge key={id} variant="secondary">
                      {kb.name}
                      <button
                        className="ml-1 hover:text-destructive"
                        onClick={() =>
                          setSelectedKnowledgeBases((prev) => prev.filter((kbId) => kbId !== id))
                        }
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ) : null
                })}
              </div>
            )}
          </SidebarGroup>

          {/* Notes */}
          <SidebarGroup>
            <SidebarGroupLabel className="gap-2">
              <Notebook className="h-4 w-4" />
              Notes
            </SidebarGroupLabel>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="w-full justify-between">
                  <span>
                    {selectedNotes.length > 0
                      ? `${selectedNotes.length} selected`
                      : 'Select notes...'}
                  </span>
                  <ChevronDown className="h-4 w-4 opacity-50" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                {notes.map((note) => (
                  <DropdownMenuItem
                    key={note.id}
                    className="flex items-center gap-2"
                    onSelect={(e) => {
                      e.preventDefault()
                      setSelectedNotes((prev) =>
                        prev.includes(note.id)
                          ? prev.filter((id) => id !== note.id)
                          : [...prev, note.id]
                      )
                    }}
                  >
                    <Checkbox
                      checked={selectedNotes.includes(note.id)}
                      className="pointer-events-none"
                    />
                    <span>{note.name}</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            {selectedNotes.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-4">
                {selectedNotes.map((id) => {
                  const note = notes.find((n) => n.id === id)
                  return note ? (
                    <Badge key={id} variant="secondary">
                      {note.name}
                      <button
                        className="ml-1 hover:text-destructive"
                        onClick={() =>
                          setSelectedNotes((prev) => prev.filter((noteId) => noteId !== id))
                        }
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ) : null
                })}
              </div>
            )}
            {!isPrivateMode && (
              <Button
                asChild
                variant="link"
                size="sm"
                className="w-full justify-end text-muted-foreground pt-6"
              >
                <Link
                  to="/marketplace/agent/$agentId"
                  params={{ agentId: 'new' }}
                  search={chatId ? { from: 'chat', chatId } : {}}
                  className="flex items-center gap-1"
                >
                  <Share className="h-4 w-4" />
                  Create Agent
                </Link>
              </Button>
            )}
          </SidebarGroup>
        </TabsContent>
        <TabsContent value="agent">
          {isPrivateMode ? (
            /* Private Mode: 显示提示信息 */
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <FolderCode />
                </EmptyMedia>
                <EmptyTitle>Not Available</EmptyTitle>
                <EmptyDescription>You can use agents only in Cloud Mode.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            /* Cloud Mode: 正常显示 Agent 选择 */
            <>
              <SidebarGroup>
                <SidebarGroupLabel className="gap-2">
                  <Sparkles className="h-4 w-4" /> AI Agent
                </SidebarGroupLabel>
                <Select value={selectedAgent} onValueChange={setSelectedAgent}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select an agent" />
                  </SelectTrigger>
                  <SelectContent>
                    {agents?.map((agent) => (
                      <SelectItem key={agent.id} value={agent.id}>
                        <span className="flex items-center gap-2">
                          <span>{agent.icon}</span>
                          <span>{agent.name}</span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </SidebarGroup>
              <Button
                asChild
                variant="link"
                size="sm"
                className="w-full justify-end text-muted-foreground"
              >
                <Link to="/marketplace">More Agents</Link>
              </Button>
            </>
          )}
        </TabsContent>
      </Tabs>
    </>
  )
}
