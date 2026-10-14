<template>
	<Transition name="splash-fade" @after-leave="onAfterLeave">
		<div
			v-if="!doneLoading"
			class="splash-screen"
			:class="`${theme.active}-mode`"
			:style="{ ...backgroundStyle, '--color-brand': theme.accentPreview ?? theme.accentColor }"
		>
			<div class="app-logo-wrapper" data-tauri-drag-region>
				<div class="simplemc-brand" aria-label="SimpleMC">
					<span class="app-logo" aria-hidden="true"></span>
					<span class="app-name">SimpleMC</span>
				</div>
				<ProgressBar class="loading-bar" :progress="Math.min(loadingProgress, 100)" />
				<span v-if="message">{{ message }}</span>
			</div>
			<div class="gradient-bg" data-tauri-drag-region></div>
			<div class="photo-bg" :style="{ backgroundImage: backgroundStyle['--home-background-image'] }"></div>
			<div class="base-bg"></div>
		</div>
	</Transition>
</template>

<script setup>
import { injectLoadingState } from '@modrinth/ui'
import { onMounted, ref, watch } from 'vue'

import ProgressBar from '@/components/ui/ProgressBar.vue'
import { useAppEvent } from '@/composables/use-app-event'
import { backgroundStyle } from '@/composables/use-background'
import { useTheme } from '@/composables/use-theme.ts'
import { debugStartup } from '@/helpers/startup-debug'

const theme = useTheme()

const doneLoading = ref(false)
const loadingProgress = ref(0)
const message = ref()

const MIN_DISPLAY_MS = 0
const mountedAt = Date.now()

const loading = injectLoadingState()
onMounted(() => debugStartup('Splash mounted'))

function onAfterLeave() {
	debugStartup('Splash fade completed', { displayedMs: Date.now() - mountedAt })
	loading.setEnabled(true)
}

watch(
	[loading.barEnabled, loading.pending],
	([barEnabled, pending]) => {
		debugStartup('Splash loading state changed', { barEnabled, pending })
		if (barEnabled) {
			doneLoading.value = true
			return
		}

		if (pending) {
			loadingProgress.value = 0
			fakeLoadingIncrease()
			return
		}

		const elapsed = Date.now() - mountedAt
		const delay = Math.max(0, MIN_DISPLAY_MS - elapsed)
		debugStartup('Splash dismissal scheduled', { delayMs: delay, displayedMs: elapsed })

		setTimeout(() => {
			if (loading.pending.value) {
				debugStartup('Splash dismissal deferred: new loading work')
				return
			}
			doneLoading.value = true
			debugStartup('Splash fade started', { displayedMs: Date.now() - mountedAt })
		}, delay)
	},
	{ immediate: true },
)

function fakeLoadingIncrease() {
	if (loadingProgress.value < 95) {
		setTimeout(() => {
			loadingProgress.value += 2
			fakeLoadingIncrease()
		}, 5)
	}
}

useAppEvent('loading', (e) => {
	if (e.event.type === 'directory_move') {
		loadingProgress.value = 100 * (e.fraction ?? 1)
		message.value = 'Updating app directory...'
	}
})
</script>

<style scoped lang="scss">
.splash-screen {
	overflow: hidden;
	position: fixed;
	inset: 0;
	z-index: 10000;

	--splash-tint-top: color-mix(in srgb, var(--color-brand) 28%, transparent);
	--splash-tint-bottom: color-mix(in srgb, var(--color-brand) 8%, transparent);
	--splash-overlay: rgba(22, 24, 28, 0.35);
}

.splash-fade-leave-active {
	transition: opacity 0.15s ease-in-out;
}

.splash-fade-leave-to {
	opacity: 0;
}

.app-logo-wrapper {
	position: absolute;
	height: 100vh;
	width: 100%;

	display: flex;
	flex-direction: column;
	justify-content: center;
	align-items: center;

	gap: 1rem;
	color: var(--color-contrast);

	z-index: 9998;
}

.simplemc-brand {
	display: flex;
	align-items: center;
	gap: 0.75rem;
	color: var(--color-brand);
}

.app-logo {
	height: 3rem;
	width: 3rem;
	background-color: currentColor;
	mask: url('@/assets/SimpleMC-logo.png') center / contain no-repeat;
	-webkit-mask: url('@/assets/SimpleMC-logo.png') center / contain no-repeat;
}

.app-name {
	color: #fff;
	font-size: 2.25rem;
	font-weight: 700;
	line-height: 1;
}

.loading-bar {
	max-width: 20rem;
}

.gradient-bg {
	position: absolute;
	height: 100vh;
	width: 100vw;
	background:
		linear-gradient(180deg, var(--splash-tint-top) 0%, var(--splash-tint-bottom) 97.29%),
		linear-gradient(0deg, var(--splash-overlay), var(--splash-overlay));
	z-index: 9997;
}

.photo-bg {
	position: absolute;
	inset: -20px;
	filter: blur(var(--home-background-blur));
	background: var(--home-background-image) center / cover no-repeat;
	opacity: 0.5;
	z-index: 9996;
}

.base-bg {
	position: absolute;
	top: 0;
	left: 0;
	width: 100%;
	height: 100%;
	background: var(--color-bg);
	z-index: 9995;
}
</style>
