'use client';

import { LoginModal } from '@/components/LoginModal';
import { useAuthStatus } from '@/lib/useAuthStatus';
import type { CSSProperties } from 'react';
import { useState } from 'react';

type LoginButtonProps = {
  label?: string;
  className?: string;
  style?: CSSProperties;
};

export function LoginButton({ label = 'Login', className = 'button', style }: LoginButtonProps) {
  const [open, setOpen] = useState(false);
  const { isLoggedIn } = useAuthStatus();

  if (isLoggedIn) return null;

  return (
    <>
      <button type="button" className={className} style={style} onClick={() => setOpen(true)}>
        {label}
      </button>
      <LoginModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}
