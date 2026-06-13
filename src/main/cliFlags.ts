/** CLI flag parsing for the main process. Pure — testable without Electron. */
export interface CliFlags {
    headless: boolean;
}

export const parseCliFlags = (argv: string[]): CliFlags => ({
    headless: argv.includes('--headless')
});
