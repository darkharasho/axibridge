import { describe, it, expect } from 'vitest'
import { classifyDegree, computePositioning, OUT_OF_POSITION } from '../positioning'

const player = (over: Record<string, unknown>) => ({ notInSquad: false, statsAll: [{}], ...over })

describe('computePositioning', () => {
  it('reports per-player distance-to-tag and out-of-position deaths', () => {
    const report = { details: { durationMS: 10000, combatReplayMetaData: { pollingRate: 150, inchToPixel: 0.01, sizes: [1000,1000] as [number,number] }, players: [
      { notInSquad: false, hasCommanderTag: true, account: 'Tag.1', combatReplayData: { positions: [[0,0],[0,0]] as [number,number][] } },
      { notInSquad: false, account: 'Stray.2', combatReplayData: { positions: [[0,0],[2000,0]] as [number,number][], down: [[150,9000]] as [number,number][], dead: [[9000,99999]] as [number,number][] } },
    ] } }
    const s = computePositioning(report)
    expect(s.degree).toBe('full')
    const stray = s.perPlayer.find(p => p.account === 'Stray.2')!
    expect(stray.peakDistToTag).toBeGreaterThan(OUT_OF_POSITION)
    expect(s.outOfPositionDeaths.some(d => d.account === 'Stray.2')).toBe(true)
  })
})

describe('squad spread, commander overextension, death clusters', () => {
  it('computes peak spread, commander overextension, and death clusters', () => {
    // pollingRate=1000ms; positions indexed by tick (1 tick = 1000ms)
    // Player A and B each go down at t=1000ms (tick 1 → position index 1 = [10,10])
    // down: [[1000, 2000]] means downStartMs=1000, linkedDeathMs=2000
    // dead: [[2000]] means deathMs=2000, which matches linkedDeathMs → valid death
    // At tick floor(1000/1000)=1, position[1]=[10,10] → death location near [10,10]
    const report = { details: { durationMS: 6000, combatReplayMetaData: { pollingRate: 1000, inchToPixel: 1, sizes: [3000,3000] as [number,number] }, players: [
      { notInSquad:false, hasCommanderTag:true, account:'Tag.1', combatReplayData:{ positions:[[0,0],[100,0],[1800,0]] as [number,number][] } },
      { notInSquad:false, account:'A.2', combatReplayData:{ positions:[[0,0],[10,10],[0,0]] as [number,number][], down:[[1000,2000]] as [number,number][], dead:[[2000]] as [number,number][] } },
      { notInSquad:false, account:'B.3', combatReplayData:{ positions:[[0,0],[10,10],[0,0]] as [number,number][], down:[[1000,2000]] as [number,number][], dead:[[2000]] as [number,number][] } },
    ] } }
    const s = computePositioning(report)
    expect(s.squad!.peakSpread!.value).toBeGreaterThan(1000)      // tag bolted at the last tick
    expect(s.commander!.peakLeadFromSquad!.value).toBeGreaterThan(1000)
    expect(s.deathClusters[0].count).toBe(2)                      // both died at ~[10,10]
    expect(s.deathClusters[0].x).toBeCloseTo(10)
    expect(s.deathClusters[0].y).toBeCloseTo(10)
  })

  it('excludes commander from perPlayer distance ranking', () => {
    const report = { details: { durationMS: 3000, combatReplayMetaData: { pollingRate: 1000, inchToPixel: 1, sizes: [3000,3000] as [number,number] }, players: [
      { notInSquad:false, hasCommanderTag:true, account:'Tag.1', combatReplayData:{ positions:[[0,0],[500,0],[1000,0]] as [number,number][] } },
      { notInSquad:false, account:'A.2', combatReplayData:{ positions:[[0,0],[100,0],[200,0]] as [number,number][] } },
    ] } }
    const s = computePositioning(report)
    expect(s.perPlayer.find(p => p.account === 'Tag.1')).toBeUndefined()
    expect(s.perPlayer.find(p => p.account === 'A.2')).toBeDefined()
  })
})

describe('figure payload', () => {
  it('omits the figure for coarse data but still gives distances', () => {
    const report = { details: { players: [ { notInSquad:false, account:'A.2', statsAll:[{ distToCom: 800 }] } ] } }
    const s = computePositioning(report)
    expect(s.degree).toBe('coarse'); expect(s.figure).toBeUndefined()
    expect(s.perPlayer.find(p=>p.account==='A.2')!.avgDistToTag).toBe(800)
  })
  it('down-samples the figure tag path to <= ~1 point/sec', () => {
    const positions = Array.from({length: 600}, (_,i)=>[i,0] as [number,number]) // 600 ticks @ 100ms = 60s
    const report = { details:{ durationMS:60000, combatReplayMetaData:{ pollingRate:100, inchToPixel:1, sizes:[1000,1000] as [number,number] }, players:[
      { notInSquad:false, hasCommanderTag:true, account:'Tag.1', combatReplayData:{ positions } } ] } }
    const s = computePositioning(report)
    expect(s.figure!.tagPath.length).toBeLessThanOrEqual(70)
  })
})

describe('classifyDegree', () => {
  it('returns "full" when a commander has replay positions', () => {
    const report = { details: { combatReplayMetaData: { pollingRate: 150, inchToPixel: 0.01 }, players: [
      player({ hasCommanderTag: true, combatReplayData: { positions: [[0,0],[1,1]] } }),
      player({ combatReplayData: { positions: [[2,2]] } }),
    ] } }
    expect(classifyDegree(report)).toBe('full')
  })
  it('returns "coarse" when only distToCom aggregates exist (no positions)', () => {
    const report = { details: { players: [ player({ statsAll: [{ distToCom: 420 }] }) ] } }
    expect(classifyDegree(report)).toBe('coarse')
  })
  it('returns "none" when neither positions nor distToCom exist', () => {
    const report = { details: { players: [ player({}) ] } }
    expect(classifyDegree(report)).toBe('none')
  })
})
