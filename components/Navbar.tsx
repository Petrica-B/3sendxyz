'use client';

import { MinimalConnect } from '@/components/MinimalConnect';
import Image from 'next/image';
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
            className="brand group"
            style={{
              textDecoration: 'none',
              display: 'flex',
              alignItems: 'center',
            }}
            aria-label="3send home"
          >
            {/* Default logo (clear) */}
            <Image
              src="/3sendClear.svg"
              alt="3send logo"
              width={150}
              height={40}
              priority
              sizes="150px"
              className="h-5 w-auto block group-hover:hidden"
            />
            {/* Hover logo (solid) */}
            <Image
              src="/3send.svg"
              alt="3send logo hover"
              width={150}
              height={40}
              sizes="150px"
              className="h-5 w-auto hidden group-hover:block"
            />
          </Link>
        </div>
        <nav className="navlinks">
          <NavItem href="/" label="Home" />
          <NavItem href="/pricing" label="Pricing" />
          {isConnected && <NavItem href="/outbox" label="Outbox" />}
          {isConnected && <NavItem href="/inbox" label="Inbox" />}
        </nav>
        <div className="navbarWallet" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <MinimalConnect />
          {isConnected && (
            <Link
              href="/profile"
              aria-label="Open profile"
              className="button square"
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
                width="18"
                height="18"
                style={{ display: 'block' }}
              >
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            </Link>
          )}
          <Link
            href="/docs"
            aria-label="Docs"
            className="button square accent"
            style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
            title="Docs"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
              width="18"
              height="18"
              style={{ display: 'block' }}
            >
              <path d="M9 9a3 3 0 1 1 6 0c0 2-3 2-3 4" />
              <path d="M12 17h.01" />
            </svg>
          </Link>
        </div>
      </div>
    </div>
  );
}
