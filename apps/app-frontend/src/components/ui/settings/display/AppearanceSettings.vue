<script setup lang="ts">
import {
	AppearanceSettingsLayout,
	Button,
	defineMessages,
	useVIntl,
	provideAppearanceSettings,
	useSavable,
} from '@modrinth/ui'
import { platform } from '@tauri-apps/plugin-os'
import { computed, inject, onBeforeUnmount, onMounted, watch } from 'vue'

import BackgroundSettings from '@/components/ui/settings/display/BackgroundSettings.vue'
import { useAppSettings } from '@/composables/use-app-settings.ts'
import { type ColorTheme, DEFAULT_ACCENT_COLOR, isDarkTheme, useTheme } from '@/composables/use-theme.ts'
import { type AppSettings, get, set } from '@/helpers/settings.ts'
import { appSettingsModalContextKey } from '@/providers/app-settings-modal'

const { formatMessage } = useVIntl()
const messages = defineMessages({
	accentColor: { id: 'app.settings.appearance.accent-color', defaultMessage: 'Accent color' },
	accentDescription: { id: 'app.settings.appearance.accent-description', defaultMessage: 'Choose the color used for buttons, highlights, and other accents on this device.' },
	resetAccent: { id: 'app.settings.appearance.reset-accent', defaultMessage: 'Reset to default' },
})
const theme = useTheme()
const appSettings = useAppSettings()
const settingsModal = inject(appSettingsModalContextKey, null)
const os = platform()

type AppearanceSettingsState = {
	accentColor: string
	theme: ColorTheme
	advancedRendering: boolean
	nativeDecorations: boolean
}

function getAppearanceSettingsState(): AppearanceSettingsState {
	return {
		accentColor: theme.accentColor,
		theme: theme.preferred,
		advancedRendering: theme.advancedRendering,
		nativeDecorations: appSettings.nativeDecorations,
	}
}

const { saved, current, changes, saving, hasChanges, reset, save } = useSavable(
	getAppearanceSettingsState,
	async () => {
		const value = current.value

		const nextSettings: AppSettings = {
			...(await get()),
			theme: value.theme,
			sync_theme_across_devices: false,
			advanced_rendering: value.advancedRendering,
			native_decorations: value.nativeDecorations,
		}

		await set(nextSettings)
		theme.accentColor = value.accentColor
		if (isDarkTheme(value.theme)) {
			theme.preferredDark = value.theme
		}
		theme.preferred = value.theme
		theme.syncAcrossDevices = false
		theme.advancedRendering = value.advancedRendering
		appSettings.nativeDecorations = value.nativeDecorations
	},
)

const themeOptions = computed(() =>
	theme.options.filter(
		(option) => option !== 'retro' || appSettings.devMode || current.value.theme === 'retro',
	),
)

const preferredDarkTheme = computed(() =>
	isDarkTheme(current.value.theme) ? current.value.theme : theme.preferredDark,
)

function setTheme(value: ColorTheme): void {
	current.value.theme = value
}


function setAdvancedRendering(enabled: boolean): void {
	current.value.advancedRendering = enabled
}

function setNativeDecorations(enabled: boolean): void {
	current.value.nativeDecorations = enabled
}

watch(
	[() => current.value.theme, () => saved.value.theme],
	([selectedTheme, savedTheme]) => {
		theme.preview = selectedTheme === savedTheme ? null : selectedTheme
	},
	{ immediate: true },
)

watch(() => current.value.accentColor, (color) => {
	theme.accentPreview = color
}, { immediate: true })

function setAccentColor(event: Event): void {
	const color = (event.target as HTMLInputElement).value
	if (/^#[0-9a-f]{6}$/i.test(color)) current.value.accentColor = color
}

async function saveAppearanceSettings(): Promise<void> {
	try {
		await save()
	} catch {
		return
	}
}

onMounted(() => {
	settingsModal?.registerUnsavedChangesController({
		hasChanges: () => hasChanges.value,
		getOriginal: () => saved.value,
		getModified: () => changes.value,
		isSaving: () => saving.value,
		reset,
		save: saveAppearanceSettings,
	})
})

onBeforeUnmount(() => {
	theme.preview = null
	theme.accentPreview = null
	settingsModal?.registerUnsavedChangesController(null)
})

provideAppearanceSettings({
	deferPersistence: true,
	theme: {
		current: computed(() => current.value.theme),
		options: themeOptions,
		system: computed(() => (theme.native === 'light' ? 'light' : preferredDarkTheme.value)),
		preferredDark: preferredDarkTheme,
		set: setTheme,
		syncAcrossDevices: {
			value: computed(() => false),
			set: () => {},
		},
		syncDisabled: computed(() => true),
	},
	advancedRendering: {
		value: computed(() => current.value.advancedRendering),
		set: setAdvancedRendering,
	},
	nativeDecorations:
		os !== 'macos'
			? {
					value: computed(() => current.value.nativeDecorations),
					set: setNativeDecorations,
				}
			: undefined,
	updatePreferences: async () => undefined,
})
</script>

<template>
	<AppearanceSettingsLayout hide-theme-sync>
		<template #after-theme-sync>
			<div class="mt-6 flex flex-wrap items-center justify-between gap-4">
				<div>
					<label for="accent-color" class="text-lg font-semibold text-contrast">{{ formatMessage(messages.accentColor) }}</label>
					<p id="accent-color-description" class="m-0 mt-1 text-secondary">{{ formatMessage(messages.accentDescription) }}</p>
				</div>
				<div class="flex items-center gap-3">
					<input id="accent-color" type="color" :value="current.accentColor" aria-describedby="accent-color-description" class="h-10 w-14 cursor-pointer rounded-lg border border-solid border-divider bg-surface-3" @input="setAccentColor" />
					<span class="font-mono text-primary">{{ current.accentColor.toUpperCase() }}</span>
					<Button @click="current.accentColor = DEFAULT_ACCENT_COLOR">{{ formatMessage(messages.resetAccent) }}</Button>
				</div>
			</div>
			<BackgroundSettings />
		</template>
	</AppearanceSettingsLayout>
</template>
