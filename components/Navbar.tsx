"use client";

import { MinimalConnect } from "@/components/MinimalConnect";
import { usePathname } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { useAccount } from "wagmi";

function NavItem({ href, label }: { href: string; label: string }) {
  const pathname = usePathname();
  const active = pathname === href;
  return (
    <Link
      href={href}
      className="muted"
      style={{
        textDecoration: "none",
        fontWeight: active ? 700 : 500,
        // Ensure active link remains visible against light background
        color: active ? "var(--text)" : undefined,
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
              textDecoration: "none",
              display: "flex",
              alignItems: "center",
            }}
          >
            <Image
              src="/3sendlogo.svg"
              alt="3send"
              width={100}
              height={50}
              priority
              className="brandLogo"
            />
          </Link>
        </div>
        <nav className="navlinks">
          <NavItem href="/" label="Home" />
          {isConnected && <NavItem href="/outbox" label="Outbox" />}
          {isConnected && <NavItem href="/inbox" label="Inbox" />}
        </nav>
        <div className="navbarWallet">
          <MinimalConnect />
        </div>
      </div>
    </div>
  );
}
