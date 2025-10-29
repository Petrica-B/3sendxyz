'use client';

import { MinimalConnect } from '@/components/MinimalConnect';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAccount } from 'wagmi';

function NavItem({ href, label }: { href: string; label: string }) {
  const pathname = usePathname();
  const active = pathname === href;
  return (
    <Link
      href={href}
      className="muted"
      style={{
        textDecoration: 'none',
        fontWeight: active ? 700 : 500,
        // Ensure active link remains visible against light background
        color: active ? 'var(--text)' : undefined,
      }}
    >
      {label}
    </Link>
  );
}

export function Navbar() {
  const { isConnected } = useAccount();
  return (
    <div className="navbar">
      <div className="container navbarInner">
        <div className="navbarBrand">
          <Link
            href="/"
            className="brand"
            style={{
              textDecoration: 'none',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            3send
          </Link>
        </div>
        <nav className="navlinks">
          <NavItem href="/" label="Home" />
          <NavItem href="/pricing" label="Pricing" />
          <NavItem href="/docs" label="Docs" />
          {isConnected && <NavItem href="/outbox" label="Outbox" />}
          {isConnected && <NavItem href="/inbox" label="Inbox" />}
        </nav>
        <div className="navbarWallet" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <MinimalConnect />
          {isConnected && (
            <Link
              href="/profile"
              aria-label="Open profile"
              className="button"
              style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
              title="Profile"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
                width="16"
                height="16"
                style={{ display: 'block' }}
              >
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
