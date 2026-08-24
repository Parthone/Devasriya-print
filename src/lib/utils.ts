import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Merge Tailwind classes with correct conflict resolution (shadcn/ui helper). */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
