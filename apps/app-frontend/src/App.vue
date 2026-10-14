<script setup>
import {
	AuthFeature,
	ModrinthApiError,
	NodeAuthFeature,
	nodeAuthState,
	PanelVersionFeature,
	TauriModrinthClient,
	VerboseLoggingFeature,
} from '@modrinth/api-client'
import {
	ArrowLeftRightIcon,
	ChevronLeftIcon,
	ChevronRightIcon,
	LogInIcon,
	LogOutIcon,
	PlusIcon,
	RefreshCwIcon,
	SettingsIcon,
	SpinnerIcon,
	ToggleRightIcon,
	UserIcon,
	UserPlusIcon,
	XIcon,
} from '@modrinth/assets'
import {
	Admonition,
	Avatar,
	commonMessages,
	commonSettingsMessages,
	ContentInstallModal,
	ContentUpdaterModal,
	CreationFlowModal,
	defineMessages,
	I18nDebugPanel,
	IconButton,
	LoadingBar,
	NotificationPanel,
	PopupNotificationPanel,
	provideModalBehavior,
	provideModrinthClient,
	provideNotificationManager,
	providePageContext,
	providePopupNotificationManager,
	TeleportOverflowMenu,
	TooltipDirective,
	useDebugLogger,
	useFormatBytes,
	UserRoleIcon,
	useVIntl,
} from '@modrinth/ui'
import { renderString } from '@modrinth/utils/parse'
import { useQueries, useQuery, useQueryClient } from '@tanstack/vue-query'
import { getVersion } from '@tauri-apps/api/app'
import { convertFileSrc, invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { fetch as tauriFetch } from '@tauri-apps/plugin-http'
import { openUrl } from '@tauri-apps/plugin-opener'
import { type } from '@tauri-apps/plugin-os'
import { computed, nextTick, onMounted, onUnmounted, provide, ref, watch } from 'vue'
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router'

import AccountsCard from '@/components/ui/AccountsCard.vue'
import AppActionBar from '@/components/ui/AppActionBar.vue'
import Breadcrumbs from '@/components/ui/Breadcrumbs.vue'
import ErrorModal from '@/components/ui/ErrorModal.vue'
import UnknownPackWarningModal from '@/components/ui/install_flow/UnknownPackWarningModal.vue'
import MinecraftAuthErrorModal from '@/components/ui/minecraft-auth-error-modal/MinecraftAuthErrorModal.vue'
import MinecraftRequiredModal from '@/components/ui/minecraft-required-modal/MinecraftRequiredModal.vue'
import InstallToPlayModal from '@/components/ui/modal/InstallToPlayModal.vue'
import ModpackAlreadyInstalledModal from '@/components/ui/modal/ModpackAlreadyInstalledModal.vue'
import UpdateToPlayModal from '@/components/ui/modal/UpdateToPlayModal.vue'
import NavButton from '@/components/ui/NavButton.vue'
import SplashScreen from '@/components/ui/SplashScreen.vue'
import SyncInstancesUpdateModal from '@/components/ui/sync-instances-update-modal/index.vue'
import {
	markSyncInstancesUpdateNotificationShown,
	shouldShowSyncInstancesUpdateNotification,
} from '@/components/ui/sync-instances-update-modal/show-notification'
import WindowControls from '@/components/ui/WindowControls.vue'
import { useCheckDisableMouseover } from '@/composables/macCssFix.js'
import { useAppEvent } from '@/composables/use-app-event'
import { backgroundStyle } from '@/composables/use-background'
import { useAppSettings } from '@/composables/use-app-settings.ts'
import { useLazyModal } from '@/composables/use-lazy-modal'
import { useError } from '@/composables/use-error.js'
import { useInstanceMetadataRefresh } from '@/composables/use-instance-metadata-refresh'
import { useQuickInstanceLimit } from '@/composables/use-quick-instance-limit.ts'
import { isDarkTheme, useTheme } from '@/composables/use-theme.ts'
import { config } from '@/config'
import { getAccountAppearance, rememberAccountAppearance } from '@/helpers/account-appearance.ts'


import { check_reachable } from '@/helpers/auth.js'
import { get_user, get_user_many, get_version } from '@/helpers/cache.js'
import { gameSettingsQueryOptions } from '@/helpers/game-options'
import { install_create_modpack_instance, install_get_modpack_preview } from '@/helpers/install'
import {
	can_current_user_use_shared_instances,
	edit as editInstance,
	list as listInstances,
	get as getInstance,
	run,
	set_global_synced_option,
} from '@/helpers/instance'
import { maxMemoryQueryOptions } from '@/helpers/jre.js'
import {
	get as getCreds,
	getAll as getAllCreds,
	login,
	logout,
	removeUser,
	setActive,
} from '@/helpers/mr_auth.ts'
import { mergeUrlQuery, parseModrinthLink } from '@/helpers/project-links.ts'
import {
	appSettingsKeys,
	appSettingsQueryOptions,
	get as getSettings,
	set as setSettings,
} from '@/helpers/settings.ts'
import { debugStartup, traceStartupStep } from '@/helpers/startup-debug'
import { get_opening_command, initialize_state } from '@/helpers/state'
import { setupStarterInstances } from '@/helpers/starter-instances'
import {
	gameOptionsSyncSourcesQueryOptions,
	globalSyncedOptionsQueryOptions,
	initializedSyncedOptionsQueryOptions,
	syncedOptionsKeys,
	syncedServersQueryOptions,
} from '@/helpers/synced-options'
import { syncedPackQueryOptions } from '@/helpers/synced-packs'
import { get_user_preferences } from '@/helpers/user-preferences.ts'
import { parse_modrinth_user_link } from '@/helpers/users'
import {
	areUpdatesEnabled,
	enqueueUpdateForInstallation,
	getOS,
	getUpdateSize,
	isDev,
	isNetworkMetered,
	setRestartAfterPendingUpdate,
} from '@/helpers/utils.js'
import { start_join_server, start_join_singleplayer_world } from '@/helpers/worlds.ts'
import i18n, { setLocale } from '@/i18n.config'
import {
	instanceKeys,
	instanceListQueryOptions,
	screenshotKeys,
} from '@/pages/instance/query-options'
import {
	appUpdateState,
	updatePreferences,
	updateCheckState,
	downloadAvailableAppUpdate,
	getNextAppUpdatePopupTime,
	installAvailableAppUpdate,
	markAppUpdateActionable,
	markAppUpdatePopupShown,
	openAppUpdateChangelog,
	setAppUpdateActions,
} from '@/providers/app-update.ts'
import { createBreadcrumbManager, provideBreadcrumbManager } from '@/providers/breadcrumbs'
import { createContentInstall, provideContentInstall } from '@/providers/content-install'
import {
	provideAppUpdateDownloadProgress,
	subscribeToDownloadProgress,
} from '@/providers/download-progress.ts'
import { createServerInstall, provideServerInstall } from '@/providers/server-install'
import { setupProviders } from '@/providers/setup'
import { setupAppEventsProvider } from '@/providers/setup/app-events'
import { setupAuthProvider } from '@/providers/setup/auth'
import { setupLoadingStateProvider } from '@/providers/setup/loading-state'
import { setupAppUserPreferencesProvider } from '@/providers/setup/user-preferences.ts'
import { appMessages } from '@/utils/app-messages'

import { AppNotificationManager } from './providers/app-notifications'
import { AppPopupNotificationManager } from './providers/app-popup-notifications'
import {
	appSettingsModalOpenProfileKey,
	appSettingsModalOpenSyncedOptionsKey,
} from './providers/app-settings-modal'

debugStartup('App setup entered')
const appSettings = useAppSettings()
const appTheme = useTheme()
const quickInstances = useQuickInstanceLimit()
const router = useRouter()
const route = useRoute()
const showSelectedBackground = computed(() => ['/', '/library', '/skins', '/screenshots'].includes(route.path))
const { channel: appEventChannel, events: appEvents } = setupAppEventsProvider()
useInstanceMetadataRefresh(appEvents)
const breadcrumbManager = createBreadcrumbManager()
provideBreadcrumbManager(breadcrumbManager)
const canNavigateBack = ref(false)
const canNavigateForward = ref(false)

function updateHistoryNavigationState() {
	const historyState = window.history.state
	canNavigateBack.value = historyState?.back != null
	canNavigateForward.value = historyState?.forward != null
}

updateHistoryNavigationState()

const APP_LEFT_NAV_WIDTH = '4rem'
const APP_SIDEBAR_WIDTH = 300
const credentials = ref()
const storedModrinthAccounts = ref([])
let credentialsRefreshId = 0
const sidebarVisible = ref(false)
const notificationManager = new AppNotificationManager()
provideNotificationManager(notificationManager)
const { handleError, addNotification } = notificationManager

useAppEvent(
	'warning',
	(event) =>
		addNotification({
			title: formatMessage(messages.warning),
			text: event.message,
			type: 'warning',
		}),
	appEvents,
)

const popupNotificationManager = new AppPopupNotificationManager()
providePopupNotificationManager(popupNotificationManager)
const { addPopupNotification } = popupNotificationManager

const appVersion = getVersion()
const tauriApiClient = new TauriModrinthClient({
	userAgent: async () => `SimpleMC/${await appVersion}`,
	labrinthBaseUrl: config.labrinthBaseUrl,
	archonBaseUrl: config.archonBaseUrl,
	sharedInstancesBaseUrl: config.sharedInstancesBaseUrl,
	features: [
		new NodeAuthFeature({
			getAuth: () => nodeAuthState.getAuth?.() ?? null,
			refreshAuth: async () => {
				if (nodeAuthState.refreshAuth) {
					await nodeAuthState.refreshAuth()
				}
			},
		}),
		new AuthFeature({
			token: async () => (await getCreds())?.session,
		}),
		new PanelVersionFeature(),
		new VerboseLoggingFeature(),
	],
})
provideModrinthClient(tauriApiClient)
const adConsentAvailable = ref(false)
providePageContext({
	hierarchicalSidebarAvailable: ref(true),
	showAds: ref(false),
	adConsentAvailable,
	floatingActionBarOffsets: {
		left: ref(APP_LEFT_NAV_WIDTH),
		right: computed(() => (sidebarVisible.value ? `${APP_SIDEBAR_WIDTH}px` : '0px')),
	},
	featureFlags: {
		serverRamAsBytesAlwaysOn: computed(() =>
			appSettings.getFeatureFlag('server_ram_as_bytes_always_on'),
		),
	},
	openExternalUrl: (url) => void openUrl(url),
})
provideModalBehavior({
	noblur: computed(() => !appTheme.advancedRendering),
})

const creationIconEditor = useLazyModal(() => import('@/components/ui/instance_settings/icon-editor-modal/index.vue'))
const creationIconEditorModal = creationIconEditor.instance
const creationIconEditorComponent = creationIconEditor.component
const creationGeneratedIcon = ref(null)
const creationIconTarget = ref('creation-flow')

const {
	installationModal,
	unknownPackWarningModal,
	fetchExistingInstanceNames,
	handleCreate,
	handleBrowseModpacks,
	searchProjects,
	getLoaderManifest,
	setModpackAlreadyInstalledModal,
	handleModpackDuplicateCreateAnyway,
	handleModpackDuplicateGoToInstance,
	onboardingChecklist,
	tags,
} = setupProviders(
	tauriApiClient,
	notificationManager,
	popupNotificationManager,
	appEvents,
	(iconPath) =>
		creationGeneratedIcon.value?.path === iconPath ? creationGeneratedIcon.value.config : null,
)

async function randomizeCreationIcon() {
	const generated = await creationIconEditor.call('randomizeAndSave')
	if (!generated) return null

	creationGeneratedIcon.value = { path: generated.iconPath, config: generated.config }
	return {
		path: generated.iconPath,
		previewUrl: convertFileSrc(generated.iconPath),
	}
}

function customizeCreationIcon() {
	creationIconTarget.value = 'creation-flow'
	void creationIconEditor.call('show').catch(handleError)
}

function customizeContentInstallIcon() {
	creationIconTarget.value = 'content-install'
	void creationIconEditor.call('show').catch(handleError)
}

function onCreationIconSaved(iconPath, config) {
	creationGeneratedIcon.value = { path: iconPath, config }
	if (creationIconTarget.value === 'content-install') {
		modInstallModal.value?.setIcon(iconPath, convertFileSrc(iconPath))
		return
	}

	const context = installationModal.value?.ctx
	if (!context) return

	context.instanceIcon.value = null
	context.instanceIconUrl.value = convertFileSrc(iconPath)
	context.instanceIconPath.value = iconPath
}

const displayedServerInviteNotifications = new Set()
const serverInvitePopupNotificationIds = new Set()
let liveNotificationGeneration = 0
let liveNotificationsEnabled = true

const offline = ref(!navigator.onLine)
window.addEventListener('offline', () => {
	offline.value = true
})
window.addEventListener('online', () => {
	offline.value = false
})

const os = ref('')
const isDevEnvironment = ref(false)

const stateInitialized = ref(false)
const globalSyncedOptionsQuery = useQuery({
	...globalSyncedOptionsQueryOptions(),
	enabled: computed(() => stateInitialized.value),
})
useQueries({
	queries: computed(() =>
		[
			appSettingsQueryOptions(),
			instanceListQueryOptions(),
			maxMemoryQueryOptions(),
			gameSettingsQueryOptions(),
			initializedSyncedOptionsQueryOptions(),
			gameOptionsSyncSourcesQueryOptions(),
			syncedServersQueryOptions(),
			syncedPackQueryOptions('resourcepack'),
			syncedPackQueryOptions('datapack'),
		].map((options) => ({
			...options,
			enabled: stateInitialized.value && options.enabled !== false,
		})),
	),
})

const criticalErrorMessage = ref()

const isMaximized = ref(false)
const isFullscreen = ref(false)

watch([os, isFullscreen], ([osName, fullscreen]) => {
	document.documentElement.classList.toggle('mac-traffic-lights', osName === 'MacOS' && !fullscreen)
})

const authUnreachableDebug = useDebugLogger('AuthReachableChecker')
const authServerQuery = useQuery({
	queryKey: ['authServerReachability'],
	queryFn: async () => {
		await check_reachable()
		authUnreachableDebug('Auth servers are reachable')
		return true
	},
	refetchInterval: 5 * 60 * 1000, // 5 minutes
	retry: false,
	refetchOnWindowFocus: false,
})

const authUnreachable = computed(() => {
	if (authServerQuery.isError.value && !authServerQuery.isLoading.value) {
		console.warn('Failed to reach auth servers', authServerQuery.error.value)
		return true
	}
	return false
})

let unlistenEditMenu

function handleEditMenuAction(action) {
	const event = new CustomEvent(`edit-menu:${action}`, { cancelable: true })
	if (document.dispatchEvent(event)) document.execCommand(action)
}

onMounted(async () => {
	try {
		const listeners = await Promise.all([
			listen('edit-menu://undo', () => handleEditMenuAction('undo')),
			listen('edit-menu://redo', () => handleEditMenuAction('redo')),
		])
		unlistenEditMenu = () => listeners.forEach((unlisten) => unlisten())
	} catch (error) {
		handleError(error)
	}

	await useCheckDisableMouseover()

	document.querySelector('body').addEventListener('click', handleClick)
	document.querySelector('body').addEventListener('auxclick', handleAuxClick)
	document.querySelector('body').addEventListener('contextmenu', handleContextMenu)

	await invoke('set_desktop_update_preferences', updatePreferences.value)
	if (updatePreferences.value.enabled && updatePreferences.value.timing !== 'close') {
		void checkUpdates()
	}

})

onUnmounted(async () => {
	document.querySelector('body').removeEventListener('click', handleClick)
	document.querySelector('body').removeEventListener('auxclick', handleAuxClick)
	document.querySelector('body').removeEventListener('contextmenu', handleContextMenu)
	unlistenEditMenu?.()
	clearDelayedUpdatePopup()


	await unlistenUpdateDownload?.()
})

const { formatMessage } = useVIntl()
const formatBytes = useFormatBytes()

const messages = defineMessages({
	syncUpdateTitle: {
		id: 'app.sync-instances-update.notification.title',
		defaultMessage: 'Sync your instances',
	},
	syncUpdateDescription: {
		id: 'app.sync-instances-update.notification.description',
		defaultMessage:
			'Keep game settings, servers, resource packs, and more in sync across your instances.',
	},
	syncUpdateView: {
		id: 'app.sync-instances-update.notification.view-update',
		defaultMessage: 'View update',
	},
	syncUpdateDismiss: {
		id: 'app.sync-instances-update.notification.dismiss',
		defaultMessage: 'Dismiss',
	},
	warning: { id: 'app.notification.warning', defaultMessage: 'Warning' },
	goBack: { id: 'app.navigation.go-back', defaultMessage: 'Go back' },
	goForward: { id: 'app.navigation.go-forward', defaultMessage: 'Go forward' },
	nextImage: { id: 'app.navigation.next-image', defaultMessage: 'Next image' },
	updateDownloadMissingVersion: {
		id: 'app.update.download-error.missing-version',
		defaultMessage: 'Failed to download update: no version available',
	},
	updateInstalledToastTitle: {
		id: 'app.update.complete-toast.title',
		defaultMessage: 'Version {version} was successfully installed!',
	},
	updateInstalledToastText: {
		id: 'app.update.complete-toast.text',
		defaultMessage: 'Click here to view the changelog.',
	},
	authUnreachableHeader: {
		id: 'app.auth-servers.unreachable.header',
		defaultMessage: 'Cannot reach authentication servers',
	},
	authUnreachableBody: {
		id: 'app.auth-servers.unreachable.body',
		defaultMessage:
			'Minecraft authentication servers may be down right now. Check your internet connection and try again later.',
	},
	home: {
		id: 'app.nav.home',
		defaultMessage: 'Home',
	},
	library: {
		id: 'app.navigation.library',
		defaultMessage: 'Library',
	},
	screenshots: {
		id: 'app.nav.screenshots',
		defaultMessage: 'Screenshots',
	},
	createNewInstance: {
		id: 'app.nav.create-new-instance',
		defaultMessage: 'Create new instance',
	},
	modrinthAccount: {
		id: 'app.nav.modrinth-account',
		defaultMessage: 'SimpleMC account',
	},
	viewProfile: {
		id: 'app.nav.view-profile',
		defaultMessage: 'View profile',
	},
	addFriend: {
		id: 'friends.action.add-friend',
		defaultMessage: 'Add a friend',
	},
	signInToModrinthAccount: {
		id: 'app.nav.sign-in-to-modrinth-account',
		defaultMessage: 'Sign into SimpleMC',
	},
	loadingProfile: {
		id: 'app.nav.loading-profile',
		defaultMessage: 'Loading profile...',
	},
	switchAccount: {
		id: 'app.nav.switch-account',
		defaultMessage: 'Switch account',
	},
	addAccount: {
		id: 'app.nav.add-account',
		defaultMessage: 'Add account',
	},
	removeAccount: {
		id: 'app.nav.remove-account',
		defaultMessage: 'Remove account',
	},
	restarting: {
		id: 'app.restarting',
		defaultMessage: 'Restarting...',
	},
	playingAs: {
		id: 'app.sidebar.playing-as',
		defaultMessage: 'Playing as',
	},
})

async function setupApp() {
	if (!window.localStorage.getItem('SimpleMC-tray-on-launch-v1')) {
		const settings = await getSettings()
		settings.hide_on_process_start = true
		settings.refocus_on_game_close = true
		await setSettings(settings)
		window.localStorage.setItem('SimpleMC-tray-on-launch-v1', 'complete')
	}
	if (!window.localStorage.getItem('SimpleMC-window-default-1280x720-v1')) {
		const windowSettings = await getSettings()
		windowSettings.game_resolution = [1280, 720]
		windowSettings.force_fullscreen = false
		await setSettings(windowSettings)
		for (const instance of await listInstances()) {
			await editInstance(instance.id, { game_resolution: null, force_fullscreen: false })
		}
		window.localStorage.setItem('SimpleMC-window-default-1280x720-v1', 'complete')
		await queryClient.invalidateQueries({ queryKey: ['instances'] })
	}
	tags.initialize()
	await traceStartupStep('Initialize onboarding checklist', () => onboardingChecklist.initialize())

	const {
		native_decorations,
		theme,
		locale,
		telemetry,
		hide_nametag_skins_page,
		advanced_rendering,
		toggle_sidebar,
		sync_theme_across_devices,
		sync_behavior_across_devices,
		sync_features_across_devices,
		show_files_tab_in_instances,
		show_worlds_tab_in_instances,
		show_screenshots_tab_in_instances,
		show_skin_selector_in_sidebar,
		refocus_on_game_close,
		compact_instance_cards,
		show_play_time,
		warn_on_unknown_modpacks,
		skip_non_essential_warnings,
		show_jump_in,
		always_show_copy_details,
		hide_installed_modpacks,
		advanced_filters_collapsed,
		dismissed_photosensitivity_filter_warning,
		friends_active_collapsed,
		friends_online_collapsed,
		friends_offline_collapsed,
		friends_pending_collapsed,
		developer_mode,
		feature_flags,
		pending_update_toast_for_version,
	} = await traceStartupStep('Read startup settings', getSettings)

	// Initialize locale from saved settings
	if (locale) {
		await traceStartupStep('Apply startup locale', () => setLocale(locale))
	}

	Object.assign(appSettings.featureFlags, feature_flags)
	isMaximized.value = await traceStartupStep('Read window maximized state', () =>
		getCurrentWindow().isMaximized(),
	)
	isFullscreen.value = await traceStartupStep('Read window fullscreen state', () =>
		getCurrentWindow().isFullscreen(),
	)
	os.value = await traceStartupStep('Read operating system', getOS)
	const dev = await traceStartupStep('Read development mode', isDev)
	isDevEnvironment.value = dev
	const version = await traceStartupStep('Read app version', getVersion)
	appSettings.nativeDecorations = native_decorations
	if (os.value !== 'MacOS') {
		await traceStartupStep('Apply window decorations', () =>
			getCurrentWindow().setDecorations(native_decorations),
		)
	}

	if (!window.localStorage.getItem('SimpleMC-oled-default-v1')) {
		const oledSettings = await getSettings()
		oledSettings.theme = 'oled'
		await setSettings(oledSettings)
		window.localStorage.setItem('SimpleMC-oled-default-v1', 'true')
		appTheme.preferred = 'oled'
	} else {
		appTheme.preferred = theme
	}
	appTheme.advancedRendering = advanced_rendering
	appTheme.syncAcrossDevices = sync_theme_across_devices
	appSettings.syncBehaviorAcrossDevices = sync_behavior_across_devices
	appSettings.syncFeaturesAcrossDevices = sync_features_across_devices
	appSettings.hideNametagSkinsPage = hide_nametag_skins_page
	appSettings.toggleSidebar = toggle_sidebar
	appSettings.showFilesTabInInstances = show_files_tab_in_instances
	appSettings.showWorldsTabInInstances = show_worlds_tab_in_instances
	appSettings.showScreenshotsTabInInstances = show_screenshots_tab_in_instances
	appSettings.showSkinSelectorInSidebar = show_skin_selector_in_sidebar
	appSettings.refocusOnGameClose = refocus_on_game_close
	appSettings.compactInstanceCards = compact_instance_cards
	appSettings.showPlayTime = show_play_time
	appSettings.warnOnUnknownModpacks = warn_on_unknown_modpacks
	appSettings.skipNonEssentialWarnings = skip_non_essential_warnings
	appSettings.showJumpIn = show_jump_in
	appSettings.alwaysShowCopyDetails = always_show_copy_details
	appSettings.hideInstalledModpacks = hide_installed_modpacks
	appSettings.advancedFiltersCollapsed = advanced_filters_collapsed
	appSettings.dismissedPhotosensitivityFilterWarning = dismissed_photosensitivity_filter_warning
	appSettings.friendsActiveCollapsed = friends_active_collapsed
	appSettings.friendsOnlineCollapsed = friends_online_collapsed
	appSettings.friendsOfflineCollapsed = friends_offline_collapsed
	appSettings.friendsPendingCollapsed = friends_pending_collapsed
	appSettings.devMode = developer_mode
	stateInitialized.value = true
	debugStartup('App state initialized')
	await traceStartupStep('Render initialized app', nextTick)
	const isSyncUpdateVersion = version.startsWith('0.20.')
	if (isSyncUpdateVersion && pending_update_toast_for_version !== version) {
		markSyncInstancesUpdateNotificationShown()
	}
	if (
		appSettings.getFeatureFlag('show_sync_instances_update_modal') ||
		(isSyncUpdateVersion &&
			pending_update_toast_for_version === version &&
			(
				await traceStartupStep('Load instances for update notification', () =>
					queryClient.fetchQuery(instanceListQueryOptions()),
				)
			).length > 0)
	) {
		showSyncInstancesUpdateNotification()
	}

	await traceStartupStep('Register window resize listener', () =>
		getCurrentWindow().onResized(async () => {
			isMaximized.value = await getCurrentWindow().isMaximized()
			isFullscreen.value = await getCurrentWindow().isFullscreen()
		}),
	)

	if (telemetry) {
		;
		if (dev) ;
		;
	}

	const osType = await traceStartupStep('Read operating system type', async () => type())
	if (osType === 'macos') {
		document.getElementsByTagName('html')[0].classList.add('mac')
	} else {
		document.getElementsByTagName('html')[0].classList.add('windows')
	}


	traceStartupStep('Read opening command', get_opening_command).then(handleCommand)
	traceStartupStep('Refresh startup credentials', fetchCredentials)

	if (pending_update_toast_for_version !== null) {
		const settings = await traceStartupStep(
			'Read settings to clear update notification',
			getSettings,
		)
		settings.pending_update_toast_for_version = null
		await traceStartupStep('Clear update notification', () => setSettings(settings))
	}
}

const stateFailed = ref(false)
traceStartupStep('Initialize backend state', () => initialize_state(appEventChannel))
	.then(() => {
		traceStartupStep('Initialize frontend state', setupApp).then(() => {
			void setupStarterInstances(async () => {
				await onboardingChecklist.initialize()
				await queryClient.invalidateQueries({ queryKey: ['instances'] })
			}).catch(handleError)
		}).catch((err) => {
			stateFailed.value = true
			console.error(err)
			error.showError(err, null, false, 'state_init')
		})
	})
	.catch((err) => {
		stateFailed.value = true
		console.error('Failed to initialize app', err)
		error.showError(err, null, false, 'state_init')
	})

const handleClose = async () => {
	await invoke('desktop_window_action', { action: 'close' })
}

const loading = setupLoadingStateProvider(() => ({
	stateInitialized: stateInitialized.value,
	stateFailed: stateFailed.value,
	initialStatePending: !!initialLoadToken,
	navigationPending: !!routerToken,
	routeSuspensePending: !!suspenseToken,
	route: route.path,
}))
loading.setEnabled(false)
let initialLoadToken = loading.begin('Initial app state')
let routerToken = null
let suspenseToken = null

let suspensePending = false

const sidebarOverlayScrollbarsOptions = Object.freeze({
	overflow: {
		x: 'hidden',
		y: 'scroll',
	},
})

router.beforeEach((to, from) => {
	debugStartup('Route navigation started', { to: to.path, from: from.path })
	suspensePending = false
	if (routerToken) loading.end(routerToken)
	routerToken = loading.begin(`Route navigation: ${to.path}`)
})
router.afterEach((to, from, failure) => {
	debugStartup('Route navigation settled', { to: to.path, failed: !!failure })
	updateHistoryNavigationState()
	;
	setTimeout(() => {
		debugStartup('Route loading release check', {
			route: to.path,
			suspensePending,
			stateInitialized: stateInitialized.value,
		})
		if (!suspensePending && stateInitialized.value) {
			if (initialLoadToken) {
				loading.end(initialLoadToken)
				initialLoadToken = null
			}
			if (routerToken) {
				loading.end(routerToken)
				routerToken = null
			}
		}
	}, 100)
})

function onSuspensePending() {
	debugStartup('Route Suspense pending', { route: route.path })
	suspensePending = true
	if (suspenseToken) loading.end(suspenseToken)
	suspenseToken = loading.begin(`Route Suspense: ${route.path}`)
}

function onSuspenseResolve() {
	if (import.meta.env.VITE_SIMPLEMC_BENCHMARK === 'true') window.__simplemcPerformance?.routeResolved()
	debugStartup('Route Suspense resolved', { route: route.path })
	if (suspenseToken) {
		loading.end(suspenseToken)
		suspenseToken = null
	}
	if (routerToken) {
		loading.end(routerToken)
		routerToken = null
	}
}

const queryClient = useQueryClient()

watch(stateInitialized, (ready) => {
	debugStartup('State readiness changed', { ready })
	if (ready) {
		if (initialLoadToken) {
			loading.end(initialLoadToken)
			initialLoadToken = null
		}
		if (routerToken) {
			loading.end(routerToken)
			routerToken = null
		}

		queryClient.prefetchQuery({
			queryKey: ['servers'],
			queryFn: async () => {
				const response = await tauriApiClient.archon.servers_v0.list({ limit: 100 })
				const hasMedalServers = response.servers.some((s) => s.is_medal)
				if (hasMedalServers) {
					const subscriptions = await tauriApiClient.labrinth.billing_internal.getSubscriptions()
					for (const server of response.servers) {
						if (server.is_medal) {
							const sub = subscriptions.find((s) => s.metadata?.id === server.server_id)
							if (sub) {
								server.medal_expires = new Date(
									new Date(sub.created).getTime() + 5 * 86400000,
								).toISOString()
							}
						}
					}
				}
				return response
			},
			staleTime: 30_000,
		})
		queryClient.prefetchQuery({
			queryKey: ['billing', 'subscriptions'],
			queryFn: () => tauriApiClient.labrinth.billing_internal.getSubscriptions(),
			staleTime: 30_000,
		})
		queryClient.prefetchQuery({
			queryKey: ['billing', 'payments'],
			queryFn: () => tauriApiClient.labrinth.billing_internal.getPayments(),
			staleTime: 30_000,
		})
	}
})

const error = useError()
const errorModal = ref()
const minecraftAuthErrorModal = ref()
const minecraftRequiredModal = ref()

const contentInstall = createContentInstall({ router, handleError, appEvents })
provideContentInstall(contentInstall)
const {
	instances: contentInstallInstances,
	compatibleLoaders: contentInstallLoaders,
	gameVersions: contentInstallGameVersions,
	loading: contentInstallLoading,
	defaultTab: contentInstallDefaultTab,
	preferredLoader: contentInstallPreferredLoader,
	preferredGameVersion: contentInstallPreferredGameVersion,
	releaseGameVersions: contentInstallReleaseGameVersions,
	projectInfo: contentInstallProjectInfo,
	handleInstallToInstance,
	handleCreateAndInstall,
	prepareNewInstance,
	handleNavigate: handleContentInstallNavigate,
	handleCancel: handleContentInstallCancel,
	setContentInstallModal,
	setModpackAlreadyInstalledModal: setContentInstallModpackAlreadyInstalledModal,
	handleModpackDuplicateCreateAnyway: handleContentInstallModpackDuplicateCreateAnyway,
	handleModpackDuplicateGoToInstance: handleContentInstallModpackDuplicateGoToInstance,
	setIncompatibilityWarningModal: setContentIncompatibilityWarningModal,
	incompatibilityWarningVersions: contentInstallIncompatibilityWarningVersions,
	incompatibilityWarningCurrentGameVersion: contentInstallIncompatibilityWarningCurrentGameVersion,
	incompatibilityWarningCurrentLoader: contentInstallIncompatibilityWarningCurrentLoader,
	incompatibilityWarningProjectType: contentInstallIncompatibilityWarningProjectType,
	incompatibilityWarningProjectIconUrl: contentInstallIncompatibilityWarningProjectIconUrl,
	incompatibilityWarningProjectName: contentInstallIncompatibilityWarningProjectName,
	incompatibilityWarningMessage: contentInstallIncompatibilityWarningMessage,
	incompatibilityWarningInstalling: contentInstallIncompatibilityWarningInstalling,
	handleIncompatibilityWarningInstall: handleContentInstallIncompatibilityWarningInstall,
	handleIncompatibilityWarningCancel: handleContentInstallIncompatibilityWarningCancel,
} = contentInstall

async function prepareCreationProjectInstall(projectId, projectType) {
	if (projectType === 'modpack') {
		await contentInstall.install(
			projectId,
			null,
			null,
			'CreationModalProject',
			undefined,
			(instanceId) => void router.push(`/instance/${encodeURIComponent(instanceId)}`),
		)
		return null
	}

	await prepareNewInstance(projectId)
	const info = contentInstallProjectInfo.value
	if (!info) throw new Error(`Project information is unavailable: '${projectId}'`)

	return {
		projectId,
		title: info.title,
		iconUrl: info.iconUrl,
		link: info.link,
		owner: info.owner,
		compatibleLoaders: [...contentInstallLoaders.value],
		gameVersions: [...contentInstallGameVersions.value],
		releaseGameVersions: new Set(contentInstallReleaseGameVersions.value),
	}
}

const serverInstall = createServerInstall({
	router,
	handleError,
	popupNotificationManager,
	appEvents,
})
provideServerInstall(serverInstall)
const {
	setInstallToPlayModal: setServerInstallToPlayModal,
	setUpdateToPlayModal: setServerUpdateToPlayModal,
	playServerProject,
} = serverInstall

const modInstallModal = ref()
const modpackAlreadyInstalledModal = ref()
const contentInstallModpackAlreadyInstalledModal = ref()
const incompatibilityWarningModal = ref()
const installToPlayModal = ref()
const sharedInstanceInviteHandler = ref()
const updateToPlayModal = ref()

const modrinthLoginModal = ref()
const settingsModal = useLazyModal(() => import('@/components/ui/modal/AppSettingsModal.vue'))
const appSettingsModal = settingsModal.instance
const settingsModalComponent = settingsModal.component
const showSettingsModal = (method = 'show') => settingsModal.call(method).catch(handleError)
if (import.meta.env.VITE_SIMPLEMC_BENCHMARK === 'true') {
	window.__simplemcPerformance.openSettings = () => showSettingsModal()
	window.__simplemcPerformance.randomizeIcon = randomizeCreationIcon
	window.__simplemcPerformance.screenshotCount = () => queryClient.getQueryData(screenshotKeys.global())?.length ?? 0
}
const syncInstancesUpdateModal = ref()
let syncInstancesUpdateNotificationId = null

function showSyncInstancesUpdateNotification() {
	if (
		popupNotificationManager
			.getNotifications()
			.some((notification) => notification.id === syncInstancesUpdateNotificationId)
	) {
		return
	}

	if (!shouldShowSyncInstancesUpdateNotification()) return

	const notification = addPopupNotification({
		contentType: 'standard',
		title: formatMessage(messages.syncUpdateTitle),
		text: formatMessage(messages.syncUpdateDescription),
		type: 'info',
		hideIcon: true,
		autoCloseMs: null,
		buttons: [
			{
				label: formatMessage(messages.syncUpdateDismiss),
				color: 'standard',
				action: () => popupNotificationManager.removeNotification(notification.id),
			},
			{
				label: formatMessage(messages.syncUpdateView),
				color: 'brand',
				action: () => syncInstancesUpdateModal.value?.show(),
			},
		],
	})
	syncInstancesUpdateNotificationId = notification.id
}

provide(appSettingsModalOpenProfileKey, () => showSettingsModal('showProfile'))
provide(appSettingsModalOpenSyncedOptionsKey, () => showSettingsModal('showSyncedOptions'))

watch(
	() => appSettings.getFeatureFlag('show_sync_instances_update_modal'),
	(enabled) => {
		if (enabled && stateInitialized.value) {
			showSyncInstancesUpdateNotification()
		}
	},
)

watch(incompatibilityWarningModal, (modal) => {
	if (modal) {
		setContentIncompatibilityWarningModal(modal)
	}
})

const authProvider = setupAuthProvider(credentials, async (_redirectPath, flow, options) => {
	if (options?.showModal === false) {
		await signIn(flow)
	} else {
		await requestSignIn(flow)
	}
})

const userPreferences = setupAppUserPreferencesProvider(authProvider, notificationManager)
let userPreferencesSync = Promise.resolve()

watch(
	[userPreferences.preferences, stateInitialized],
	([preferences, initialized]) => {
		if (!preferences || !initialized) return

		userPreferencesSync = userPreferencesSync
			.then(async () => {
				const settings = await getSettings()
				const selectedTheme = preferences.appearance.auto ? 'system' : preferences.appearance.theme
				const userId = credentials.value?.user_id ?? credentials.value?.user?.id
				if (userId) {
					rememberAccountAppearance(userId, preferences.appearance)
				}
				if (appTheme.syncAcrossDevices && isDarkTheme(preferences.appearance.theme)) {
					appTheme.preferredDark = preferences.appearance.theme
				}
				const locale = preferences.localization.locale
				const behavior = preferences.behavior
				let settingsChanged = false

				if (appTheme.syncAcrossDevices && appTheme.preferred !== selectedTheme) {
					appTheme.preferred = selectedTheme
				}
				if (i18n.global.locale.value !== locale) {
					await setLocale(locale)
				}

				if (appTheme.syncAcrossDevices && settings.theme !== selectedTheme) {
					settings.theme = selectedTheme
					settingsChanged = true
				}
				if (settings.locale !== locale) {
					settings.locale = locale
					settingsChanged = true
				}

				if (behavior && appSettings.syncBehaviorAcrossDevices) {
					const behaviorSettings = {
						refocus_on_game_close: 'refocusOnGameClose',
						compact_instance_cards: 'compactInstanceCards',
						show_play_time: 'showPlayTime',
						warn_on_unknown_modpacks: 'warnOnUnknownModpacks',
						skip_non_essential_warnings: 'skipNonEssentialWarnings',
					}
					for (const [key, stateKey] of Object.entries(behaviorSettings)) {
						const value = behavior[key] ?? settings[key]
						appSettings[stateKey] = value
						if (settings[key] !== value) {
							settings[key] = value
							settingsChanged = true
						}
					}

					appSettings.toggleSidebar = behavior.hide_right_sidebar
					appSettings.hideNametagSkinsPage = behavior.hide_nametag

					if (settings.hide_on_process_start !== behavior.minimize_app) {
						settings.hide_on_process_start = behavior.minimize_app
						settingsChanged = true
					}
					if (settings.toggle_sidebar !== behavior.hide_right_sidebar) {
						settings.toggle_sidebar = behavior.hide_right_sidebar
						settingsChanged = true
					}
					if (settings.hide_nametag_skins_page !== behavior.hide_nametag) {
						settings.hide_nametag_skins_page = behavior.hide_nametag
						settingsChanged = true
					}
				}

				if (behavior && appSettings.syncFeaturesAcrossDevices) {
					const featureSettings = {
						show_jump_in: 'showJumpIn',
						show_files_tab_in_instances: 'showFilesTabInInstances',
						show_worlds_tab_in_instances: 'showWorldsTabInInstances',
						show_screenshots_tab_in_instances: 'showScreenshotsTabInInstances',
						show_skin_selector_in_sidebar: 'showSkinSelectorInSidebar',
					}
					for (const [key, stateKey] of Object.entries(featureSettings)) {
						const value = behavior[key] ?? settings[key]
						appSettings[stateKey] = value
						if (settings[key] !== value) {
							settings[key] = value
							settingsChanged = true
						}
					}
					if (typeof behavior.quick_instance_count === 'number') {
						quickInstances.setLimit(behavior.quick_instance_count)
					}

					const showAllScreenshots = behavior.show_all_screenshots
					if (typeof showAllScreenshots === 'boolean') {
						const globalSyncedOptions =
							globalSyncedOptionsQuery.data.value ??
							(await queryClient.fetchQuery(globalSyncedOptionsQueryOptions()))
						if (globalSyncedOptions.screenshots !== showAllScreenshots) {
							const updatedGlobalSyncedOptions = await set_global_synced_option(
								'screenshots',
								showAllScreenshots,
							)
							queryClient.setQueryData(syncedOptionsKeys.global, updatedGlobalSyncedOptions)
							await queryClient.invalidateQueries({ queryKey: screenshotKeys.all })
						}
					}
				}

				if (settingsChanged) {
					await setSettings(settings)
					queryClient.setQueryData(appSettingsKeys.all, settings)
				}
			})
			.catch(handleError)
	},
	{ immediate: true },
)

async function validateSession(sessionToken) {
	try {
		const response = await tauriFetch(`${config.labrinthBaseUrl}/v2/user`, {
			method: 'GET',
			headers: { Authorization: sessionToken },
		})
		if (response.status === 401) return false
		return true
	} catch {
		return true
	}
}

async function fetchCredentials() {
	const hadSession = !!credentials.value?.session
	const refreshId = ++credentialsRefreshId
	credentials.value = undefined

	const creds = await traceStartupStep('Read stored credentials', getCreds).catch(handleError)
	if (refreshId !== credentialsRefreshId) return
	if (!creds && hadSession) clearLiveNotifications()

	if (creds && creds.user_id) {
		if (
			creds.session &&
			!(await traceStartupStep('Validate stored session', () => validateSession(creds.session)))
		) {
			if (refreshId !== credentialsRefreshId) return

			clearLiveNotifications()
			await removeUser(creds.user_id).catch(handleError)
			if (refreshId !== credentialsRefreshId) return

			credentials.value = null
			liveNotificationsEnabled = false
			await fetchStoredModrinthAccounts()
			return
		}
		creds.user = await traceStartupStep('Fetch signed-in user', () =>
			get_user(creds.user_id, 'bypass'),
		).catch(handleError)
		if (refreshId !== credentialsRefreshId) return
	}
	credentials.value = creds ?? null
	liveNotificationsEnabled = !!creds?.session
	await traceStartupStep('Load stored account profiles', fetchStoredModrinthAccounts)
}

async function signIn(flow = 'sign-in', addAccount = false) {
	try {
		await login(flow, addAccount)
		await fetchCredentials()
	} catch (error) {
		if (
			typeof error === 'object' &&
			typeof error['message'] === 'string' &&
			error.message.includes('Login canceled')
		) {
			// user closed the login window
		} else {
			handleError(error)
		}
	}
}

async function requestSignIn(flow = 'sign-in', addAccount = false) {
	await modrinthLoginModal.value?.showSigningIn(flow, addAccount)
}

async function requestModrinthAuth(flow = 'sign-in', addAccount = false) {
	await signIn(flow, addAccount)
	return !!credentials.value?.session
}

async function logOut() {
	if (!credentials.value?.user) return
	await completeAccountSwitch(() => logout())
}

async function fetchStoredModrinthAccounts() {
	const all = (await getAllCreds().catch(handleError)) ?? []
	const ids = all.map((account) => account.user_id)
	const users = ids.length ? ((await get_user_many(ids).catch(handleError)) ?? []) : []
	const usersById = new Map(users.map((user) => [user.id, user]))

	storedModrinthAccounts.value = all.map((account) => ({
		...account,
		user: usersById.get(account.user_id) ?? {
			id: account.user_id,
			username: account.user_id,
			avatar_url: null,
			role: 'developer',
		},
	}))
}

const accountSwitcherAccounts = computed(() => {
	const currentId = credentials.value?.session ? credentials.value.user_id : null

	return storedModrinthAccounts.value.map((account) => ({
		...account,
		optionId: `account-${account.user_id}`,
		current: account.user_id === currentId,
	}))
})

const profileButtonTooltip = computed(() => {
	if (credentials.value === undefined) return formatMessage(messages.loadingProfile)
	if (credentials.value?.user) return formatMessage(messages.modrinthAccount)
	return formatMessage(messages.signInToModrinthAccount)
})

const accountSwitcherOptions = computed(() => [
	...accountSwitcherAccounts.value.map((account) => ({
		id: account.optionId,
		label: account.user.username,
		selected: account.current,
		action: () => switchModrinthAccount(account),
		trailingAction: {
			label: formatMessage(messages.removeAccount),
			icon: XIcon,
			color: 'red',
			action: () => forgetModrinthAccount(account.user_id),
		},
	})),
	{
		type: 'divider',
	},
	{
		id: 'add-account',
		label: formatMessage(messages.addAccount),
		icon: PlusIcon,
		action: () => requestSignIn('sign-in', true),
	},
])

const isSwitchingAccount = ref(false)

async function persistAppearanceTheme(appearance) {
	const selectedTheme = appearance.auto ? 'system' : appearance.theme
	appTheme.applyAccountAppearance(appearance)
	const settings = await getSettings()
	if (settings.theme !== selectedTheme) {
		settings.theme = selectedTheme
		await setSettings(settings)
	}
}

async function completeAccountSwitch(task) {
	isSwitchingAccount.value = true
	await nextTick()
	try {
		await task()
		window.location.reload()
	} catch (error) {
		isSwitchingAccount.value = false
		handleError(error)
	}
}

async function switchModrinthAccount(account) {
	if (account.current) return

	const cached = getAccountAppearance(account.user_id)
	if (cached) await persistAppearanceTheme(cached)
	await nextTick()

	await completeAccountSwitch(async () => {
		await setActive(account.user_id)
		if (cached) return

		try {
			const preferences = await get_user_preferences(account.user_id)
			rememberAccountAppearance(account.user_id, preferences.appearance)
			await persistAppearanceTheme(preferences.appearance)
			await nextTick()
		} catch {
			// no saved appearance for this account
		}
	})
}

async function forgetModrinthAccount(userId) {
	const isCurrent = credentials.value?.user_id === userId && !!credentials.value?.session
	if (isCurrent) {
		await completeAccountSwitch(() => removeUser(userId))
		return
	}

	await removeUser(userId).catch(handleError)
	await fetchStoredModrinthAccounts()
}

const modrinthAccountMenuOptions = computed(() => [
	{
		id: 'view-profile',
		label: formatMessage(messages.viewProfile),
		icon: UserIcon,
		action: () => router.push(`/user/${encodeURIComponent(credentials.value.user.username)}`),
	},
	{
		id: 'flags',
		label: formatMessage(commonSettingsMessages.featureFlags),
		icon: ToggleRightIcon,
		shown: appSettings.devMode,
		action: () => showSettingsModal('showFeatureFlags'),
	},
	{
		type: 'divider',
	},
	{
		id: 'switch-account',
		label: formatMessage(messages.switchAccount),
		icon: ArrowLeftRightIcon,
		type: 'submenu',
		options: accountSwitcherOptions.value,
	},
	{
		id: 'sign-out',
		label: formatMessage(commonMessages.signOutButton),
		icon: LogOutIcon,
		tone: 'red',
		action: () => logOut(),
	},
])

onMounted(() => {
	invoke('show_window')

	error.setErrorModal(errorModal.value)
	error.setMinecraftAuthErrorModal(minecraftAuthErrorModal.value)
	error.setMinecraftRequiredModal(minecraftRequiredModal.value)

	setContentIncompatibilityWarningModal(incompatibilityWarningModal.value)
	setContentInstallModal(modInstallModal.value)
	setContentInstallModpackAlreadyInstalledModal(contentInstallModpackAlreadyInstalledModal.value)
	setModpackAlreadyInstalledModal(modpackAlreadyInstalledModal.value)
	setServerInstallToPlayModal(installToPlayModal.value)
	setServerUpdateToPlayModal(updateToPlayModal.value)
})

const accounts = ref(null)
provide('accountsCard', accounts)

useAppEvent('command', handleCommand, appEvents)
useAppEvent('notification', handleLiveNotification, appEvents)

async function markLiveNotificationRead(notification) {
	try {
		await tauriApiClient.labrinth.notifications_v2.markAsRead(notification.id)
	} catch (error) {
		if (error instanceof ModrinthApiError && error.statusCode === 404) {
			console.warn(`notification ${notification.id} could not be marked as read`, error)
			return
		}
		throw error
	}
}

async function respondToServerInvite(notification, action) {
	const serverId = notification.body?.server_id
	if (typeof serverId !== 'string') {
		throw new Error('Missing server ID for invite notification.')
	}

	await tauriApiClient.request(`/servers/${serverId}/invites/${action}`, {
		api: 'archon',
		version: 1,
		method: 'POST',
	})
	await markLiveNotificationRead(notification)

	return serverId
}

async function acceptServerInviteNotification(notification) {
	try {
		const serverId = await respondToServerInvite(notification, 'accept')
		await router.push(`/hosting/manage/${encodeURIComponent(serverId)}`)
		queryClient.invalidateQueries({ queryKey: ['servers'] })
	} catch (error) {
		handleError(error)
	}
}

async function declineServerInviteNotification(notification) {
	try {
		await respondToServerInvite(notification, 'decline')
	} catch (error) {
		handleError(error)
	}
}

function openServerInviteInviterProfile(inviterName) {
	if (!inviterName) return
	void router.push(`/user/${encodeURIComponent(inviterName)}`)
}

async function handleLiveNotification(notification) {
	if (!liveNotificationsEnabled || !notification?.body || notification.read) return
	if (await sharedInstanceInviteHandler.value?.handleNotification(notification)) return

	if (notification.body.type === 'server_invite') {
		if (displayedServerInviteNotifications.has(notification.id)) return

		const generation = liveNotificationGeneration
		displayedServerInviteNotifications.add(notification.id)

		const serverName =
			typeof notification.body.server_name === 'string' ? notification.body.server_name : 'a server'
		const inviterId = notification.body.invited_by
		const invitedBy =
			typeof inviterId === 'string' ? await get_user(inviterId, 'bypass').catch(() => null) : null
		if (generation !== liveNotificationGeneration) return

		const popupNotification = addPopupNotification({
			contentType: 'toast',
			title: serverName,
			type: 'server-invite',
			actorName: invitedBy?.username ?? null,
			actorAvatarUrl: invitedBy?.avatar_url ?? null,
			entityName: serverName,
			autoCloseMs: null,
			onAccept: () => acceptServerInviteNotification(notification),
			onDecline: () => declineServerInviteNotification(notification),
			onOpenActor: () => openServerInviteInviterProfile(invitedBy?.username ?? null),
		})
		serverInvitePopupNotificationIds.add(popupNotification.id)
	}
}

function clearLiveNotifications() {
	liveNotificationGeneration++
	liveNotificationsEnabled = false
	for (const id of serverInvitePopupNotificationIds) {
		popupNotificationManager.removeNotification(id)
	}
	displayedServerInviteNotifications.clear()
	serverInvitePopupNotificationIds.clear()
	sharedInstanceInviteHandler.value?.clearNotifications()
}

async function handleCommand(e) {
	if (!e) return

	if (e.event === 'RunMRPack') {
		// RunMRPack should directly install a local mrpack given a path
		if (e.path.endsWith('.mrpack')) {
			const location = { type: 'fromFile', path: e.path }
			const preview = await install_get_modpack_preview(location).catch(handleError)
			if (preview?.unknownFile || preview?.externalFilesInModpack.length > 0) {
				const splitPath = e.path.split(/[\\/]/)
				const fileName = splitPath ? splitPath[splitPath.length - 1] : e.path
				unknownPackWarningModal.value?.show(
					() => install_create_modpack_instance(location).then(() => undefined),
					fileName,
					preview.externalFilesInModpack,
				)
			} else {
				await install_create_modpack_instance(location).catch(handleError)
			}
			;
		}
	} else if (e.event === 'LaunchInstance') {
		const instance = await getInstance(e.id).catch(handleError)
		if (!instance || instance.quarantined) return

		if (e.server) {
			await start_join_server(e.id, e.server).catch(handleError)
		} else if (e.singleplayer_world) {
			await start_join_singleplayer_world(e.id, e.singleplayer_world).catch(handleError)
		} else {
			await run(e.id).catch(handleError)
		}
	} else if (e.event === 'InstallSharedInstanceInvite') {
		await sharedInstanceInviteHandler.value?.installFromInviteId(e.invite_id)
	} else if (e.event === 'InstallServer') {
		await router.push(`/project/${e.id}`)
		await playServerProject(e.id).catch(handleError)
	} else if (e.event === 'InstallVersion') {
		const version = await get_version(e.id, 'must_revalidate').catch(handleError)
		if (version) {
			await contentInstall
				.install(version.project_id, version.id, null, 'URLConfirmModal', undefined, undefined, {
					showProjectInfo: true,
				})
				.catch(handleError)
		}
	} else {
		await contentInstall
			.install(e.id, null, null, 'URLConfirmModal', undefined, undefined, { showProjectInfo: true })
			.catch(handleError)
	}
}

const appUpdateDownload = {
	progress: appUpdateState.progress,
	version: ref(),
}
let unlistenUpdateDownload

const {
	metered,
	finishedDownloading,
	downloading,
	restarting,
	availableUpdate,
	updateSize,
	updatesEnabled,
} = appUpdateState
let delayedUpdatePopupTimeout = null

const updatePopupMessages = defineMessages({
	updateAvailable: {
		id: 'app.update-popup.title',
		defaultMessage: 'Update available',
	},
	downloadComplete: {
		id: 'app.update-popup.download-complete',
		defaultMessage: 'Download complete',
	},
	meteredBody: {
		id: 'app.update-popup.body.metered',
		defaultMessage: `SimpleMC v{version} is available now! Since you're on a metered network, we didn't automatically download it.`,
	},
	downloadedBody: {
		id: 'app.update-popup.body.download-complete',
		defaultMessage: `SimpleMC v{version} has finished downloading. Reload to update now, or automatically when you close SimpleMC.`,
	},
	linuxBody: {
		id: 'app.update-popup.body.linux',
		defaultMessage:
			'SimpleMC v{version} is available. Use your package manager to update for the latest features and fixes!',
	},
	reload: {
		id: 'app.update-popup.reload',
		defaultMessage: 'Reload to update',
	},
	download: {
		id: 'app.update-popup.download',
		defaultMessage: 'Download ({size})',
	},
	changelog: {
		id: 'app.update-popup.changelog',
		defaultMessage: 'Changelog',
	},
})

function clearDelayedUpdatePopup() {
	if (delayedUpdatePopupTimeout !== null) {
		clearTimeout(delayedUpdatePopupTimeout)
		delayedUpdatePopupTimeout = null
	}
}

function getCurrentUpdatePromptStage() {
	return finishedDownloading.value ? 'downloaded' : 'available'
}

function scheduleDelayedUpdatePopup() {
	clearDelayedUpdatePopup()

	const version = availableUpdate.value?.version
	if (!version) {
		return
	}

	const nextPopupTime = getNextAppUpdatePopupTime(version, getCurrentUpdatePromptStage())
	if (nextPopupTime === null) {
		return
	}

	const delay = nextPopupTime - Date.now()
	if (delay <= 0) {
		showDelayedUpdatePopup()
		return
	}

	delayedUpdatePopupTimeout = setTimeout(showDelayedUpdatePopup, Math.min(delay, 2_147_483_647))
}

function showDelayedUpdatePopup() {
	const update = availableUpdate.value
	if (!update) {
		return
	}

	const stage = getCurrentUpdatePromptStage()
	const nextPopupTime = getNextAppUpdatePopupTime(update.version, stage)
	if (nextPopupTime === null) {
		return
	}

	if (Date.now() < nextPopupTime) {
		scheduleDelayedUpdatePopup()
		return
	}

	if (metered.value && !finishedDownloading.value) {
		addPopupNotification({
			contentType: 'standard',
			title: formatMessage(updatePopupMessages.updateAvailable),
			text: formatMessage(updatePopupMessages.meteredBody, { version: update.version }),
			type: 'info',
			autoCloseMs: null,
			buttons: [
				{
					label: formatMessage(updatePopupMessages.download, {
						size: formatBytes(updateSize.value ?? 0),
					}),
					action: () => downloadAvailableAppUpdate(),
					color: 'brand',
				},
				{
					label: formatMessage(updatePopupMessages.changelog),
					action: () => openAppUpdateChangelog(),
					keepOpen: true,
				},
			],
		})
	} else if (finishedDownloading.value) {
		addPopupNotification({
			contentType: 'standard',
			title: formatMessage(updatePopupMessages.downloadComplete),
			text: formatMessage(updatePopupMessages.downloadedBody, {
				version: update.version,
			}),
			type: 'success',
			autoCloseMs: null,
			buttons: [
				{
					label: formatMessage(updatePopupMessages.reload),
					action: () => installAvailableAppUpdate(),
					color: 'brand',
				},
				{
					label: formatMessage(updatePopupMessages.changelog),
					action: () => openAppUpdateChangelog(),
					keepOpen: true,
				},
			],
		})
	} else {
		scheduleDelayedUpdatePopup()
		return
	}

	markAppUpdatePopupShown(update.version, stage)
}

let updateCheckPromise = null

async function checkUpdates(manual = false) {
	if (updateCheckPromise) return updateCheckPromise
	updateCheckPromise = performUpdateCheck(manual).finally(() => { updateCheckPromise = null })
	return updateCheckPromise
}

async function performUpdateCheck(manual) {
	updateCheckState.value.checking = true
	updateCheckState.value.message = 'Checking for updates…'
	try {
		if (!(await areUpdatesEnabled())) {
			updatesEnabled.value = false
			updateCheckState.value.message = manual
				? 'This development preview cannot check for updates. Update checks work in the installed release.'
				: ''
			return
		}
		async function performCheck() {
			const update = await invoke('check_app_update')
			if (!update) {
				updateCheckState.value.message = `You’re up to date. You have SimpleMC ${await getVersion()}.`
				return
			}

			updateCheckState.value.message = finishedDownloading.value && availableUpdate.value?.version === update.version
				? `SimpleMC ${update.version} is downloaded and ready to install.`
				: `A new version is available: SimpleMC ${update.version}.`
			const isExistingUpdate = update.version === availableUpdate.value?.version

			if (isExistingUpdate) {
				console.log('Update is already known')
				scheduleDelayedUpdatePopup()
				return
			}

			appUpdateDownload.progress.value = 0
			finishedDownloading.value = false
			downloading.value = false
			updateSize.value = null
			availableUpdate.value = update

			console.log(`Update ${update.version} is available.`)

			metered.value = await isNetworkMetered()
			if (!metered.value && updatePreferences.value.enabled) {
				console.log('Starting download of update')
				await downloadUpdate(update)
			} else {
				console.log(`Metered connection detected, not auto-downloading update.`)
				markAppUpdateActionable(update.version)
				scheduleDelayedUpdatePopup()
			}

			getUpdateSize(update.rid).then((size) => (updateSize.value = size))
		}

		await performCheck()
	} catch (error) {
		updateCheckState.value.message = 'Could not check for updates. Please try again.'
		console.warn('Could not check for SimpleMC updates.', error)
	} finally {
		updateCheckState.value.checking = false
	}
}

async function downloadAvailableUpdate() {
	return downloadUpdate(availableUpdate.value)
}

async function downloadUpdate(versionToDownload) {
	if (!versionToDownload) {
		handleError(formatMessage(messages.updateDownloadMissingVersion))
		return
	}

	if (downloading.value || appUpdateDownload.progress.value !== 0) {
		console.error(`Update ${versionToDownload.version} already downloading`)
		return
	}

	console.log(`Downloading update ${versionToDownload.version}`)
	downloading.value = true

	try {
		unlistenUpdateDownload = await subscribeToDownloadProgress(
			appEvents, appUpdateDownload, versionToDownload.version,
		)
		await enqueueUpdateForInstallation(versionToDownload.rid)
		finishedDownloading.value = true
		updateCheckState.value.message = `SimpleMC ${versionToDownload.version} is downloaded and ready to install.`
		markAppUpdateActionable(versionToDownload.version, 'downloaded')
		scheduleDelayedUpdatePopup()
	} catch (e) {
		appUpdateDownload.progress.value = 0
		updateCheckState.value.message = 'The update could not be downloaded. Please try again.'
		handleError(e)
	} finally {
		downloading.value = false
		unlistenUpdateDownload?.()
		unlistenUpdateDownload = null
	}
}

async function installUpdate() {
	restarting.value = true

	try {
		await setRestartAfterPendingUpdate(true)
	} catch (e) {
		restarting.value = false
		handleError(e)
		return
	}
	setTimeout(async () => {
		await handleClose()
	}, 250)
}

setAppUpdateActions({
	check: () => checkUpdates(true),
	download: downloadAvailableUpdate,
	install: installUpdate,
	changelog: () => openUrl('https://github.com/lequcfel/SimpleMC/releases'),
})

async function openModrinthProjectLinkInApp(parsed) {
	const { slug, pathSuffix, url } = parsed
	const loadToken = loading.begin()
	try {
		const { id } = await tauriApiClient.labrinth.projects_v2.check(slug)
		const query = mergeUrlQuery(route.query, url)
		await router.push({
			path: `/project/${id}${pathSuffix}`,
			query,
			hash: url.hash || undefined,
		})
	} catch (err) {
		if (err instanceof ModrinthApiError && err.statusCode === 404) {
			openUrl(url.href)
		} else {
			handleError(err)
		}
	} finally {
		loading.end(loadToken)
	}
}

function handleClick(e) {
	let target = e.target
	while (target != null) {
		if (target.matches('a')) {
			if (
				target.href &&
				['http://', 'https://', 'mailto:', 'tel:'].some((v) => target.href.startsWith(v)) &&
				!target.classList.contains('router-link-active') &&
				!target.href.startsWith('http://localhost') &&
				!target.href.startsWith('https://tauri.localhost') &&
				!target.href.startsWith('http://tauri.localhost')
			) {
				const userPath = parse_modrinth_user_link(target.href)
				const parsed = parseModrinthLink(target.href)
				if (userPath) {
					void router.push(userPath)
				} else if (target.target !== '_blank' && parsed) {
					void openModrinthProjectLinkInApp(parsed)
				} else {
					openUrl(target.href)
				}
			}
			e.preventDefault()
			break
		}
		target = target.parentElement
	}
}

function handleAuxClick(e) {
	// disables middle click -> new tab
	if (e.button === 1) {
		e.preventDefault()
		// instead do a left click
		const event = new MouseEvent('click', {
			view: window,
			bubbles: true,
			cancelable: true,
		})
		e.target.dispatchEvent(event)
	}
}

function handleContextMenu(event) {
	const target = event.target
	if (target instanceof Element) {
		if (target.closest('img, textarea, [contenteditable="true"]')) return
		const input = target.closest('input')
		if (
			input &&
			!['button', 'checkbox', 'radio', 'submit', 'reset', 'file', 'range'].includes(input.type)
		) {
			return
		}
	}

	const selection = window.getSelection()
	if (
		target instanceof Node &&
		selection &&
		!selection.isCollapsed &&
		selection.containsNode(target, true)
	) {
		return
	}

	event.preventDefault()
}

provideAppUpdateDownloadProgress(appUpdateDownload)
</script>

<template>
	<TooltipDirective />
	<SplashScreen v-if="!stateFailed" ref="splashScreen" data-tauri-drag-region />
	<div id="teleports"></div>
	<div
		v-if="stateInitialized"
		class="app-grid-layout relative"
		:style="backgroundStyle"
		:class="{ 'home-background-layout': showSelectedBackground, 'disable-advanced-rendering': !appTheme.advancedRendering }"
	>
		<Transition name="fade">
			<div
				v-if="restarting"
				data-tauri-drag-region
				class="inset-0 fixed bg-black/80 backdrop-blur z-[200] flex items-center justify-center"
			>
				<span
					data-tauri-drag-region
					class="flex items-center gap-4 text-contrast font-semibold text-xl select-none cursor-default"
				>
					<RefreshCwIcon data-tauri-drag-region class="animate-spin w-6 h-6" />
					{{ formatMessage(messages.restarting) }}
				</span>
			</div>
		</Transition>
		<component :is="settingsModalComponent" v-if="settingsModalComponent" ref="appSettingsModal" />
		<SyncInstancesUpdateModal ref="syncInstancesUpdateModal" />
		<CreationFlowModal
			ref="installationModal"
			type="instance"
			show-snapshot-toggle
			:fetch-existing-instance-names="fetchExistingInstanceNames"
			:search-projects="searchProjects"
			:prepare-project-install="prepareCreationProjectInstall"
			:create-project-install="handleCreateAndInstall"
			:get-loader-manifest="getLoaderManifest"
			:randomize-instance-icon="randomizeCreationIcon"
			:customize-instance-icon="customizeCreationIcon"
			@create="handleCreate"
			@browse-modpacks="handleBrowseModpacks"
		/>
		<component
			:is="creationIconEditorComponent"
			v-if="creationIconEditorComponent"
			ref="creationIconEditorModal"
			:config="creationGeneratedIcon?.config"
			@saved="onCreationIconSaved"
		/>
		<UnknownPackWarningModal ref="unknownPackWarningModal" />
		<div v-show="route.path === '/'" class="app-grid-navbar flex flex-col p-2 gap-1">
			<AccountsCard ref="accounts" />
			<NavButton
				v-tooltip.right="formatMessage(commonMessages.settingsLabel)"
				:to="() => showSettingsModal()"
			>
				<SettingsIcon />
			</NavButton>
		</div>
		<div data-tauri-drag-region class="app-grid-statusbar bg-bg-raised h-[--top-bar-height] flex">
			<div data-tauri-drag-region class="flex min-w-0 flex-1 items-center overflow-hidden p-2">
				<RouterLink
					to="/"
					data-tauri-drag-region-exclude
					class="flex shrink-0 items-center gap-2 rounded-md no-underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand"
					aria-label="SimpleMC Home"
				>
					<span class="simplemc-logo" aria-hidden="true"></span>
					<span class="text-contrast text-lg font-bold">SimpleMC</span>
				</RouterLink>
				<div v-if="canNavigateBack || canNavigateForward" data-tauri-drag-region class="ml-2 flex shrink-0 items-center gap-2">
					<IconButton
						v-if="canNavigateBack"
						type="outlined"
						:label="formatMessage(messages.goBack)"
						class="!h-7 !min-w-7 !w-7 !border !border-surface-4 !p-0 !opacity-100"
						@click="router.back()"
					>
						<ChevronLeftIcon
							class="!size-4 !text-primary"
						/>
					</IconButton>
					<IconButton
						v-if="canNavigateForward"
						type="outlined"
						:label="formatMessage(messages.goForward)"
						class="!h-7 !min-w-7 !w-7 !border !border-surface-4 !p-0 !opacity-100"
						@click="router.forward()"
					>
						<ChevronRightIcon
							class="!size-4 !text-primary"
						/>
					</IconButton>
				</div>
				<Breadcrumbs v-if="route.path !== '/'" />
			</div>
			<section data-tauri-drag-region class="flex shrink-0 ml-auto items-center">
				<div class="flex mr-3">
					<Suspense>
						<AppActionBar />
					</Suspense>
				</div>
				<WindowControls :transparent="showSelectedBackground" />
			</section>
		</div>
	</div>
	<div
		v-if="stateInitialized"
		class="app-contents"
		:class="{
			'sidebar-enabled': sidebarVisible,
			'home-background-contents': showSelectedBackground,
			'disable-advanced-rendering': !appTheme.advancedRendering,
		}"
	>
		<div class="app-viewport flex-grow router-view" :class="{ 'home-viewport': route.path === '/' }">
			<div
				class="loading-indicator-container h-8 fixed z-50 pointer-events-none"
				:style="{
					top: 'calc(var(--top-bar-height))',
					left: 'calc(var(--left-bar-width))',
					width: 'calc(100% - var(--left-bar-width) - var(--right-bar-width))',
				}"
			>
				<LoadingBar position="absolute" />
			</div>
			<div
				v-if="appSettings.featureFlags.page_path"
				class="absolute bottom-0 left-0 m-2 bg-tooltip-bg text-tooltip-text font-semibold rounded-full px-2 py-1 text-xs z-50"
			>
				{{ route.fullPath }}
			</div>
			<div
				id="background-teleport-target"
				class="absolute h-full -z-10 rounded-tl-[--radius-xl] overflow-hidden"
				:style="{
					width: 'calc(100% - var(--right-bar-width))',
				}"
			></div>
			<Admonition
				v-if="criticalErrorMessage"
				type="critical"
				:header="criticalErrorMessage.header"
				class="m-6 mb-0"
			>
				<div
					class="markdown-body text-primary"
					v-html="renderString(criticalErrorMessage.body ?? '')"
				></div>
			</Admonition>
			<Admonition
				v-if="authUnreachable"
				type="warning"
				:header="formatMessage(messages.authUnreachableHeader)"
				class="m-6 mb-0"
			>
				{{ formatMessage(messages.authUnreachableBody) }}
			</Admonition>
			<RouterView v-else v-slot="{ Component }">
				<template v-if="Component">
					<Suspense @pending="onSuspensePending" @resolve="onSuspenseResolve">
						<component :is="Component"></component>
					</Suspense>
				</template>
			</RouterView>
		</div>
		<div
			class="app-sidebar mt-px shrink-0 flex flex-col border-0 border-l-[1px] border-[--brand-gradient-border] border-solid"
			
		>
			<div
				v-overlay-scrollbars="sidebarOverlayScrollbarsOptions"
				class="app-sidebar-scrollable flex-grow shrink relative"
				data-overlayscrollbars-initialize
			>
				<div id="sidebar-teleport-target" class="sidebar-teleport-content"></div>

			</div>
		</div>
	</div>
	<I18nDebugPanel />
	<NotificationPanel :has-sidebar="sidebarVisible" />
	<PopupNotificationPanel :has-sidebar="sidebarVisible" />
	<ErrorModal ref="errorModal" />
	<MinecraftAuthErrorModal ref="minecraftAuthErrorModal" />
	<MinecraftRequiredModal ref="minecraftRequiredModal" />
	<ContentInstallModal
		ref="modInstallModal"
		:instances="contentInstallInstances"
		:compatible-loaders="contentInstallLoaders"
		:game-versions="contentInstallGameVersions"
		:loading="contentInstallLoading"
		:default-tab="contentInstallDefaultTab"
		:preferred-loader="contentInstallPreferredLoader"
		:preferred-game-version="contentInstallPreferredGameVersion"
		:release-game-versions="contentInstallReleaseGameVersions"
		:project-info="contentInstallProjectInfo"
		:randomize-icon="randomizeCreationIcon"
		:customize-icon="customizeContentInstallIcon"
		@install="handleInstallToInstance"
		@create-and-install="handleCreateAndInstall"
		@navigate="handleContentInstallNavigate"
		@cancel="handleContentInstallCancel"
	/>
	<ModpackAlreadyInstalledModal
		ref="modpackAlreadyInstalledModal"
		@create-anyway="handleModpackDuplicateCreateAnyway"
		@go-to-instance="handleModpackDuplicateGoToInstance"
	/>
	<ContentUpdaterModal
		ref="incompatibilityWarningModal"
		mode="incompatibility-warning"
		:versions="contentInstallIncompatibilityWarningVersions"
		:current-game-version="contentInstallIncompatibilityWarningCurrentGameVersion"
		:current-loader="contentInstallIncompatibilityWarningCurrentLoader"
		current-version-id=""
		:is-app="true"
		:project-type="contentInstallIncompatibilityWarningProjectType"
		:project-icon-url="contentInstallIncompatibilityWarningProjectIconUrl"
		:project-name="contentInstallIncompatibilityWarningProjectName"
		:warning="contentInstallIncompatibilityWarningMessage"
		:action-loading="contentInstallIncompatibilityWarningInstalling"
		@update="handleContentInstallIncompatibilityWarningInstall"
		@cancel="handleContentInstallIncompatibilityWarningCancel"
	/>
	<ModpackAlreadyInstalledModal
		ref="contentInstallModpackAlreadyInstalledModal"
		@create-anyway="handleContentInstallModpackDuplicateCreateAnyway"
		@go-to-instance="handleContentInstallModpackDuplicateGoToInstance"
	/>
	<InstallToPlayModal ref="installToPlayModal" :show-external-warnings="false" />
	<UpdateToPlayModal ref="updateToPlayModal" :show-external-warnings="false" />
</template>

<style lang="scss" scoped>
.simplemc-logo {
	width: 1.75rem;
	height: 1.75rem;
	background-color: var(--color-brand);
	mask: url('@/assets/SimpleMC-logo.png') center / contain no-repeat;
	-webkit-mask: url('@/assets/SimpleMC-logo.png') center / contain no-repeat;
}

.app-grid-layout,
.app-contents {
	--top-bar-height: 3rem;
	--left-bar-width: 0rem;
	--right-bar-width: 300px;
}

.app-grid-layout {
	display: grid;
	grid-template: 'status status' 'nav dummy';
	grid-template-columns: auto 1fr;
	grid-template-rows: auto minmax(0, 1fr);
	position: relative;
	//z-index: 0;
	background-color: var(--color-raised-bg);
	height: 100vh;
}

.home-background-layout {
	overflow: hidden;

	&::before {
		content: '';
		position: absolute;
		inset: -20px;
		background: var(--home-background-image) center / cover no-repeat;
		opacity: 0.75;
		filter: blur(var(--home-background-blur));
		pointer-events: none;
	}

	.app-grid-statusbar {
		background: transparent;
	}
}

.app-contents.home-background-contents {
	background: transparent;
	border-radius: 0;

	&::before {
		display: none;
	}

	:deep(.home-background) {
		display: none;
	}
}

.app-grid-navbar {
	position: absolute;
	left: 0;
	bottom: 0;
	background: transparent;
	z-index: 2;

	> :deep(*) {
		flex-shrink: 0;
	}
}

.app-grid-statusbar {
	grid-area: status;
	padding-right: var(--window-controls-width, 0px);
	position: relative;
	z-index: 2;
}

[data-tauri-drag-region-exclude] {
	-webkit-app-region: no-drag;
}

.app-contents {
	position: absolute;
	z-index: 1;
	left: var(--left-bar-width);
	top: var(--top-bar-height);
	right: 0;
	bottom: 0;
	height: calc(100vh - var(--top-bar-height));
	background-color: var(--color-bg);
	border-radius: var(--radius-xl);
	overflow: hidden;

	display: grid;
	grid-template-columns: 1fr 0px;
	// transition: grid-template-columns 0.4s ease-in-out;

	&.sidebar-enabled {
		grid-template-columns: 1fr 300px;
	}
}

.loading-indicator-container {
	border-top-left-radius: var(--radius-xl);
	overflow: hidden;
}

.app-sidebar {
	display: none;
	overflow: visible;
	width: 300px;
	position: relative;
	height: calc(100vh - var(--top-bar-height));
	background: var(--brand-gradient-bg);

	--color-button-bg: var(--brand-gradient-button);
	--surface-4: var(--brand-gradient-button);
	--color-button-bg-hover: var(--brand-gradient-border);
	--surface-5: var(--brand-gradient-border);
	--color-divider: var(--brand-gradient-border);
	--color-divider-dark: var(--brand-gradient-border);
}

.app-sidebar::after {
	content: '';
	position: absolute;
	bottom: 0;
	left: 0;
	right: 0;
	height: 5rem;
	background: var(--brand-gradient-fade-out-color);
	pointer-events: none;
}


.disable-advanced-rendering {
	.app-sidebar::before {
		box-shadow: none;
	}

	&.app-contents::before {
		box-shadow: none;
	}

	*,
	:deep(*) {
		box-shadow: none !important;
		--tw-drop-shadow:;
	}
}

.app-sidebar::before {
	content: '';
	box-shadow: -15px 0 15px -15px rgba(0, 0, 0, 0.1) inset;
	top: 0;
	bottom: 0;
	left: -2rem;
	width: 2rem;
	position: absolute;
	pointer-events: none;
}

.app-viewport {
	flex-grow: 1;
	height: 100%;
	overflow: auto;
	overflow-x: hidden;
	scrollbar-gutter: stable;
}

.app-viewport.home-viewport {
	scrollbar-gutter: auto;
}

.app-contents::before {
	z-index: 30;
	content: '';
	position: fixed;
	left: var(--left-bar-width);
	top: var(--top-bar-height);
	right: calc(-1 * var(--left-bar-width));
	bottom: calc(-1 * var(--left-bar-width));
	border-radius: var(--radius-xl);
	box-shadow: 1px 1px 15px rgba(0, 0, 0, 0.1) inset;
	border-color: var(--surface-5);
	border-width: 1px;
	border-style: solid;
	pointer-events: none;
}

.sidebar-teleport-content {
	display: contents;
}



@media (prefers-reduced-motion: no-preference) {
	.nav-button-animated-enter-active {
		transition: all 0.5s cubic-bezier(0.15, 1.4, 0.64, 0.96);
	}

	.nav-button-animated-leave-active {
		transition: all 0.25s ease;
	}

	.nav-button-animated-enter-active {
		position: relative;
	}

	.nav-button-animated-enter-active::before {
		content: '';
		inset: 0;
		border-radius: 100vw;
		background-color: var(--color-brand-highlight);
		position: absolute;
		animation: pop 0.5s ease-in forwards;
		opacity: 0;
	}

	@keyframes pop {
		0% {
			scale: 0.5;
		}
		50% {
			opacity: 0.5;
		}
		100% {
			scale: 1.5;
		}
	}

	.nav-button-animated-enter-from {
		scale: 0.5;
		translate: -2rem 0;
		opacity: 0;
	}

	.nav-button-animated-leave-to {
		scale: 0.75;
		opacity: 0;
	}

	.fade-enter-active {
		transition: 0.25s ease-in-out;
	}

	.fade-enter-from {
		opacity: 0;
	}
}
</style>
<style>
.os-theme-dark,
.os-theme-light {
	--os-handle-bg: var(--color-scrollbar) !important;
	--os-handle-bg-hover: var(--color-scrollbar) !important;
	--os-handle-bg-active: var(--color-scrollbar) !important;
}

.app-grid-statusbar {
	padding-left: 0.25rem;
}

.mac-traffic-lights {
	.app-grid-statusbar {
		padding-left: 5rem;
	}
}

.windows {
	.fake-appbar {
		height: 2.5rem !important;
	}

	.info-card {
		right: 22rem;
	}

	.profile-card {
		right: 8rem;
	}
}
</style>
