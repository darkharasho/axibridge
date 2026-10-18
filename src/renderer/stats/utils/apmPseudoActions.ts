/**
 * Rotation entries APM does not count: swaps, bundle and mode toggles, and
 * entries that are not a button press at all.
 *
 * The rotation lists everything arcdps (or EI's instant-cast finders) turned
 * into a cast, and that includes things nobody would call an action: a relic
 * dropping its buff, Berserk running out, a pet being spawned. The swaps are
 * real key presses, but they change what the next press does rather than do
 * anything themselves, and they inflate the professions that have them - a
 * kit engineer roughly doubles in APM against a class with one weapon swap.
 * Skill Usage still lists all of them; only APM drops them.
 *
 * Elementalist attunement swaps (5492-5495, Weaver's 43470/41166/42264/44857
 * and EI's -5..-16 dual ids) are deliberately NOT here: attuning is core
 * elementalist rotation, so it counts toward APM.
 *
 * Ids, not names: names vary by log and locale. The swap ids are EI's own
 * `SkillItem.IsSwap` set (as ported by axilog's `skill_map::is_swap`), listed
 * here instead of read from `skillMap.isSwap` so logs ingested before that
 * flag existed are filtered the same way.
 */
const PSEUDO_ACTION_IDS: ReadonlySet<number> = new Set([
    // Weapon swap.
    -2,
    // Revenant legend swaps.
    28134, 28494, 28419, 28195, 28085, 41858, 62749, 76610,
    // Shroud and other F-key transforms, entering and leaving.
    10574, 10585, // Death Shroud
    30792, 30961, // Reaper's Shroud
    62567, 62540, // Harbinger Shroud
    77238, 76933, // Ritualist's Shroud
    63155, 63251, // Specter Shadow Shroud
    31869, 31411, // Druid Celestial Avatar
    42938, 41123, // Holosmith Photon Forge
    77073, 76616, // Luminary Radiant Forge
    63344, 63147, // Untamed Unleash Pet / Unleash Ranger
    // Bundles: engineer kits, firebrand tomes.
    5802, 5812, 5805, 6020, 5904, 5927, 5933, 30800,
    44364, 42259, 41780, 46298, 41380,
    // Not a press at all: pet spawns, relic and rune triggers, buff ends.
    -28, -26, -32, -38, -40, -41,
    -42, -43, -44, -45, -46, -47, -48, -49, -50, -59,
]);

/** True for a Skill Usage id (`s<id>`) or bare id that APM should not count. */
export const isApmPseudoAction = (skillId: string | number): boolean => {
    const id = typeof skillId === 'number' ? skillId : Number(String(skillId).replace(/^s/, ''));
    return Number.isFinite(id) && PSEUDO_ACTION_IDS.has(id);
};
