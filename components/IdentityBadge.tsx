'use client';

import { shortAddress } from '@/lib/format';
import { fetchIdentityProfile, identityQueryKey } from '@/lib/identity';
import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';

type IdentityBadgeProps = {
  address?: string;
  size?: number;
  className?: string;
  basicStyle?: boolean;
  showAvatar?: boolean;
  nameMaxLength?: number;
};

export function IdentityBadge({
  address,
  size = 5,
  className,
  basicStyle = false,
  showAvatar = false,
  nameMaxLength,
}: IdentityBadgeProps) {
  const normalized = address?.trim().toLowerCase() ?? '';
  const enabled = normalized.length > 0;
  const { data } = useQuery({
    queryKey: identityQueryKey(normalized),
    queryFn: () => fetchIdentityProfile(normalized),
    enabled,
    staleTime: 30 * 60 * 1000,
  });

  if (!enabled) {
    return null;
  }

  const baseName = data?.name?.trim();
  const displayName =
    (baseName && nameMaxLength && baseName.length > nameMaxLength
      ? `${baseName.slice(0, nameMaxLength)}…`
      : baseName) || shortAddress(normalized, size);
  const avatarUrl = data?.avatarUrl;
  const fallbackLetter = displayName ? displayName[0]?.toUpperCase() : '?';

  const badgeContent = (
    <span
      className={clsx('identityBadge', className)}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        padding: !basicStyle ? '4px 8px' : undefined,
        borderRadius: !basicStyle ? 999 : undefined,
        background: !basicStyle ? 'rgba(0,0,0,0.03)' : undefined,
      }}
    >
      {avatarUrl && showAvatar && (
        <span
          aria-hidden
          style={{
            width: 28,
            height: 28,
            borderRadius: '50%',
            overflow: 'hidden',
            border: '1px solid rgba(0,0,0,0.06)',
            background: '#f3f4f6',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 12,
            color: '#6b7280',
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={avatarUrl}
            alt={`${displayName} avatar`}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        </span>
      )}
      <span style={{ fontWeight: 600, lineHeight: 1 }}>{displayName}</span>
      {data?.name && !basicStyle ? (
        <span className="mono muted" style={{ fontSize: 11, color: '#6b7280' }}>
          {shortAddress(normalized, size)}
        </span>
      ) : null}
    </span>
  );

  return badgeContent;
}
