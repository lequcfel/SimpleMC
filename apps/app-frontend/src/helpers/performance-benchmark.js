const enabled = import.meta.env.VITE_SIMPLEMC_BENCHMARK === 'true'
if (enabled) {
	localStorage.setItem('SimpleMC-starter-instances-v2', JSON.stringify({ complete: true, versions: [] }))
	localStorage.setItem('SimpleMC-optimized-1.21.11-v3', 'complete')
	localStorage.setItem('SimpleMC-update-preferences', JSON.stringify({ enabled: false, timing: 'launch' }))
	const calls = []
	const longTasks = []
	let pending = 0
	let lastActivity = 0
	let routeResolvedAt = 0
	let currentRoute = ''
	const original = window.__TAURI_INTERNALS__.invoke
	new PerformanceObserver(list => longTasks.push(...list.getEntries().map(e => ({ start: e.startTime, duration: e.duration })))).observe({ type: 'longtask', buffered: true })
	const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
	const frame = () => new Promise(resolve => requestAnimationFrame(() => resolve()))
	const wait = async (test, timeout = 30000) => {
		const started = performance.now()
		while (!test()) { if (performance.now() - started > timeout) throw new Error('Benchmark wait timed out: ' + currentRoute); await delay(20) }
	}
	const quiet = (started = performance.now()) => wait(() => pending === 0 && performance.now() - Math.max(lastActivity, started) > 150, 20000)
	const scroll = async () => {
		const viewport = document.querySelector('.app-viewport')
		const intervals = []
		let previous = performance.now()
		for (let i = 0; i < 90; i++) {
			viewport.scrollTop = (viewport.scrollHeight - viewport.clientHeight) * i / 89
			await frame()
			const now = performance.now(); intervals.push(now - previous); previous = now
		}
		viewport.scrollTop = 0
		return { frames: intervals.length, p95Ms: intervals.toSorted((a,b) => a-b)[Math.floor(intervals.length*.95)], slowFrames: intervals.filter(t => t > 25).length, maxMs: Math.max(...intervals), domNodes: viewport.querySelectorAll('*').length }
	}
	window.__simplemcPerformance = {
		async invoke(command, run) {
			const started = performance.now(); pending++
			try { return await run() }
			finally { pending--; lastActivity = performance.now(); calls.push({ command, start: started, duration: lastActivity - started }) }
		},
		routeResolved() { routeResolvedAt = performance.now() },
		async run(router) {
			const config = await fetch('/__perf__/config').then(r => r.json())
			const report = { ...config, routes: [], longTasks, userAgent: navigator.userAgent }
			try {
				await wait(() => document.querySelector('.app-contents') && !document.querySelector('.splash-screen'), 60000)
				report.startupMs = performance.now()
				report.startupCalls = calls.slice()
				report.startupResources = performance.getEntriesByType('resource').filter(e => e.name.endsWith('.js')).map(e => ({ name: e.name.split('/').at(-1), duration: e.duration, bytes: e.decodedBodySize }))
				await quiet()
				if (config.seed) {
					const instances = await original('plugin:instance|instance_list', {})
					if (!instances.length) {
						for (let i = 0; i < 180; i++) await original('plugin:instance|instance_create_vanilla_draft', { name: 'Benchmark Minecraft '+String(i).padStart(3,'0'), gameVersion: i%2 ? '1.8.9' : '1.21.11' })
					}
					report.seeded = true
				} else {
					for (const path of ['/library','/browse/mod','/skins','/screenshots','/','/library','/browse/mod?page=8','/skins','/screenshots','/','/browse/mod','/library']) {
						currentRoute = path
						const start = performance.now(); const callIndex = calls.length; routeResolvedAt = 0
						await router.push(path); await frame(); await frame()
						await wait(() => routeResolvedAt >= start)
						const shellMs = routeResolvedAt - start
						await quiet(start); await frame(); await frame()
						const contentMs = Math.max(shellMs, performance.now() - start - 150)
						const scrolling = await scroll()
						report.routes.push({ path, shellMs, contentMs, scrolling, calls: calls.slice(callIndex) })
					}
				}
				if (config.validateScreenshots) {
					await router.push('/screenshots'); await quiet()
					const before = window.__simplemcPerformance.screenshotCount()
					if (before < 600) throw new Error('Screenshot fixture archive was not loaded')
					await router.push('/library'); await frame()
					const instances = await original('plugin:instance|instance_list', {})
					const target = instances.find(instance => instance.name === 'Benchmark Minecraft 000')
					const canvas = document.createElement('canvas'); canvas.width = 2; canvas.height = 2
					canvas.getContext('2d').fillRect(0, 0, 2, 2)
					const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'))
					await original('plugin:files|file_write', { instanceId: target.id, path: 'screenshots/performance-cache-check-' + Date.now() + '.png', bytes: Array.from(new Uint8Array(await blob.arrayBuffer())), createOnly: true })
					await delay(1000)
					await router.push('/screenshots')
					await wait(() => window.__simplemcPerformance.screenshotCount() > before, 7000)
					report.screenshotCacheInvalidated = true
				}
				if (config.validateModals) {
					await router.push('/'); await frame()
					const opened = performance.now()
					await window.__simplemcPerformance.openSettings()
					await wait(() => document.querySelector('.modal-container.shown [role="dialog"]'))
					report.settingsOpenMs = performance.now() - opened
					report.settingsOpened = true
					const icon = await window.__simplemcPerformance.randomizeIcon()
					report.iconEditorWorks = !!icon?.path
				}
			} catch (error) { report.error = String(error) }
			report.resources = performance.getEntriesByType('resource').map(e => ({ name: e.name.split('/').at(-1), duration: e.duration, bytes: e.decodedBodySize }))
			report.navigationReportMs = performance.now()
			await fetch('/__perf__/report', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(report) })
			await original('plugin:window|destroy', { label: 'main' }).catch(() => {})
		},
	}
}
