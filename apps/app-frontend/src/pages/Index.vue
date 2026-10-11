<script setup lang="ts">
import { PlayIcon } from '@modrinth/assets'
import { defineMessages, useVIntl } from '@modrinth/ui'
import WelcomeScreen from '@/components/ui/WelcomeScreen.vue'
import { useRootBreadcrumb } from '@/providers/breadcrumbs'

const { formatMessage } = useVIntl()
const messages = defineMessages({
	home: { id: 'app.navigation.home', defaultMessage: 'Home' },
})
useRootBreadcrumb({
	slot: 'root',
	id: 'home',
	label: formatMessage(messages.home),
	to: '/',
	visual: { type: 'icon', component: PlayIcon },
})
</script>

<template>
	<div class="relative isolate h-full min-h-full overflow-hidden rounded-tl-[--radius-xl]">
		<div class="home-background pointer-events-none absolute inset-0 -z-10" aria-hidden="true" />
		<WelcomeScreen />
	</div>
</template>

<style scoped>
.home-background {
	background: url('@/assets/loading/minecraft-landscape.png') center / cover no-repeat;
	opacity: 0.75;
	inset: -20px;
	filter: blur(8px);
}
</style>
