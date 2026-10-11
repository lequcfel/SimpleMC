import { computed, ref } from 'vue'
import original from '@/assets/loading/minecraft-landscape.png'
import cherry from '@/assets/backgrounds/cherry-grove.png'
import jungle from '@/assets/backgrounds/jungle-river.png'
import sunset from '@/assets/backgrounds/sunset-meadow.png'
import mountains from '@/assets/backgrounds/mountain-valley.png'

export const backgrounds = [
	{ id: 'original', name: 'Forest lake (default)', url: original },
	{ id: 'cherry', name: 'Cherry grove', url: cherry },
	{ id: 'jungle', name: 'Jungle river', url: jungle },
	{ id: 'sunset', name: 'Sunset meadow', url: sunset },
	{ id: 'mountains', name: 'Mountain valley', url: mountains },
]
const key = 'SimpleMC-background-settings'
function readSettings() {
	try {
		const parsed = JSON.parse(localStorage.getItem(key) ?? '{}')
		return parsed && typeof parsed === 'object' ? parsed : {}
	} catch { return {} }
}
const stored = readSettings()
export const backgroundSettings = ref({
	selected: backgrounds.some((b) => b.id === stored.selected) || stored.selected === 'custom' ? stored.selected : 'original',
	custom: typeof stored.custom === 'string' && (stored.custom.startsWith('data:image/') || stored.custom === 'stored') ? stored.custom : '',
	blur: stored.blur !== false,
	rotate: stored.rotate === true,
})
if (backgroundSettings.value.rotate) {
	const choices = [...backgrounds.map((b) => b.id), ...(backgroundSettings.value.custom ? ['custom'] : [])]
	const different = choices.filter((id) => id !== backgroundSettings.value.selected)
	backgroundSettings.value.selected = different[Math.floor(Math.random() * different.length)]
	try { localStorage.setItem(key, JSON.stringify(backgroundSettings.value)) } catch { /* Keep the selected background for this session. */ }
}
export function setBackgroundSettings(patch: Partial<typeof backgroundSettings.value>) {
	const next = { ...backgroundSettings.value, ...patch }
	localStorage.setItem(key, JSON.stringify({ ...next, custom: next.custom.startsWith('blob:') ? 'stored' : next.custom }))
	backgroundSettings.value = next
}
export const backgroundUrl = computed(() => backgroundSettings.value.selected === 'custom' && backgroundSettings.value.custom && backgroundSettings.value.custom !== 'stored'
	? backgroundSettings.value.custom
	: backgrounds.find((b) => b.id === backgroundSettings.value.selected)?.url ?? original)
export const backgroundStyle = computed(() => ({
	'--home-background-image': `url("${backgroundUrl.value}")`,
	'--home-background-blur': backgroundSettings.value.blur ? '8px' : '0px',
}))

function openBackgroundDatabase(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const request = indexedDB.open('SimpleMC-background-images', 1)
		request.onupgradeneeded = () => request.result.createObjectStore('images')
		request.onsuccess = () => resolve(request.result)
		request.onerror = () => reject(request.error)
	})
}
export async function saveCustomBackground(file: Blob): Promise<void> {
	const database = await openBackgroundDatabase()
	try {
		await new Promise<void>((resolve, reject) => {
			const transaction = database.transaction('images', 'readwrite')
			transaction.objectStore('images').put(file, 'custom')
			transaction.oncomplete = () => resolve()
			transaction.onerror = () => reject(transaction.error)
			transaction.onabort = () => reject(transaction.error)
		})
	} finally { database.close() }
}
async function restoreCustomBackground() {
	if (backgroundSettings.value.custom !== 'stored') return
	try {
		const database = await openBackgroundDatabase()
		try {
			const blob = await new Promise<Blob | undefined>((resolve, reject) => {
				const request = database.transaction('images', 'readonly').objectStore('images').get('custom')
				request.onsuccess = () => resolve(request.result)
				request.onerror = () => reject(request.error)
			})
			if (blob) backgroundSettings.value.custom = URL.createObjectURL(blob)
		} finally { database.close() }
	} catch (error) { console.warn('Could not restore custom background.', error) }
}
void restoreCustomBackground()
