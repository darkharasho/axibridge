import { sanitizeWvwLabel, buildFightLabel, resolveMapName } from './utils/labelUtils';
import { resolveFightTimestamp } from './utils/timestampUtils';

type StripFightValue = {
    strips: number;
    stripTime: number;
    stripDownContrib: number;
};

type StripFight = {
    id: string;
    shortLabel: string;
    fullLabel: string;
    timestamp: number;
    values: Record<string, StripFightValue>;
    maxStrips: number;
    maxStripTime: number;
    maxStripDownContrib: number;
};

type StripPlayer = {
    key: string;
    account: string;
    displayName: string;
    characterName: string;
    profession: string;
    professionList: string[];
    logs: number;
    totalStrips: number;
    totalStripTime: number;
    totalStripDownContrib: number;
    peakStrips: number;
    peakStripTime: number;
    peakStripDownContrib: number;
    peakFightLabel: string;
};

export type StripSpikesData = {
    fights: StripFight[];
    players: StripPlayer[];
};

export function computeStripSpikesData(validLogs: any[], splitPlayersByClass = false): StripSpikesData {
    const fights: StripFight[] = [];
    const playerMap = new Map<string, StripPlayer>();

    validLogs
        .map((log) => ({ log, ts: resolveFightTimestamp(log?.details, log) }))
        .sort((a, b) => a.ts - b.ts)
        .forEach(({ log }, index) => {
            const details = log?.details;
            if (!details) return;

            const fightName = sanitizeWvwLabel(details.fightName || log.fightName || `Fight ${index + 1}`);
            const mapName = resolveMapName(details, log);
            const fullLabel = buildFightLabel(fightName, String(mapName || ''));
            const fightId = log.filePath || log.id || `fight-${index + 1}`;
            const shortLabel = `F${index + 1}`;
            const timestamp = resolveFightTimestamp(details, log);

            const values: Record<string, StripFightValue> = {};
            let maxStrips = 0;
            let maxStripTime = 0;
            let maxStripDownContrib = 0;

            const players = Array.isArray(details.players) ? details.players : [];
            players.forEach((player: any) => {
                if (player?.notInSquad) return;
                const account = String(player?.account || player?.name || 'Unknown');
                const characterName = String(player?.character_name || player?.display_name || player?.name || '');
                const profession = String(player?.profession || 'Unknown');
                const key = splitPlayersByClass && profession !== 'Unknown' ? `${account}::${profession}` : account;

                const support = Array.isArray(player?.support) ? player.support[0] : player?.support;
                const strips = Number(support?.boonStrips || 0);
                const stripTime = Number(support?.boonStripsTime || 0);
                const stripDownContrib = Number(support?.boonStripDownContribution || 0);

                values[key] = { strips, stripTime, stripDownContrib };

                if (strips > maxStrips) maxStrips = strips;
                if (stripTime > maxStripTime) maxStripTime = stripTime;
                if (stripDownContrib > maxStripDownContrib) maxStripDownContrib = stripDownContrib;

                const existing = playerMap.get(key);
                if (existing) {
                    existing.logs += 1;
                    existing.totalStrips += strips;
                    existing.totalStripTime += stripTime;
                    existing.totalStripDownContrib += stripDownContrib;
                    if (!existing.professionList.includes(profession)) {
                        existing.professionList.push(profession);
                    }
                    if (strips > existing.peakStrips) {
                        existing.peakStrips = strips;
                        existing.peakFightLabel = fullLabel;
                    }
                    if (stripTime > existing.peakStripTime) existing.peakStripTime = stripTime;
                    if (stripDownContrib > existing.peakStripDownContrib) existing.peakStripDownContrib = stripDownContrib;
                } else {
                    playerMap.set(key, {
                        key,
                        account,
                        displayName: account,
                        characterName,
                        profession,
                        professionList: [profession],
                        logs: 1,
                        totalStrips: strips,
                        totalStripTime: stripTime,
                        totalStripDownContrib: stripDownContrib,
                        peakStrips: strips,
                        peakStripTime: stripTime,
                        peakStripDownContrib: stripDownContrib,
                        peakFightLabel: fullLabel,
                    });
                }
            });

            fights.push({
                id: fightId,
                shortLabel,
                fullLabel,
                timestamp,
                values,
                maxStrips,
                maxStripTime,
                maxStripDownContrib,
            });
        });

    const players = Array.from(playerMap.values())
        .sort((a, b) => b.totalStrips - a.totalStrips || a.displayName.localeCompare(b.displayName));

    return { fights, players };
}
