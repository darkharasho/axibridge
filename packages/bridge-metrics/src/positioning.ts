// src/positioning.ts
//
// Squad positioning on axilog's NATIVE replay surface.
//
// Two structural changes from the EI-shaped version this replaces, and both
// delete a class of bug rather than relocating it:
//
//   1. Samples are self-timestamped `[t_ms, x, y]`. The old code re-derived
//      each actor's first poll as `floor(start / pollingRate)` in five separate
//      loops, where `ceil` is correct — wrong for 36 of 42 players on the
//      committed fixture, shifting a whole track one 300ms tick against the
//      tag. There is no offset to derive here; every lookup is `positionAt`.
//   2. Coordinates are world inches. The old code divided pixel distances by
//      `combatReplayMetaData.inchToPixel`, which EI rounds to three decimals
//      (0.009 against a true 0.0087193), so every distance read 3.12% short.
//      There is no division here.
//
// Consequence for callers: `figure.tagPath`, `.deaths`, `.downs`, `.squadMass`
// and every distance are WORLD INCHES, and `figure.map` carries the arena
// projection instead of `{sizes, inchToPixel}`. Project at draw time with
// `worldToPixel(arena, x, y, canvasSize)`.
import {
  getArena, getPollMs, getPositionTracks, getDistanceScalars, positionAt,
  NO_DISTANCE, type ArenaProjection, type PositionTrack,
} from './nativePositioning'
import { squadEntities, type NativeEntityLike } from './nativeRoster'

export type ReplayDegree = 'full' | 'coarse' | 'none'

/** The details object, reached through `.native`. Kept loose for the migration. */
export type ParsedReport = { details?: any }

export type PerPlayerDistance = {
  account: string
  avgDistToTag: number
  peakDistToTag: number
}

export type OutOfPositionDeath = {
  account: string
  distAtDown: number
  atSec: number
}

export type SquadCohesion = {
  avgSpread: number
  peakSpread: { value: number; atSec: number }
  cohesionNote: string
}

export type CommanderOverextension = {
  account: string
  peakLeadFromSquad: { value: number; atSec: number }
  /** v1 definition: mean per-tick distance from commander to squad centroid */
  squadFollowLag: number
}

export type DeathCluster = {
  x: number
  y: number
  count: number
}

export type PositioningFigure = {
  /**
   * The static geometry a renderer needs to project the world-inch coordinates
   * below. Replaces EI's `{sizes, inchToPixel}` — both were renderer artifacts
   * (a 750px-max squeeze and a 3dp rounding) derivable from this, while this is
   * not derivable from them. `null` for maps with no arena image, where a
   * caller must fall back to a bounding box.
   */
  map: { arena: ArenaProjection | null }
  /** Down-sampled tag path in WORLD INCHES, ~1 point/sec. */
  tagPath: Array<[number, number]>
  /** Approximate bounding circle of the squad centroid over time, world inches. */
  squadMass: { x: number; y: number; r: number }
  /** Death locations in world inches. */
  deaths: Array<[number, number]>
  /** Down locations in world inches. */
  downs: Array<[number, number]>
  /** [[sec, spreadValue]] down-sampled to ~1 point/sec. */
  spread: Array<[number, number]>
  peakSpread: number
}

export type PositioningSummary = {
  degree: ReplayDegree
  perPlayer: PerPlayerDistance[]
  outOfPositionDeaths: OutOfPositionDeath[]
  squad: SquadCohesion | null
  commander: CommanderOverextension | null
  deathClusters: DeathCluster[]
  figure: PositioningFigure | undefined
}

export const OUT_OF_POSITION = 1200

/** A squad entity paired with its replay track, if it has one. */
type SquadMember = {
  entity: NativeEntityLike
  account: string
  isCommander: boolean
  track: PositionTrack | null
}

const isCommanderEntity = (e: any): boolean => {
  const c = e?.commander
  return !!c && typeof c === 'object' && Array.isArray(c.segments) && c.segments.length > 0
}

const membersOf = (report: ParsedReport): SquadMember[] => {
  const details = report.details
  const tracks = getPositionTracks(details)
  return squadEntities(details?.native ?? {}).map((entity) => ({
    entity,
    account: entity?.account ?? 'Unknown',
    isCommander: isCommanderEntity(entity),
    track: tracks.get(entity.id) ?? null,
  }))
}

/** The interval arrays on `blocks.replay.by_entity`, which exist without `--replay`. */
const intervalsFor = (details: any, entityId: number, key: 'down' | 'dead'): Array<[number, number]> => {
  const raw = details?.native?.blocks?.replay?.by_entity?.[entityId]?.[key]
  if (!Array.isArray(raw)) return []
  return raw.filter((e: any) => Array.isArray(e) && Number.isFinite(Number(e[0]))) as Array<[number, number]>
}

/**
 * The shared tick grid: `poll_ms, 2*poll_ms, …` out to the last sample of any
 * track. Never an array index — an actor polled from t=900 onward has its
 * first sample at index 0, and treating that as t=0 is exactly the bug this
 * rewrite deletes.
 */
const tickGrid = (pollMs: number, tracks: SquadMember[]): number[] => {
  let last = 0
  for (const m of tracks) {
    const s = m.track?.samples
    if (s && s.length > 0) last = Math.max(last, s[s.length - 1][0])
  }
  const out: number[] = []
  for (let t = pollMs; t <= last; t += pollMs) out.push(t)
  return out
}

export function classifyDegree(report: ParsedReport): ReplayDegree {
  const details = report.details
  const pollMs = getPollMs(details) ?? 0
  const members = membersOf(report)
  const commander = members.find((m) => m.isCommander)
  if (commander && (commander.track?.samples.length ?? 0) > 0 && pollMs > 0) return 'full'
  for (const s of getDistanceScalars(details).values()) {
    if (s.distToCom !== null && s.distToCom !== NO_DISTANCE) return 'coarse'
  }
  return 'none'
}

export function computePositioning(report: ParsedReport): PositioningSummary {
  const details = report.details
  const degree = classifyDegree(report)
  const members = membersOf(report)
  const pollMs = getPollMs(details) ?? 0
  const commander = members.find((m) => m.isCommander)
  const tagTrack = commander?.track ?? null
  const replayUsable = degree === 'full' && !!tagTrack && pollMs > 0

  const perPlayer: PerPlayerDistance[] = []
  const outOfPositionDeaths: OutOfPositionDeath[] = []

  if (!replayUsable) {
    if (degree === 'coarse') {
      // The native scalars ARE the coarse mode: axilog measures them in-core,
      // and they survive `pruneDetailsForStats` when the user turns off
      // position retention. peak = avg, since there is no per-tick series.
      const scalars = getDistanceScalars(details)
      for (const m of members) {
        if (m.isCommander) continue
        const dist = scalars.get(m.entity.id)?.distToCom
        if (dist === undefined || dist === null || dist === NO_DISTANCE) continue
        perPlayer.push({ account: m.account, avgDistToTag: Math.round(dist), peakDistToTag: Math.round(dist) })
      }
      perPlayer.sort((a, b) => b.peakDistToTag - a.peakDistToTag)
    }
    return { degree, perPlayer, outOfPositionDeaths, squad: null, commander: null, deathClusters: [], figure: undefined }
  }

  const ticks = tickGrid(pollMs, members)
  const others = members.filter((m) => !m.isCommander && (m.track?.samples.length ?? 0) > 0)

  // --- Per-player distance to tag ---
  const perPlayerSamples = new Map<string, number[]>()
  for (const m of others) {
    const samples: number[] = []
    for (const t of ticks) {
      const p = positionAt(m.track!, t)
      const tag = positionAt(tagTrack!, t)
      if (!p || !tag) continue
      samples.push(Math.hypot(p[0] - tag[0], p[1] - tag[1]))
    }
    if (samples.length === 0) continue
    const existing = perPlayerSamples.get(m.account)
    if (existing) existing.push(...samples)
    else perPlayerSamples.set(m.account, samples)
  }
  for (const [account, samples] of perPlayerSamples) {
    const avg = samples.reduce((s, v) => s + v, 0) / samples.length
    perPlayer.push({ account, avgDistToTag: Math.round(avg), peakDistToTag: Math.round(Math.max(...samples)) })
  }
  perPlayer.sort((a, b) => b.peakDistToTag - a.peakDistToTag)

  // --- Deaths and downs ---
  // Native's `dead` intervals ARE the deaths. The old code inferred them from
  // "a down entry whose linkedDeathMs appears in the dead set", a heuristic
  // that existed only because EI's `down`/`dead` arrays were unlinked.
  const deathCoords: Array<[number, number]> = []
  const downCoords: Array<[number, number]> = []
  for (const m of members) {
    if (!m.track) continue
    for (const [startMs] of intervalsFor(details, m.entity.id, 'dead')) {
      const p = positionAt(m.track, startMs)
      if (!p) continue
      deathCoords.push(p)
      if (m.isCommander) continue
      const tag = positionAt(tagTrack!, startMs)
      if (!tag) continue
      const distAtDown = Math.round(Math.hypot(p[0] - tag[0], p[1] - tag[1]))
      if (distAtDown > OUT_OF_POSITION) {
        outOfPositionDeaths.push({ account: m.account, distAtDown, atSec: Math.round(startMs / 1000) })
      }
    }
    for (const [startMs] of intervalsFor(details, m.entity.id, 'down')) {
      const p = positionAt(m.track, startMs)
      if (p) downCoords.push(p)
    }
  }

  // --- Squad cohesion and commander overextension, per tick ---
  let spreadSum = 0
  let peakSpreadValue = 0
  let peakSpreadAtSec = 0
  let tagToCentroidSum = 0
  let peakLeadValue = 0
  let peakLeadAtSec = 0
  let measuredTicks = 0

  const stride = Math.max(1, Math.ceil(1000 / pollMs))
  const spreadTimeline: Array<[number, number]> = []
  let sumMassX = 0
  let sumMassY = 0
  let massCount = 0
  let minX = Infinity; let maxX = -Infinity; let minY = Infinity; let maxY = -Infinity
  const tagPath: Array<[number, number]> = []

  ticks.forEach((t, i) => {
    const tag = positionAt(tagTrack!, t)
    if (!tag) return
    const atSec = t / 1000
    const sampled = i % stride === 0
    if (sampled) tagPath.push([tag[0], tag[1]])

    let spreadAtTick = 0
    let centroidX = 0
    let centroidY = 0
    let n = 0
    for (const m of others) {
      const p = positionAt(m.track!, t)
      if (!p) continue
      spreadAtTick += Math.hypot(p[0] - tag[0], p[1] - tag[1])
      centroidX += p[0]
      centroidY += p[1]
      n++
    }
    if (n === 0) return

    const avgSpreadAtTick = spreadAtTick / n
    spreadSum += avgSpreadAtTick
    measuredTicks++
    if (avgSpreadAtTick > peakSpreadValue) {
      peakSpreadValue = avgSpreadAtTick
      peakSpreadAtSec = atSec
    }

    centroidX /= n
    centroidY /= n
    const tagToCentroid = Math.hypot(tag[0] - centroidX, tag[1] - centroidY)
    tagToCentroidSum += tagToCentroid
    if (tagToCentroid > peakLeadValue) {
      peakLeadValue = tagToCentroid
      peakLeadAtSec = atSec
    }

    if (sampled) {
      spreadTimeline.push([atSec, Math.round(avgSpreadAtTick)])
      sumMassX += centroidX
      sumMassY += centroidY
      minX = Math.min(minX, centroidX); maxX = Math.max(maxX, centroidX)
      minY = Math.min(minY, centroidY); maxY = Math.max(maxY, centroidY)
      massCount++
    }
  })

  const avgSpread = measuredTicks > 0 ? spreadSum / measuredTicks : 0
  const peakAvgRatio = avgSpread > 0 ? peakSpreadValue / avgSpread : 1
  const cohesionNote = peakAvgRatio > 2.5 ? 'tight then scattered' : 'held together'
  const squadFollowLag = measuredTicks > 0 ? tagToCentroidSum / measuredTicks : 0

  // --- Death clusters: 150-INCH grid (the old 150 was map units) ---
  const CLUSTER_CELL = 150
  const cellMap = new Map<string, { sumX: number; sumY: number; count: number }>()
  for (const [x, y] of deathCoords) {
    const key = `${Math.floor(x / CLUSTER_CELL)},${Math.floor(y / CLUSTER_CELL)}`
    const existing = cellMap.get(key)
    if (existing) {
      existing.sumX += x
      existing.sumY += y
      existing.count++
    } else {
      cellMap.set(key, { sumX: x, sumY: y, count: 1 })
    }
  }
  const deathClusters = Array.from(cellMap.values())
    .map(({ sumX, sumY, count }) => ({ x: sumX / count, y: sumY / count, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6)

  const massX = massCount > 0 ? sumMassX / massCount : 0
  const massY = massCount > 0 ? sumMassY / massCount : 0
  const massR = massCount > 0 ? Math.hypot(maxX - minX, maxY - minY) / 2 : 0

  const figure: PositioningFigure = {
    map: { arena: getArena(details) },
    tagPath,
    squadMass: { x: Math.round(massX), y: Math.round(massY), r: Math.round(massR) },
    deaths: deathCoords,
    downs: downCoords,
    spread: spreadTimeline,
    peakSpread: Math.round(peakSpreadValue),
  }

  return {
    degree,
    perPlayer,
    outOfPositionDeaths,
    squad: {
      avgSpread: Math.round(avgSpread),
      peakSpread: { value: Math.round(peakSpreadValue), atSec: peakSpreadAtSec },
      cohesionNote,
    },
    commander: {
      account: commander?.account ?? 'Unknown',
      peakLeadFromSquad: { value: Math.round(peakLeadValue), atSec: peakLeadAtSec },
      squadFollowLag: Math.round(squadFollowLag),
    },
    deathClusters,
    figure,
  }
}
