export type RouteDecision =
    | { kind: 'context'; directive: string }
    | { kind: 'unavailable'; reason: string }
    | { kind: 'unknown' };

// --- Pattern matchers ---

type Matcher = {
    test: (text: string) => boolean;
    decide: (text: string) => RouteDecision;
};

function lower(s: string): string {
    return s.toLowerCase();
}

const any = (...patterns: RegExp[]) => (text: string) => patterns.some(p => p.test(lower(text)));

const MATCHERS: Matcher[] = [
    // Unavailable data
    {
        test: any(
            /\brotation\b|\bcast sequence\b|\bskill order\b/,
            /\bbuilds?\b|\bgear\b|\btraits?\b|\bequipment\b|\bspecialization\b/,
            /\brallies?\b/,
            /which (skill|ability|attack) (did|should) i (use|cast|spam)/,
        ),
        decide: (text) => {
            const t = lower(text);
            if (/rotation|cast sequence|skill order/.test(t)) {
                return { kind: 'unavailable', reason: 'Player cast sequences and rotations are not tracked in arcdps logs.' };
            }
            if (/build|gear|trait|equip|spec/.test(t)) {
                return { kind: 'unavailable', reason: 'Build, gear, and trait data are not available in arcdps combat logs.' };
            }
            if (/rally/.test(t)) {
                return { kind: 'unavailable', reason: 'Rally counts are not tracked in these logs.' };
            }
            return { kind: 'unavailable', reason: 'This specific data is not available in arcdps logs.' };
        },
    },

    // Context questions — fight outcomes, totals visible in the summary
    {
        test: any(
            /did\s+(we|our\s+squad)\s+(win|lose|wipe|survive)/,
            /what\s+(was|were|is)\s+(?:the|our)\s+(outcome|result|score)/,
            /(how\s+many|total)\s+(deaths?|kills?|fights?|players?)/,
            /how\s+(long|much\s+time)\s+(was|did|took?)\s+(the\s+)?fight/,
            /\bk\/?d\b|\bkill.?death\b/,
            /(squad\s+)?(size|count|composition|how\s+many\s+(of\s+)?(us|them))/,
            /how\s+many\s+fights?\s+(did\s+we|have\s+we|were)/,
            /what\s+(fights?|logs?)\s+(do\s+(i|we)\s+have|are\s+loaded)/,
        ),
        decide: () => ({
            kind: 'context',
            directive: 'Answer directly from the fight summary data already in your context (outcomes, deaths, K/D, duration, squad size). Do NOT call any tool.',
        }),
    },
];

export function classifyQuestion(text: string): RouteDecision {
    for (const matcher of MATCHERS) {
        if (matcher.test(text)) {
            return matcher.decide(text);
        }
    }
    return { kind: 'unknown' };
}
