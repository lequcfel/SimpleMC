/**
 * All theseus API calls return serialized values (both return values and errors);
 * So, for example, addDefaultInstance creates a blank instance object, where the Rust struct is serialized,
 *  and deserialized into a usable JS object.
 */
import { invoke } from '@tauri-apps/api/core'

const cachedTags = new Map()
const TAG_CACHE_MS = 5 * 60_000

function readTags(command) {
	const cached = cachedTags.get(command)
	if (cached?.pending) return cached.pending
	if (cached && cached.expiresAt > Date.now()) return Promise.resolve(cached.value)
	const entry = { pending: undefined, value: undefined, expiresAt: 0 }
	entry.pending = invoke(command).then((value) => {
		entry.value = value
		entry.expiresAt = Date.now() + TAG_CACHE_MS
		return value
	}).catch((error) => {
		cachedTags.delete(command)
		throw error
	}).finally(() => { entry.pending = undefined })
	cachedTags.set(command, entry)
	return entry.pending
}


// Gets cached category tags
export async function get_categories() {
	return await readTags('plugin:tags|tags_get_categories')
}

// Gets cached loaders tags
export async function get_loaders() {
	return await readTags('plugin:tags|tags_get_loaders')
}

// Gets cached game_versions tags
export async function get_game_versions() {
	return await readTags('plugin:tags|tags_get_game_versions')
}

// Gets cached donation_platforms tags
export async function get_donation_platforms() {
	return await invoke('plugin:tags|tags_get_donation_platforms')
}

// Gets cached licenses tags
export async function get_report_types() {
	return await invoke('plugin:tags|tags_get_report_types')
}
