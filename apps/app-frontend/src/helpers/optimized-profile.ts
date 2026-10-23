import { invoke } from '@tauri-apps/api/core'
import { add_project_from_version, check_installed, create_vanilla_draft, list } from './instance'
import { selectLaunchInstance } from '@/composables/use-launch-profile'

const SETUP_KEY = 'SimpleMC-optimized-1.21.11-v3'
const LEGACY_SETUP_KEY = 'SimpleMC-optimized-1.21.11-v2'
const ARMOR_HUD = { name: 'armor-durability-hud', project: 'hAG5PWoN', version: 'FzBzQQRQ' }
const MODS = [
	ARMOR_HUD,
	{ name: "fabric-language-kotlin", project: "Ha28R6CL", version: "SKW1BTL3" },
	{ name: "yacl", project: "1eAoo2KR", version: "pHWDw3Vc" },
	{ name: "zoomify", project: "w7ThoJFB", version: "gI5KZI8V" },
	{ name: "fabric-api", project: "P7dR8mSH", version: "6qAuTtLR" },
	{ name: "placeholder-api", project: "eXts2L7r", version: "qxjzQ9xY" },
	{ name: "sodium", project: "AANobbMI", version: "NFkjnzWE" },
	{ name: "voxy", project: "fxxUqruK", version: "H3w2nVdU" },
	{ name: "mouse-tweaks", project: "aC3cM3Vq", version: "i1duwnJl" },
	{ name: "modmenu", project: "mOgUt4GM", version: "cLkYaVuL" },
	{ name: "sodium-extra", project: "PtjYWJkn", version: "zmsIDdn6" },
	{ name: "ferrite-core", project: "uXXizFIs", version: "Ii0gP3D8" },
	{ name: "lithium", project: "gvQqBUqZ", version: "Ow7wA0kG" },
	{ name: "entityculling", project: "NNAgCjsB", version: "CFBkR8Vm" },
	{ name: "immediatelyfast", project: "5ZwdcRci", version: "4EwhsTu7" },
]

export async function setupOptimizedProfile(refreshLibrary: () => Promise<void>) {
	if (window.localStorage.getItem(SETUP_KEY)) return
	let instances = await list()
	if (window.localStorage.getItem(LEGACY_SETUP_KEY)) {
		const existing = instances.find(instance => instance.game_version === '1.21.11' && instance.loader === 'fabric')
		if (existing) {
			if (!await check_installed(existing.id, ARMOR_HUD.project)) {
				await add_project_from_version(existing.id, ARMOR_HUD.version, 'standalone')
			}
			await refreshLibrary()
		}
		window.localStorage.setItem(SETUP_KEY, 'complete')
		return
	}
	let profile = instances.find(instance => instance.game_version === '1.21.11' && instance.loader === 'fabric')
		?? instances.find(instance => instance.game_version === '1.21.11' && instance.loader === 'vanilla')
	if (!profile) {
		await create_vanilla_draft('Minecraft 1.21.11', '1.21.11')
		instances = await list()
		profile = instances.find(instance => instance.game_version === '1.21.11' && instance.loader === 'vanilla')
	}
	if (!profile) throw new Error('Could not create the default Minecraft profile.')
	await invoke('plugin:instance|instance_prepare_fabric_draft', { instanceId: profile.id, loaderVersion: '0.19.5' })
	await refreshLibrary()
	for (const mod of MODS) {
		if (!await check_installed(profile.id, mod.project)) {
			await add_project_from_version(profile.id, mod.version, 'standalone')
		}
	}
	selectLaunchInstance(profile.id)
	window.localStorage.setItem(SETUP_KEY, 'complete')
	await refreshLibrary()
}
