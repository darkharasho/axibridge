import { describe, it, expect } from 'vitest';
import { fightsRepoName, shareTargetConfigured, shouldUploadToDpsReport } from '../shareTargetPolicy';

const storeOf = (values: Record<string, any>) => ({
    get: (key: string) => values[key]
});

describe('fightsRepoName', () => {
    it('derives from the reports repo so two installs cannot collide', () => {
        expect(fightsRepoName(storeOf({ githubRepoName: 'wvw-reports' }))).toBe('wvw-reports-fights');
    });

    it('prefers an explicitly stored name once one has been provisioned', () => {
        expect(fightsRepoName(storeOf({
            githubRepoName: 'wvw-reports',
            githubFightsRepoName: 'my-fights'
        }))).toBe('my-fights');
    });

    it('is null when no reports repo is connected', () => {
        expect(fightsRepoName(storeOf({}))).toBeNull();
        expect(fightsRepoName(storeOf({ githubRepoName: '   ' }))).toBeNull();
    });
});

describe('shareTargetConfigured', () => {
    it('is true on R2 alone, with no GitHub connection at all', () => {
        expect(shareTargetConfigured(storeOf({}), true)).toBe(true);
    });

    // The whole point of the Pages rung: sharing must not require Cloudflare.
    it('is true on a GitHub token plus a reports repo, without R2', () => {
        expect(shareTargetConfigured(storeOf({
            githubToken: 'ghp_x',
            githubRepoName: 'wvw-reports'
        }), false)).toBe(true);
    });

    it('is false with a token but nowhere to derive a repo name from', () => {
        expect(shareTargetConfigured(storeOf({ githubToken: 'ghp_x' }), false)).toBe(false);
    });

    it('is false with a repo but no token', () => {
        expect(shareTargetConfigured(storeOf({ githubRepoName: 'wvw-reports' }), false)).toBe(false);
    });

    it('treats a blank token as no token', () => {
        expect(shareTargetConfigured(storeOf({
            githubToken: '   ',
            githubRepoName: 'wvw-reports'
        }), false)).toBe(false);
    });
});

describe('shouldUploadToDpsReport', () => {
    const shareable = { githubToken: 'ghp_x', githubRepoName: 'wvw-reports' };

    // Every fight row carries an always-on dps.report alt link, so the upload has
    // to keep running even once sharing has somewhere to write — otherwise there
    // is no permalink for that column to point at.
    it('keeps uploading even when sharing has somewhere to write', () => {
        expect(shouldUploadToDpsReport(storeOf(shareable), false)).toBe(true);
        expect(shouldUploadToDpsReport(storeOf({}), true)).toBe(true);
    });

    // The regression this guards: a user with neither R2 nor GitHub must not go
    // from "has a link" to "has no link at all".
    it('keeps uploading as a fallback when nothing else can store a report', () => {
        expect(shouldUploadToDpsReport(storeOf({}), false)).toBe(true);
    });

    it('defaults to uploading when the setting was never written', () => {
        expect(shouldUploadToDpsReport(storeOf({}), false)).toBe(true);
    });

    // The toggle is now the ONLY thing that stops these uploads.
    it('honours an explicit opt-out, share target or not', () => {
        expect(shouldUploadToDpsReport(storeOf({ dpsReportEnabled: false }), false)).toBe(false);
        expect(shouldUploadToDpsReport(storeOf({ ...shareable, dpsReportEnabled: false }), true)).toBe(false);
    });

    it('only treats a literal false as opting out, not any falsy value', () => {
        expect(shouldUploadToDpsReport(storeOf({ dpsReportEnabled: undefined }), false)).toBe(true);
    });
});
