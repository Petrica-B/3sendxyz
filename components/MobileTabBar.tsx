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

function PricingIcon() {
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
      <path d="M7 7h10a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2z" />
      <path d="M12 8v8" />
      <path d="M9 10h6" />
      <path d="M9 14h6" />
    </svg>
  );
}

function PaperPlaneIcon() {
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
      {/* paper plane */}
      <path d="M22 2L11 13" />
      <path d="M22 2l-7 20-4-9-9-4 20-7z" />
    </svg>
  );
}


export function MobileTabBar() {
  const pathname = usePathname();
  const isActive = (href: string) => (href === '/' ? pathname === '/' : pathname.startsWith(href));

  return (
    <nav className="mobileTabbar" role="navigation" aria-label="Primary">
      <div className="mobileTabbarInner singleRow">
        {/* Left two */}
        {[
          { href: '/', label: 'Home', Icon: HomeIcon },
          { href: '/pricing', label: 'Pricing', Icon: PricingIcon },
        ].map(({ href, label, Icon }) => {
          const active = isActive(href);
          return (
            <Link key={href} href={href} className={`mobileTabItem${active ? ' active' : ''}`}>
              <Icon />
              <span>{label}</span>
            </Link>
          );
        })}

        {/* Gap */}
        <span className="mobileGap" aria-hidden />

        {/* Center send */}
        <Link href="/send" className="mobileCenterBtn" aria-label="Send file" title="Send">
          <PaperPlaneIcon />
          <span>Send</span>
        </Link>

        {/* Gap */}
        <span className="mobileGap" aria-hidden />

        {/* Right two */}
        {[
          { href: '/outbox', label: 'Outbox', Icon: OutboxIcon },
          { href: '/inbox', label: 'Inbox', Icon: InboxIcon },
        ].map(({ href, label, Icon }) => {
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
