import { useMemo, useState } from 'react';

/**
 * Shared internal state for metric detail sections (OffenseSection, DefenseSection,
 * SupportSection, HealingSection, etc.).
 *
 * Extracts the boilerplate that was duplicated across 5+ section components:
 *  - sort toggle (value / fightTime)
 *  - dense-table column sort
 *  - column + player multi-select filters
 *  - derived player options (deduplicated by account)
 *  - derived filtered / selected metric lists
 *  - combined search-selected-ids Set for the SearchSelectDropdown
 */

export type SortDir = 'asc' | 'desc';
export type MetricSortKey = 'value' | 'fightTime';

export type MetricItem = {
    id: string;
    label: string;
    [key: string]: unknown;
};

export type PlayerRow = {
    account: string;
    profession?: string;
    professionList?: string[];
    [key: string]: unknown;
};

export type PlayerOption = {
    id: string;
    label: string;
    icon: React.ReactNode;
};

export type UseMetricSectionStateOptions<M extends MetricItem> = {
    /** The full metrics list (e.g. OFFENSE_METRICS). */
    metrics: M[];
    /** The player rows used to build the player-filter dropdown. */
    rows: PlayerRow[];
    /**
     * Current search string (owned by the parent, e.g. StatsView).
     * Pass '' or omit when the section has no search.
     */
    search?: string;
    /**
     * Initial column ID for the dense-table sort.
     * Defaults to `metrics[0].id` when omitted.
     */
    initialDenseSortColumnId?: string;
    /** Used to build the icon for each player option. */
    renderProfessionIcon: (
        profession: string | undefined,
        professionList?: string[],
        className?: string
    ) => React.ReactNode;
};

export type UseMetricSectionStateResult<M extends MetricItem> = {
    // ── Sort (value / fightTime header) ──────────────────────────────────────
    sortState: { key: MetricSortKey; dir: SortDir };
    updateSort: (key: MetricSortKey) => void;
    /**
     * The `aria-sort` value for a column's `<th>`. One fact - which column is
     * sorted and which way - announced and styled by the same attribute, rather
     * than a class beside it saying the same thing a second time. It lives here
     * because `sortState` does: a copy of this in every section is a copy that
     * can disagree with the state it reads.
     */
    ariaSort: (key: MetricSortKey) => 'ascending' | 'descending' | undefined;

    // ── Dense-table column sort ───────────────────────────────────────────────
    denseSort: { columnId: string; dir: SortDir };
    setDenseSort: React.Dispatch<React.SetStateAction<{ columnId: string; dir: SortDir }>>;

    // ── Column + player selection ─────────────────────────────────────────────
    selectedColumnIds: string[];
    setSelectedColumnIds: React.Dispatch<React.SetStateAction<string[]>>;
    selectedPlayers: string[];
    setSelectedPlayers: React.Dispatch<React.SetStateAction<string[]>>;

    // ── Derived metric lists ──────────────────────────────────────────────────
    /** All metrics whose label matches the current search string. */
    filteredMetrics: M[];
    /** Full column options list (id + label). */
    columnOptions: Array<{ id: string; label: string }>;
    /** Column options filtered by the current search string. */
    columnOptionsFiltered: Array<{ id: string; label: string }>;
    /**
     * The visible metrics to render in the dense table.
     * When nothing is selected this equals the full metrics list.
     */
    selectedMetrics: M[];

    // ── Player options ────────────────────────────────────────────────────────
    /** Deduplicated player options for the player-filter dropdown. */
    playerOptions: PlayerOption[];

    // ── Combined selection set ────────────────────────────────────────────────
    /**
     * A Set of `"column:<id>"` and `"player:<id>"` strings used by
     * SearchSelectDropdown to highlight active selections.
     */
    searchSelectedIds: Set<string>;
};

export function useMetricSectionState<M extends MetricItem>(
    options: UseMetricSectionStateOptions<M>
): UseMetricSectionStateResult<M> {
    const { metrics, rows, search = '', initialDenseSortColumnId, renderProfessionIcon } = options;

    // ── Internal state ────────────────────────────────────────────────────────

    const [sortState, setSortState] = useState<{ key: MetricSortKey; dir: SortDir }>({
        key: 'value',
        dir: 'desc',
    });

    const [denseSort, setDenseSort] = useState<{ columnId: string; dir: SortDir }>({
        columnId: initialDenseSortColumnId ?? metrics[0]?.id ?? 'value',
        dir: 'desc',
    });

    const [selectedColumnIds, setSelectedColumnIds] = useState<string[]>([]);
    const [selectedPlayers, setSelectedPlayers] = useState<string[]>([]);

    // ── Derived values ────────────────────────────────────────────────────────

    const updateSort = useMemo(
        () => (key: MetricSortKey) => {
            setSortState((prev) => ({
                key,
                dir: prev.key === key ? (prev.dir === 'desc' ? 'asc' : 'desc') : 'desc',
            }));
        },
        []
    );

    const ariaSort = useMemo(
        () => (key: MetricSortKey): 'ascending' | 'descending' | undefined =>
            sortState.key !== key ? undefined : sortState.dir === 'asc' ? 'ascending' : 'descending',
        [sortState]
    );

    const normalizedSearch = search.trim().toLowerCase();

    const filteredMetrics = useMemo(
        () => metrics.filter((m) => m.label.toLowerCase().includes(normalizedSearch)),
        [metrics, normalizedSearch]
    );

    const columnOptions = useMemo(
        () => metrics.map((m) => ({ id: m.id, label: m.label })),
        [metrics]
    );

    const columnOptionsFiltered = useMemo(
        () => columnOptions.filter((o) => o.label.toLowerCase().includes(normalizedSearch)),
        [columnOptions, normalizedSearch]
    );

    const selectedMetrics = useMemo(
        () =>
            selectedColumnIds.length > 0
                ? metrics.filter((m) => selectedColumnIds.includes(m.id))
                : metrics,
        [metrics, selectedColumnIds]
    );

    const playerOptions: PlayerOption[] = useMemo(
        () =>
            Array.from(new Map(rows.map((row) => [row.account, row])).values()).map((row) => ({
                id: row.account,
                label: row.account,
                icon: renderProfessionIcon(row.profession, row.professionList, 'w-3 h-3'),
            })),
        [rows, renderProfessionIcon]
    );

    const searchSelectedIds = useMemo(
        () =>
            new Set([
                ...selectedColumnIds.map((id) => `column:${id}`),
                ...selectedPlayers.map((id) => `player:${id}`),
            ]),
        [selectedColumnIds, selectedPlayers]
    );

    return {
        sortState,
        updateSort,
        ariaSort,
        denseSort,
        setDenseSort,
        selectedColumnIds,
        setSelectedColumnIds,
        selectedPlayers,
        setSelectedPlayers,
        filteredMetrics,
        columnOptions,
        columnOptionsFiltered,
        selectedMetrics,
        playerOptions,
        searchSelectedIds,
    };
}
