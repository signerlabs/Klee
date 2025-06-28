import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Button } from '@/components/ui/button'

export const ActionIcon = ({
  icon,
  tooltipText,
  tooltipSide = 'top',
  className,
  variant = 'ghost',
  onClick,
  showTooltip = true,
}: {
  icon: React.ReactNode
  tooltipText: string
  tooltipSide?: 'top' | 'right' | 'bottom' | 'left'
  className?: string
  variant?: 'ghost' | 'default' | 'outline' | 'secondary' | 'destructive' | null | undefined
  onClick?: () => void
  showTooltip?: boolean
}) => (
  <TooltipProvider delayDuration={0}>
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant={variant} size="icon" className={className} onClick={onClick}>
          {icon}
        </Button>
      </TooltipTrigger>
      {showTooltip && (
        <TooltipContent side={tooltipSide}>
          <p>{tooltipText}</p>
        </TooltipContent>
      )}
    </Tooltip>
  </TooltipProvider>
)
