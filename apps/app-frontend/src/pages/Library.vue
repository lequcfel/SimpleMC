<script setup lang="ts">
import { PlusIcon } from '@modrinth/assets'
import InstanceCubeIcon from '@/assets/SimpleMC-instance-cube.svg?component'
import { ContextMenu, defineMessages, injectNotificationManager, useVIntl } from '@modrinth/ui'
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import { computed, inject, onMounted, ref } from 'vue'
import { onBeforeRouteLeave, useRoute } from 'vue-router'

import LibrarySection from '@/components/ui/library/index.vue'
import { libraryScrollTop } from '@/components/ui/library/view-state'
import { traceStartupStep } from '@/helpers/startup-debug'
import { setupStarterInstances } from '@/helpers/starter-instances'
import { instanceListQueryOptions } from '@/pages/instance/query-options'
import { useRootBreadcrumb } from '@/providers/breadcrumbs'
import { injectOnboardingChecklist } from '@/providers/onboarding-checklist'

defineOptions({
	name: 'LibraryPage',
})

const route = useRoute()
const { formatMessage } = useVIntl()
const { handleError } = injectNotificationManager()
const { hasCreatedInstance } = injectOnboardingChecklist()
const showCreationModal = inject<() => void>('showCreationModal')
const pageOptions = ref<InstanceType<typeof ContextMenu>>()
onBeforeRouteLeave(() => {
	libraryScrollTop.value = document.querySelector('.app-viewport')?.scrollTop ?? 0
})

const messages = defineMessages({
	library: {
		id: 'app.navigation.library',
		defaultMessage: 'Library',
	},
	newInstance: {
		id: 'app.library.context-menu.create-instance',
		defaultMessage: 'New instance',
	},
	libraryActionsLabel: {
		id: 'app.library.actions.label',
		defaultMessage: 'Library actions',
	},
})

useRootBreadcrumb({
	slot: 'root',
	id: 'library',
	label: formatMessage(messages.library),
	to: '/library',
	visual: { type: 'icon', component: InstanceCubeIcon },
})

const queryClient = useQueryClient()
onMounted(() => {
	void setupStarterInstances(async () => {
		await queryClient.invalidateQueries({ queryKey: ['instances'] })
	}).catch(handleError)
})
const instancesQuery = useQuery(instanceListQueryOptions())
const instances = computed(() => instancesQuery.data.value ?? [])
if (hasCreatedInstance.value) {
	await traceStartupStep('Load library instances', () => instancesQuery.suspense()).catch(
		handleError,
	)
}

function openPageContextMenu(event: MouseEvent) {
	if (
		!(event.target instanceof HTMLElement) ||
		!event.target.hasAttribute('data-library-page-background')
	) {
		return
	}

	event.preventDefault()
	event.stopPropagation()
	pageOptions.value?.open(event, [
		{
			id: 'new_instance',
			label: formatMessage(messages.newInstance),
			icon: PlusIcon,
			action: () => showCreationModal?.(),
		},
	])
}
</script>

<template>
	<div
		data-library-page-background
		class="flex flex-col gap-3 p-6"
		@contextmenu="openPageContextMenu"
	>
		<LibrarySection :instances="instances" />
		<ContextMenu ref="pageOptions" :label="formatMessage(messages.libraryActionsLabel)" />
	</div>
</template>
