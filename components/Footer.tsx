import ServedByComponent from "./ServedByComponent";

export function Footer() {
  return (
    <footer className="footer">
      <div
        className="container"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div className="servedBy">
          <ServedByComponent />
        </div>
        <div className="row" style={{ gap: 12 }}>
          <a
            href="https://docs.base.org/get-started/build-app"
            target="_blank"
            rel="noreferrer"
          >
            3send Git Repo
          </a>
        </div>
      </div>
    </footer>
  );
}
