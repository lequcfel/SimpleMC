<template>
	<NavButton
		v-tooltip.right="selectedAccount ? selectedAccount.profile.name : formatMessage(messages.signInToMinecraft)"
		:to="onHeadClick"
		:disabled="loginDisabled"
		:aria-label="formatMessage(messages.minecraftAccount)"
		class="!rounded-lg"
	>
		<img
			:src="selectedAccount ? avatarUrl : steveHead"
			alt=""
			class="size-8 rounded-sm"
			style="image-rendering: pixelated"
			@error="($event.target as HTMLImageElement).src = steveHead"
		/>
	</NavButton>
	<NewModal ref="accountModal" :header="formatMessage(messages.minecraftAccount)" width="400px" max-width="400px">
		<div
			v-if="accounts.length === 0"
			class="flex flex-col gap-3 bg-button-bg border border-solid border-surface-5 rounded-xl p-3 mt-2"
		>
			<span>{{ formatMessage(messages.notSignedIn) }}</span>
			<Button type="colored" color="brand" :disabled="loginDisabled" @click="login()">
				<LogInIcon v-if="!loginDisabled" />
				<SpinnerIcon v-else class="animate-spin" />
				{{ formatMessage(messages.signInToMinecraft) }}
			</Button>
		</div>
		<Accordion
			v-else
			class="w-full mt-2 bg-button-bg border border-solid border-surface-5 rounded-xl overflow-clip"
			button-class="button-base w-full bg-transparent px-3 py-2 border-0 cursor-pointer"
			:open-by-default="false"
		>
			<template #title>
				<div class="flex gap-2 w-full min-w-0">
					<Avatar
						size="36px"
						:src="
							selectedAccount
								? avatarUrl
								: steveHead
						"
					/>
					<div class="flex flex-col items-start w-full min-w-0">
						<span class="truncate w-full text-left">{{
							selectedAccount ? selectedAccount.profile.name : formatMessage(messages.selectAccount)
						}}</span>
						<span class="text-secondary text-xs">{{ formatMessage(messages.minecraftAccount) }}</span>
					</div>
				</div>
			</template>
			<div class="bg-button-bg pt-1 pb-2 border-0 border-t border-solid border-surface-5">
				<template v-if="accounts.length > 0">
					<div v-for="account in accounts" :key="account.profile.id" class="flex gap-1 items-center">
						<button
							class="flex items-center flex-shrink flex-grow overflow-clip gap-2 p-2 border-0 bg-transparent cursor-pointer button-base min-w-0"
							@click="setAccount(account)"
						>
							<RadioButtonCheckedIcon
								v-if="selectedAccount && selectedAccount.profile.id === account.profile.id"
								class="w-5 h-5 text-brand shrink-0"
							/>
							<RadioButtonIcon v-else class="w-5 h-5 text-secondary shrink-0" />
							<Avatar :src="getAccountAvatarUrl(account)" size="24px" />
							<p
								class="m-0 truncate min-w-0"
								:class="
									selectedAccount && selectedAccount.profile.id === account.profile.id
										? 'text-contrast font-semibold'
										: 'text-primary'
								"
							>
								{{ account.profile.name }}
							</p>
						</button>
						<IconButton
							v-tooltip="formatMessage(messages.removeAccount)"
							type="quiet"
							color="red"
							:label="formatMessage(messages.removeAccount)"
							class="mr-2 !bg-button-bg !text-primary ![box-shadow:var(--shadow-button)] hover:!bg-red focus-visible:!bg-red hover:!text-[var(--color-accent-contrast)] focus-visible:!text-[var(--color-accent-contrast)]"
							@click="logout(account.profile.id)"
						>
							<TrashIcon />
						</IconButton>
					</div>
				</template>
				<div class="flex flex-col gap-2 px-2 pt-2">
					<Button
						v-if="accounts.length > 0"
						class="w-full !bg-button-bg !text-primary ![box-shadow:var(--shadow-button)]"
						:disabled="loginDisabled"
						@click="login()"
					>
						<PlusIcon />
						{{ formatMessage(messages.addAccount) }}
					</Button>
				</div>
			</div>
		</Accordion>
	</NewModal>
</template>

<script setup lang="ts">
import {
	LogInIcon,
	PlusIcon,
	RadioButtonCheckedIcon,
	RadioButtonIcon,
	SpinnerIcon,
	TrashIcon,
} from '@modrinth/assets'
import {
	Accordion,
	Avatar,
	Button,
	defineMessages,
	IconButton,
	NewModal,
	injectNotificationManager,
	useVIntl,
} from '@modrinth/ui'
import type { Ref } from 'vue'
import { computed, onMounted, onUnmounted, ref } from 'vue'

import steveHead from '@/assets/skins/steve-head.png'
import NavButton from '@/components/ui/NavButton.vue'

import { useAppEvent } from '@/composables/use-app-event'
import { handleSevereError } from '@/composables/use-error.js'

import {
	get_stored_accounts,
	login as login_flow,
	remove_user,
	set_default_user,
} from '@/helpers/auth'
import { getPlayerHeadUrl } from '@/helpers/rendering/player-head'
import type { Skin } from '@/helpers/skins'
import { get_available_skins } from '@/helpers/skins'

const { formatMessage } = useVIntl()
const { handleError } = injectNotificationManager()

const emit = defineEmits<{
	change: []
}>()

type MinecraftCredential = {
	active?: boolean
	profile: {
		id: string
		name: string
	}
}

const accounts: Ref<MinecraftCredential[]> = ref([])
const loginDisabled = ref(false)
const accountModal = ref<InstanceType<typeof NewModal>>()
const defaultUser = ref<string | undefined>()
const equippedSkin = ref<Skin | null>(null)
const equippedHeadUrl = ref<string>()
let headRequest = 0
let accountRequest = 0
let displayedAccountId: string | undefined

async function updateHeadUrl(skin: Skin | null) {
	const request = ++headRequest
	if (equippedHeadUrl.value) URL.revokeObjectURL(equippedHeadUrl.value)
	equippedHeadUrl.value = undefined
	if (!skin) return
	const url = await getPlayerHeadUrl(skin)
	if (request !== headRequest) URL.revokeObjectURL(url)
	else equippedHeadUrl.value = url
}

onUnmounted(() => {
	accountRequest++
	headRequest++
	if (equippedHeadUrl.value) URL.revokeObjectURL(equippedHeadUrl.value)
})

function applyStoredAccounts(userList: MinecraftCredential[]) {
	const nextId = userList.find((account) => account.active)?.profile.id
	if (nextId !== displayedAccountId) {
		displayedAccountId = nextId
		equippedSkin.value = null
		void updateHeadUrl(null)
	}
	accounts.value = [...userList].sort((a, b) => a.profile.name.localeCompare(b.profile.name))
	defaultUser.value = nextId
}

async function refreshValues() {
	const request = ++accountRequest
	const userList = await get_stored_accounts()
	if (request !== accountRequest) return
	applyStoredAccounts(userList)
	const accountId = selectedAccount.value?.profile.id
	if (!accountId) {
		equippedSkin.value = null
		void updateHeadUrl(null)
		return
	}
	void refreshSkin(accountId, request)
}

async function refreshSkin(accountId: string, request: number) {
	const current = () => request === accountRequest && selectedAccount.value?.profile.id === accountId
	try {
		const skins = await get_available_skins()
		if (!current()) return
		equippedSkin.value = skins.find((skin) => skin.is_equipped) ?? null
		await updateHeadUrl(equippedSkin.value)
	} catch {
		if (current()) {
			equippedSkin.value = null
			void updateHeadUrl(null)
		}
	} finally {
		if (current()) {
			try {
				const latest = await get_stored_accounts()
				if (current()) {
					const nextId = latest.find((account: MinecraftCredential) => account.active)?.profile.id
					if (nextId !== accountId) await refreshValues()
					else applyStoredAccounts(latest)
				}
			} catch (error) {
				console.warn('Could not refresh saved account display.', error)
			}
		}
	}
}

async function setEquippedSkin(skin: Skin) {
	accountRequest++
	equippedSkin.value = skin

	try {
		await updateHeadUrl(skin)
	} catch (error) {
		console.warn('Failed to get head render for equipped skin:', error)
	}
}

function setLoginDisabled(value: boolean) {
	loginDisabled.value = value
}

const selectedAccount = computed(() =>
	accounts.value.find((account) => account.profile.id === defaultUser.value),
)

defineExpose({
	selectedAccount,
	refreshValues,
	setEquippedSkin,
	setLoginDisabled,
	login,
	loginDisabled,
})

onMounted(() => {
	void refreshValues().catch(handleError)
})



const avatarUrl = computed(() => {
	if (equippedSkin.value?.texture_key) {
		const cachedUrl = equippedHeadUrl.value
		if (cachedUrl) {
			return cachedUrl
		}
		return `https://mc-heads.net/avatar/${equippedSkin.value.texture_key}/128`
	}
	if (selectedAccount.value?.profile?.id) {
		return `https://mc-heads.net/avatar/${selectedAccount.value.profile.id}/128`
	}
	return steveHead
})

function getAccountAvatarUrl(account: MinecraftCredential) {
	if (
		account.profile.id === selectedAccount.value?.profile?.id &&
		equippedSkin.value?.texture_key
	) {
		const cachedUrl = equippedHeadUrl.value
		if (cachedUrl) {
			return cachedUrl
		}
	}
	return `https://mc-heads.net/avatar/${account.profile.id}/128`
}

async function setAccount(account: MinecraftCredential) {
	accountRequest++
	defaultUser.value = account.profile.id
	await set_default_user(account.profile.id).catch(handleError)
	await refreshValues()
	emit('change')
}

function onHeadClick() {
	if (selectedAccount.value) accountModal.value?.show()
	else void login()
}

async function login() {
	if (loginDisabled.value) return
	loginDisabled.value = true
	try {
		const loggedIn = await login_flow()
		if (loggedIn) await setAccount(loggedIn)
	} catch (error) {
		handleSevereError(error)
	} finally {
		loginDisabled.value = false
	}
}

async function logout(id: string) {
	accountRequest++
	await remove_user(id).catch(handleError)
	await refreshValues()
	if (!selectedAccount.value && accounts.value.length > 0) {
		await setAccount(accounts.value[0])
	} else {
		emit('change')
	}
	;
}

useAppEvent('process', async (e) => {
	if (e.event === 'launched') {
		await refreshValues()
	}
})

const messages = defineMessages({
	notSignedIn: {
		id: 'minecraft-account.not-signed-in',
		defaultMessage: 'Not signed in',
	},
	addAccount: {
		id: 'minecraft-account.add-account',
		defaultMessage: 'Add account',
	},
	removeAccount: {
		id: 'minecraft-account.remove-account',
		defaultMessage: 'Remove account',
	},
	selectAccount: {
		id: 'minecraft-account.select-account',
		defaultMessage: 'Select account',
	},
	minecraftAccount: {
		id: 'minecraft-account.label',
		defaultMessage: 'Minecraft account',
	},
	signInToMinecraft: {
		id: 'minecraft-account.sign-in',
		defaultMessage: 'Sign in to Minecraft',
	},
})
</script>
