const artwork = import.meta.glob<string>('../assets/versions/*.{jpg,png}', { eager: true, query: '?url', import: 'default' })

export function getVersionArtwork(version: string): string | undefined {
	const exact = artwork[`../assets/versions/${version}.jpg`] ?? artwork[`../assets/versions/${version}.png`]
	if (exact) return exact
	const family = version.split('.').slice(0, version.startsWith('1.') ? 2 : 1).join('.')
	return artwork[`../assets/versions/${family}.jpg`]
}
