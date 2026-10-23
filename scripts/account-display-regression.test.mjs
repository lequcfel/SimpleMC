import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire, stripTypeScriptTypes } from 'node:module'
import { performance } from 'node:perf_hooks'
import { resolve } from 'node:path'
import test from 'node:test'
import vm from 'node:vm'

const root = resolve(import.meta.dirname, '..')
const vue = createRequire(resolve(root, 'apps/app-frontend/package.json'))('vue')
const source = resolve(root, 'apps/app-frontend/src/components/ui/AccountsCard.vue')
const delay = (ms) => new Promise((done) => setTimeout(done, ms))

function load(path = source) {
	let saved = [
		{ profile: { id: 'a', name: 'Alex' }, active: true },
		{ profile: { id: 'b', name: 'Steve' }, active: false },
	]
	const skins = []
	let code = readFileSync(path, 'utf8').split('<script setup lang="ts">')[1].split('</script>')[0]
	code = stripTypeScriptTypes(code.replace(/^import[\s\S]*?from '[^']+'\r?\n/gm, ''))
	const context = {
		...vue, console,
		defineEmits: () => () => {}, defineExpose() {}, onMounted() {}, onUnmounted() {},
		defineMessages: (value) => value, useVIntl: () => ({ formatMessage: (value) => value.defaultMessage }),
		injectNotificationManager: () => ({ handleError: (error) => { throw error } }),
		useAppEvent() {}, URL: { revokeObjectURL() {} }, steveHead: 'steve',
		getPlayerHeadUrl: async (skin) => 'blob:' + skin.texture_key,
		get_stored_accounts: async () => { await delay(3); return structuredClone(saved) },
		get_default_user: async () => { await delay(5000); return 'a' },
		users: async () => { await delay(5000); return structuredClone(saved) },
		get_available_skins: () => new Promise((accept, reject) => skins.push({ accept, reject })),
		set_default_user: async (id) => { saved = saved.map((value) => ({ ...value, active: value.profile.id === id })) },
		remove_user: async (id) => { saved = saved.filter((value) => value.profile.id !== id) },
		handleSevereError: (error) => { throw error },
	}
	vm.runInNewContext(code + '\nglobalThis.subject = { selectedAccount, refreshValues, setAccount, logout, equippedSkin }', context)
	return { ...context.subject, skins, revoke: () => { saved = [] } }
}

test('saved account appears before any online skin request finishes', async () => {
	const account = load()
	await Promise.race([account.refreshValues(), delay(500).then(() => { throw new Error('Account display waited for network') })])
	assert.equal(account.selectedAccount.value.profile.id, 'a')
	assert.equal(account.skins.length, 1)
})

test('a delayed skin response cannot replace the newly selected account head', async () => {
	const account = load()
	await account.refreshValues()
	await account.setAccount({ profile: { id: 'b', name: 'Steve' } })
	account.skins[0].accept([{ texture_key: 'old-account', is_equipped: true }])
	await delay(15)
	assert.equal(account.selectedAccount.value.profile.id, 'b')
	assert.notEqual(account.equippedSkin.value?.texture_key, 'old-account')
	await account.logout('b')
	account.skins[1].accept([{ texture_key: 'logged-out-account', is_equipped: true }])
	await delay(15)
	assert.equal(account.selectedAccount.value.profile.id, 'a')
	assert.notEqual(account.equippedSkin.value?.texture_key, 'logged-out-account')
})

test('background authentication removal is reflected in the account display', async () => {
	const account = load()
	await account.refreshValues()
	account.revoke()
	account.skins[0].reject(new Error('Invalid grant'))
	await delay(30)
	assert.equal(account.selectedAccount.value, undefined)
})

if (process.env.SIMPLEMC_ACCOUNT_BASELINE) {
	test('controlled before/after benchmark with ten seconds of simulated auth latency', async () => {
		const before = load(process.env.SIMPLEMC_ACCOUNT_BASELINE)
		const start = performance.now()
		void before.refreshValues()
		while (!before.selectedAccount.value) await delay(5)
		const beforeMs = performance.now() - start
		const after = load()
		const next = performance.now()
		await after.refreshValues()
		const afterMs = performance.now() - next
		assert.equal(after.selectedAccount.value.profile.id, 'a')
		console.log(JSON.stringify({ simulatedNetworkDelayMs: 10000, beforeAccountVisibleMs: beforeMs, afterAccountVisibleMs: afterMs }))
	})
}
