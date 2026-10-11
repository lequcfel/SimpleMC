import { setupOptimizedProfile } from './optimized-profile'
import { create_vanilla_draft, list } from '@/helpers/instance'
import { get_game_versions } from '@/helpers/metadata'

const SETUP_KEY = 'SimpleMC-starter-instances-v2'
type Setup = { versions: string[]; complete: boolean }
let pending: Promise<void> | undefined

export function setupStarterInstances(refreshLibrary: () => Promise<void>) {
	if (pending) return pending
	pending = createStarterInstances(refreshLibrary).then(() => setupOptimizedProfile(refreshLibrary)).catch((error) => { console.error('Starter profile setup failed:', error); throw error }).finally(() => { pending = undefined })
	return pending
}

async function createStarterInstances(refreshLibrary: () => Promise<void>) {
	const stored = window.localStorage.getItem(SETUP_KEY)
	let setup: Setup | undefined = stored ? JSON.parse(stored) : undefined
	if (setup?.complete) return
	const save = () => window.localStorage.setItem(SETUP_KEY, JSON.stringify(setup))
	if (!setup) {
		const existing = await list()
		const newestExisting = existing.filter(instance => instance.loader === 'vanilla')
			.map(instance => instance.game_version).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))[0]
		const latest = newestExisting ?? (await get_game_versions()).latest.release as string
		setup = { versions: [...new Set([latest, '1.21.11', '1.21.1', '1.8.9', '1.20.6', '1.19.4', '1.7.10', '1.18.2', '1.16.5', '1.17.1', '1.12.2'])], complete: false }
		save()
	}
	for (const version of setup.versions) {
		const existing = await list()
		if (existing.some((instance) => instance.game_version === version)) continue
		await create_vanilla_draft('Minecraft ' + version, version)
		await refreshLibrary()
	}
	setup.complete = true
	save()
}
