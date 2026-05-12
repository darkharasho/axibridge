const ACTIVE_STATUSES: ReadonlySet<NonNullable<ILogData['status']>> = new Set([
  'queued',
  'pending',
  'uploading',
  'retrying',
  'discord',
  'calculating',
  'parsing',
]);

const STATUS_LABEL: Record<string, string> = {
  queued: 'queued',
  pending: 'pending',
  uploading: 'uploading',
  retrying: 'retrying',
  discord: 'posting to Discord',
  calculating: 'calculating',
  parsing: 'parsing',
};

export function CommanderProcessingBanner({ logs }: { logs: ILogData[] }) {
  const active = logs.filter((l) => l.status && ACTIVE_STATUSES.has(l.status));
  if (active.length === 0) return null;

  const summary = active.length === 1
    ? `1 log ${STATUS_LABEL[active[0].status!] ?? active[0].status}…`
    : `${active.length} logs processing…`;

  return (
    <div
      className="flex items-center gap-2 px-3 py-1.5 border rounded-md mb-3 text-xs"
      style={{
        background: 'var(--bg-card-inner)',
        borderColor: 'var(--border-default)',
        color: 'var(--text-secondary)',
      }}
      data-role="commander-processing-banner"
    >
      <div className="stats-particle-spinner shrink-0" style={{ width: 18, height: 18 }}>
        <div className="stats-particle-spinner__ring" />
        <div className="stats-particle-spinner__orbit">
          <span className="stats-particle-spinner__particle" />
          <span className="stats-particle-spinner__particle" />
          <span className="stats-particle-spinner__particle" />
          <span className="stats-particle-spinner__particle" />
        </div>
      </div>
      <span>
        <span style={{ color: 'var(--text-primary)' }}>{summary}</span>
        <span className="ml-1.5" style={{ color: 'var(--text-muted)' }}>
          (Commander view will update once parsing finishes)
        </span>
      </span>
    </div>
  );
}
