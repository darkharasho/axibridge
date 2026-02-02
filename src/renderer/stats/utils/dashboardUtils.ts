import { RES_UTILITY_IDS, RES_UTILITY_NAME_MATCHES } from '../statsMetrics';

export const isResUtilitySkill = (id: number, skillMap: Record<string, { name?: string }> | undefined) => {
    if (RES_UTILITY_IDS.has(id)) {
        return true;
    }
    const entry = skillMap?.[`s${id}`] || skillMap?.[`${id}`];
    const name = entry?.name?.toLowerCase() || '';
    return RES_UTILITY_NAME_MATCHES.some((match) => name.includes(match));
};

export const isAutoAttackName = (name: string) => {
    const lowered = name.toLowerCase();
    return lowered.includes('autoattack') || lowered.includes('auto attack');
};

export const formatDurationMs = (durationMs?: number) => {
    if (!durationMs || !Number.isFinite(durationMs)) return '--:--';
    const totalSeconds = Math.max(0, Math.round(durationMs / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    if (hours > 0) {
        return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
};

export const getFightDurationLabel = (details: any, log: any) => {
    const candidates = [details?.encounterDuration, details?.duration, log?.encounterDuration];
    for (const candidate of candidates) {
        if (candidate === undefined || candidate === null) continue;
        if (typeof candidate === 'number' && Number.isFinite(candidate)) {
            return formatDurationMs(candidate);
        }
        if (typeof candidate === 'string') {
            const trimmed = candidate.trim();
            if (!trimmed) continue;
            if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(trimmed)) {
                return trimmed;
            }
            const hmsMatch = trimmed.match(/^(?:(\d+(?:\.\d+)?)\s*h(?:ours?)?)?\s*(?:(\d+(?:\.\d+)?)\s*m(?:in(?:ute)?s?)?)?\s*(?:(\d+(?:\.\d+)?)\s*s(?:ec(?:ond)?s?)?)?\s*(?:(\d+(?:\.\d+)?)\s*ms)?$/i);
            if (hmsMatch) {
                const hours = Number(hmsMatch[1] || 0);
                const minutes = Number(hmsMatch[2] || 0);
                const seconds = Number(hmsMatch[3] || 0);
                const ms = Number(hmsMatch[4] || 0);
                const totalMs = (hours * 3600 + minutes * 60 + seconds) * 1000 + ms;
                if (totalMs > 0) {
                    return formatDurationMs(totalMs);
                }
            }
            const msMatch = trimmed.match(/^(\d+(?:\.\d+)?)\s*ms$/i);
            if (msMatch) {
                return formatDurationMs(Number(msMatch[1]));
            }
            const msWordMatch = trimmed.match(/^(\d+(?:\.\d+)?)\s*(milliseconds?|msec|msecs)$/i);
            if (msWordMatch) {
                return formatDurationMs(Number(msWordMatch[1]));
            }
            const secMatch = trimmed.match(/^(\d+(?:\.\d+)?)\s*(s|sec|secs|seconds?)$/i);
            if (secMatch) {
                return formatDurationMs(Number(secMatch[1]) * 1000);
            }
            if (/^\d+(?:\.\d+)?$/.test(trimmed)) {
                return formatDurationMs(Number(trimmed));
            }
            return trimmed;
        }
    }
    return formatDurationMs(details?.durationMS);
};

export const shortenFightLabel = (label: string) => {
    const normalized = label.trim();
    const lowered = normalized.toLowerCase();
    if (lowered.includes('eternal battleground')) return 'EBG';
    if (lowered.includes('green borderlands') || lowered.includes('green alpine borderlands')) return 'Green BL';
    if (lowered.includes('blue borderlands') || lowered.includes('blue alpine borderlands')) return 'Blue BL';
    if (lowered.includes('red borderlands') || lowered.includes('red desert borderlands')) return 'Red BL';
    return normalized;
};

export const formatFightDateTime = (details: any, log: any) => {
    const raw = details?.timeStartStd || details?.timeStart || details?.timeEndStd || details?.timeEnd;
    let date: Date | null = null;
    if (typeof raw === 'string') {
        const parsed = Date.parse(raw);
        if (!Number.isNaN(parsed)) {
            date = new Date(parsed);
        }
    } else if (typeof raw === 'number' && Number.isFinite(raw)) {
        date = new Date(raw * 1000);
    } else if (typeof details?.uploadTime === 'number') {
        date = new Date(details.uploadTime * 1000);
    } else if (typeof log?.uploadTime === 'number') {
        date = new Date(log.uploadTime * 1000);
    }
    if (!date) return '';
    return date.toLocaleString(undefined, {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
};

export const formatWithCommas = (value: number, decimals = 2) =>
    value.toLocaleString(undefined, {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
    });

export const formatTopStatValue = (value: number) => {
    if (!Number.isFinite(value)) return '--';
    const absValue = Math.abs(value);
    if (absValue >= 1_000_000) {
        const compact = (value / 1_000_000);
        const formatted = compact.toFixed(2).replace(/\.?0+$/, '');
        return `${formatted}m`;
    }
    return Math.round(value).toLocaleString();
};
