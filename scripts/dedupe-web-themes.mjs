#!/usr/bin/env node
/**
 * Removes .stats-view component rules from public/web-report-themes/*.css that
 * are already defined in src/renderer/index.css under body.theme-{name} selectors.
 *
 * Usage: node scripts/dedupe-web-themes.mjs [--dry-run]
 *
 * Run this once after the initial cleanup. Going forward the contract tests
 * (src/shared/__tests__/statsThemesContract.test.ts) prevent re-introduction.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import postcss from 'postcss';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const INDEX_CSS_PATH = path.join(ROOT, 'src/renderer/index.css');
const WEB_THEMES_DIR = path.join(ROOT, 'public/web-report-themes');
const DRY_RUN = process.argv.includes('--dry-run');

// These component classes are owned by StatsView — rules targeting them inside
// .stats-view must live in index.css only.
const STATS_VIEW_COMPONENT_CLASSES = [
    'fight-diff-select',
    'squad-comp-board',
    'squad-comp-party-row',
    'squad-comp-party-badge',
    'squad-comp-player-tile',
    'squad-comp-player-account',
    'squad-comp-player-character',
    'fight-comp-board',
    'fight-comp-fight-nav',
    'fight-comp-fight-nav-item',
    'fight-comp-card',
    'fight-comp-fight-nav-item--active',
    'mvp-card',
    'stats-table-shell',
    'stats-table-layout',
    'stats-table-column-header',
    'stats-table-sidebar',
    'dense-table',
    'skill-usage-player-list',
    'spike-player-list',
    'incoming-skill-table',
];

function normalizeSelector(sel) {
    return sel.trim().replace(/\s+/g, ' ');
}

function selectsStatsViewComponent(selector) {
    if (!selector.includes('.stats-view')) return false;
    return STATS_VIEW_COMPONENT_CLASSES.some(cls => selector.includes(`.${cls}`));
}

function webToAppSelector(selector) {
    return selector.replace(/body\.web-report\.(theme-\S+)/, 'body.$1');
}

// Build index.css selector set
const indexContent = fs.readFileSync(INDEX_CSS_PATH, 'utf8');
const indexRoot = postcss.parse(indexContent);
const indexSelectors = new Set();
indexRoot.walkRules(rule => {
    indexSelectors.add(normalizeSelector(rule.selector));
});

const themeFiles = fs.readdirSync(WEB_THEMES_DIR).filter(f => f.endsWith('.css'));
let totalRemoved = 0;

for (const file of themeFiles) {
    const filePath = path.join(WEB_THEMES_DIR, file);
    const content = fs.readFileSync(filePath, 'utf8');
    const root = postcss.parse(content);

    const toRemove = [];

    root.walkRules(rule => {
        const sel = normalizeSelector(rule.selector);
        if (!selectsStatsViewComponent(sel)) return;

        const appEquivalent = webToAppSelector(sel);
        if (indexSelectors.has(appEquivalent)) {
            toRemove.push(rule);
        }
    });

    if (toRemove.length === 0) {
        console.log(`${file}: no duplicates found`);
        continue;
    }

    console.log(`${file}: removing ${toRemove.length} duplicate rules`);
    for (const rule of toRemove) {
        if (!DRY_RUN) {
            rule.remove();
        }
    }
    totalRemoved += toRemove.length;

    if (!DRY_RUN) {
        // Clean up extra blank lines left by removals
        let cleaned = root.toResult().css.replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
        fs.writeFileSync(filePath, cleaned, 'utf8');
    }
}

console.log(`\nTotal: removed ${totalRemoved} duplicate rules${DRY_RUN ? ' (dry run)' : ''}`);
