import * as React from "react"
import { cn } from "@/lib/utils"
import { LucideIcon } from "lucide-react"

export interface CustomToggleProps extends React.HTMLAttributes<HTMLDivElement> {
  checked?: boolean
  onCheckedChange?: (checked: boolean) => void
  label?: string
  checkedLabel?: string
  uncheckedLabel?: string
  checkedIcon?: LucideIcon
  uncheckedIcon?: LucideIcon
  disabled?: boolean
}

export const CustomToggle = React.forwardRef<HTMLDivElement, CustomToggleProps>(
  ({ 
    className, 
    checked = false, 
    onCheckedChange, 
    label,
    checkedLabel,
    uncheckedLabel,
    checkedIcon: CheckedIcon,
    uncheckedIcon: UncheckedIcon,
    disabled = false,
    ...props 
  }, ref) => {
    const [isChecked, setIsChecked] = React.useState(checked)

    React.useEffect(() => {
      setIsChecked(checked)
    }, [checked])

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const newChecked = e.target.checked
      setIsChecked(newChecked)
      onCheckedChange?.(newChecked)
    }

    const displayLabel = React.useMemo(() => {
      if (isChecked && checkedLabel) return checkedLabel
      if (!isChecked && uncheckedLabel) return uncheckedLabel
      return label
    }, [isChecked, label, checkedLabel, uncheckedLabel])

    const Icon = React.useMemo(() => {
      if (isChecked && CheckedIcon) return CheckedIcon
      if (!isChecked && UncheckedIcon) return UncheckedIcon
      return null
    }, [isChecked, CheckedIcon, UncheckedIcon])

    return (
      <div 
        ref={ref}
        className={cn("flex items-center gap-3", className)}
        {...props}
      >
        <label className="relative inline-flex items-center cursor-pointer">
          <input 
            type="checkbox" 
            className="sr-only peer" 
            checked={isChecked}
            onChange={handleChange}
            disabled={disabled}
          />
          <div className={cn(
            "relative w-11 h-6 rounded-full transition-colors",
            "bg-input peer-checked:bg-primary",
            "peer-focus-visible:outline-none peer-focus-visible:ring-2",
            "peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2",
            "peer-focus-visible:ring-offset-background",
            "peer-disabled:cursor-not-allowed peer-disabled:opacity-50"
          )}>
            <div className={cn(
              "absolute top-[2px] left-[2px]",
              "bg-background rounded-full",
              "h-5 w-5 transition-transform duration-200",
              isChecked && "translate-x-5",
              "shadow-sm flex items-center justify-center"
            )}>
              {Icon && (
                <Icon className={cn(
                  "h-3 w-3",
                  "text-muted-foreground",
                  disabled && "opacity-50"
                )} />
              )}
            </div>
          </div>
        </label>
        {displayLabel && (
          <span className={cn(
            "text-sm transition-colors select-none",
            "text-muted-foreground",
            disabled && "opacity-50"
          )}>
            {displayLabel}
          </span>
        )}
      </div>
    )
  }
)

CustomToggle.displayName = "CustomToggle"