'use client';

import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';

interface BadgeProps {
  children: ReactNode;
  variant?: 'default' | 'accent' | 'success' | 'warning' | 'muted';
  size?: 'sm' | 'md';
  className?: string;
}

const variants = {
  default: 'bg-[var(--bg-elevated)] text-[var(--text-secondary)] border border-[var(--border-subtle)]',
  accent:  'bg-[var(--accent-50)] text-[var(--accent-600)] border border-[var(--accent-200)]',
  success: 'bg-[var(--success-bg)] text-[var(--success)]',
  warning: 'bg-[var(--warning-bg)] text-[var(--warning)]',
  muted:   'bg-[var(--bg-elevated)] text-[var(--text-muted)]',
};

const sizes = {
  sm: 'px-2 py-0.5 text-xs',
  md: 'px-2.5 py-1 text-xs',
};

export function Badge({ children, variant = 'default', size = 'md', className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 font-medium rounded-full leading-none',
        variants[variant],
        sizes[size],
        className,
      )}
    >
      {children}
    </span>
  );
}
