import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="col" style={{ gap: 24 }}>
      <section className="hero">
        <div className="headline">Page not found</div>
        <div className="subhead">The page you’re looking for doesn’t exist.</div>
      </section>
      <section className="row" style={{ gap: 8 }}>
        <Link href="/" className="button">Go Home</Link>
        <Link href="/docs" className="button secondary">Open Docs</Link>
      </section>
    </main>
  );
}
