import ServedByComponent from './ServedByComponent';

export function Footer() {
  return (
    <footer className="footer">
      <div className="container footerInner">
        <div className="servedBy">
          <ServedByComponent />
        </div>
        <div className="row" style={{ gap: 12 }}>
          <a href="https://github.com/Petrica-B/3sendxyz" target="_blank" rel="noreferrer">
            3sendxyz Git Repo
          </a>
        </div>
      </div>
    </footer>
  );
}
