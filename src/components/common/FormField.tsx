import type { ReactNode } from 'react';

import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

interface FormFieldProps {
  id: string;
  label: string;
  error?: string | undefined;
  hint?: string | undefined;
  required?: boolean;
  className?: string;
  children: ReactNode;
}

/**
 * Label, control and validation message in one consistent block, so every form
 * in the application reports errors the same way and stays accessible.
 */
export function FormField({
  id,
  label,
  error,
  hint,
  required = false,
  className,
  children,
}: FormFieldProps) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <Label htmlFor={id}>
        {label}
        {required ? (
          <span className="text-destructive" aria-hidden="true">
            *
          </span>
        ) : null}
      </Label>
      {children}
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
