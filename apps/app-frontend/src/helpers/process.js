/**
 * All theseus API calls return serialized values (both return values and errors);
 * So, for example, addDefaultInstance creates a blank instance object, where the Rust struct is serialized,
 *  and deserialized into a usable JS object.
 */
import { invoke } from '@tauri-apps/api/core'

let processCache
let processGeneration = 0

export function clearRunningProcessCache() {
	processGeneration++
	processCache = undefined
}


/// Gets running processes for a given instance ID
/// Returns ProcessMetadata[]
export async function get_by_instance_id(instanceId) {
	return (await get_all()).filter((process) => process.instance_id === instanceId)
}

/// Gets all running processes
/// Returns ProcessMetadata[]
export async function get_all() {
	const cached = processCache
	if (cached?.pending) return cached.pending
	if (cached && cached.expiresAt > Date.now()) return cached.value
	const generation = processGeneration
	const entry = { pending: undefined, value: [], expiresAt: 0 }
	entry.pending = invoke('plugin:process|process_get_all').then((value) => {
		if (generation !== processGeneration) return get_all()
		entry.value = value
		entry.expiresAt = Date.now() + 250
		return value
	}).catch((error) => {
		if (processCache === entry) processCache = undefined
		throw error
	}).finally(() => { entry.pending = undefined })
	processCache = entry
	return entry.pending
}

/// Kills a process by UUID
export async function kill(uuid) {
	clearRunningProcessCache()
	return await invoke('plugin:process|process_kill', { uuid })
}
