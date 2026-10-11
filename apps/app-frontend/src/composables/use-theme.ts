import { invoke, isTauri } from '@tauri-apps/api/core'
import { prepareThemeColorTransition } from '@modrinth/ui'
import { computed, reactive, ref, watch } from 'vue'

export const THEME_OPTIONS = ['dark', 'light', 'oled', 'retro', 'system'] as const
export const DARK_THEMES = ['dark', 'oled', 'retro'] as const

export type ColorTheme = (typeof THEME_OPTIONS)[number]
export type DarkTheme = (typeof DARK_THEMES)[number]
type Theme = Exclude<ColorTheme, 'system'>
type NativeTheme = 'light' | 'dark'

const PREFERRED_THEME_KEY = 'modrinth-theme'
const PREFERRED_DARK_THEME_KEY = 'modrinth-preferred-dark-theme'

export function isDarkTheme(theme: string): theme is DarkTheme {
	return (DARK_THEMES as readonly string[]).includes(theme)
}

function loadPreferredTheme(): ColorTheme {
	try {
		const stored = window.localStorage.getItem(PREFERRED_THEME_KEY)
		if (stored && (THEME_OPTIONS as readonly string[]).includes(stored)) {
			return stored as ColorTheme
		}
	} catch {
		// storage blocked or full
	}

	for (const option of THEME_OPTIONS) {
		if (option !== 'system' && document.documentElement.classList.contains(`${option}-mode`)) {
			return option
		}
	}

	return 'oled'
}

function loadPreferredDarkTheme(): DarkTheme {
	try {
		const stored = window.localStorage.getItem(PREFERRED_DARK_THEME_KEY)
		if (stored && isDarkTheme(stored)) {
			return stored
		}
	} catch {
		// storage blocked or full
	}

	return 'oled'
}

export const DEFAULT_ACCENT_COLOR = '#4287f5'
const ACCENT_COLOR_KEY = 'modrinth-accent-color'

function loadAccentColor(): string {
	try {
		const stored = window.localStorage.getItem(ACCENT_COLOR_KEY)
		if (stored && /^#[0-9a-f]{6}$/i.test(stored)) return stored
	} catch {}
	return DEFAULT_ACCENT_COLOR
}

const accentColor = ref(loadAccentColor())
const accentPreview = ref<string | null>(null)

watch(accentColor, (color) => {
	if (isTauri()) {
		void invoke('set_accent_icon', { color }).catch((error) => {
			console.warn('Could not update the taskbar icon', error)
		})
	}
}, { immediate: true })

watch(accentColor, (color) => {
	try {
		window.localStorage.setItem(ACCENT_COLOR_KEY, color)
	} catch {}
})

watch([accentColor, accentPreview], ([savedColor, previewColor]) => {
	const color = previewColor ?? savedColor
	if (!/^#[0-9a-f]{6}$/i.test(color)) return
	const rgb = [1, 3, 5].map((start) => parseInt(color.slice(start, start + 2), 16)).join(', ')
	const style = document.documentElement.style
	style.setProperty('--modal-backdrop-gradient', `linear-gradient(to bottom, rgba(${rgb}, 0.18) 0%, rgba(14, 21, 26, 0.95) 100%)`)
	style.setProperty('--color-brand', color)
	style.setProperty('--color-brand-highlight', `rgba(${rgb}, 0.25)`)
	style.setProperty('--color-brand-shadow', `rgba(${rgb}, 0.7)`)
	style.setProperty('--brand-gradient-bg', `linear-gradient(0deg, rgba(${rgb}, 0.2), rgba(${rgb}, 0.1))`)
	style.setProperty('--brand-gradient-strong-bg', `linear-gradient(270deg, rgba(${rgb}, 0.08), rgba(${rgb}, 0.18))`)
	style.setProperty('--brand-gradient-border', `rgba(${rgb}, 0.15)`)
	style.setProperty('--loading-bar-gradient', `linear-gradient(to right, ${color}, ${color})`)
}, { immediate: true })

const preferred = ref<ColorTheme>(loadPreferredTheme())
const preview = ref<ColorTheme | null>(null)
const preferredDark = ref<DarkTheme>(loadPreferredDarkTheme())
const advancedRendering = ref(true)
const syncAcrossDevices = ref(false)
const nativeThemeQuery = window.matchMedia('(prefers-color-scheme: dark)')
const native = ref<NativeTheme>(nativeThemeQuery.matches ? 'dark' : 'light')
const active = computed<Theme>(() => {
	const selectedTheme = preview.value ?? preferred.value
	if (selectedTheme !== 'system') {
		return selectedTheme
	}

	return native.value === 'light' ? 'light' : preferredDark.value
})

nativeThemeQuery.addEventListener('change', (event) => {
	native.value = event.matches ? 'dark' : 'light'
})

watch([preferred, preview], ([selectedPreferred, selectedPreview]) => {
	const selectedTheme = selectedPreview ?? selectedPreferred
	if (isDarkTheme(selectedTheme)) {
		preferredDark.value = selectedTheme
	}
})

watch(
	preferred,
	(theme) => {
		try {
			window.localStorage.setItem(PREFERRED_THEME_KEY, theme)
		} catch {
			// storage blocked or full
		}
	},
	{ immediate: true },
)

watch(preferredDark, (theme) => {
	try {
		window.localStorage.setItem(PREFERRED_DARK_THEME_KEY, theme)
	} catch {
		// storage blocked or full
	}
})

watch(
	active,
	(theme, previousTheme) => {
		if (previousTheme && previousTheme !== theme) {
			prepareThemeColorTransition()
		}

		const html = document.documentElement
		for (const option of THEME_OPTIONS) {
			html.classList.remove(`${option}-mode`)
		}
		html.classList.add(`${theme}-mode`)
	},
	{ immediate: true },
)

function applyAccountAppearance(appearance: { auto: boolean; theme: string }): void {
	if (isDarkTheme(appearance.theme)) {
		preferredDark.value = appearance.theme
	}

	if (appearance.auto) {
		preferred.value = 'system'
		return
	}

	if ((THEME_OPTIONS as readonly string[]).includes(appearance.theme)) {
		preferred.value = appearance.theme as ColorTheme
	}
}

const theme = reactive({
	accentColor,
	accentPreview,
	preferred,
	preview,
	preferredDark,
	active,
	native,
	syncAcrossDevices,
	advancedRendering,
	options: THEME_OPTIONS,
	applyAccountAppearance,
})

export function useTheme() {
	return theme
}
