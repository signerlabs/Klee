import { cn } from '@/lib/utils'
import { AnimatePresence, motion } from 'motion/react'
import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Bot, BookOpen } from 'lucide-react'

// Type definitions for marketplace items
export type MarketplaceItemType = 'agent' | 'knowledge-base'

export interface BaseMarketplaceItem {
  type: MarketplaceItemType
  title: string
  author: string
  description: string
  avatar: string
  link: string
}

export interface Agent extends BaseMarketplaceItem {
  type: 'agent'
}

export interface KnowledgeBase extends BaseMarketplaceItem {
  type: 'knowledge-base'
}

export type MarketplaceItem = Agent | KnowledgeBase

// Helper function to get icon for different types
const getDefaultIcon = (type: MarketplaceItemType) => {
  switch (type) {
    case 'agent':
      return Bot
    case 'knowledge-base':
      return BookOpen
    default:
      return Bot
  }
}

interface HoverCardsProps {
  items: MarketplaceItem[]
  className?: string
}

export const HoverCards = ({ items, className }: HoverCardsProps) => {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)

  return (
    <div className={cn('grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4', className)}>
      {items.map((item, idx) => {
        const Icon = getDefaultIcon(item.type)

        return (
          <Link
            to={item.link}
            key={`${item.type}-${item.title}-${idx}`}
            className="relative group block p-2 h-full w-full"
            onMouseEnter={() => setHoveredIndex(idx)}
            onMouseLeave={() => setHoveredIndex(null)}
          >
            <AnimatePresence>
              {hoveredIndex === idx && (
                <motion.span
                  className="absolute inset-0 h-full w-full bg-neutral-200 dark:bg-slate-800/[0.8] block rounded-2xl"
                  layoutId="hoverBackground"
                  initial={{ opacity: 0 }}
                  animate={{
                    opacity: 1,
                    transition: { duration: 0.15 },
                  }}
                  exit={{
                    opacity: 0,
                    transition: { duration: 0.15, delay: 0.2 },
                  }}
                />
              )}
            </AnimatePresence>
            <Card className="relative z-20 h-full">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Avatar className="h-10 w-10">
                    {item.avatar ? (
                      <AvatarFallback>{item.avatar}</AvatarFallback>
                    ) : (
                      <AvatarFallback>
                        <Icon className="h-5 w-5" />
                      </AvatarFallback>
                    )}
                  </Avatar>
                  <div>
                    {item.title}
                    <CardDescription>by {item.author}</CardDescription>
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent className="line-clamp-3">
                <CardDescription>{item.description}</CardDescription>
              </CardContent>
            </Card>
          </Link>
        )
      })}
    </div>
  )
}
