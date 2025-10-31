import ServedByComponent from './ServedByComponent';

export function Footer() {
  return (
    <footer className="footer">
      <div className="container footerInner">
        <ServedByComponent />

        <div className="row" style={{ gap: 12, alignItems: 'center' }}>
          <span>3sendxyz Git Repos:</span>
          <a
            href="https://github.com/Petrica-B/3sendxyz"
            target="_blank"
            rel="noreferrer"
            className="pill labelLink"
          >
            dApp
          </a>
          <a
            href="https://github.com/Petrica-B/3sendxyz-sc"
            target="_blank"
            rel="noreferrer"
            className="pill labelLink"
          >
            Smart Contract
          </a>
          <span className="footerSep">|</span>
          <a
            href="https://x.com/3sendxyz"
            target="_blank"
            rel="noreferrer"
            className="pill labelLink"
            aria-label="Open X (Twitter)"
            title="X"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M4 4l16 16M20 4L4 20" />
            </svg>
          </a>
          <a
            href="https://t.me/threesendxyz"
            target="_blank"
            rel="noreferrer"
            className="pill labelLink"
            aria-label="Open Telegram"
            title="Telegram"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M22 2L11 13" />
              <path d="M22 2l-7 20-4-9-9-4 20-7z" />
            </svg>
          </a>
        </div>
      </div>
    </footer>
  );
}
