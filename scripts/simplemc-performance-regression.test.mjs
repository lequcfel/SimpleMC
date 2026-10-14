import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'
import { resolve } from 'node:path'
import { performance } from 'node:perf_hooks'
import test from 'node:test'
import vm from 'node:vm'

const root = resolve(import.meta.dirname, '..')
const tick = () => new Promise(resolve => setTimeout(resolve, 0))
function helpers(path, invoke, clock = { now: 0 }, extras = {}) {
	let source = readFileSync(resolve(root, path), 'utf8')
	if (path.endsWith('.ts')) source = stripTypeScriptTypes(source)
	const exported = [...source.matchAll(/export (?:async )?function (\w+)/g)].map(m => m[1])
	source = source.replace(/^import .*\r?\n/gm, '').replace(/export /g, '')
	const module = { exports: {} }
	vm.runInNewContext(source + '\nmodule.exports = {' + exported.join(',') + '}', {
		module, invoke, console, Promise, Map, Set, Date: { now: () => clock.now }, ...extras,
	})
	return module.exports
}

test('discovery metadata shares concurrent requests and expires after five minutes', async () => {
	let calls = 0
	const clock = { now: 0 }
	const api = helpers('apps/app-frontend/src/helpers/tags.js', async () => { calls++; return ['tag'] }, clock)
	await Promise.all(Array.from({ length: 100 }, () => api.get_categories()))
	assert.equal(calls, 1)
	await api.get_categories(); assert.equal(calls, 1)
	clock.now = 300_001
	await api.get_categories(); assert.equal(calls, 2)
})

test('failed metadata requests are retryable', async () => {
	let calls = 0
	const api = helpers('apps/app-frontend/src/helpers/tags.js', async () => {
		if (++calls === 1) throw new Error('offline')
		return ['tag']
	})
	await assert.rejects(api.get_loaders())
	await api.get_loaders(); assert.equal(calls, 2)
})

test('profile status requests are batched, filtered, and refreshed after expiry', async () => {
	let calls = 0
	const clock = { now: 0 }
	const api = helpers('apps/app-frontend/src/helpers/process.js', async () => {
		calls++; return [{ instance_id: 'playing', uuid: 'p1' }]
	}, clock)
	const responses = await Promise.all(Array.from({ length: 200 }, (_, i) => api.get_by_instance_id(i % 2 ? 'playing' : 'idle')))
	assert.equal(calls, 1)
	assert.equal(responses[0].length, 0); assert.equal(responses[1].length, 1)
	clock.now = 251
	await api.get_all(); assert.equal(calls, 2)
	api.clearRunningProcessCache()
	await api.get_all(); assert.equal(calls, 3)
})

test('process events discard an older in-flight status snapshot', async () => {
	const resolvers = []
	const api = helpers('apps/app-frontend/src/helpers/process.js', () => new Promise(resolve => resolvers.push(resolve)))
	const old = api.get_all()
	api.clearRunningProcessCache()
	const fresh = api.get_all()
	resolvers[0]([])
	await tick()
	resolvers[1]([{ instance_id: 'launched', uuid: 'new' }])
	assert.equal((await old)[0].instance_id, 'launched')
	assert.equal((await fresh)[0].instance_id, 'launched')
})

test('failed process requests do not poison subsequent reads', async () => {
	let calls = 0
	const api = helpers('apps/app-frontend/src/helpers/process.js', async () => {
		if (++calls === 1) throw new Error('temporary')
		return []
	})
	await assert.rejects(api.get_all())
	await api.get_all(); assert.equal(calls, 2)
})

function thumbnailHarness(invoke) {
	const slots = []
	const clock = { now: 0 }
	const api = helpers('apps/app-frontend/src/composables/use-image-thumbnail.ts', invoke, clock, {
		convertFileSrc: path => 'file:' + path,
		ref: () => ({ value: undefined }),
		toValue: value => typeof value === 'function' ? value() : value,
		watch(getters, callback) {
			const slot = { cleanup: [] }; slots.push(slot)
			callback(getters.map(g => g()), [], cleanup => slot.cleanup.push(cleanup))
		},
	})
	return { api, slots, clock }
}

test('thumbnail work is bounded to four requests and cancelled queued cards are skipped', async () => {
	let active = 0, peak = 0, calls = 0
	const resolvers = []
	const { api, slots } = thumbnailHarness(async (_command, args) => {
		calls++; active++; peak = Math.max(peak, active)
		await new Promise(resolve => resolvers.push(resolve))
		active--; return 'thumbnail:' + args.path
	})
	const images = Array.from({ length: 12 }, (_, i) => api.useImageThumbnail('/image-' + i, 512, 1))
	slots.slice(4).forEach(slot => slot.cleanup.forEach(cleanup => cleanup()))
	assert.equal(active, 4)
	resolvers.forEach(resolve => resolve())
	await tick(); await tick()
	assert.equal(peak, 4); assert.equal(calls, 4)
	assert.equal(images[0].value, 'thumbnail:/image-0')
	assert.equal(images[4].value, undefined)
})

test('thumbnail cache keys include revision, expire, and do not retain failed loads', async () => {
	let calls = 0
	const { api, clock } = thumbnailHarness(async (_command, args) => {
		calls++
		if (args.path === '/failed' && calls === 4) throw new Error('temporary')
		return 'thumbnail:' + args.path + ':' + calls
	})
	const first = api.useImageThumbnail('/image', 512, 1); await tick()
	const repeated = api.useImageThumbnail('/image', 512, 1)
	assert.equal(repeated.value, first.value); assert.equal(calls, 1)
	api.useImageThumbnail('/image', 512, 2); await tick(); assert.equal(calls, 2)
	clock.now = 15_001
	api.useImageThumbnail('/image', 512, 1); await tick(); assert.equal(calls, 3)
	const failed = api.useImageThumbnail('/failed', 512, 1); await tick()
	assert.equal(failed.value, 'file:/failed')
	api.useImageThumbnail('/failed', 512, 1); await tick(); assert.equal(calls, 5)
})

test('lazy modals share loading, deliver calls after mounting, and retry import failures', async () => {
	let calls = 0, shows = 0
	const refs = []
	const { useLazyModal } = helpers('apps/app-frontend/src/composables/use-lazy-modal.ts', () => {}, { now: 0 }, {
		shallowRef: () => ({ value: undefined }),
		ref: () => { const instance = { value: undefined }; refs.push(instance); return instance },
		nextTick: async () => { refs.at(-1).value = { show: () => { shows++ } } },
	})
	const modal = useLazyModal(async () => {
		if (++calls === 1) throw new Error('temporary load failure')
		return { default: {} }
	})
	await assert.rejects(modal.call('show'))
	await Promise.all([modal.call('show'), modal.call('show')])
	assert.equal(calls, 2); assert.equal(shows, 2)
	await modal.call('show'); assert.equal(calls, 2); assert.equal(shows, 3)
})

test('virtual ranges retain focused and dragged cards without duplicates', () => {
	const { visibleInstanceRange } = helpers('apps/app-frontend/src/helpers/visible-instance-range.ts', () => {})
	const instances = Array.from({ length: 100 }, (_, id) => ({ id }))
	const actual = visibleInstanceRange(instances, 40, 50, [2, 80, 80, 45, -1, 100]).map(item => item.index)
	assert.equal(JSON.stringify(actual), JSON.stringify([2, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 80]))
	assert.equal(visibleInstanceRange([], 0, 0, []).length, 0)
})

if (process.env.SIMPLEMC_BEFORE_SOURCE) {
	test('production virtual-grid calculation matches the original for scrolling, focus and dragging', () => {
		function calculation(path) {
			const source = readFileSync(path, 'utf8')
			const start = source.indexOf('const visibleInstances = computed(() => {') + 'const visibleInstances = computed(() => {'.length
			const end = source.indexOf('\n})', start)
			const instances = Array.from({ length: 10_000 }, (_, i) => ({ id: String(i) }))
			const context = {
				props: { hideHeader: true, instanceGroup: { id: 'group:none', instances } },
				gridWidth: { value: 1000 }, isSectionCollapsed: () => false, isSearching: { value: false },
				scrollTop: { value: 0 }, containerOffset: { value: 0 }, cardHeight: { value: 250 }, gap: { value: 12 },
				columnCount: { value: 5 }, viewportHeight: { value: 800 }, focusedInstanceId: { value: null },
				activeInstanceGroupDrag: { value: null }, instanceIndices: { value: new Map(instances.map((x,i) => [x.id,i])) },
				...helpers('apps/app-frontend/src/helpers/visible-instance-range.ts', () => {}),
			}
			return { context, calculate: vm.runInNewContext('(function () {' + source.slice(start,end) + '\n})', context) }
		}
		const relative = 'apps/app-frontend/src/components/ui/library/instance-group/index.vue'
		const before = calculation(resolve(process.env.SIMPLEMC_BEFORE_SOURCE, relative))
		const after = calculation(resolve(root, relative))
		for (let i = 0; i < 1000; i++) {
			for (const item of [before, after]) {
				item.context.scrollTop.value = i * 471
				item.context.focusedInstanceId.value = i % 3 ? null : String(i)
				item.context.activeInstanceGroupDrag.value = i % 4 ? null : { primaryInstanceId: String(i+1), fromGroup: 'group:none' }
			}
			assert.equal(JSON.stringify(before.calculate()), JSON.stringify(after.calculate()))
		}
		const times = {}
		for (const [name, item] of [['before',before],['after',after]]) {
			item.context.focusedInstanceId.value = null; item.context.activeInstanceGroupDrag.value = null
			const samples = []
			for (let run = 0; run < 5; run++) {
				const start = performance.now()
				for (let i = 0; i < 1000; i++) { item.context.scrollTop.value = i*471; item.calculate() }
				samples.push(performance.now()-start)
			}
			times[name] = samples.sort((a,b) => a-b)[2]
		}
		console.log('Virtual grid 10,000 rows / 1,000 scroll updates:', JSON.stringify(times))
		if (process.env.SIMPLEMC_PERFORMANCE_RESULTS) writeFileSync(resolve(process.env.SIMPLEMC_PERFORMANCE_RESULTS,'virtual-grid-benchmark.json'),JSON.stringify(times,null,2))
	})
}
