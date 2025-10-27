type HandleSectionProps = {
  handleInput: string;
  onHandleChange: (value: string) => void;
  onSaveHandle: () => void;
  handleValid: boolean;
  currentHandle?: string;
};

export default function HandleSection(props: HandleSectionProps) {
  const { handleInput, onHandleChange, onSaveHandle, handleValid, currentHandle } = props;

  return (
    <section className="card col" style={{ gap: 12 }}>
      <div style={{ fontWeight: 700 }}>Handle</div>
      <div className="muted" style={{ fontSize: 12 }}>
        Choose a public handle to share, like <span className="mono">alice.3send</span>.
      </div>
      <div className="row" style={{ gap: 8, alignItems: 'stretch', flexWrap: 'wrap' }}>
        <input
          className="input"
          placeholder="yourname.3send"
          value={handleInput}
          onChange={(event) => onHandleChange(event.target.value)}
          style={{ flex: 1, minWidth: 220 }}
        />
        <button className="button" onClick={onSaveHandle} disabled={!handleValid}>
          Save Handle
        </button>
      </div>
      {!handleValid && handleInput && (
        <div style={{ color: '#f87171', fontSize: 12 }}>Invalid handle format.</div>
      )}
      {currentHandle && (
        <div className="muted" style={{ fontSize: 12 }}>
          Current: <span className="mono">{currentHandle}</span>
        </div>
      )}
    </section>
  );
}
