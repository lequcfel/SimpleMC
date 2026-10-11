<script setup lang="ts">
import { computed, inject, ref, type Ref } from 'vue'
import { ChevronDownIcon, PlayIcon, SpinnerIcon } from '@modrinth/assets'
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import { create_vanilla_draft, list, run } from '@/helpers/instance'
import { useRouter } from 'vue-router'
import { launchInstanceId, selectLaunchInstance } from '@/composables/use-launch-profile'
import { instanceListQueryOptions } from '@/pages/instance/query-options'
import { handleSevereError } from '@/composables/use-error.js'

type AccountCard = {
	selectedAccount?: { profile: { id: string; name: string } }
	loginDisabled: boolean
	login: () => Promise<void>
}
const accounts = inject<Ref<AccountCard | null>>('accountsCard')
const signedIn = computed(() => !!accounts?.value?.selectedAccount)
const busy = ref(false)
const queryClient = useQueryClient()
const router = useRouter()
const instancesQuery = useQuery(instanceListQueryOptions())
const selectedInstance = computed(() => {
	const instances = instancesQuery.data.value ?? []
	return instances.find(item => item.id === launchInstanceId.value)
		?? instances.find(item => item.game_version === '1.21.11')
})
const version = computed(() => selectedInstance.value?.game_version ?? '1.21.11')
const profileName = computed(() => selectedInstance.value?.name ?? 'Minecraft 1.21.11')

async function launch() {
	if (busy.value) return
	busy.value = true
	let instanceId: string | undefined
	try {
		let instance = selectedInstance.value
		if (!instance) {
			await create_vanilla_draft('Minecraft ' + version.value, version.value)
			instance = (await list()).find(item => item.loader === 'vanilla' && item.game_version === version.value)
			await queryClient.invalidateQueries({ queryKey: ['instances'] })
		}
		if (!instance) throw new Error('Could not create the selected Minecraft instance.')
		selectLaunchInstance(instance.id)
		instanceId = instance.id
		await run(instance.id)
	} catch (error) {
		handleSevereError(error, { instanceId })
	} finally {
		busy.value = false
	}
}
</script>

<template>
	<button
		v-if="!signedIn"
		class="microsoft-login"
		:disabled="!accounts || accounts.loginDisabled"
		@click="accounts?.login()"
	>
		<SpinnerIcon v-if="accounts?.loginDisabled" class="animate-spin size-5" />
		<svg v-else viewBox="0 0 21 21" class="size-5" aria-hidden="true">
			<path fill="#f25022" d="M0 0h10v10H0z" />
			<path fill="#7fba00" d="M11 0h10v10H11z" />
			<path fill="#00a4ef" d="M0 11h10v10H0z" />
			<path fill="#ffb900" d="M11 11h10v10H11z" />
		</svg>
		{{ accounts?.loginDisabled ? 'Signing in…' : 'Login with Microsoft' }}
	</button>
	<div v-else class="launch-control">
		<button class="launch-game" :disabled="busy" @click="launch">
			<SpinnerIcon v-if="busy" class="size-4 animate-spin" />
			<PlayIcon v-else class="size-4" />
			<span class="flex flex-col items-start gap-0.5">
				<strong>{{ busy ? 'STARTING GAME…' : 'LAUNCH GAME' }}</strong>
				<span class="launch-description">{{ profileName }} · {{ selectedInstance?.loader ?? 'vanilla' }}</span>
			</span>
		</button>
		<button class="version-picker" :disabled="busy" aria-label="Choose a profile from Library" @click="router.push('/library?select=launch')">
			<span>{{ version }}</span>
			<ChevronDownIcon class="size-4" />
		</button>
	</div>
</template>

<style scoped>
.microsoft-login {
	display: flex;
	align-items: center;
	justify-content: center;
	gap: 0.75rem;
	padding: 0.6rem 0.9rem;
	border: 1px solid var(--color-button-border);
	border-radius: 0.75rem;
	background: var(--color-button-bg);
	color: var(--color-text-contrast);
	font-size: 1rem;
	font-weight: 600;
	cursor: pointer;
}
.launch-control {
	display: flex;
	border: 2px solid color-mix(in srgb, var(--color-brand) 65%, white);
	border-radius: 0.75rem;
	overflow: hidden;
	background: linear-gradient(120deg, color-mix(in srgb, var(--color-brand) 75%, black), var(--color-brand));
	box-shadow: 0 4px 0 color-mix(in srgb, var(--color-brand) 45%, black);
	color: white;
}
.launch-game {
	display: flex;
	align-items: center;
	justify-content: center;
	gap: 0.75rem;
	padding: 0.6rem 0.9rem;
	border: 0;
	background: transparent;
	color: inherit;
	cursor: pointer;
}
.launch-game strong { font-size: 1rem; font-weight: 900; }
.launch-description { font-size: 0.65rem; opacity: 0.9; }
.version-picker {
	display: flex;
	align-items: center;
	gap: 0.4rem;
	padding: 0.6rem;
	border: 0;
	border-left: 1px solid #ffffff40;
	background: #00000018;
	color: inherit;
	font-size: 0.75rem;
	cursor: pointer;
}
.launch-description { max-width: 14rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
button:disabled, select:disabled { opacity: 0.65; cursor: wait; }
button:focus-visible, select:focus-visible { outline: 2px solid white; outline-offset: -4px; }
.launch-game:hover:not(:disabled) { background: #ffffff14; }
.microsoft-login:hover:not(:disabled) { background: var(--color-button-bg-hover); }
</style>
