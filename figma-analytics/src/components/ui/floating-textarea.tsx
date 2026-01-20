import * as React from "react"
import { cn } from "@/lib/utils"

export interface FloatingTextareaProps extends Omit<React.ComponentProps<"textarea">, "placeholder"> {
  label?: string;
  placeholder?: string;
}

const FloatingTextarea = React.forwardRef<HTMLTextAreaElement, FloatingTextareaProps>(
  ({ className, label, placeholder, value, onFocus, onBlur, ...props }, ref) => {
    const [isFocused, setIsFocused] = React.useState(false);
    const [hasValue, setHasValue] = React.useState(!!value);
    const textareaRef = React.useRef<HTMLTextAreaElement>(null);
    
    React.useImperativeHandle(ref, () => textareaRef.current!);
    
    React.useEffect(() => {
      setHasValue(!!value || (textareaRef.current?.value?.length ?? 0) > 0);
    }, [value]);
    
    const handleFocus = (e: React.FocusEvent<HTMLTextAreaElement>) => {
      setIsFocused(true);
      onFocus?.(e);
    };
    
    const handleBlur = (e: React.FocusEvent<HTMLTextAreaElement>) => {
      setIsFocused(false);
      setHasValue(!!e.target.value);
      onBlur?.(e);
    };
    
    const isFloating = isFocused || hasValue;
    const displayPlaceholder = isFloating ? placeholder : undefined;
    
    return (
      <div className="relative">
        {label && (
          <label
            className={cn(
              "absolute left-4 pointer-events-none transition-all duration-200 ease-out",
              "text-[var(--input-label-color)]",
              isFloating
                ? "top-2 text-[11px] leading-4 tracking-[0.4px]"
                : "top-3 text-[13px] leading-5 tracking-0"
            )}
          >
            {label}
          </label>
        )}
        <textarea
          {...props}
          ref={textareaRef}
          value={value}
          onFocus={handleFocus}
          onBlur={handleBlur}
          placeholder={displayPlaceholder}
          className={cn(
            "w-full rounded-xl border border-input bg-white px-4",
            label ? (isFloating ? "pt-6 pb-2" : "pt-8 pb-2") : "py-3",
            "h-[84px]",
            "text-[13px] leading-5 tracking-0 font-normal",
            "text-[var(--input-value-color)]",
            "shadow-[0px_2px_3px_rgba(0,0,0,0.1)]",
            "transition-colors duration-200",
            "placeholder:text-[var(--input-label-color)] placeholder:text-[13px] placeholder:leading-5 placeholder:tracking-0",
            "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
            "disabled:cursor-not-allowed disabled:opacity-50",
            "resize-none",
            className
          )}
        />
      </div>
    )
  }
)
FloatingTextarea.displayName = "FloatingTextarea"

export { FloatingTextarea }
