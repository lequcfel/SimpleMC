<script setup lang="ts">
import { Toggle } from '@modrinth/ui'
import { ref } from 'vue'
import { backgrounds, backgroundSettings, setBackgroundSettings, saveCustomBackground } from '@/composables/use-background'
const error = ref('')
async function chooseCustom(event: Event) {
	const input = event.target as HTMLInputElement
	const file = input.files?.[0]
	if (!file) return
	error.value = ''
	try {
		const data = URL.createObjectURL(file)
		try {
			const image = new Image()
			image.src = data
			await image.decode()
			await saveCustomBackground(file)
			const previous = backgroundSettings.value.custom
			setBackgroundSettings({ selected: 'custom', custom: data })
			if (previous.startsWith('blob:')) URL.revokeObjectURL(previous)
		} catch (reason) {
			URL.revokeObjectURL(data)
			throw reason
		}
	} catch (reason) {
		error.value = 'Could not load or save this image. Choose a format supported by the client and check available disk space.'
	} finally { input.value = '' }
}
</script>

<template>
	<section class="mt-6 flex flex-col gap-3">
		<h3 class="m-0 text-lg font-semibold text-contrast">Background</h3>
		<p class="m-0 text-sm text-secondary">Choose the image used on Home and the loading screen. Changes are saved immediately.</p>
		<div class="grid grid-cols-3 gap-3">
			<button v-for="background in backgrounds" :key="background.id" type="button" :aria-pressed="backgroundSettings.selected === background.id" class="overflow-hidden rounded-xl border-2 border-solid p-0 bg-button-bg text-primary cursor-pointer" :class="backgroundSettings.selected === background.id ? 'border-brand' : 'border-transparent'" @click="setBackgroundSettings({ selected: background.id })">
				<img :src="background.url" alt="" class="w-full aspect-video object-cover block" />
				<span class="block p-2 text-xs font-semibold">{{ background.name }}</span>
			</button>
			<div class="flex flex-col gap-2 rounded-xl bg-button-bg p-2 border-2 border-solid" :class="backgroundSettings.selected === 'custom' ? 'border-brand' : 'border-transparent'">
				<button v-if="backgroundSettings.custom" type="button" class="border-0 bg-transparent p-0 cursor-pointer text-primary" @click="setBackgroundSettings({ selected: 'custom' })">
					<img :src="backgroundSettings.custom" alt="Custom background" class="w-full aspect-video object-cover rounded-lg" />
				</button>
				<label class="cursor-pointer text-center text-xs font-semibold p-2 rounded-lg hover:bg-button-bg-hover">Choose custom image<input type="file" accept="image/*" class="sr-only" @change="chooseCustom" /></label>
				<span class="text-xs text-secondary text-center">Images are stored locally · no file-size limit</span>
			</div>
		</div>
		<p v-if="error" role="alert" class="m-0 text-sm text-red">{{ error }}</p>
		<div class="flex items-center justify-between gap-4">
			<span class="font-semibold text-contrast">Blur background</span>
			<Toggle :model-value="backgroundSettings.blur" aria-label="Blur background" @update:model-value="setBackgroundSettings({ blur: $event })" />
		</div>
		<div class="flex items-center justify-between gap-4">
			<div><span class="font-semibold text-contrast">Change background on startup</span><p class="m-0 mt-1 text-sm text-secondary">Pick a different background each time you restart SimpleMC, including your custom image.</p></div>
			<Toggle :model-value="backgroundSettings.rotate" aria-label="Change background on startup" @update:model-value="setBackgroundSettings({ rotate: $event })" />
		</div>
	</section>
</template>
