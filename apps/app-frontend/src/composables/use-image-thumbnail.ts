import { convertFileSrc, invoke } from '@tauri-apps/api/core'
import { type MaybeRefOrGetter, ref, toValue, watch } from 'vue'

const tasks: (() => Promise<void>)[] = []
const recentThumbnails = new Map<string, { url: string; expiresAt: number }>()
const MAX_WORKERS = 4
const MAX_RECENT_THUMBNAILS = 128
let workers = 0

function schedule(task: () => Promise<void>) {
	tasks.push(task)
	drain()
}

function drain() {
	while (workers < MAX_WORKERS && tasks.length > 0) {
		const task = tasks.shift()!
		workers++
		void task().finally(() => { workers--; drain() })
	}
}

function remember(key: string, url: string) {
	recentThumbnails.delete(key)
	recentThumbnails.set(key, { url, expiresAt: Date.now() + 15_000 })
	if (recentThumbnails.size > MAX_RECENT_THUMBNAILS) {
		recentThumbnails.delete(recentThumbnails.keys().next().value!)
	}
}

export function useImageThumbnail(
	path: MaybeRefOrGetter<string | null | undefined>,
	size: MaybeRefOrGetter<number>,
	revision: MaybeRefOrGetter<string | number | undefined> = undefined,
) {
	const thumbnail = ref<string>()
	watch(
		[() => toValue(path), () => toValue(size), () => toValue(revision)],
		([source, pixels, modified], [previousSource, previousPixels], onCleanup) => {
			if (source !== previousSource || pixels !== previousPixels) thumbnail.value = undefined
			if (!source) return
			const key = JSON.stringify([source, pixels, modified])
			const cached = recentThumbnails.get(key)
			if (cached && cached.expiresAt > Date.now()) {
				thumbnail.value = cached.url
				return
			}
			let active = true
			onCleanup(() => {
				active = false
			})
			schedule(async () => {
				if (!active) return
				try {
					const url = await invoke<string>('plugin:utils|get_image_thumbnail', {
						path: source,
						size: pixels,
					})
					remember(key, url)
					if (active) thumbnail.value = url
				} catch (error) {
					console.warn('Could not create image thumbnail', error)
					if (active) thumbnail.value = convertFileSrc(source)
				}
			})
		},
		{ immediate: true },
	)
	return thumbnail
}
