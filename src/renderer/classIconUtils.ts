import { getProfessionBase, PROFESSION_COLORS } from '../shared/professionUtils';

const iconModules = import.meta.glob<string>(
    '../../node_modules/gw2-class-icons/wiki/svg/*.svg',
    { eager: true, query: '?url', import: 'default' }
);

const iconsByName: Record<string, string> = {};
for (const [filePath, url] of Object.entries(iconModules)) {
    const name = filePath.split('/').pop()!.replace('.svg', '');
    iconsByName[name] = url;
}

export function getProfessionIconPath(profession: string | undefined | null): string | null {
    if (!profession || profession === 'Unknown') return null;
    if (PROFESSION_COLORS[profession] && iconsByName[profession]) {
        return iconsByName[profession];
    }
    const base = getProfessionBase(profession);
    if (base && base !== 'Unknown' && iconsByName[base]) {
        return iconsByName[base];
    }
    return null;
}
