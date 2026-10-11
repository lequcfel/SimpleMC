<script setup lang="ts">
import { Button, NewModal, Toggle } from '@modrinth/ui'
import { invoke } from '@tauri-apps/api/core'
import { ref } from 'vue'
import {
	appUpdateState, checkForAppUpdates, downloadAvailableAppUpdate, installAvailableAppUpdate, saveUpdatePreferences,
	updateCheckState, updatePreferences, type UpdateCheckTiming,
} from '@/providers/app-update'

const confirmation = ref<InstanceType<typeof NewModal>>()
const saving = ref(false)
const error = ref('')
function toggleUpdates(enabled: boolean) {
	if (!enabled) confirmation.value?.show()
	else saveUpdatePreferences(true, updatePreferences.value.timing)
}
async function disableUpdates() {
	saving.value = true
	error.value = ''
	try {
		await invoke('remove_enqueued_update')
		saveUpdatePreferences(false, updatePreferences.value.timing)
		appUpdateState.finishedDownloading.value = false
		appUpdateState.progress.value = 0
		appUpdateState.availableUpdate.value = null
		confirmation.value?.hide()
	} catch {
		error.value = 'Could not disable updates. Please try again.'
	} finally {
		saving.value = false
	}
}
function changeTiming(timing: UpdateCheckTiming) {
	saveUpdatePreferences(updatePreferences.value.enabled, timing)
}
const timingOptions: { value: UpdateCheckTiming; label: string }[] = [
	{ value: 'launch', label: 'On startup' },
	{ value: 'close', label: 'On exit' },
	{ value: 'both', label: 'Both' },
]
</script>

<template>
	<div class="flex flex-col gap-6">
		<h2 class="m-0 text-lg font-semibold text-contrast">Updates</h2>
		<div class="flex items-center justify-between gap-4">
			<div>
				<h3 class="m-0 text-base font-semibold text-contrast">Automatic updates</h3>
				<p class="mt-1 mb-0 text-sm text-secondary">Download new versions automatically and install them when SimpleMC closes.</p>
			</div>
			<Toggle :model-value="updatePreferences.enabled" :disabled="updateCheckState.checking || appUpdateState.downloading.value" aria-label="Automatic updates" @update:model-value="toggleUpdates" />
		</div>
		<div class="flex flex-col gap-2">
			<span id="update-check-timing-label" class="font-semibold text-contrast">Check automatically</span>
			<div role="group" aria-labelledby="update-check-timing-label" class="flex gap-1 rounded-xl bg-button-bg p-1">
				<button
					v-for="option in timingOptions"
					:key="option.value"
					type="button"
					:aria-pressed="updatePreferences.timing === option.value"
					:disabled="!updatePreferences.enabled"
					class="flex-1 rounded-lg border-0 px-3 py-2 text-sm font-semibold cursor-pointer transition-colors disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand"
					:class="updatePreferences.timing === option.value ? 'bg-brand text-accent-contrast' : 'bg-transparent text-secondary hover:bg-button-bg-hover hover:text-contrast'"
					@click="changeTiming(option.value)"
				>{{ option.label }}</button>
			</div>
			<p class="m-0 text-sm text-secondary">Choose whether SimpleMC checks when you open it, quit it, or both.</p>
		</div>
		<div class="flex flex-col items-start gap-2">
			<Button :disabled="updateCheckState.checking || appUpdateState.downloading.value" @click="checkForAppUpdates">
				{{ updateCheckState.checking ? 'Checking…' : 'Check for updates' }}
			</Button>
			<Button v-if="appUpdateState.availableUpdate.value && !appUpdateState.finishedDownloading.value" :disabled="appUpdateState.downloading.value" @click="downloadAvailableAppUpdate">
				{{ appUpdateState.downloading.value ? 'Downloading…' : 'Download update' }}
			</Button>
			<Button v-if="appUpdateState.finishedDownloading.value" @click="installAvailableAppUpdate">Restart and install update</Button>
			<p v-if="updateCheckState.message" class="m-0 text-sm text-secondary" role="status">{{ updateCheckState.message }}</p>
			<p class="m-0 text-sm text-secondary">You can always check manually, even with automatic updates disabled.</p>
		</div>
	</div>
	<NewModal ref="confirmation" header="Disable automatic updates?" width="420px">
		<div class="flex flex-col gap-4">
			<p>SimpleMC will stop checking automatically. Any downloaded update waiting to install will be cancelled. You can still check manually.</p>
			<p v-if="error" class="text-red" role="alert">{{ error }}</p>
			<div class="flex gap-2 justify-end">
				<Button :disabled="saving" @click="confirmation?.hide()">Keep enabled</Button>
				<Button color="red" :disabled="saving || appUpdateState.downloading.value" @click="disableUpdates">Disable updates</Button>
			</div>
			<p v-if="appUpdateState.downloading.value" class="text-sm text-secondary">Wait for the current download to finish before disabling updates.</p>
		</div>
	</NewModal>
</template>
