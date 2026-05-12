export function CommanderEmptyState() {
  return (
    <div className="flex items-center justify-center min-h-[60vh] text-slate-400">
      <div className="text-center">
        <div className="text-base font-medium text-slate-200 mb-1">No logs yet</div>
        <div className="text-sm">
          Drop a .zevtc into your watched folder or upload one to see your latest fight.
        </div>
      </div>
    </div>
  );
}
