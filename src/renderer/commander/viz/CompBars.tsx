import React from 'react';
import { getProfessionColor } from '../../../shared/professionUtils';

interface CompBarsProps {
  comp: Array<{ profession: string; count: number }>;
  max?: number;
  height?: number;
}

export function CompBars({ comp, max, height = 32 }: CompBarsProps) {
  const total = comp.reduce((acc, c) => acc + c.count, 0);
  const ceiling = Math.max(1, max ?? total);

  const bars: Array<{ profession: string; key: string }> = [];
  comp.forEach((entry, groupIdx) => {
    for (let i = 0; i < entry.count; i++) {
      bars.push({ profession: entry.profession, key: `${groupIdx}-${i}` });
    }
  });

  return (
    <div className="flex items-end gap-[1px]" data-role="comp-bars" style={{ height }}>
      {bars.map((b) => {
        const h = Math.max(2, (height * 1) / Math.max(1, ceiling / Math.max(1, total)));
        return (
          <div
            key={b.key}
            data-role="comp-bar"
            data-profession={b.profession}
            className="w-1 rounded-sm"
            style={{ height: h, backgroundColor: getProfessionColor(b.profession) }}
          />
        );
      })}
    </div>
  );
}
