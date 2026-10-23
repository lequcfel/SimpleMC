<script setup lang="ts">
import licenseText from '@/assets/SimpleMC-GPL.txt?raw'
</script>

<template>
	<section class="flex flex-col gap-4">
		<h2 class="m-0 text-xl font-bold">About SimpleMC</h2>
		<p class="m-0">SimpleMC is an independent, modified version of Modrinth App, originally developed by Rinth, Inc. and its contributors. It is not affiliated with or endorsed by Modrinth.</p>
		<p class="m-0">Modifications by lequcfel and contributors. Last modified: 24 October 2026. The launcher and its modifications are licensed under GNU GPL version 3 only.</p>
		<p class="m-0">This software comes without warranty. You may copy, modify, and redistribute it under GPL-3.0-only.</p>
		<div class="flex gap-4">
			<a href="https://github.com/lequcfel/SimpleMC" target="_blank" rel="noopener noreferrer" class="text-brand">SimpleMC source and releases</a>
			<a href="https://github.com/modrinth/code" target="_blank" rel="noopener noreferrer" class="text-brand">Original project</a>
		</div>
		<details class="rounded-xl bg-surface-3 p-4">
			<summary class="cursor-pointer font-bold">GNU General Public License v3</summary>
			<pre class="mt-4 max-h-80 overflow-auto whitespace-pre-wrap text-xs">{{ licenseText }}</pre>
		</details>
		<p class="m-0 text-sm text-secondary">Third-party dependencies and downloaded mods retain their own licenses. Minecraft and Microsoft names and logos belong to their respective owners.</p>
	</section>
</template>
