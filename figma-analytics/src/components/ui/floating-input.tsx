import * as React from "react"
import { cn } from "@/lib/utils"

export interface FloatingInputProps extends Omit<React.ComponentProps<"input">, "placeholder"> {
  label?: string;
  placeholder?: string;
}

const FloatingInput = React.forwardRef<HTMLInputElement, FloatingInputProps>(
  ({ className, label, placeholder, value, onFocus, onBlur, ...props }, ref) => {
    const [isFocused, setIsFocused] = React.useState(false);
    const [hasValue, setHasValue] = React.useState(!!value);
    const inputRef = React.useRef<HTMLInputElement>(null);
    
    React.useImperativeHandle(ref, () => inputRef.current!);
    
    React.useEffect(() => {
      setHasValue(!!value || (inputRef.current?.value?.length ?? 0) > 0);
    }, [value]);
    
    const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
      setIsFocused(true);
      onFocus?.(e);
    };
    
    const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
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
                ? "top-1 text-[11px] leading-4 tracking-[0.4px]"
                : "top-[12px] text-[13px] leading-5 tracking-0"
            )}
          >
            {label}
          </label>
        )}
        <input
          {...props}
          ref={inputRef}
          value={value}
          onFocus={handleFocus}
          onBlur={handleBlur}
          placeholder={displayPlaceholder}
          className={cn(
            "flex h-11 w-full rounded-xl border border-input bg-white px-4",
            label ? "pt-4 pb-2" : "py-0",
            "text-[13px] leading-5 tracking-0 font-normal",
            "text-[var(--input-value-color)]",
            "shadow-[0px_2px_3px_rgba(0,0,0,0.1)]",
            "transition-colors duration-200",
            "placeholder:text-[var(--input-label-color)] placeholder:text-[13px] placeholder:leading-5 placeholder:tracking-0",
            "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
            "disabled:cursor-not-allowed disabled:opacity-50",
            "file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground",
            className
          )}
        />
      </div>
    )
  }
)
FloatingInput.displayName = "FloatingInput"

export { FloatingInput }
