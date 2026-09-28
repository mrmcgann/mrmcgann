export function Tile({ colour, path, title, children }: { colour: string; path: string; title: string; children: React.ReactNode }) {
  return (
    <div className="tile">
      <span className={`ic bg-${colour}`}>
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#1D1D1F" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" dangerouslySetInnerHTML={{ __html: path }} />
      </span>
      <h3>{title}</h3>
      <p className="muted">{children}</p>
    </div>
  );
}
