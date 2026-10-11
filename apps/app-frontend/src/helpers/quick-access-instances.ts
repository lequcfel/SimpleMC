import type { GameInstance } from './types'

export function getQuickAccessInstances(instances: GameInstance[]): GameInstance[] {
	const byVersion = (a: GameInstance, b: GameInstance) =>
		b.game_version.localeCompare(a.game_version, undefined, { numeric: true }) || a.name.localeCompare(b.name)
	const releases = instances.filter(instance => ['vanilla', 'fabric'].includes(instance.loader) && /^\d+(\.\d+)*$/.test(instance.game_version)).sort(byVersion)
	const defaults = [releases[0], ...['1.21.11', '1.8.9'].map(version => releases.find(instance => instance.game_version === version))]
	const played = instances.filter(instance => instance.last_played && Number.isFinite(new Date(instance.last_played).getTime()))
		.sort((a, b) => new Date(b.last_played!).getTime() - new Date(a.last_played!).getTime() || byVersion(a, b))
	const lastPlayed = played[0]
	const eligible = new Map<string, GameInstance>()
	for (const instance of [...defaults, ...played]) {
		if (instance) eligible.set(instance.id, instance)
	}
	const remaining = [...eligible.values()].filter(instance => instance.id !== lastPlayed?.id).sort(byVersion)
	return (lastPlayed ? [lastPlayed, ...remaining] : remaining).slice(0, 5)
}
