import { nextTick, ref, shallowRef, type Component } from 'vue'

export function useLazyModal(load: () => Promise<{ default: Component }>) {
	const component = shallowRef<Component>()
	const instance = ref<Record<string, (...args: unknown[]) => unknown>>()
	let pending: Promise<Component> | undefined

	async function call(method: string, ...args: unknown[]) {
		if (!component.value) {
			pending ??= load().then((module) => module.default).catch((error) => {
				pending = undefined
				throw error
			})
			component.value = await pending
			await nextTick()
		}
		return instance.value?.[method]?.(...args)
	}

	return { component, instance, call }
}
