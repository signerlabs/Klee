import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { getEmojiCategories } from '@/lib/emoji-utils'

interface EmojiPickerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onEmojiSelect: (emoji: string) => void
  currentEmoji?: string
}

export function EmojiPicker({ open, onOpenChange, onEmojiSelect, currentEmoji }: EmojiPickerProps) {
  const categories = getEmojiCategories()
  const [selectedCategory, setSelectedCategory] = useState('People')

  const handleEmojiClick = (emoji: string) => {
    onEmojiSelect(emoji)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Choose Agent Avatar</DialogTitle>
          <DialogDescription>Select an emoji to represent your agent</DialogDescription>
        </DialogHeader>

        <Tabs value={selectedCategory} onValueChange={setSelectedCategory} className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            {categories.slice(0, 3).map((category) => (
              <TabsTrigger key={category.name} value={category.name}>
                {category.name}
              </TabsTrigger>
            ))}
          </TabsList>
          <TabsList className="grid w-full grid-cols-3 mt-2">
            {categories.slice(3).map((category) => (
              <TabsTrigger key={category.name} value={category.name}>
                {category.name}
              </TabsTrigger>
            ))}
          </TabsList>

          {categories.map((category) => (
            <TabsContent key={category.name} value={category.name} className="mt-4">
              <div className="grid grid-cols-8 gap-2 max-h-64 overflow-y-auto p-2">
                {category.emojis.map((emoji) => (
                  <button
                    key={emoji}
                    onClick={() => handleEmojiClick(emoji)}
                    className={`
                      text-2xl p-2 rounded hover:bg-accent transition-colors
                      ${currentEmoji === emoji ? 'bg-accent ring-2 ring-primary' : ''}
                    `}
                    title={emoji}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </TabsContent>
          ))}
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
