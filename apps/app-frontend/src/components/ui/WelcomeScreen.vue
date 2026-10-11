<script setup lang="ts">
import { CompassIcon, ImageIcon, ShirtIcon } from '@modrinth/assets'
import { defineMessages, useVIntl } from '@modrinth/ui'
import InstanceCubeIcon from '@/assets/SimpleMC-instance-cube.svg?component'
import { inject, onMounted, onUnmounted, ref } from 'vue'
import HomeGameButton from '@/components/ui/HomeGameButton.vue'


const showCreationModal = inject<() => void>('showCreationModal')

const { formatMessage } = useVIntl()

const messages = defineMessages({
	welcomeTitle: {
		id: 'app.welcome-screen.simplemc-title',
		defaultMessage: 'Welcome to SimpleMC',
	},
	welcomeDescription: {
		id: 'app.welcome-screen.description',
		defaultMessage: 'Ready to start playing?',
	},
	createInstance: {
		id: 'app.welcome-screen.create-instance',
		defaultMessage: 'Create an instance',
	},
	quickCreateHint: {
		id: 'app.welcome-screen.quick-create-hint',
		defaultMessage: 'Press <shortcut>N</shortcut> to quick create an instance',
	},
	importPrompt: {
		id: 'app.welcome-screen.import-prompt',
		defaultMessage: 'Escaping another launcher?',
	},
	importFromLauncher: {
		id: 'app.welcome-screen.import-from-launcher',
		defaultMessage: 'Import from launcher',
	},
})

const offline = ref(!navigator.onLine)

function handleOffline() {
	offline.value = true
}

function handleOnline() {
	offline.value = false
}

function handleQuickCreate(event: KeyboardEvent) {
	const target = event.target as HTMLElement | null
	if (
		event.key.toLowerCase() !== 'n' ||
		event.repeat ||
		event.metaKey ||
		event.ctrlKey ||
		event.altKey ||
		target?.isContentEditable ||
		['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName ?? '')
	) {
		return
	}

	if (!offline.value) {
		event.preventDefault()
		showCreationModal?.()
	}
}

onMounted(() => {
	window.addEventListener('offline', handleOffline)
	window.addEventListener('online', handleOnline)
	window.addEventListener('keydown', handleQuickCreate)
})

onUnmounted(() => {
	window.removeEventListener('offline', handleOffline)
	window.removeEventListener('online', handleOnline)
	window.removeEventListener('keydown', handleQuickCreate)
})
</script>

<template>
	<div class="flex h-full min-h-full flex-col px-6 pb-6 pt-6">
		<div class="relative flex grow items-center justify-center">
			<div class="relative isolate flex flex-col items-center gap-6">
				<div class="size-[6.25rem]">
					<span class="simplemc-logo pointer-events-none block size-full" role="img" aria-label="SimpleMC" />
				</div>
				<div class="flex flex-col items-center gap-2">
					<h1 class="m-0 flex items-center gap-2 text-2xl font-semibold leading-8 text-contrast">
						{{ formatMessage(messages.welcomeTitle) }}
					</h1>
					<p class="m-0 text-center text-base leading-6 text-primary">
						{{ formatMessage(messages.welcomeDescription) }}
					</p>
				</div>
				<HomeGameButton />

			</div>
		</div>
		<nav class="mt-6 flex shrink-0 flex-wrap items-start justify-center gap-3" aria-label="Explore SimpleMC">
			<RouterLink to="/browse/mod" class="home-nav-link">
				<CompassIcon />
				<span>Discover Content</span>
			</RouterLink>
			<RouterLink to="/library" class="home-nav-link">
				<InstanceCubeIcon />
				<span>Library</span>
			</RouterLink>
			<RouterLink to="/skins" class="home-nav-link">
				<ShirtIcon />
				<span>Skin selector</span>
			</RouterLink>
			<RouterLink to="/screenshots" class="home-nav-link">
				<ImageIcon />
				<span>Screenshots</span>
			</RouterLink>
		</nav>
	</div>
</template>

<style scoped>
.simplemc-logo {
	background-color: var(--color-brand);
	mask: url('@/assets/SimpleMC-logo.png') center / contain no-repeat;
	-webkit-mask: url('@/assets/SimpleMC-logo.png') center / contain no-repeat;
}

.home-nav-link {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 0.5rem;
	padding: 0.75rem;
	border-radius: var(--radius-lg);
	color: var(--color-text-primary);
	font-size: 0.8125rem;
	font-weight: 600;
	text-decoration: none;
	transition: background-color 150ms, color 150ms, transform 150ms;
}

.home-nav-link:hover,
.home-nav-link:focus-visible {
	transform: scale(1.08);
	background-color: var(--color-button-bg);
	color: var(--color-text-contrast);
}

.home-nav-link :deep(svg) {
	width: 1.5rem;
	height: 1.5rem;
}
</style>

<style scoped>
@media (prefers-reduced-motion: reduce) {
	.home-nav-link { transition: none; }
}
</style>
