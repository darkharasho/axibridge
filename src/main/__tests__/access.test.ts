// @vitest-environment node
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createConfig, hashIdentity, type AxiConfig, type Identity } from '@axiapps/axi-config'
import { resetBlockScreenForTests } from '@axiapps/axi-config/electron'
import { recorderIdentities, startAccess, type AccessDeps } from '../access'

const quiet = { warn: () => {} }
const SERVER: Identity = { kind: 'discord_server', value: '123456789012345678' }
const GUILD = 'AAAAAAAA-1111-2222-3333-BBBBBBBBBBBB'
const ZERO = '00000000-0000-0000-0000-000000000000'
const manifest = (denylist: string[]) =>
  new Response(JSON.stringify({ version: 1, flags: {}, minVersion: null, notice: null, denylist }), { status: 200, headers: { etag: '"v1"' } })

let dir: string
let configs: AxiConfig[] = []
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'axibridge-access-'))
  resetBlockScreenForTests()
})
afterEach(async () => {
  for (const c of configs) c.close()
  configs = []
  await rm(dir, { recursive: true, force: true })
})

function makeConfig(fetchImpl: typeof fetch) {
  const c = createConfig({ appId: 'axibridge', cacheDir: dir, url: 'https://cfg.test', fetch: fetchImpl, logger: quiet })
  configs.push(c)
  return c
}

function fakeElectron() {
  const windows: any[] = []
  const BrowserWindow: any = function (this: any) {
    const win = {
      isDestroyed: () => false,
      destroy: vi.fn(),
      removeMenu: vi.fn(),
      loadURL: vi.fn(async () => {}),
      on: vi.fn(),
      webContents: { setWindowOpenHandler: vi.fn(), on: vi.fn() },
    }
    windows.push(win)
    return win
  }
  BrowserWindow.getAllWindows = () => windows
  const app = { quit: vi.fn(), on: vi.fn(), relaunch: vi.fn(), exit: vi.fn(), getPath: () => dir }
  return { electron: { app, BrowserWindow, shell: { openExternal: vi.fn(async () => {}) } } as unknown as AccessDeps['electron'], windows, app }
}

const WEBHOOK = 'https://discord.com/api/webhooks/111111111111111111/abcdef_token'
const baseDeps = (over: Partial<AccessDeps>): AccessDeps => ({
  electron: fakeElectron().electron,
  readWebhookUrls: () => [WEBHOOK],
  lookupWebhooks: async () => [SERVER],
  ...over,
})

describe('startAccess', () => {
  it('blocks at runtime when a webhook server is listed (once, persisted)', async () => {
    const config = makeConfig((async () => manifest([await hashIdentity(SERVER.kind, SERVER.value)])) as typeof fetch)
    const onBlocked = vi.fn()
    const boot = await startAccess(baseDeps({ config, onBlocked }))
    expect(boot.blocked).toBe(false)
    if (boot.blocked) return
    await config.refresh()
    await boot.gate.recheck()
    await boot.gate.recheck()
    expect(onBlocked).toHaveBeenCalledTimes(1)
    expect(onBlocked).toHaveBeenCalledWith({ persisted: true })
  })

  it('passes the webhook URLs to the lookup', async () => {
    const config = makeConfig((async () => manifest([])) as typeof fetch)
    const lookupWebhooks = vi.fn(async () => [] as Identity[])
    const boot = await startAccess(baseDeps({ config, lookupWebhooks }))
    if (boot.blocked) throw new Error('unexpected')
    await boot.gate.recheck()
    expect(lookupWebhooks).toHaveBeenCalledWith([WEBHOOK])
  })

  it('does not block clean identities', async () => {
    const config = makeConfig((async () => manifest([await hashIdentity('discord_server', '999999999999999999')])) as typeof fetch)
    const onBlocked = vi.fn()
    const boot = await startAccess(baseDeps({ config, onBlocked }))
    if (boot.blocked) throw new Error('unexpected')
    await config.refresh()
    expect(await boot.gate.recheck()).toBe(false)
    expect(onBlocked).not.toHaveBeenCalled()
  })

  it('boots into the block screen when an earlier check persisted the trip', async () => {
    const hash = await hashIdentity(SERVER.kind, SERVER.value)
    const first = makeConfig((async () => manifest([hash])) as typeof fetch)
    await first.ready()
    await first.refresh()
    expect((await first.check([SERVER])).persisted).toBe(true)
    first.close()

    const second = makeConfig((async () => { throw new Error('offline') }) as typeof fetch)
    const { electron, windows } = fakeElectron()
    const boot = await startAccess(baseDeps({ config: second, electron }))
    expect(boot).toEqual({ blocked: true })
    expect(windows).toHaveLength(1)
  })

  it('headless: a persisted trip prints to stderr and exits without a window', async () => {
    const hash = await hashIdentity(SERVER.kind, SERVER.value)
    const first = makeConfig((async () => manifest([hash])) as typeof fetch)
    await first.ready()
    await first.refresh()
    await first.check([SERVER])
    first.close()
    const second = makeConfig((async () => { throw new Error('offline') }) as typeof fetch)
    const { electron, windows, app } = fakeElectron()
    const write = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    try {
      const boot = await startAccess(baseDeps({ config: second, electron, headless: true }))
      expect(boot).toEqual({ blocked: true })
      expect(write).toHaveBeenCalledWith('Access unavailable.\n')
      expect(app.exit).toHaveBeenCalledWith(1)
      expect(windows).toHaveLength(0)
    } finally {
      write.mockRestore()
    }
  })

  it('fails open when offline with no cache', async () => {
    const config = makeConfig((async () => { throw new Error('offline') }) as typeof fetch)
    const onBlocked = vi.fn()
    const boot = await startAccess(baseDeps({ config, onBlocked, lookupWebhooks: async () => [] }))
    expect(boot.blocked).toBe(false)
    if (boot.blocked) return
    expect(await boot.gate.recheck()).toBe(false)
    expect(onBlocked).not.toHaveBeenCalled()
  })

  it('blocks when a listed log recorder is checked', async () => {
    const account: Identity = { kind: 'gw2_account', value: 'Recorder.1234' }
    const config = makeConfig((async () => manifest([await hashIdentity(account.kind, account.value)])) as typeof fetch)
    const onBlocked = vi.fn()
    const boot = await startAccess(baseDeps({ config, onBlocked, lookupWebhooks: async () => [] }))
    if (boot.blocked) throw new Error('unexpected')
    await config.refresh()
    const details = { recordedBy: 'Me', players: [{ name: 'Me', account: 'Recorder.1234', guildID: ZERO }] }
    await boot.gate.checkIdentities(recorderIdentities(details))
    expect(onBlocked).toHaveBeenCalledTimes(1)
  })
})

describe('recorderIdentities', () => {
  const players = [
    { name: 'Other', account: 'Other.1111', guildID: 'CCCCCCCC-1111-2222-3333-DDDDDDDDDDDD' },
    { name: 'Me', account: 'Mine.2222', guildID: GUILD },
  ]
  it('picks only the recording player', () => {
    expect(recorderIdentities({ recordedBy: 'Me', players })).toEqual([
      { kind: 'gw2_account', value: 'Mine.2222' },
      { kind: 'gw2_guild', value: GUILD },
    ])
  })
  it('returns only the account for a zero-GUID guild', () => {
    expect(recorderIdentities({ recordedBy: 'Me', players: [{ name: 'Me', account: 'Mine.2222', guildID: ZERO }] })).toEqual([
      { kind: 'gw2_account', value: 'Mine.2222' },
    ])
  })
  it('returns [] when no player matches or recordedBy is missing', () => {
    expect(recorderIdentities({ recordedBy: 'Nobody', players })).toEqual([])
    expect(recorderIdentities({ players })).toEqual([])
    expect(recorderIdentities({ recordedBy: 'Me' })).toEqual([])
    expect(recorderIdentities({ recordedBy: 'Me', players: 'nope' })).toEqual([])
  })
  it('reads axilog-shaped details (native recorded_by, character_name)', () => {
    expect(recorderIdentities({ native: { encounter: { recorded_by: 'Me' } }, players: [{ character_name: 'Me', account: 'Mine.2222' }] } as any)).toEqual([
      { kind: 'gw2_account', value: 'Mine.2222' },
    ])
  })
})
