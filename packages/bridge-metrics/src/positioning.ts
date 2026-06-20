// src/positioning.ts
export type ReplayDegree = 'full' | 'coarse' | 'none'

type AnyPlayer = { notInSquad?: boolean; hasCommanderTag?: boolean; account?: string; profession?: string
  statsAll?: Array<{ distToCom?: number; stackDist?: number }>
  combatReplayData?: { positions?: Array<[number, number]>; dead?: Array<[number, number]>; down?: Array<[number, number]>; start?: number } }
export type ParsedReport = { details?: { players?: AnyPlayer[]
  combatReplayMetaData?: { pollingRate?: number; inchToPixel?: number; sizes?: [number, number] }
  durationMS?: number } }

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
  map: { sizes: [number, number]; inchToPixel: number }
  /** Down-sampled tag path: ~1 point/sec (stride = Math.ceil(1000/pollingRate)) */
  tagPath: Array<[number, number]>
  /** Approximate bounding circle of the squad centroid over time */
  squadMass: { x: number; y: number; r: number }
  /** Death locations (reused from deathClusters source) */
  deaths: Array<[number, number]>
  /** Down positions */
  downs: Array<[number, number]>
  /** [[sec, spreadValue]] down-sampled to ~1 point/sec */
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

const clamp = (val: number, min: number, max: number) => Math.max(min, Math.min(max, val))

const squadOf = (r: ParsedReport): AnyPlayer[] => (r.details?.players ?? []).filter((p) => !p?.notInSquad)

type LinkedDeathHit = { px: number; py: number; tx: number; ty: number; downStartMs: number }

/**
 * Walk a single player's linked-death `down` events once and return, per qualifying death,
 * the player map position [px,py] and the tag map position [tx,ty] at the down tick.
 * A "linked death" is a down entry whose second value (linkedDeathMs) exists in the
 * player's dead set (built with the same `entry[0] > 0` threshold as the renderer).
 */
function linkedDeathHits(
  player: AnyPlayer,
  tagPositions: Array<[number, number]>,
  pollingRate: number,
): LinkedDeathHit[] {
  const replay = player?.combatReplayData
  if (!replay || !Array.isArray(replay.dead) || !Array.isArray(replay.down)) return []
  const playerPositions = replay.positions
  if (!Array.isArray(playerPositions) || playerPositions.length === 0) return []

  const playerStart = Number(replay.start ?? 0)
  const playerOffset = Math.floor(playerStart / pollingRate)

  const deadSet = new Set<number>()
  for (const entry of replay.dead) {
    if (Array.isArray(entry) && Number.isFinite(Number(entry[0])) && Number(entry[0]) > 0) {
      deadSet.add(Number(entry[0]))
    }
  }

  const hits: LinkedDeathHit[] = []
  for (const entry of replay.down) {
    if (!Array.isArray(entry)) continue
    const downStartMs = Number(entry[0])
    const linkedDeathMs = Number(entry[1])
    if (!Number.isFinite(downStartMs) || downStartMs < 0) continue
    if (!deadSet.has(linkedDeathMs)) continue

    const pollIndex = Math.floor(downStartMs / pollingRate)
    const playerIdx = clamp(pollIndex - playerOffset, 0, playerPositions.length - 1)
    const tagIdx = clamp(pollIndex, 0, tagPositions.length - 1)

    const [px, py] = playerPositions[playerIdx]
    const [tx, ty] = tagPositions[tagIdx]
    hits.push({ px, py, tx, ty, downStartMs })
  }
  return hits
}

export function classifyDegree(report: ParsedReport): ReplayDegree {
  const squad = squadOf(report)
  const meta = report.details?.combatReplayMetaData ?? {}
  const commander = squad.find((p) => p?.hasCommanderTag)
  const tagPositions = commander?.combatReplayData?.positions ?? []
  if (commander && tagPositions.length > 0 && (meta.pollingRate ?? 0) > 0 && (meta.inchToPixel ?? 0) > 0) return 'full'
  if (squad.some((p) => typeof p?.statsAll?.[0]?.distToCom === 'number')) return 'coarse'
  return 'none'
}

export function computePositioning(report: ParsedReport): PositioningSummary {
  const degree = classifyDegree(report)
  const squad = squadOf(report)
  const meta = report.details?.combatReplayMetaData ?? {}
  const pollingRate = (meta.pollingRate ?? 0) > 0 ? (meta.pollingRate as number) : 0
  const inchToPixel = (meta.inchToPixel ?? 0) > 0 ? (meta.inchToPixel as number) : 0

  const commander = squad.find((p) => p?.hasCommanderTag)
  const tagPositions: Array<[number, number]> = commander?.combatReplayData?.positions ?? []
  const replayUsable = !!commander && tagPositions.length > 0 && pollingRate > 0 && inchToPixel > 0

  const perPlayerMap = new Map<string, number[]>()
  const outOfPositionDeaths: OutOfPositionDeath[] = []

  if (replayUsable) {
    for (const player of squad) {
      const account = player?.account ?? 'Unknown'
      const isCommanderPlayer = !!player?.hasCommanderTag
      const playerPositions = player?.combatReplayData?.positions
      if (!Array.isArray(playerPositions) || playerPositions.length === 0) continue

      const playerStart = Number(player?.combatReplayData?.start ?? 0)
      const playerOffset = Math.floor(playerStart / pollingRate)

      // Per-tick distance samples; commander distance is always 0 (skip adding to perPlayerMap)
      const samples: number[] = []
      for (let i = 0; i < playerPositions.length; i++) {
        const tagIdx = clamp(i + playerOffset, 0, tagPositions.length - 1)
        const [px, py] = playerPositions[i]
        const [tx, ty] = tagPositions[tagIdx]
        const dist = isCommanderPlayer ? 0 : Math.hypot(px - tx, py - ty) / inchToPixel
        samples.push(dist)
      }
      // Omit commander from perPlayer — the tag shouldn't appear in the distance ranking
      if (!isCommanderPlayer) {
        const existing = perPlayerMap.get(account)
        if (existing) {
          for (const s of samples) existing.push(s)
        } else {
          perPlayerMap.set(account, samples)
        }
      }

      // Out-of-position downs/deaths (skip commander)
      if (isCommanderPlayer) continue
      for (const { px, py, tx, ty, downStartMs } of linkedDeathHits(player, tagPositions, pollingRate)) {
        const distAtDown = Math.round(Math.hypot(px - tx, py - ty) / inchToPixel)
        if (distAtDown > OUT_OF_POSITION) {
          outOfPositionDeaths.push({ account, distAtDown, atSec: Math.round(downStartMs / 1000) })
        }
      }
    }
  }

  const perPlayer: PerPlayerDistance[] = []

  if (replayUsable) {
    for (const [account, samples] of perPlayerMap) {
      if (samples.length === 0) continue
      const avg = samples.reduce((s, v) => s + v, 0) / samples.length
      const peak = Math.max(...samples)
      perPlayer.push({ account, avgDistToTag: Math.round(avg), peakDistToTag: Math.round(peak) })
    }
    perPlayer.sort((a, b) => b.peakDistToTag - a.peakDistToTag)
  } else if (degree === 'coarse') {
    // Populate from statsAll[0].distToCom (peak = avg in coarse mode)
    for (const p of squad) {
      const account = p?.account
      if (!account) continue
      const distToCom = p?.statsAll?.[0]?.distToCom
      if (typeof distToCom !== 'number') continue
      perPlayer.push({ account, avgDistToTag: distToCom, peakDistToTag: distToCom })
    }
    perPlayer.sort((a, b) => b.peakDistToTag - a.peakDistToTag)
  }

  // Only populate squad/commander/deathClusters for 'full' degree
  if (degree !== 'full' || !replayUsable) {
    return { degree, perPlayer, outOfPositionDeaths, squad: null, commander: null, deathClusters: [], figure: undefined }
  }

  // --- Squad cohesion (spread timeline) ---
  // squad members = non-commander players with positions
  const squadNonCmdr = squad.filter((p) => !p?.hasCommanderTag && Array.isArray(p?.combatReplayData?.positions) && (p.combatReplayData!.positions!.length ?? 0) > 0)
  const numTicks = tagPositions.length
  let spreadSum = 0
  let peakSpreadValue = 0
  let peakSpreadAtSec = 0

  // For commander overextension: track distance from tag to centroid per tick
  let tagToCentroidSum = 0
  let peakLeadValue = 0
  let peakLeadAtSec = 0

  // Collect death positions for death clusters (raw map coords, no inchToPixel)
  // dead entries are timestamps: [deathMs, ...]; down entries are [downStartMs, linkedDeathMs]
  // The death location is the player's position at the down tick.
  const deathCoords: Array<[number, number]> = []

  for (const player of squad) {
    for (const { px, py } of linkedDeathHits(player, tagPositions, pollingRate)) {
      deathCoords.push([px, py])
    }
  }

  for (let i = 0; i < numTicks; i++) {
    const atSec = (i * pollingRate) / 1000
    const [tx, ty] = tagPositions[i]

    // Compute spread = mean player distance to tag at this tick
    if (squadNonCmdr.length > 0) {
      let spreadAtTick = 0
      let centroidX = 0
      let centroidY = 0
      for (const player of squadNonCmdr) {
        const positions = player.combatReplayData!.positions!
        const playerStart = Number(player.combatReplayData?.start ?? 0)
        const playerOffset = Math.floor(playerStart / pollingRate)
        const pIdx = clamp(i - playerOffset, 0, positions.length - 1)
        const [px, py] = positions[pIdx]
        // spread = distance to tag / inchToPixel
        spreadAtTick += Math.hypot(px - tx, py - ty) / inchToPixel
        centroidX += px
        centroidY += py
      }
      const avgSpreadAtTick = spreadAtTick / squadNonCmdr.length
      spreadSum += avgSpreadAtTick
      if (avgSpreadAtTick > peakSpreadValue) {
        peakSpreadValue = avgSpreadAtTick
        peakSpreadAtSec = atSec
      }

      // Centroid of squad (non-commander)
      centroidX /= squadNonCmdr.length
      centroidY /= squadNonCmdr.length

      // Commander overextension: distance from tag to centroid / inchToPixel
      const tagToCentroidDist = Math.hypot(tx - centroidX, ty - centroidY) / inchToPixel
      tagToCentroidSum += tagToCentroidDist
      if (tagToCentroidDist > peakLeadValue) {
        peakLeadValue = tagToCentroidDist
        peakLeadAtSec = atSec
      }
    }
  }

  const avgSpread = numTicks > 0 ? spreadSum / numTicks : 0
  const peakAvgRatio = avgSpread > 0 ? peakSpreadValue / avgSpread : 1
  const cohesionNote = peakAvgRatio > 2.5 ? 'tight then scattered' : 'held together'

  // v1 squadFollowLag = mean over ticks of distance(tag, centroid) / inchToPixel
  const squadFollowLag = numTicks > 0 ? tagToCentroidSum / numTicks : 0

  // --- Death clusters ---
  // Bucket death positions into a 150-map-unit grid; centroid = mean of points in cell
  const CLUSTER_CELL = 150
  const cellMap = new Map<string, { sumX: number; sumY: number; count: number }>()
  for (const [x, y] of deathCoords) {
    const cellX = Math.floor(x / CLUSTER_CELL)
    const cellY = Math.floor(y / CLUSTER_CELL)
    const key = `${cellX},${cellY}`
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

  // --- Figure payload (down-sampled, full degree only) ---
  // stride = 1 point/sec: e.g. pollingRate=100ms → stride=10, 600 ticks → 60 points
  const stride = Math.ceil(1000 / pollingRate)

  // Down-sample tagPath
  const tagPath: Array<[number, number]> = []
  for (let i = 0; i < tagPositions.length; i += stride) {
    tagPath.push(tagPositions[i])
  }

  // Collect downs positions (first player position at down tick)
  const downCoords: Array<[number, number]> = []
  for (const player of squad) {
    const replay = player?.combatReplayData
    if (!replay || !Array.isArray(replay.down) || !Array.isArray(replay.positions)) continue
    const playerStart = Number(replay.start ?? 0)
    const playerOffset = Math.floor(playerStart / pollingRate)
    for (const entry of replay.down) {
      if (!Array.isArray(entry)) continue
      const downStartMs = Number(entry[0])
      if (!Number.isFinite(downStartMs) || downStartMs < 0) continue
      const pollIndex = Math.floor(downStartMs / pollingRate)
      const playerIdx = clamp(pollIndex - playerOffset, 0, replay.positions.length - 1)
      const [px, py] = replay.positions[playerIdx]
      downCoords.push([px, py])
    }
  }

  // Build spread timeline down-sampled to ~1 point/sec
  // Re-walk tag positions at stride intervals
  const spreadTimeline: Array<[number, number]> = []
  let sumMassX = 0
  let sumMassY = 0
  let massCount = 0
  let minX = Infinity; let maxX = -Infinity; let minY = Infinity; let maxY = -Infinity

  for (let i = 0; i < numTicks; i += stride) {
    const atSec = (i * pollingRate) / 1000
    const [tx, ty] = tagPositions[i]

    let spreadAtTick = 0
    let centroidX = 0
    let centroidY = 0
    for (const player of squadNonCmdr) {
      const positions = player.combatReplayData!.positions!
      const playerStart = Number(player.combatReplayData?.start ?? 0)
      const playerOffset = Math.floor(playerStart / pollingRate)
      const pIdx = clamp(i - playerOffset, 0, positions.length - 1)
      const [px, py] = positions[pIdx]
      spreadAtTick += Math.hypot(px - tx, py - ty) / inchToPixel
      centroidX += px
      centroidY += py
    }
    if (squadNonCmdr.length > 0) {
      centroidX /= squadNonCmdr.length
      centroidY /= squadNonCmdr.length
      spreadTimeline.push([atSec, Math.round(spreadAtTick / squadNonCmdr.length)])
      sumMassX += centroidX
      sumMassY += centroidY
      minX = Math.min(minX, centroidX); maxX = Math.max(maxX, centroidX)
      minY = Math.min(minY, centroidY); maxY = Math.max(maxY, centroidY)
      massCount++
    }
  }

  // squadMass: centroid of centroids + bounding-circle radius
  const massX = massCount > 0 ? sumMassX / massCount : 0
  const massY = massCount > 0 ? sumMassY / massCount : 0
  const massR = massCount > 0 ? Math.hypot(maxX - minX, maxY - minY) / 2 : 0

  const sizes = (meta.sizes ?? [0, 0]) as [number, number]

  const figure: PositioningFigure = {
    map: { sizes, inchToPixel },
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
