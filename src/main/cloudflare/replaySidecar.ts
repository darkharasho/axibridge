/**
 * Packaging and reading of the out-of-band replay object.
 *
 * Replay data is the largest artifact a report produces — often two thirds of
 * the raw payload — and it is almost entirely repeated keys and numeric
 * position arrays, so it gzips an order of magnitude down. It ships compressed
 * to both R2 (storage cost) and GitHub Pages (where the compressed size is what
 * has to clear the blob-API limit), exactly like the slice sidecar.
 *
 * Content-Type only, never Content-Encoding: the viewer inflates these bytes
 * itself, so the browser must NOT transparently inflate them first.
 */
import { gunzipSync, gzipSync } from 'node:zlib';

export const REPLAY_SIDECAR_FILENAME = 'replay.json.gz';
/** Reports published before compression landed. Still hosted, still deletable. */
export const LEGACY_REPLAY_SIDECAR_FILENAME = 'replay.json';

export const REPLAY_SIDECAR_CONTENT_TYPE = 'application/gzip';

/** gzip's two-byte magic number, the only thing that distinguishes the formats. */
const isGzipped = (buffer: Buffer): boolean =>
    buffer.length >= 2 && buffer[0] === 0x1f && buffer[1] === 0x8b;

export const prepareReplaySidecar = (replayFights: unknown[]): { buffer: Buffer; rawBytes: number } => {
    const raw = Buffer.from(JSON.stringify({ replayFights }), 'utf8');
    return { buffer: gzipSync(raw, { level: 9 }), rawBytes: raw.length };
};

/**
 * Every R2 key a report's replay could live under, newest first. Deleting a
 * report has to sweep the legacy key too or its object lingers in the bucket,
 * billed forever, with nothing left pointing at it.
 */
export const replayObjectKeys = (reportId: string): string[] => [
    `reports/${reportId}/${REPLAY_SIDECAR_FILENAME}`,
    `reports/${reportId}/${LEGACY_REPLAY_SIDECAR_FILENAME}`
];

/**
 * Read a replay body that may or may not be compressed. Sniffing the bytes
 * rather than the URL means already-published reports keep loading without
 * anyone having to republish them.
 */
export const parseMaybeGzippedJson = (body: Buffer): any =>
    JSON.parse((isGzipped(body) ? gunzipSync(body) : body).toString('utf8'));
