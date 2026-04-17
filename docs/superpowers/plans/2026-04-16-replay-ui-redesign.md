# Replay UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the Replay section so the map fills all available space, the squad panel is a collapsible right-side overlay, the fight picker is collapsible, member cards match axipulse style with real GW2 boon icons / HP% / per-second skills, and zoom uses axipulse's range (1–50×) with cursor-centered wheel zoom.

**Architecture:** Five new/modified files in `src/renderer/stats/map/`. Pure helper functions are extracted into `partyMemberHelpers.ts` and tested in isolation. `PartyMemberCard` and `ReplaySquadPanel` replace `PartyPanel`. `FightPickerBar` wraps the existing `FightPicker`. `useReplayViewport` gets new zoom constants and a cursor-centered wheel-zoom attachment function. `ReplayView` is rewired with the new layout — flex column, map fills `flex:1`, squad panel sits right of the map as a collapsible flex child.

**Tech Stack:** React 18, Zustand, Vitest + React Testing Library, TypeScript

---

## File Map

| Action | Path | Purpose |
|--------|------|---------|
| Create | `src/renderer/stats/map/partyMemberHelpers.ts` | Pure functions: `hpAt`, `statusAt`, `activeBoons`, `activeSkillsAt` |
| Create | `src/renderer/stats/map/__tests__/partyMemberHelpers.test.ts` | Unit tests for helpers |
| Create | `src/renderer/stats/map/PartyMemberCard.tsx` | Axipulse-style member card component |
| Create | `src/renderer/stats/map/__tests__/PartyMemberCard.test.tsx` | Component tests for member card |
| Create | `src/renderer/stats/map/ReplaySquadPanel.tsx` | Collapsible right panel with member cards |
| Create | `src/renderer/stats/map/__tests__/ReplaySquadPanel.test.tsx` | Component tests for squad panel |
| Create | `src/renderer/stats/map/FightPickerBar.tsx` | Collapsible fight picker wrapper |
| Create | `src/renderer/stats/map/__tests__/FightPickerBar.test.tsx` | Component tests for fight picker bar |
| Modify | `src/renderer/stats/map/hooks/useReplayViewport.ts` | New zoom range + wheel zoom attachment |
| Modify | `src/renderer/stats/map/hooks/__tests__/useReplayViewport.test.ts` | Add wheel zoom test |
| Modify | `src/renderer/stats/map/ReplayView.tsx` | New layout wiring everything together |

---

## Task 1: Pure helper functions

**Files:**
- Create: `src/renderer/stats/map/partyMemberHelpers.ts`
- Create: `src/renderer/stats/map/__tests__/partyMemberHelpers.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// src/renderer/stats/map/__tests__/partyMemberHelpers.test.ts
import { describe, it, expect } from 'vitest';
import { hpAt, statusAt, activeBoons, activeSkillsAt } from '../partyMemberHelpers';
import type { SquadMemberMovement } from '../../../../shared/movementData';

const base: SquadMemberMovement = {
    name: 'A', account: 'A.1', profession: 'Guardian', eliteSpec: '', group: 1,
    isCommander: false, isLocal: false, isEnemy: false, inSquad: true,
    positions: [], downRanges: [], deadRanges: [],
};

describe('hpAt', () => {
    it('returns 100 when no health series', () => {
        expect(hpAt(base, 5000)).toBe(100);
    });
    it('returns the last sample before or at timeMs', () => {
        const m = { ...base, healthPercents: [[1000, 80], [3000, 60]] as [number, number][] };
        expect(hpAt(m, 2000)).toBe(80);
        expect(hpAt(m, 3000)).toBe(60);
        expect(hpAt(m, 4000)).toBe(60);
    });
    it('returns 100 before first sample', () => {
        const m = { ...base, healthPercents: [[2000, 70]] as [number, number][] };
        expect(hpAt(m, 500)).toBe(100);
    });
});

describe('statusAt', () => {
    it('returns alive when no ranges match', () => {
        expect(statusAt(base, 1000)).toBe('alive');
    });
    it('returns dead when in a deadRange (end=0 means ongoing)', () => {
        const m = { ...base, deadRanges: [[1000, 0]] as [number, number][] };
        expect(statusAt(m, 2000)).toBe('dead');
    });
    it('returns dead when in a deadRange with an end time', () => {
        const m = { ...base, deadRanges: [[1000, 3000]] as [number, number][] };
        expect(statusAt(m, 1500)).toBe('dead');
        expect(statusAt(m, 3001)).toBe('alive');
    });
    it('returns down when in downRange but not deadRange', () => {
        const m = { ...base, downRanges: [[2000, 4000]] as [number, number][] };
        expect(statusAt(m, 3000)).toBe('down');
    });
    it('dead takes priority over down', () => {
        const m = {
            ...base,
            deadRanges: [[2000, 4000]] as [number, number][],
            downRanges: [[2000, 4000]] as [number, number][],
        };
        expect(statusAt(m, 3000)).toBe('dead');
    });
});

describe('activeBoons', () => {
    it('returns empty array with no boonStates', () => {
        expect(activeBoons(base, 1000)).toEqual([]);
    });
    it('returns boon IDs with stacks > 0 at timeMs', () => {
        const m = {
            ...base,
            boonStates: {
                743: [[0, 25], [5000, 0]] as [number, number][],
                725: [[0, 1]] as [number, number][],
            },
        };
        expect(activeBoons(m, 1000)).toEqual(expect.arrayContaining([743, 725]));
        expect(activeBoons(m, 1000).length).toBe(2);
    });
    it('excludes boons with stacks = 0 at timeMs', () => {
        const m = {
            ...base,
            boonStates: {
                743: [[0, 1], [2000, 0]] as [number, number][],
            },
        };
        expect(activeBoons(m, 3000)).toEqual([]);
    });
});

describe('activeSkillsAt', () => {
    it('returns empty array with no skillCasts', () => {
        expect(activeSkillsAt(base, 1000)).toEqual([]);
    });
    it('returns skill IDs cast within [timeMs, timeMs+1000)', () => {
        const m = {
            ...base,
            skillCasts: [
                { id: 10, time: 2000, duration: 500 },
                { id: 20, time: 2500, duration: 200 },
                { id: 30, time: 3000, duration: 100 }, // exactly at timeMs+1000 — excluded
                { id: 40, time: 1500, duration: 100 }, // before window — excluded
            ],
        };
        expect(activeSkillsAt(m, 2000)).toEqual([10, 20]);
    });
    it('returns empty array when no casts in window', () => {
        const m = { ...base, skillCasts: [{ id: 10, time: 5000, duration: 100 }] };
        expect(activeSkillsAt(m, 1000)).toEqual([]);
    });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest run src/renderer/stats/map/__tests__/partyMemberHelpers.test.ts
```

Expected: FAIL (module not found)

- [ ] **Step 3: Implement the helpers**

```ts
// src/renderer/stats/map/partyMemberHelpers.ts
import type { SquadMemberMovement } from '../../../shared/movementData';

export type MemberStatus = 'alive' | 'down' | 'dead';

export function hpAt(member: SquadMemberMovement, timeMs: number): number {
    const series = member.healthPercents;
    if (!series?.length) return 100;
    let hp = 100;
    for (const [t, v] of series) {
        if (t > timeMs) break;
        hp = v;
    }
    return hp;
}

export function statusAt(member: SquadMemberMovement, timeMs: number): MemberStatus {
    for (const [start, end] of member.deadRanges) {
        if (timeMs >= start && (end === 0 || timeMs <= end)) return 'dead';
    }
    for (const [start, end] of member.downRanges) {
        if (timeMs >= start && (end === 0 || timeMs <= end)) return 'down';
    }
    return 'alive';
}

export function activeBoons(member: SquadMemberMovement, timeMs: number): number[] {
    if (!member.boonStates) return [];
    const ids: number[] = [];
    for (const [idStr, states] of Object.entries(member.boonStates)) {
        let stacks = 0;
        for (const [t, v] of states) {
            if (t > timeMs) break;
            stacks = v;
        }
        if (stacks > 0) ids.push(Number(idStr));
    }
    return ids;
}

export function activeSkillsAt(member: SquadMemberMovement, timeMs: number): number[] {
    if (!member.skillCasts?.length) return [];
    return member.skillCasts
        .filter(c => c.time >= timeMs && c.time < timeMs + 1000)
        .map(c => c.id);
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
npx vitest run src/renderer/stats/map/__tests__/partyMemberHelpers.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/renderer/stats/map/partyMemberHelpers.ts src/renderer/stats/map/__tests__/partyMemberHelpers.test.ts
git commit -m "feat(replay): add partyMemberHelpers — hpAt, statusAt, activeBoons, activeSkillsAt"
```

---

## Task 2: PartyMemberCard component

**Files:**
- Create: `src/renderer/stats/map/PartyMemberCard.tsx`
- Create: `src/renderer/stats/map/__tests__/PartyMemberCard.test.tsx`

- [ ] **Step 1: Write failing tests**

```tsx
// src/renderer/stats/map/__tests__/PartyMemberCard.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PartyMemberCard } from '../PartyMemberCard';
import type { SquadMemberMovement } from '../../../../shared/movementData';

const mkMember = (o: Partial<SquadMemberMovement> = {}): SquadMemberMovement => ({
    name: 'TestPlayer', account: 'Test.1234', profession: 'Guardian', eliteSpec: '',
    group: 1, isCommander: false, isLocal: false, isEnemy: false, inSquad: true,
    positions: [], downRanges: [], deadRanges: [], ...o,
});

const boonIcons: Record<number, { name: string; icon: string }> = {
    743: { name: 'Aegis', icon: 'aegis.png' },
    725: { name: 'Protection', icon: 'protection.png' },
};
const skillIcons: Record<number, { name: string; icon: string }> = {
    5536: { name: 'Heal by Light', icon: 'heal.png' },
};

describe('PartyMemberCard', () => {
    it('renders member name', () => {
        render(<PartyMemberCard member={mkMember()} timeMs={0} boonIcons={{}} skillIcons={{}} />);
        expect(screen.getByText('TestPlayer')).toBeTruthy();
    });

    it('renders HP percentage when alive', () => {
        const m = mkMember({ healthPercents: [[0, 72]] });
        render(<PartyMemberCard member={m} timeMs={500} boonIcons={{}} skillIcons={{}} />);
        expect(screen.getByText('72%')).toBeTruthy();
    });

    it('renders — for dead member HP', () => {
        const m = mkMember({ deadRanges: [[0, 0]] });
        render(<PartyMemberCard member={m} timeMs={500} boonIcons={{}} skillIcons={{}} />);
        expect(screen.getByText('—')).toBeTruthy();
    });

    it('renders active boon icons', () => {
        const m = mkMember({ boonStates: { 743: [[0, 1]] } });
        render(<PartyMemberCard member={m} timeMs={500} boonIcons={boonIcons} skillIcons={{}} />);
        const imgs = document.querySelectorAll('img[alt="Aegis"]');
        expect(imgs.length).toBeGreaterThan(0);
    });

    it('renders skill icons for casts in current second', () => {
        const m = mkMember({ skillCasts: [{ id: 5536, time: 1000, duration: 500 }] });
        render(<PartyMemberCard member={m} timeMs={1000} boonIcons={{}} skillIcons={skillIcons} />);
        const imgs = document.querySelectorAll('img[alt="Heal by Light"]');
        expect(imgs.length).toBeGreaterThan(0);
    });

    it('does not render skill if cast is outside the 1s window', () => {
        const m = mkMember({ skillCasts: [{ id: 5536, time: 3000, duration: 500 }] });
        render(<PartyMemberCard member={m} timeMs={1000} boonIcons={{}} skillIcons={skillIcons} />);
        const imgs = document.querySelectorAll('img[alt="Heal by Light"]');
        expect(imgs.length).toBe(0);
    });

    it('shows commander diamond when isCommander', () => {
        const m = mkMember({ isCommander: true });
        const { container } = render(<PartyMemberCard member={m} timeMs={0} boonIcons={{}} skillIcons={{}} />);
        expect(container.querySelector('[data-cmd-tag]')).toBeTruthy();
    });

    it('shows DOWN status label when member is downed', () => {
        const m = mkMember({ downRanges: [[0, 0]] });
        render(<PartyMemberCard member={m} timeMs={500} boonIcons={{}} skillIcons={{}} />);
        expect(screen.getByText(/DOWN/i)).toBeTruthy();
    });

    it('shows DEAD status label when member is dead', () => {
        const m = mkMember({ deadRanges: [[0, 0]] });
        render(<PartyMemberCard member={m} timeMs={500} boonIcons={{}} skillIcons={{}} />);
        expect(screen.getByText(/DEAD/i)).toBeTruthy();
    });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest run src/renderer/stats/map/__tests__/PartyMemberCard.test.tsx
```

Expected: FAIL (module not found)

- [ ] **Step 3: Implement PartyMemberCard**

```tsx
// src/renderer/stats/map/PartyMemberCard.tsx
import React, { useMemo } from 'react';
import { getProfessionIconPath } from '../../classIconUtils';
import { hpAt, statusAt, activeBoons, activeSkillsAt } from './partyMemberHelpers';
import type { SquadMemberMovement } from '../../../shared/movementData';

interface PartyMemberCardProps {
    member: SquadMemberMovement;
    timeMs: number;
    boonIcons: Record<number, { name: string; icon: string }>;
    skillIcons: Record<number, { name: string; icon: string }>;
    onFollow?: (key: string) => void;
}

function hpColor(hp: number, status: string): string {
    if (status === 'dead') return '#64748b';
    if (status === 'down') return '#f97316';
    if (hp >= 60) return '#4ade80';
    if (hp >= 30) return '#fbbf24';
    return '#f87171';
}

function barColor(status: string): string {
    if (status === 'dead') return '#7f1d1d';
    if (status === 'down') return '#9a3412';
    return '#22c55e';
}

export const PartyMemberCard: React.FC<PartyMemberCardProps> = ({
    member, timeMs, boonIcons, skillIcons, onFollow,
}) => {
    const hp = hpAt(member, timeMs);
    const status = statusAt(member, timeMs);
    const boonIds = useMemo(() => activeBoons(member, timeMs), [member, timeMs]);
    const skillIds = useMemo(() => activeSkillsAt(member, timeMs), [member, timeMs]);

    const specLabel = member.eliteSpec
        ? String(member.eliteSpec)
        : member.profession;
    const statusSuffix = status === 'down' ? ' · DOWN' : status === 'dead' ? ' · DEAD' : '';
    const statusColor = status === 'down' ? '#f97316' : status === 'dead' ? '#ef4444' : '#475569';

    return (
        <button
            type="button"
            onClick={() => onFollow?.(member.account || member.name)}
            style={{
                display: 'block', width: '100%', textAlign: 'left',
                padding: '5px 8px', borderRadius: 4, margin: '1px 4px',
                background: 'rgba(255,255,255,0.02)',
                border: '1px solid transparent',
                cursor: 'pointer',
            }}
        >
            {/* Row 1: icon + name + hp */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                <div style={{ position: 'relative', flexShrink: 0, width: 24, height: 24 }}>
                    <img
                        src={getProfessionIconPath(member.profession) ?? undefined}
                        alt={member.profession}
                        width={24}
                        height={24}
                        style={{ borderRadius: '50%', display: 'block' }}
                    />
                    {member.isCommander && (
                        <div
                            data-cmd-tag
                            style={{
                                position: 'absolute', top: -6, left: '50%', transform: 'translateX(-50%)',
                                width: 10, height: 10,
                                background: '#fbbf24',
                                clipPath: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)',
                            }}
                        />
                    )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 10, fontWeight: 600, color: '#e2e8f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {member.name}
                    </div>
                    <div style={{ fontSize: 9, color: statusColor }}>
                        {specLabel}{statusSuffix}
                    </div>
                </div>
                <div style={{ fontSize: 11, fontWeight: 700, color: hpColor(hp, status), flexShrink: 0, width: 32, textAlign: 'right' }}>
                    {status === 'dead' ? '—' : `${Math.round(hp)}%`}
                </div>
            </div>

            {/* HP bar */}
            <div style={{ height: 3, background: 'rgba(255,255,255,0.07)', borderRadius: 2, marginBottom: 4, overflow: 'hidden' }}>
                <div style={{ width: `${status === 'dead' ? 0 : hp}%`, height: '100%', background: barColor(status), borderRadius: 2 }} />
            </div>

            {/* Row 2: active boons */}
            {status !== 'dead' && (
                <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', marginBottom: 3 }}>
                    {boonIds.map(id => {
                        const icon = boonIcons[id];
                        if (!icon?.icon) return null;
                        return (
                            <img key={id} src={icon.icon} alt={icon.name} title={icon.name} width={22} height={22}
                                 style={{ borderRadius: 3, border: '1px solid rgba(255,255,255,0.15)' }} />
                        );
                    })}
                </div>
            )}

            {/* Row 3: skills used this second */}
            {status !== 'dead' && skillIds.length > 0 && (
                <div style={{ display: 'flex', gap: 3 }}>
                    {skillIds.map(id => {
                        const icon = skillIcons[id];
                        if (!icon?.icon) return null;
                        return (
                            <img key={id} src={icon.icon} alt={icon.name} title={icon.name} width={22} height={22}
                                 style={{ borderRadius: 3, border: '1px solid rgba(96,165,250,0.3)', background: 'rgba(96,165,250,0.1)' }} />
                        );
                    })}
                </div>
            )}
        </button>
    );
};

export default PartyMemberCard;
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
npx vitest run src/renderer/stats/map/__tests__/PartyMemberCard.test.tsx
```

- [ ] **Step 5: Commit**

```bash
git add src/renderer/stats/map/PartyMemberCard.tsx src/renderer/stats/map/__tests__/PartyMemberCard.test.tsx
git commit -m "feat(replay): add PartyMemberCard — axipulse-style with boons, HP%, skills, commander tag"
```

---

## Task 3: ReplaySquadPanel component

**Files:**
- Create: `src/renderer/stats/map/ReplaySquadPanel.tsx`
- Create: `src/renderer/stats/map/__tests__/ReplaySquadPanel.test.tsx`

- [ ] **Step 1: Write failing tests**

```tsx
// src/renderer/stats/map/__tests__/ReplaySquadPanel.test.tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ReplaySquadPanel } from '../ReplaySquadPanel';
import { useStatsStore } from '../../statsStore';
import type { ReplayFightPayload } from '../replayTypes';
import type { SquadMemberMovement } from '../../../../shared/movementData';

const mkMember = (o: Partial<SquadMemberMovement> = {}): SquadMemberMovement => ({
    name: 'Player', account: 'P.1', profession: 'Guardian', eliteSpec: '',
    group: 1, isCommander: false, isLocal: false, isEnemy: false, inSquad: true,
    positions: [], downRanges: [], deadRanges: [], ...o,
});

const mkFight = (members: SquadMemberMovement[]): ReplayFightPayload => ({
    fightId: 'f1', fightIndex: 0, label: 'x', timestampMs: 0, durationMs: 5000,
    mapKey: null, mapImageUrl: null, mapSize: [600, 600], avgPosition: null,
    nearestLandmark: null, squadSize: members.length, kills: 0, deaths: 0,
    movementData: { pollingRate: 1000, durationMs: 5000, inchToPixel: 1, members, boonIcons: {}, skillIcons: {} },
    dpsSamples: [], killEvents: [], damageSpikeEvents: [], rallyEvents: [], targetFocusSamples: [],
});

describe('ReplaySquadPanel', () => {
    beforeEach(() => {
        useStatsStore.setState((useStatsStore as any).getInitialState());
    });

    it('renders member names when expanded', () => {
        const fight = mkFight([mkMember({ name: 'Alice' }), mkMember({ name: 'Bob', group: 2 })]);
        render(<ReplaySquadPanel fight={fight} collapsed={false} onToggle={() => {}} />);
        expect(screen.getByText('Alice')).toBeTruthy();
        expect(screen.getByText('Bob')).toBeTruthy();
    });

    it('hides member names when collapsed', () => {
        const fight = mkFight([mkMember({ name: 'Alice' })]);
        render(<ReplaySquadPanel fight={fight} collapsed={true} onToggle={() => {}} />);
        expect(screen.queryByText('Alice')).toBeNull();
    });

    it('renders party headers for each unique group', () => {
        const fight = mkFight([
            mkMember({ name: 'A', group: 1 }),
            mkMember({ name: 'B', group: 2 }),
        ]);
        render(<ReplaySquadPanel fight={fight} collapsed={false} onToggle={() => {}} />);
        expect(screen.getByText('Party 1')).toBeTruthy();
        expect(screen.getByText('Party 2')).toBeTruthy();
    });

    it('excludes enemies from the panel', () => {
        const fight = mkFight([
            mkMember({ name: 'Friend', isEnemy: false }),
            mkMember({ name: 'Foe', isEnemy: true }),
        ]);
        render(<ReplaySquadPanel fight={fight} collapsed={false} onToggle={() => {}} />);
        expect(screen.getByText('Friend')).toBeTruthy();
        expect(screen.queryByText('Foe')).toBeNull();
    });

    it('calls onToggle when collapse button is clicked', () => {
        const onToggle = vi.fn();
        const fight = mkFight([mkMember()]);
        render(<ReplaySquadPanel fight={fight} collapsed={false} onToggle={onToggle} />);
        fireEvent.click(screen.getByTitle('Collapse squad panel'));
        expect(onToggle).toHaveBeenCalledOnce();
    });

    it('calls onToggle when the collapsed rail is clicked', () => {
        const onToggle = vi.fn();
        const fight = mkFight([mkMember()]);
        render(<ReplaySquadPanel fight={fight} collapsed={true} onToggle={onToggle} />);
        fireEvent.click(screen.getByTitle('Expand squad panel'));
        expect(onToggle).toHaveBeenCalledOnce();
    });
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
npx vitest run src/renderer/stats/map/__tests__/ReplaySquadPanel.test.tsx
```

Expected: FAIL (module not found)

- [ ] **Step 3: Implement ReplaySquadPanel**

```tsx
// src/renderer/stats/map/ReplaySquadPanel.tsx
import React, { useMemo } from 'react';
import { useStatsStore } from '../statsStore';
import { PartyMemberCard } from './PartyMemberCard';
import type { ReplayFightPayload } from './replayTypes';

interface ReplaySquadPanelProps {
    fight: ReplayFightPayload;
    collapsed: boolean;
    onToggle: () => void;
}

export const ReplaySquadPanel: React.FC<ReplaySquadPanelProps> = ({ fight, collapsed, onToggle }) => {
    const timeMs = useStatsStore(state => state.replayPlayhead.timeMs);
    const setReplayFollowTarget = useStatsStore(state => state.setReplayFollowTarget);

    const allies = useMemo(
        () => fight.movementData.members.filter(m => !m.isEnemy && m.inSquad),
        [fight.movementData.members],
    );

    const byParty = useMemo(() => {
        const map = new Map<number, typeof allies>();
        for (const m of allies) {
            const group = m.group ?? 0;
            if (!map.has(group)) map.set(group, []);
            map.get(group)!.push(m);
        }
        return Array.from(map.entries()).sort((a, b) => a[0] - b[0]);
    }, [allies]);

    const { boonIcons, skillIcons } = fight.movementData;

    if (collapsed) {
        return (
            <div
                title="Expand squad panel"
                onClick={onToggle}
                style={{
                    width: 28, flexShrink: 0,
                    background: 'rgba(8,17,31,0.95)',
                    borderLeft: '1px solid rgba(255,255,255,0.08)',
                    display: 'flex', flexDirection: 'column', alignItems: 'center',
                    paddingTop: 8, cursor: 'pointer',
                }}
            >
                <span style={{ fontSize: 11, color: '#334155' }}>◀</span>
                <span style={{ writingMode: 'vertical-rl', fontSize: 9, fontWeight: 700, letterSpacing: '.07em', textTransform: 'uppercase', color: '#334155', marginTop: 7 }}>
                    Squad
                </span>
            </div>
        );
    }

    return (
        <div style={{
            width: 230, flexShrink: 0,
            background: 'rgba(8,17,31,0.95)',
            borderLeft: '1px solid rgba(255,255,255,0.08)',
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}>
            <div style={{ padding: '7px 10px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: '#475569' }}>Squad · {allies.length} members</span>
                <button
                    type="button"
                    title="Collapse squad panel"
                    onClick={onToggle}
                    style={{ fontSize: 11, color: '#334155', padding: '2px 4px', borderRadius: 3, background: 'none', border: 'none', cursor: 'pointer' }}
                >
                    ▶
                </button>
            </div>
            <div style={{ overflowY: 'auto', flex: 1, padding: '4px 0' }}>
                {byParty.map(([group, members]) => (
                    <React.Fragment key={group}>
                        <div style={{ padding: '5px 8px 2px', fontSize: 9, fontWeight: 700, letterSpacing: '.07em', textTransform: 'uppercase', color: '#334155', borderTop: '1px solid rgba(255,255,255,0.04)', marginTop: 2 }}>
                            Party {group}
                        </div>
                        {members.map(m => (
                            <PartyMemberCard
                                key={m.account || m.name}
                                member={m}
                                timeMs={timeMs}
                                boonIcons={boonIcons}
                                skillIcons={skillIcons}
                                onFollow={key => setReplayFollowTarget(key)}
                            />
                        ))}
                    </React.Fragment>
                ))}
            </div>
        </div>
    );
};

export default ReplaySquadPanel;
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
npx vitest run src/renderer/stats/map/__tests__/ReplaySquadPanel.test.tsx
```

- [ ] **Step 5: Commit**

```bash
git add src/renderer/stats/map/ReplaySquadPanel.tsx src/renderer/stats/map/__tests__/ReplaySquadPanel.test.tsx
git commit -m "feat(replay): add ReplaySquadPanel — collapsible right panel with party-grouped member cards"
```

---

## Task 4: FightPickerBar component

**Files:**
- Create: `src/renderer/stats/map/FightPickerBar.tsx`
- Create: `src/renderer/stats/map/__tests__/FightPickerBar.test.tsx`

- [ ] **Step 1: Write failing tests**

```tsx
// src/renderer/stats/map/__tests__/FightPickerBar.test.tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FightPickerBar } from '../FightPickerBar';
import { useStatsStore } from '../../statsStore';
import type { ReplayFightPayload } from '../replayTypes';

const makeFight = (id: string, label: string): ReplayFightPayload => ({
    fightId: id, fightIndex: 0, label, timestampMs: 0, durationMs: 60_000,
    mapKey: null, mapImageUrl: null, mapSize: null, avgPosition: null,
    nearestLandmark: null, squadSize: 20, kills: 5, deaths: 2,
    movementData: { pollingRate: 300, durationMs: 60_000, inchToPixel: 1, members: [], boonIcons: {}, skillIcons: {} },
    dpsSamples: [], killEvents: [], damageSpikeEvents: [], rallyEvents: [], targetFocusSamples: [],
});

const fights = [makeFight('a', 'Fight A'), makeFight('b', 'Fight B'), makeFight('c', 'Fight C')];

describe('FightPickerBar', () => {
    beforeEach(() => {
        useStatsStore.setState((useStatsStore as any).getInitialState());
    });

    it('shows fight cards when expanded', () => {
        render(<FightPickerBar fights={fights} collapsed={false} onToggle={() => {}} />);
        expect(screen.getByText('Fight A')).toBeTruthy();
        expect(screen.getByText('Fight B')).toBeTruthy();
    });

    it('hides fight cards when collapsed', () => {
        render(<FightPickerBar fights={fights} collapsed={true} onToggle={() => {}} />);
        expect(screen.queryByText('Fight A')).toBeNull();
    });

    it('collapsed bar shows active fight name', () => {
        useStatsStore.getState().setSelectedReplayFight('b');
        render(<FightPickerBar fights={fights} collapsed={true} onToggle={() => {}} />);
        expect(screen.getByText('Fight B')).toBeTruthy();
    });

    it('collapsed bar shows fight count', () => {
        useStatsStore.getState().setSelectedReplayFight('b');
        render(<FightPickerBar fights={fights} collapsed={true} onToggle={() => {}} />);
        expect(screen.getByText('2 of 3')).toBeTruthy();
    });

    it('collapsed ▶ button advances to next fight', () => {
        useStatsStore.getState().setSelectedReplayFight('a');
        render(<FightPickerBar fights={fights} collapsed={true} onToggle={() => {}} />);
        fireEvent.click(screen.getByTitle('Next fight'));
        expect(useStatsStore.getState().selectedReplayFightId).toBe('b');
    });

    it('collapsed ◀ button goes to previous fight', () => {
        useStatsStore.getState().setSelectedReplayFight('b');
        render(<FightPickerBar fights={fights} collapsed={true} onToggle={() => {}} />);
        fireEvent.click(screen.getByTitle('Previous fight'));
        expect(useStatsStore.getState().selectedReplayFightId).toBe('a');
    });

    it('calls onToggle when toggle button is clicked (expanded)', () => {
        const onToggle = vi.fn();
        render(<FightPickerBar fights={fights} collapsed={false} onToggle={onToggle} />);
        fireEvent.click(screen.getByTitle('Collapse fight picker'));
        expect(onToggle).toHaveBeenCalledOnce();
    });

    it('calls onToggle when "Show all fights" is clicked (collapsed)', () => {
        const onToggle = vi.fn();
        render(<FightPickerBar fights={fights} collapsed={true} onToggle={onToggle} />);
        fireEvent.click(screen.getByText(/show all fights/i));
        expect(onToggle).toHaveBeenCalledOnce();
    });
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
npx vitest run src/renderer/stats/map/__tests__/FightPickerBar.test.tsx
```

Expected: FAIL (module not found)

- [ ] **Step 3: Implement FightPickerBar**

```tsx
// src/renderer/stats/map/FightPickerBar.tsx
import React, { useCallback } from 'react';
import { useStatsStore } from '../statsStore';
import { FightPicker } from './FightPicker';
import type { ReplayFightPayload } from './replayTypes';

interface FightPickerBarProps {
    fights: ReplayFightPayload[];
    collapsed: boolean;
    onToggle: () => void;
}

export const FightPickerBar: React.FC<FightPickerBarProps> = ({ fights, collapsed, onToggle }) => {
    const selectedId = useStatsStore(state => state.selectedReplayFightId);
    const setSelectedReplayFight = useStatsStore(state => state.setSelectedReplayFight);

    const currentIdx = fights.findIndex(f => f.fightId === selectedId);
    const activeLabel = fights[currentIdx]?.label ?? '';

    const step = useCallback((dir: -1 | 1) => {
        if (!fights.length) return;
        const idx = currentIdx < 0 ? 0 : currentIdx;
        const nextIdx = Math.max(0, Math.min(fights.length - 1, idx + dir));
        const next = fights[nextIdx];
        if (next && next.fightId !== selectedId) setSelectedReplayFight(next.fightId);
    }, [fights, currentIdx, selectedId, setSelectedReplayFight]);

    if (collapsed) {
        return (
            <div style={{
                background: '#0f1a2e',
                borderBottom: '1px solid rgba(255,255,255,0.07)',
                height: 34, display: 'flex', alignItems: 'center', padding: '0 10px', gap: 8,
            }}>
                <button
                    type="button"
                    onClick={onToggle}
                    style={{ fontSize: 10, color: '#64748b', display: 'flex', alignItems: 'center', gap: 4, padding: '3px 7px', borderRadius: 4, border: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.03)', cursor: 'pointer' }}
                >
                    ▼ Show all fights
                </button>
                {activeLabel && (
                    <span style={{ fontSize: 11, fontWeight: 600, color: '#93c5fd', padding: '2px 8px', borderRadius: 4, background: 'rgba(96,165,250,0.1)', border: '1px solid rgba(96,165,250,0.2)' }}>
                        {activeLabel}
                    </span>
                )}
                {fights.length > 0 && currentIdx >= 0 && (
                    <span style={{ fontSize: 10, color: '#475569' }}>{currentIdx + 1} of {fights.length}</span>
                )}
                <div style={{ display: 'flex', gap: 2, marginLeft: 'auto' }}>
                    <button type="button" title="Previous fight" onClick={() => step(-1)} style={{ width: 22, height: 22, borderRadius: 4, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', fontSize: 10, color: '#64748b', cursor: 'pointer' }}>◀</button>
                    <button type="button" title="Next fight" onClick={() => step(1)} style={{ width: 22, height: 22, borderRadius: 4, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', fontSize: 10, color: '#64748b', cursor: 'pointer' }}>▶</button>
                </div>
            </div>
        );
    }

    return (
        <div style={{ background: '#0f1a2e', borderBottom: '1px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'stretch' }}>
            <button
                type="button"
                title="Collapse fight picker"
                onClick={onToggle}
                style={{ width: 36, flexShrink: 0, borderRight: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: '#475569', background: 'rgba(255,255,255,0.02)', border: 'none', cursor: 'pointer' }}
            >
                ▲
            </button>
            <div style={{ flex: 1, overflow: 'hidden' }}>
                <FightPicker fights={fights} />
            </div>
        </div>
    );
};

export default FightPickerBar;
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
npx vitest run src/renderer/stats/map/__tests__/FightPickerBar.test.tsx
```

- [ ] **Step 5: Commit**

```bash
git add src/renderer/stats/map/FightPickerBar.tsx src/renderer/stats/map/__tests__/FightPickerBar.test.tsx
git commit -m "feat(replay): add FightPickerBar — collapsible wrapper with active chip and prev/next nav"
```

---

## Task 5: Update useReplayViewport — zoom range + cursor-centered wheel zoom

**Files:**
- Modify: `src/renderer/stats/map/hooks/useReplayViewport.ts`
- Modify: `src/renderer/stats/map/hooks/__tests__/useReplayViewport.test.ts`

- [ ] **Step 1: Add wheel zoom test and update existing test for new scale range**

Replace the entire test file:

```ts
// src/renderer/stats/map/hooks/__tests__/useReplayViewport.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { fireEvent } from '@testing-library/dom';
import { useReplayViewport } from '../useReplayViewport';
import { useStatsStore } from '../../../statsStore';

describe('useReplayViewport', () => {
    beforeEach(() => {
        useStatsStore.setState((useStatsStore as any).getInitialState());
    });

    it('starts at scale 1 with no translation', () => {
        const { result } = renderHook(() => useReplayViewport({ mapWidth: 600, mapHeight: 600, containerWidth: 600, containerHeight: 600 }));
        expect(result.current.scale).toBe(1);
        expect(result.current.tx).toBe(0);
        expect(result.current.ty).toBe(0);
    });

    it('zoomIn increases scale', () => {
        const { result } = renderHook(() => useReplayViewport({ mapWidth: 600, mapHeight: 600, containerWidth: 600, containerHeight: 600 }));
        act(() => result.current.zoomIn());
        expect(result.current.scale).toBeGreaterThan(1);
    });

    it('zoomOut decreases scale but not below MIN_SCALE (1)', () => {
        const { result } = renderHook(() => useReplayViewport({ mapWidth: 600, mapHeight: 600, containerWidth: 600, containerHeight: 600 }));
        act(() => result.current.zoomOut());
        // Already at minimum — should stay at 1
        expect(result.current.scale).toBe(1);
    });

    it('zoomIn does not exceed MAX_SCALE (50)', () => {
        const { result } = renderHook(() => useReplayViewport({ mapWidth: 600, mapHeight: 600, containerWidth: 600, containerHeight: 600 }));
        // Zoom in many times
        act(() => {
            for (let i = 0; i < 50; i++) result.current.zoomIn();
        });
        expect(result.current.scale).toBeLessThanOrEqual(50);
    });

    it('resetViewport restores defaults', () => {
        const { result } = renderHook(() => useReplayViewport({ mapWidth: 600, mapHeight: 600, containerWidth: 600, containerHeight: 600 }));
        act(() => result.current.zoomIn());
        act(() => result.current.panBy(30, 40));
        act(() => result.current.resetViewport());
        expect(result.current.scale).toBe(1);
        expect(result.current.tx).toBe(0);
        expect(result.current.ty).toBe(0);
    });

    it('attachWheelZoom zooms in toward cursor on scroll up', () => {
        const { result } = renderHook(() => useReplayViewport({ mapWidth: 600, mapHeight: 600, containerWidth: 600, containerHeight: 600 }));

        const el = document.createElement('div');
        vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({
            left: 0, top: 0, width: 600, height: 600,
            right: 600, bottom: 600, x: 0, y: 0, toJSON: () => {},
        });

        let cleanup: (() => void) | undefined;
        act(() => { cleanup = result.current.attachWheelZoom(el); });

        act(() => {
            fireEvent.wheel(el, { deltaY: -1, clientX: 300, clientY: 300 });
        });

        // Scale should have increased (scroll up = zoom in)
        expect(useStatsStore.getState().replayViewport.scale).toBeGreaterThan(1);

        cleanup?.();
    });

    it('attachWheelZoom zooms out on scroll down', () => {
        // Start at scale 5 so we can zoom out
        useStatsStore.setState({ replayViewport: { scale: 5, tx: 0, ty: 0 } });

        const { result } = renderHook(() => useReplayViewport({ mapWidth: 600, mapHeight: 600, containerWidth: 600, containerHeight: 600 }));

        const el = document.createElement('div');
        vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({
            left: 0, top: 0, width: 600, height: 600,
            right: 600, bottom: 600, x: 0, y: 0, toJSON: () => {},
        });

        let cleanup: (() => void) | undefined;
        act(() => { cleanup = result.current.attachWheelZoom(el); });

        act(() => {
            fireEvent.wheel(el, { deltaY: 1, clientX: 300, clientY: 300 });
        });

        expect(useStatsStore.getState().replayViewport.scale).toBeLessThan(5);

        cleanup?.();
    });

    it('attachWheelZoom returns a cleanup that removes the listener', () => {
        const { result } = renderHook(() => useReplayViewport({ mapWidth: 600, mapHeight: 600, containerWidth: 600, containerHeight: 600 }));
        const el = document.createElement('div');
        vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({
            left: 0, top: 0, width: 600, height: 600,
            right: 600, bottom: 600, x: 0, y: 0, toJSON: () => {},
        });

        let cleanup: (() => void) | undefined;
        act(() => { cleanup = result.current.attachWheelZoom(el); });
        act(() => { cleanup?.(); });

        // After cleanup, wheel events should not change scale
        act(() => { fireEvent.wheel(el, { deltaY: -1, clientX: 300, clientY: 300 }); });
        expect(useStatsStore.getState().replayViewport.scale).toBe(1);
    });
});
```

- [ ] **Step 2: Run to confirm new tests fail**

```bash
npx vitest run src/renderer/stats/map/hooks/__tests__/useReplayViewport.test.ts
```

Expected: new wheel zoom tests FAIL, existing tests PASS

- [ ] **Step 3: Rewrite useReplayViewport**

```ts
// src/renderer/stats/map/hooks/useReplayViewport.ts
import { useCallback } from 'react';
import { useStatsStore } from '../../statsStore';

interface UseReplayViewportArgs {
    mapWidth: number;
    mapHeight: number;
    containerWidth: number;
    containerHeight: number;
}

const ZOOM_STEP = 0.15;
const MIN_SCALE = 1;
const MAX_SCALE = 50;

export function useReplayViewport({ mapWidth, mapHeight, containerWidth, containerHeight }: UseReplayViewportArgs) {
    const setReplayViewport = useStatsStore(state => state.setReplayViewport);
    const resetReplayViewport = useStatsStore(state => state.resetReplayViewport);
    const replayViewport = useStatsStore(state => state.replayViewport);

    const zoomIn = useCallback(() => {
        const { replayViewport: prev } = useStatsStore.getState();
        setReplayViewport({ scale: Math.min(prev.scale * (1 + ZOOM_STEP * 2), MAX_SCALE) });
    }, [setReplayViewport]);

    const zoomOut = useCallback(() => {
        const { replayViewport: prev } = useStatsStore.getState();
        setReplayViewport({ scale: Math.max(prev.scale * (1 - ZOOM_STEP * 2), MIN_SCALE) });
    }, [setReplayViewport]);

    const panBy = useCallback((dx: number, dy: number) => {
        const { replayViewport: prev } = useStatsStore.getState();
        setReplayViewport({ tx: prev.tx + dx, ty: prev.ty + dy });
    }, [setReplayViewport]);

    const resetViewport = useCallback(() => { resetReplayViewport(); }, [resetReplayViewport]);

    const centerOn = useCallback((x: number, y: number) => {
        const { replayViewport: prev } = useStatsStore.getState();
        setReplayViewport({
            tx: containerWidth / 2 - x * prev.scale,
            ty: containerHeight / 2 - y * prev.scale,
        });
    }, [containerWidth, containerHeight, setReplayViewport]);

    // Returns a cleanup function. Attach to the container element for cursor-centered wheel zoom.
    // Uses the axipulse zoom algorithm: scale * (1 - sign(deltaY) * ZOOM_STEP), tx/ty adjusted
    // so the world point under the cursor stays fixed.
    const attachWheelZoom = useCallback((el: Element): (() => void) => {
        const handler = (e: Event) => {
            const we = e as WheelEvent;
            we.preventDefault();
            const { replayViewport: prev } = useStatsStore.getState();
            const rect = el.getBoundingClientRect();
            const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE,
                prev.scale * (1 - Math.sign(we.deltaY) * ZOOM_STEP)
            ));
            if (next === prev.scale) return;
            const ratio = next / prev.scale;
            // Convert screen cursor to SVG viewBox coordinates
            const svgX = ((we.clientX - rect.left) / rect.width) * mapWidth;
            const svgY = ((we.clientY - rect.top) / rect.height) * mapHeight;
            setReplayViewport({
                scale: next,
                tx: svgX * (1 - ratio) + ratio * prev.tx,
                ty: svgY * (1 - ratio) + ratio * prev.ty,
            });
        };
        el.addEventListener('wheel', handler, { passive: false });
        return () => el.removeEventListener('wheel', handler);
    }, [mapWidth, mapHeight, setReplayViewport]);

    return {
        scale: replayViewport.scale,
        tx: replayViewport.tx,
        ty: replayViewport.ty,
        zoomIn,
        zoomOut,
        panBy,
        resetViewport,
        centerOn,
        attachWheelZoom,
        mapWidth,
        mapHeight,
    };
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
npx vitest run src/renderer/stats/map/hooks/__tests__/useReplayViewport.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/renderer/stats/map/hooks/useReplayViewport.ts src/renderer/stats/map/hooks/__tests__/useReplayViewport.test.ts
git commit -m "feat(replay): update viewport zoom to axipulse range (1-50x) with cursor-centered wheel zoom"
```

---

## Task 6: Rewire ReplayView with new layout

**Files:**
- Modify: `src/renderer/stats/map/ReplayView.tsx`

No new tests — existing e2e smoke tests cover the SVG canvas presence. This task is integration wiring.

- [ ] **Step 1: Replace ReplayView.tsx entirely**

```tsx
// src/renderer/stats/map/ReplayView.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pause, Play, Maximize2, Minimize2, Plus, Minus, RotateCcw, X } from 'lucide-react';
import { useStatsStore } from '../statsStore';
import { getMapTiles, hasTileData } from '../../../shared/wvwTiles';
import { WVW_LANDMARKS } from '../../../shared/wvwLandmarks';
import { normalizeMapNameShort, formatDuration } from '../../../shared/mapUtils';
import { getProfessionIconPath } from '../../classIconUtils';
import { HeatmapLayer } from './HeatmapLayer';
import { SquadOverlay } from './SquadOverlay';
import { LayersPopover } from './LayersPopover';
import { useHeatmapData } from './hooks/useHeatmapData';
import { FightPickerBar } from './FightPickerBar';
import { ReplaySquadPanel } from './ReplaySquadPanel';
import { SyncedTimeline } from './SyncedTimeline';
import { EventOverlay } from './EventOverlay';
import { FullscreenPortal } from './FullscreenPortal';
import { useReplayPlayback } from './hooks/useReplayPlayback';
import { useReplayViewport } from './hooks/useReplayViewport';
import { useMovementData } from './hooks/useMovementData';
import { pickDefaultFightId, findClosestMember } from './replaySelectors';
import type { ReplayFightPayload } from './replayTypes';
import type { SquadMemberMovement } from '../../../shared/movementData';

interface ReplayViewProps {
    fights: ReplayFightPayload[];
}

const SPEEDS = [0.5, 1, 1.5, 2, 4] as const;

function sampleAt(member: SquadMemberMovement, pollIndex: number): [number, number] | null {
    if (!member.positions.length) return null;
    const idx = Math.max(0, Math.min(pollIndex, member.positions.length - 1));
    return member.positions[idx];
}

export const ReplayView: React.FC<ReplayViewProps> = ({ fights }) => {
    const selectedId = useStatsStore(state => state.selectedReplayFightId);
    const setSelectedReplayFight = useStatsStore(state => state.setSelectedReplayFight);
    const playhead = useStatsStore(state => state.replayPlayhead);
    const setReplayPlayhead = useStatsStore(state => state.setReplayPlayhead);
    const viewportState = useStatsStore(state => state.replayViewport);
    const setReplayFollowTarget = useStatsStore(state => state.setReplayFollowTarget);
    const layers = useStatsStore(state => state.replayLayers);
    const spotlightParty = useStatsStore(state => state.replaySpotlightParty);
    const setReplaySpotlightParty = useStatsStore(state => state.setReplaySpotlightParty);

    const [fullscreen, setFullscreen] = useState(false);
    const [pickerCollapsed, setPickerCollapsed] = useState(false);
    const [panelCollapsed, setPanelCollapsed] = useState(false);

    const mapContainerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!selectedId && fights.length) {
            const def = pickDefaultFightId(fights);
            if (def) setSelectedReplayFight(def);
        }
    }, [selectedId, fights, setSelectedReplayFight]);

    const selectedFight = useMovementData(fights, selectedId);
    const heatmap = useHeatmapData(selectedFight, layers.heatmap);
    const durationMs = selectedFight?.durationMs ?? 0;
    useReplayPlayback({ durationMs });

    const mapSize = selectedFight?.mapSize ?? [600, 600];
    const [mapWidth, mapHeight] = mapSize;
    const viewport = useReplayViewport({ mapWidth, mapHeight, containerWidth: mapWidth, containerHeight: mapHeight });

    // Attach cursor-centered wheel zoom to the map container
    useEffect(() => {
        const el = mapContainerRef.current;
        if (!el) return;
        return viewport.attachWheelZoom(el);
    }, [viewport.attachWheelZoom]);

    const pollIndex = selectedFight
        ? Math.floor(playhead.timeMs / selectedFight.movementData.pollingRate)
        : 0;

    const followMember = useMemo(() => {
        if (!selectedFight) return null;
        const key = viewportState.followTarget;
        if (!key) {
            return selectedFight.movementData.members.find(m => m.isCommander && m.inSquad) ?? null;
        }
        return selectedFight.movementData.members.find(m => (m.account || m.name) === key) ?? null;
    }, [selectedFight, viewportState.followTarget]);

    const { centerOn } = viewport;
    useEffect(() => {
        if (!followMember) return;
        const pos = sampleAt(followMember, pollIndex);
        if (pos) centerOn(pos[0], pos[1]);
    }, [followMember, pollIndex, centerOn]);

    const onCanvasClick = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
        if (!selectedFight) return;
        const svg = e.currentTarget;
        const rect = svg.getBoundingClientRect();
        const fracX = (e.clientX - rect.left) / rect.width;
        const fracY = (e.clientY - rect.top) / rect.height;
        const worldX = fracX * mapWidth;
        const worldY = fracY * mapHeight;
        const hit = findClosestMember(selectedFight.movementData.members, pollIndex, worldX, worldY, 24);
        if (hit && !hit.isEnemy) setReplayFollowTarget(hit.account || hit.name);
    }, [selectedFight, pollIndex, mapWidth, mapHeight, setReplayFollowTarget]);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === ' ' && selectedFight) {
                e.preventDefault();
                setReplayPlayhead({ playing: !playhead.playing });
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [selectedFight, playhead.playing, setReplayPlayhead]);

    const followLabel = viewportState.followTarget
        ? `Follow: ${viewportState.followTarget}`
        : (followMember ? `Follow: ${followMember.name} (commander)` : '');

    const body = (
        <div className="replay-view" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <FightPickerBar fights={fights} collapsed={pickerCollapsed} onToggle={() => setPickerCollapsed(v => !v)} />

            {!selectedFight ? (
                <div style={{ padding: 16, opacity: 0.7 }}>Pick a fight above to start replay.</div>
            ) : (
                <>
                    {/* Map + squad panel */}
                    <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>

                        {/* Map area */}
                        <div ref={mapContainerRef} style={{ flex: 1, position: 'relative', minWidth: 0, overflow: 'hidden' }}>
                            {/* Zoom + layer controls — floating left */}
                            <div style={{ position: 'absolute', top: 8, left: 8, zIndex: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
                                <button type="button" onClick={() => viewport.zoomIn()} title="Zoom in" style={ctrlBtnStyle}><Plus size={12} /></button>
                                <button type="button" onClick={() => viewport.zoomOut()} title="Zoom out" style={ctrlBtnStyle}><Minus size={12} /></button>
                                <button type="button" onClick={() => viewport.resetViewport()} title="Reset zoom" style={ctrlBtnStyle}><RotateCcw size={12} /></button>
                                <button type="button" onClick={() => setFullscreen(v => !v)} title="Fullscreen" style={ctrlBtnStyle}>
                                    {fullscreen ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
                                </button>
                                <LayersPopover />
                            </div>

                            {/* Status chips floating on map */}
                            {followLabel && (
                                <button
                                    type="button"
                                    onClick={() => setReplayFollowTarget(null)}
                                    style={{ position: 'absolute', bottom: 10, left: 10, zIndex: 10, ...chipStyle, borderColor: 'rgba(96,165,250,0.3)', color: '#93c5fd' }}
                                >
                                    {followLabel} <X size={10} style={{ marginLeft: 4 }} />
                                </button>
                            )}
                            {spotlightParty !== null && (
                                <button
                                    type="button"
                                    onClick={() => setReplaySpotlightParty(null)}
                                    style={{ position: 'absolute', top: 10, left: '50%', transform: 'translateX(-50%)', zIndex: 10, ...chipStyle, borderColor: 'rgba(251,191,36,0.3)', color: '#fbbf24' }}
                                >
                                    Spotlight: Party {spotlightParty} <X size={10} style={{ marginLeft: 4 }} />
                                </button>
                            )}

                            <svg
                                className="replay-canvas"
                                viewBox={`0 0 ${mapWidth} ${mapHeight}`}
                                onClick={onCanvasClick}
                                style={{ width: '100%', height: '100%', background: '#0c1224', cursor: 'crosshair', display: 'block' }}
                            >
                                <g transform={`translate(${viewport.tx} ${viewport.ty}) scale(${viewport.scale})`}>
                                    {selectedFight.mapKey && hasTileData(selectedFight.mapKey)
                                        ? getMapTiles(selectedFight.mapKey, 5).map((t, i) => (
                                            <image key={i} href={t.url} x={t.x} y={t.y} width={t.width} height={t.height} />
                                        ))
                                        : selectedFight.mapImageUrl && (
                                            <image href={selectedFight.mapImageUrl} x={0} y={0} width={mapWidth} height={mapHeight} />
                                        )
                                    }
                                    <HeatmapLayer raster={heatmap} mapWidth={mapWidth} mapHeight={mapHeight} mode={layers.heatmap} />
                                    {selectedFight.mapKey && (WVW_LANDMARKS[selectedFight.mapKey] ?? []).map(lm => (
                                        <g key={lm.name}>
                                            <circle cx={lm.x} cy={lm.y} r={6} fill="rgba(15,23,42,0.8)" stroke="rgba(250,204,21,0.8)" strokeWidth={1.5} />
                                            <text x={lm.x + 8} y={lm.y + 3} fontSize={9} fill="rgba(250,204,21,0.9)">{lm.name}</text>
                                        </g>
                                    ))}
                                    {selectedFight.movementData.members.map(member => {
                                        const pos = sampleAt(member, pollIndex);
                                        if (!pos) return null;
                                        const dim = spotlightParty !== null && !member.isEnemy && member.group !== spotlightParty;
                                        const trail = member.positions.slice(Math.max(0, pollIndex - 20), pollIndex + 1);
                                        const recent = member.positions.slice(Math.max(0, pollIndex - 5), pollIndex + 1);
                                        const trailStr = trail.map(p => `${p[0]},${p[1]}`).join(' ');
                                        const recentStr = recent.map(p => `${p[0]},${p[1]}`).join(' ');
                                        const color = member.isEnemy ? '#ef4444' : member.isCommander ? '#fbbf24' : '#60a5fa';
                                        const isFollow = followMember && (followMember.account || followMember.name) === (member.account || member.name);
                                        return (
                                            <g key={member.account || member.name} opacity={dim ? 0.2 : 1}>
                                                <polyline points={trailStr} fill="none" stroke={color} strokeOpacity={0.2} strokeWidth={1} strokeDasharray="2 2" />
                                                <polyline points={recentStr} fill="none" stroke={color} strokeOpacity={0.6} strokeWidth={1.5} />
                                                {isFollow && <circle cx={pos[0]} cy={pos[1]} r={16} fill="none" stroke="#fbbf24" strokeWidth={1.5} strokeOpacity={0.8} />}
                                                {member.isEnemy
                                                    ? <circle cx={pos[0]} cy={pos[1]} r={6} fill="#7f1d1d" stroke="#ef4444" strokeWidth={1.5} />
                                                    : <image href={getProfessionIconPath(member.profession) ?? undefined} x={pos[0] - 10} y={pos[1] - 10} width={20} height={20} />
                                                }
                                                {member.isCommander && (
                                                    <polygon
                                                        points={`${pos[0]},${pos[1] - 19} ${pos[0] + 5},${pos[1] - 14} ${pos[0]},${pos[1] - 9} ${pos[0] - 5},${pos[1] - 14}`}
                                                        fill="#fbbf24"
                                                    />
                                                )}
                                            </g>
                                        );
                                    })}
                                    <SquadOverlay fight={selectedFight} timeMs={playhead.timeMs} />
                                    <EventOverlay fight={selectedFight} timeMs={playhead.timeMs} />
                                </g>
                            </svg>
                        </div>

                        {/* Right squad panel */}
                        <ReplaySquadPanel
                            fight={selectedFight}
                            collapsed={panelCollapsed}
                            onToggle={() => setPanelCollapsed(v => !v)}
                        />
                    </div>

                    <SyncedTimeline fight={selectedFight} />

                    {/* Controls bar */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: 'rgba(8,17,31,0.98)', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                        <button
                            type="button"
                            aria-label={playhead.playing ? 'Pause' : 'Play'}
                            onClick={() => setReplayPlayhead({ playing: !playhead.playing })}
                        >
                            {playhead.playing ? <Pause size={16} /> : <Play size={16} />}
                        </button>
                        <select
                            value={playhead.speed}
                            onChange={(e) => setReplayPlayhead({ speed: Number(e.target.value) })}
                        >
                            {SPEEDS.map(s => <option key={s} value={s}>{s}×</option>)}
                        </select>
                        <span style={{ fontSize: 12, opacity: 0.8 }}>
                            {formatDuration(playhead.timeMs)} / {formatDuration(durationMs)}
                        </span>
                        <div style={{ flex: 1 }} />
                        <span style={{ fontSize: 10, color: '#475569' }}>{normalizeMapNameShort(selectedFight.label)}</span>
                    </div>
                </>
            )}
        </div>
    );

    return (
        <FullscreenPortal enabled={fullscreen} onExit={() => setFullscreen(false)}>
            {body}
        </FullscreenPortal>
    );
};

// Shared styles
const ctrlBtnStyle: React.CSSProperties = {
    width: 26, height: 26, borderRadius: 5,
    background: 'rgba(8,17,31,0.85)', border: '1px solid rgba(255,255,255,0.1)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    color: '#94a3b8', cursor: 'pointer', backdropFilter: 'blur(4px)',
};

const chipStyle: React.CSSProperties = {
    background: 'rgba(8,17,31,0.8)', backdropFilter: 'blur(4px)',
    border: '1px solid rgba(255,255,255,0.08)', borderRadius: 20,
    padding: '3px 10px', fontSize: 10, display: 'flex', alignItems: 'center',
    cursor: 'pointer',
};

export default ReplayView;
```

- [ ] **Step 2: Run full unit test suite**

```bash
npm run test:unit
```

Expected: all tests pass. Fix any import errors before proceeding.

- [ ] **Step 3: Run typecheck**

```bash
npm run typecheck
```

Expected: 0 errors. Fix any type errors before proceeding.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/stats/map/ReplayView.tsx
git commit -m "feat(replay): rewire ReplayView — map-first layout, collapsible picker and squad panel, diamond commander tag"
```

---

## Task 7: Cleanup — remove PartyPanel

**Files:**
- Delete: `src/renderer/stats/map/PartyPanel.tsx` (replaced by ReplaySquadPanel)
- Delete: `src/renderer/stats/map/__tests__/PartyPanel.allParties.test.tsx`

- [ ] **Step 1: Confirm PartyPanel is no longer imported anywhere**

```bash
grep -r "PartyPanel" src/
```

Expected: zero results (ReplayView no longer imports it after Task 6).

- [ ] **Step 2: Delete the files**

```bash
rm src/renderer/stats/map/PartyPanel.tsx
rm src/renderer/stats/map/__tests__/PartyPanel.allParties.test.tsx
```

- [ ] **Step 3: Run tests to confirm nothing broke**

```bash
npm run test:unit
```

Expected: all tests pass.

- [ ] **Step 4: Run typecheck**

```bash
npm run typecheck
```

Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore(replay): remove PartyPanel — replaced by ReplaySquadPanel + PartyMemberCard"
```

---

## Final check

- [ ] **Run full validate**

```bash
npm run validate
```

Expected: typecheck + lint both pass with 0 errors and 0 warnings.

- [ ] **Run e2e smoke test**

```bash
npm run test:e2e:web
```

Expected: existing replay layer toggle and spotlight tests pass.
