'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

function HomeIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 10v9a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1v-9" />
    </svg>
  );
}

function OutboxIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="M7 10l5-5 5 5" />
      <path d="M12 5v12" />
    </svg>
  );
}

function InboxIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M21 9V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v4" />
      <path d="M7 14l5 5 5-5" />
      <path d="M12 19V7" />
    </svg>
  );
}

export function MobileTabBar() {
  const pathname = usePathname();
  const isActive = (href: string) => (href === '/' ? pathname === '/' : pathname.startsWith(href));

  // Order: Outbox (left) · Home (center) · Inbox (right)
  const items = [
    { href: '/outbox', label: 'Outbox', Icon: OutboxIcon },
    { href: '/', label: 'Home', Icon: HomeIcon },
    { href: '/inbox', label: 'Inbox', Icon: InboxIcon },
  ];

  return (
    <nav className="mobileTabbar" role="navigation" aria-label="Primary">
      <div className="mobileTabbarInner">
        {items.map(({ href, label, Icon }) => {
          const active = isActive(href);
          return (
            <Link key={href} href={href} className={`mobileTabItem${active ? ' active' : ''}`}>
              <Icon />
              <span>{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

export default MobileTabBar;
