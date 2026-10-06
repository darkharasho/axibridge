// Access check: blocks the app when one of its identities is on the Axi
// denylist. See README "Access".
import { createAccessGate, createConfig, webhookServers, gw2GuildIdentity, type AccessGate, type AxiConfig, type Identity } from '@axiapps/axi-config'
import { blockIfTripped, handleBlocked, type ElectronLike, type RelaunchableApp } from '@axiapps/axi-config/electron'

export interface AccessDeps {
  electron: ElectronLike & { app: RelaunchableApp & { getPath(name: 'userData'): string } }
  config?: AxiConfig // tests inject one; production creates it
  onBlocked?: (info: { persisted: boolean }) => void // tests inject a spy
  /** Configured Discord webhook URLs (webhooks, report webhooks, legacy). */
  readWebhookUrls: () => unknown[]
  /** Resolves webhook URLs to Discord server identities. Defaults to the package lookup. */
  lookupWebhooks?: (urls: unknown[]) => Promise<Identity[]>
  /** Headless runs have no window: a tripped check prints to stderr and exits instead of showing the block screen. */
  headless?: boolean
}

export type AccessBoot = { blocked: true } | { blocked: false; gate: AccessGate; config: AxiConfig }

export async function startAccess(deps: AccessDeps): Promise<AccessBoot> {
  const config = deps.config ?? createConfig({ appId: 'axibridge', cacheDir: deps.electron.app.getPath('userData') })
  await config.ready()
  if (deps.headless) {
    if (config.isBlocked()) {
      process.stderr.write('Access unavailable.\n')
      deps.electron.app.exit(1)
      return { blocked: true }
    }
  } else if (blockIfTripped(deps.electron, config)) {
    return { blocked: true }
  }
  const defaultOnBlocked = (info: { persisted: boolean }) => {
    if (!deps.headless) return handleBlocked(deps.electron, config, info)
    // No window to show: stop here. A relaunch (trip saved) would exit the same way at boot.
    process.stderr.write('Access unavailable.\n')
    deps.electron.app.exit(1)
  }
  const gate = createAccessGate({ config, onBlocked: deps.onBlocked ?? defaultOnBlocked })
  const lookup = deps.lookupWebhooks ?? ((urls: unknown[]) => webhookServers(urls))
  gate.addSource('webhooks', () => lookup(deps.readWebhookUrls()))
  config.onChange(() => void gate.recheck())
  return { blocked: false, gate, config }
}

const asRecord = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object' ? (v as Record<string, unknown>) : null)

/**
 * The account and guild of the player who recorded the log. Only the player
 * whose character name equals the recorder is read; no other player and no
 * squad guild is used. Handles EI-shaped details (`recordedBy`, `name`,
 * `guildID`) and axilog-shaped details (`native.encounter.recorded_by`,
 * `character_name`, `guild_id`).
 */
export function recorderIdentities(details: { recordedBy?: unknown; players?: unknown } | null | undefined): Identity[] {
  const d = asRecord(details)
  if (!d) return []
  const native = asRecord(asRecord(asRecord(d.native)?.encounter))
  const recorder = typeof d.recordedBy === 'string' && d.recordedBy ? d.recordedBy : typeof native?.recorded_by === 'string' ? native.recorded_by : ''
  if (!recorder || !Array.isArray(d.players)) return []
  for (const entry of d.players) {
    const p = asRecord(entry)
    if (!p) continue
    const name = typeof p.name === 'string' ? p.name : p.character_name
    if (name !== recorder) continue
    const out: Identity[] = []
    if (typeof p.account === 'string' && p.account.trim()) out.push({ kind: 'gw2_account', value: p.account })
    out.push(...gw2GuildIdentity(p.guildID ?? p.guild_id))
    return out
  }
  return []
}
