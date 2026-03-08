/**
 * CSS Contract Tests: Shared Stats-View Stylesheet
 *
 * Architecture:
 *   - src/renderer/index.css is imported by BOTH the Electron renderer AND the web
 *     report (via src/web/main.tsx). It is the single source of truth for all
 *     .stats-view component styling under body.theme-{name}.
 *
 *   - public/web-report-themes/{name}.css are loaded dynamically per theme in the
 *     web report only. They MUST contain only web-specific structural/layout rules
 *     (sidebar, nav, containers, CSS variables). They MUST NOT duplicate .stats-view
 *     component rules that already live in index.css.
 *
 * These tests enforce that contract so drift cannot occur silently.
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import postcss from 'postcss';

const ROOT = path.resolve(__dirname, '../../..');
const INDEX_CSS_PATH = path.join(ROOT, 'src/renderer/index.css');
const WEB_THEMES_DIR = path.join(ROOT, 'public/web-report-themes');

// Component-level class names that belong to StatsView internals.
// Rules targeting these inside .stats-view must live in index.css only.
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
    'boon-timeline',
];

// Themes expected to have stats-view component overrides in index.css.
const EXPECTED_THEMES = [
    'theme-classic',
    'theme-modern',
    'theme-crt',
    'theme-matte',
    'theme-kinetic',
    'theme-dark-glass',
] as const;


interface CssRule {
    selector: string;
    declarations: Record<string, string>;
    source?: { line?: number };
}

function parseRules(cssContent: string): CssRule[] {
    const root = postcss.parse(cssContent);
    const rules: CssRule[] = [];
    root.walkRules(rule => {
        const declarations: Record<string, string> = {};
        rule.walkDecls(decl => {
            declarations[decl.prop] = decl.value;
        });
        rules.push({
            selector: rule.selector.trim().replace(/\s+/g, ' '),
            declarations,
            source: { line: rule.source?.start?.line },
        });
    });
    return rules;
}

/** True if a selector targets a stats-view component class. */
function selectsStatsViewComponent(selector: string): boolean {
    if (!selector.includes('.stats-view')) return false;
    return STATS_VIEW_COMPONENT_CLASSES.some(cls => selector.includes(`.${cls}`));
}

/** Convert a web selector to its equivalent app selector for comparison.
 *  "body.web-report.theme-classic .stats-view .x" → "body.theme-classic .stats-view .x"
 */
function webToAppSelector(selector: string): string {
    return selector.replace(/body\.web-report\.(theme-\S+)/, 'body.$1');
}

// ---------------------------------------------------------------------------
// Contract: web-report-themes must NOT duplicate stats-view component rules
// ---------------------------------------------------------------------------

describe('Web-report-theme CSS contract: no .stats-view component duplication', () => {
    const indexCss = fs.readFileSync(INDEX_CSS_PATH, 'utf8');
    const indexRules = parseRules(indexCss);
    const indexSelectorSet = new Set(indexRules.map(r => r.selector));

    const themeFiles = fs.readdirSync(WEB_THEMES_DIR).filter(f => f.endsWith('.css'));

    for (const file of themeFiles) {
        it(`${file}: no .stats-view component rules that duplicate index.css`, () => {
            const content = fs.readFileSync(path.join(WEB_THEMES_DIR, file), 'utf8');
            const rules = parseRules(content);

            const violations: string[] = [];

            for (const rule of rules) {
                if (!selectsStatsViewComponent(rule.selector)) continue;

                const appEquivalent = webToAppSelector(rule.selector);
                if (indexSelectorSet.has(appEquivalent)) {
                    violations.push(
                        `  Duplicate at line ${rule.source?.line}: "${rule.selector}"` +
                        `\n    (already in index.css as "${appEquivalent}")`
                    );
                }
            }

            if (violations.length > 0) {
                throw new Error(
                    `${file} contains ${violations.length} .stats-view rules that duplicate index.css.\n` +
                    `Move these to index.css or remove them:\n${violations.join('\n')}`
                );
            }
        });
    }
});

// ---------------------------------------------------------------------------
// Coverage: index.css must have fight-diff-select overrides for every theme
// ---------------------------------------------------------------------------

describe('index.css coverage: fight-diff-select styled for all themes', () => {
    const indexCss = fs.readFileSync(INDEX_CSS_PATH, 'utf8');
    const indexRules = parseRules(indexCss);

    for (const theme of EXPECTED_THEMES) {
        it(`${theme} has a .fight-diff-select override`, () => {
            const selector = `body.${theme} .stats-view .fight-diff-select`;
            const found = indexRules.some(r => r.selector === selector || r.selector.startsWith(selector));
            expect(found, `Missing rule: ${selector}`).toBe(true);
        });
    }
});

// ---------------------------------------------------------------------------
// Coverage: index.css must have squad-comp overrides for all dark themes
// ---------------------------------------------------------------------------

describe('index.css coverage: squad-comp-board styled for all themes', () => {
    const indexCss = fs.readFileSync(INDEX_CSS_PATH, 'utf8');
    const indexRules = parseRules(indexCss);

    for (const theme of EXPECTED_THEMES) {
        it(`${theme} has a .squad-comp-board override`, () => {
            const selector = `body.${theme} .stats-view .squad-comp-board`;
            const found = indexRules.some(r => r.selector === selector);
            expect(found, `Missing rule: ${selector}`).toBe(true);
        });
    }
});

// ---------------------------------------------------------------------------
// Isolation: web-report-theme files should only contain body.web-report rules
// (structural / layout / variable rules scoped to the web context)
// ---------------------------------------------------------------------------

describe('Web-report-theme CSS isolation: all selectors must include .web-report or be @-rules', () => {
    const themeFiles = fs.readdirSync(WEB_THEMES_DIR).filter(f => f.endsWith('.css'));

    for (const file of themeFiles) {
        it(`${file}: all rules are web-report-scoped`, () => {
            const content = fs.readFileSync(path.join(WEB_THEMES_DIR, file), 'utf8');
            const rules = parseRules(content);

            const violations = rules.filter(
                r => !r.selector.includes('.web-report') && !r.selector.includes('@')
            );

            expect(
                violations.map(r => `line ${r.source?.line}: "${r.selector}"`),
                `${file} has selectors not scoped to .web-report`
            ).toEqual([]);
        });
    }
});

// ---------------------------------------------------------------------------
// Structural: web-report-themes must define theme-specific CSS variables
// ---------------------------------------------------------------------------

describe('Web-report-theme CSS: required CSS variables are defined', () => {
    const VARIABLE_THEMES: Array<{ file: string; vars: string[] }> = [
        {
            file: 'dark-glass.css',
            vars: ['--bg-base', '--bg-elevated', '--bg-card', '--text-primary', '--text-secondary'],
        },
        {
            file: 'matte.css',
            vars: ['--bg-base', '--bg-card', '--matte-light', '--matte-dark'],
        },
        {
            file: 'kinetic.css',
            vars: ['--bg-base', '--text-primary'],
        },
    ];

    for (const { file, vars } of VARIABLE_THEMES) {
        it(`${file}: defines required CSS custom properties`, () => {
            const content = fs.readFileSync(path.join(WEB_THEMES_DIR, file), 'utf8');

            for (const variable of vars) {
                expect(
                    content,
                    `${file} is missing CSS variable ${variable}`
                ).toContain(variable);
            }
        });
    }
});
