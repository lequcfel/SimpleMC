export function visibleInstanceRange<T>(
	instances: readonly T[],
	first: number,
	end: number,
	pinnedIndices: readonly number[],
): { instance: T; index: number }[] {
	const visible = instances.slice(first, end).map((instance, index) => ({
		instance,
		index: first + index,
	}))
	for (const index of new Set(pinnedIndices)) {
		if (index >= 0 && index < instances.length && (index < first || index >= end)) {
			visible.push({ instance: instances[index]!, index })
		}
	}
	return pinnedIndices.length > 0 ? visible.sort((a, b) => a.index - b.index) : visible
}
