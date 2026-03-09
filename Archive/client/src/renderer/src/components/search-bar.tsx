import { Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { useState, useEffect, useCallback } from 'react'

interface SearchBarProps {
  className?: string
  placeholder?: string
  onSearch?: (value: string) => void
  debounceMs?: number
}

export function SearchBar({
  className,
  placeholder = 'Search...',
  onSearch,
  debounceMs = 300,
}: SearchBarProps) {
  const [inputValue, setInputValue] = useState('')

  // Debounce the search callback
  useEffect(() => {
    const timer = setTimeout(() => {
      onSearch?.(inputValue)
    }, debounceMs)

    return () => clearTimeout(timer)
  }, [inputValue, debounceMs, onSearch])

  return (
    <div className={cn('relative w-full z-10', className)}>
      <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        placeholder={placeholder}
        className="pl-8 h-8"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
      />
    </div>
  )
}
