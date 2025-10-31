import ServedByComponent from './ServedByComponent';

export function Footer() {
  return (
    <footer className="footer">
      <div className="container footerInner">
        <div className="servedBy">
          <ServedByComponent />
        </div>
        <div className="row" style={{ gap: 12 }}>
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
        </div>
      </div>
    </footer>
  );
}
