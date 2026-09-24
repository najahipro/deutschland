'use client';

import { cn } from '@/lib/utils';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  variant?: 'ghost' | 'subtle' | 'accent' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  isActive?: boolean;
  label: string; // required for accessibility
}

const variants = {
  ghost:  'text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]',
  subtle: 'bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:bg-[var(--border-subtle)] hover:text-[var(--text-primary)]',
  accent: 'bg-[var(--accent-500)] text-white hover:bg-[var(--accent-600)] shadow-sm',
  danger: 'text-[var(--text-muted)] hover:bg-[var(--error-bg)] hover:text-[var(--error)]',
};

const sizes = {
  sm: 'w-7 h-7 rounded-lg',
  md: 'w-9 h-9 rounded-xl',
  lg: 'w-10 h-10 rounded-xl',
};

export function IconButton({
  children,
  variant = 'ghost',
  size = 'md',
  isActive,
  label,
  className,
  ...props
}: IconButtonProps) {
  return (
    <button
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex items-center justify-center flex-shrink-0',
        'transition-all duration-150 ease-out',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-500)] focus-visible:ring-offset-1',
        'disabled:opacity-40 disabled:cursor-not-allowed',
        variants[variant],
        sizes[size],
        isActive && variant === 'ghost' && 'bg-[var(--accent-50)] text-[var(--accent-600)]',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
