export function validateRepoName(value: string): string | null {
    if (!value) return 'Repository name is required.';
    if (!/^[A-Za-z0-9._-]+$/.test(value)) return 'Use letters, numbers, ., _, or - only.';
    if (value.startsWith('.') || value.endsWith('.')) return 'Name cannot start or end with a dot.';
    if (value.endsWith('.git')) return 'Name cannot end with .git.';
    return null;
}
