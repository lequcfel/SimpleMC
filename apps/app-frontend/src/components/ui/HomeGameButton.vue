<script setup lang="ts">
import { computed, inject, ref, type Ref } from 'vue'
import { ChevronDownIcon, PlayIcon, SpinnerIcon } from '@modrinth/assets'
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import { create_vanilla_draft, list, run } from '@/helpers/instance'
import { useRouter } from 'vue-router'
import { launchInstanceId, selectLaunchInstance } from '@/composables/use-launch-profile'
import { instanceListQueryOptions } from '@/pages/instance/query-options'
import { handleSevereError } from '@/composables/use-error.js'
import { get_all as getRunningProcesses } from '@/helpers/process'

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
const processesQuery = useQuery({
	queryKey: ['running-processes'],
	queryFn: getRunningProcesses,
	networkMode: 'always',
	staleTime: 0,
})
const gameRunning = computed(() => (processesQuery.data.value?.length ?? 0) > 0)
const checkingProcesses = computed(() => processesQuery.isPending.value)
const selectedInstance = computed(() => {
	const instances = instancesQuery.data.value ?? []
	return instances.find(item => item.id === launchInstanceId.value)
		?? instances.find(item => item.game_version === '1.21.11')
})
const version = computed(() => selectedInstance.value?.game_version ?? '1.21.11')
const profileName = computed(() => selectedInstance.value?.name ?? 'Minecraft 1.21.11')
const runningInstance = computed(() => {
	const process = processesQuery.data.value?.find(item => item.instance_id === selectedInstance.value?.id)
		?? processesQuery.data.value?.[0]
	return instancesQuery.data.value?.find(item => item.id === process?.instance_id)
})
const description = computed(() => {
	const instance = gameRunning.value ? runningInstance.value : selectedInstance.value
	return instance ? `${instance.name} · ${instance.loader}` : gameRunning.value ? 'Your game is already open' : `${profileName.value} · vanilla`
})

async function launch() {
	if (!signedIn.value || busy.value || gameRunning.value || checkingProcesses.value) return
	busy.value = true
	let instanceId: string | undefined
	try {
		const processes = await getRunningProcesses()
		queryClient.setQueryData(['running-processes'], processes)
		if (processes.length) return
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
		await queryClient.invalidateQueries({ queryKey: ['running-processes'] })
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
	<div v-else class="launch-control" :data-running="gameRunning">
		<button class="launch-game" :disabled="busy || gameRunning || checkingProcesses" @click="launch">
			<span class="launch-symbol" aria-hidden="true">
				<SpinnerIcon v-if="busy || checkingProcesses" class="size-5 animate-spin" />
				<span v-else-if="gameRunning" class="running-indicator" />
				<PlayIcon v-else class="size-5" />
			</span>
			<span class="launch-label-container">
				<span class="launch-label-size flex flex-col items-start gap-0.5" aria-hidden="true">
					<strong>{{ gameRunning ? 'Minecraft is running' : busy ? 'Starting game…' : checkingProcesses ? 'Checking game…' : 'Launch game' }}</strong>
					<span class="launch-description">{{ description }}</span>
				</span>
				<strong class="launch-label" :class="{ 'launch-label-large': !gameRunning && !busy && !checkingProcesses }" aria-live="polite">{{ gameRunning ? 'Minecraft is running' : busy ? 'Starting game…' : checkingProcesses ? 'Checking game…' : 'Launch game' }}</strong>
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
	color: var(--color-contrast);
	font-size: 1rem;
	font-weight: 600;
	cursor: pointer;
}
.launch-control {
	display: flex;
	border: 1px solid var(--color-button-border);
	border-radius: 1rem;
	overflow: hidden;
	background: color-mix(in srgb, var(--color-raised-bg) 90%, transparent);
	box-shadow: 0 8px 24px #00000020;
	color: var(--color-contrast);
	transition: border-color 150ms ease;
}
.launch-control:hover, .launch-control[data-running="true"] { border-color: color-mix(in srgb, var(--color-brand) 55%, transparent); }
.launch-game {
	display: flex;
	align-items: center;
	justify-content: flex-start;
	gap: 0.75rem;
	padding: 0.75rem 1rem;
	border: 0;
	background: transparent;
	color: inherit;
	cursor: pointer;
}
.launch-game strong { font-size: 0.9375rem; font-weight: 650; }
.launch-label-container { position: relative; }
.launch-label-size { visibility: hidden; }
.launch-label { position: absolute; inset: 0; display: flex; align-items: center; white-space: nowrap; }
.launch-game .launch-label-large { font-size: 1.125rem; font-weight: 700; }
.launch-symbol { display: grid; place-items: center; width: 2rem; height: 2rem; flex-shrink: 0; border-radius: 0.625rem; background: color-mix(in srgb, var(--color-brand) 18%, transparent); color: var(--color-brand); }
.running-indicator { width: 0.625rem; height: 0.625rem; border-radius: 50%; background: currentColor; box-shadow: 0 0 0 4px color-mix(in srgb, var(--color-brand) 15%, transparent); }
.launch-description { font-size: 0.75rem; color: var(--color-secondary); }
.version-picker {
	display: flex;
	align-items: center;
	gap: 0.4rem;
	padding: 0.75rem;
	border: 0;
	border-left: 1px solid var(--color-button-border);
	background: transparent;
	color: inherit;
	font-size: 0.75rem;
	cursor: pointer;
}
.launch-description { max-width: 14rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
button:disabled { cursor: default; }
.microsoft-login:disabled, .version-picker:disabled { opacity: 0.65; }
button:focus-visible { outline: 2px solid var(--color-brand); outline-offset: -4px; }
.launch-game:hover:not(:disabled), .version-picker:hover:not(:disabled) { background: var(--color-button-bg-hover); }
.microsoft-login:hover:not(:disabled) { background: var(--color-button-bg-hover); }
</style>
