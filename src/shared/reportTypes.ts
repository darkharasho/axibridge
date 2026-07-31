export interface ReportGuild {
    id: string;
    name: string | null;
    tag: string | null;
}

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
    guild?: ReportGuild | null;
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
    guild?: ReportGuild | null;
    summary?: {
        borderlandsPct?: number | null;
        mapSlices?: Array<{ name: string; value: number; color: string }>;
        avgSquadSize?: number | null;
        avgEnemySize?: number | null;
    };
}
