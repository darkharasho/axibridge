interface CommanderEmptyStateProps {
  status?: 'idle' | 'loading' | 'loaded' | 'error';
}

export function CommanderEmptyState({ status = 'idle' }: CommanderEmptyStateProps) {
  const isLoading = status === 'loading';
  const isError = status === 'error';
  return (
    <div className="flex items-center justify-center min-h-[60vh]" style={{ color: 'var(--text-secondary)' }}>
      <div className="text-center">
        <div className="text-base font-medium mb-1" style={{ color: 'var(--text-primary)' }}>
          {isLoading
            ? 'Loading fight details…'
            : isError
              ? 'Could not load fight details'
              : 'No logs yet'}
        </div>
        <div className="text-sm">
          {isLoading
            ? 'Hang tight — pulling the report from dps.report.'
            : isError
              ? 'Re-upload the log or try again.'
              : 'Drop a .zevtc into your watched folder or upload one to see your latest fight.'}
        </div>
      </div>
    </div>
  );
}
