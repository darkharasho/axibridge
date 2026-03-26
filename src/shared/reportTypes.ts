export interface ReportMeta {
    id: string;
    title: string;
    commanders: string[];
    dateStart: string;
    dateEnd: string;
    dateLabel: string;
    generatedAt: string;
    appVersion?: string;
    trimmedSections?: string[];
}

export interface ReportPayload {
    meta: ReportMeta;
    stats: any;
}

export interface ReportIndexEntry {
    id: string;
    title: string;
    commanders: string[];
    dateStart: string;
    dateEnd: string;
    dateLabel: string;
    url: string;
    summary?: {
        borderlandsPct?: number | null;
        mapSlices?: Array<{ name: string; value: number; color: string }>;
        avgSquadSize?: number | null;
        avgEnemySize?: number | null;
    };
}
