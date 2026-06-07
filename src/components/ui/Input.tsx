"use client";
import { forwardRef } from "react";
import { cn } from "@/lib/cn";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  leftIcon?: React.ReactNode;
  rightElement?: React.ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, hint, leftIcon, rightElement, className, id, ...props },
  ref
) {
  const inputId = id || label?.toLowerCase().replace(/\s+/g, "-");

  return (
    <div className="w-full">
      {label && (
        <label htmlFor={inputId} className="form-label">
          {label}
          {props.required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}
      <div className="relative">
        {leftIcon && (
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted">
            {leftIcon}
          </div>
        )}
        <input
          ref={ref}
          id={inputId}
          className={cn(
            "input-base",
            leftIcon && "pl-9",
            rightElement && "pr-10",
            error && "border-red-500/50 focus:border-red-500 focus:shadow-[0_0_0_3px_rgba(239,68,68,0.15)]",
            className
          )}
          aria-invalid={!!error}
          aria-describedby={error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined}
          {...props}
        />
        {rightElement && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            {rightElement}
          </div>
        )}
      </div>
      {error && (
        <p id={`${inputId}-error`} className="mt-1.5 text-xs text-red-400">
          {error}
        </p>
      )}
      {hint && !error && (
        <p id={`${inputId}-hint`} className="mt-1.5 text-xs text-text-muted">
          {hint}
        </p>
      )}
    </div>
  );
});

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, error, hint, className, id, ...props },
  ref
) {
  const inputId = id || label?.toLowerCase().replace(/\s+/g, "-");

  return (
    <div className="w-full">
      {label && (
        <label htmlFor={inputId} className="form-label">
          {label}
          {props.required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}
      <textarea
        ref={ref}
        id={inputId}
        className={cn(
          "input-base resize-none min-h-[100px]",
          error && "border-red-500/50 focus:border-red-500",
          className
        )}
        aria-invalid={!!error}
        {...props}
      />
      {error && <p className="mt-1.5 text-xs text-red-400">{error}</p>}
      {hint && !error && <p className="mt-1.5 text-xs text-text-muted">{hint}</p>}
    </div>
  );
});
