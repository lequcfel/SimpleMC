use serde::Deserialize;
use std::sync::{
	Mutex,
	atomic::{AtomicBool, Ordering},
};
use tauri::{AppHandle, Manager, WindowEvent};
use tauri_plugin_window_state::{AppHandleExt, StateFlags};

#[derive(Clone, Copy, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum UpdateTiming {
	Launch,
	Close,
	Both,
}

#[derive(Default)]
pub struct DesktopState {
	preferences: Mutex<Option<(bool, UpdateTiming)>>,
	closing: AtomicBool,
	allow_close: AtomicBool,
}

impl DesktopState {
	pub(crate) fn check_on_close(&self) -> bool {
		self.preferences
			.lock()
			.unwrap()
			.is_some_and(|(enabled, timing)| {
				enabled && timing != UpdateTiming::Launch
			})
	}
}

#[tauri::command]
pub fn set_desktop_update_preferences(
	app: AppHandle,
	enabled: bool,
	timing: UpdateTiming,
) {
	*app.state::<DesktopState>().preferences.lock().unwrap() =
		Some((enabled, timing));
}

pub fn restore(app: &AppHandle) -> tauri::Result<()> {
	if let Some(window) = app.get_window("main") {
		window.show()?;
		window.unminimize()?;
		window.set_focus()?;
	}
	Ok(())
}

#[derive(Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum WindowAction {
	Minimize,
	ToggleMaximize,
	Close,
	Show,
}

#[tauri::command]
pub fn desktop_window_action(
	app: AppHandle,
	action: WindowAction,
) -> Result<(), String> {
	let window = app.get_window("main").ok_or("Main window unavailable")?;
	match action {
		WindowAction::Minimize => window.minimize(),
		WindowAction::ToggleMaximize => {
			if window.is_maximized().map_err(|error| error.to_string())? {
				window.unmaximize()
			} else {
				window.maximize()
			}
		}
		WindowAction::Show => restore(&app),
		WindowAction::Close => window.close(),
	}
	.map_err(|error| error.to_string())
}

pub fn handle_window_event(window: &tauri::Window, event: &WindowEvent) {
	if window.label() != "main" {
		return;
	}
	if let WindowEvent::CloseRequested { api, .. } = event {
		let app = window.app_handle();
		let state = app.state::<DesktopState>();
		if state.allow_close.load(Ordering::Acquire) {
			return;
		}
		if let Err(error) = app.save_window_state(
			StateFlags::POSITION
				| StateFlags::SIZE
				| StateFlags::MAXIMIZED
				| StateFlags::DECORATIONS,
		) {
			tracing::warn!("Could not save SimpleMC window state: {error}");
		}
		if !state.check_on_close() || !crate::are_updates_enabled(app.clone()) {
			return;
		}
		api.prevent_close();
		if state.closing.swap(true, Ordering::AcqRel) {
			return;
		}
		let app = app.clone();
		tauri::async_runtime::spawn(async move {
			#[cfg(feature = "updater")]
			if let Err(error) =
				crate::updater_impl::prepare_close_update(&app).await
			{
				tracing::warn!("Exit update check did not finish: {error}");
			}
			app.state::<DesktopState>()
				.allow_close
				.store(true, Ordering::Release);
			if let Some(window) = app.get_window("main") {
				if let Err(error) = window.close() {
					let state = app.state::<DesktopState>();
					state.allow_close.store(false, Ordering::Release);
					state.closing.store(false, Ordering::Release);
					tracing::error!("Could not close SimpleMC: {error}");
				}
			}
		});
	}
}

pub fn setup_tray(app: &tauri::App) -> tauri::Result<()> {
	let show = tauri::menu::MenuItem::with_id(
		app,
		"show",
		"Open SimpleMC",
		true,
		None::<&str>,
	)?;
	let quit = tauri::menu::MenuItem::with_id(
		app,
		"quit",
		"Quit SimpleMC",
		true,
		None::<&str>,
	)?;
	let menu = tauri::menu::Menu::with_items(app, &[&show, &quit])?;
	let mut tray = tauri::tray::TrayIconBuilder::with_id("SimpleMC")
		.tooltip("SimpleMC")
		.menu(&menu)
		.show_menu_on_left_click(false)
		.on_menu_event(|app, event| {
			let result = match event.id.as_ref() {
				"show" => restore(app),
				"quit" => app
					.get_window("main")
					.map(|window| window.close())
					.unwrap_or(Ok(())),
				_ => Ok(()),
			};
			if let Err(error) = result {
				tracing::warn!("Tray action failed: {error}");
			}
		})
		.on_tray_icon_event(|tray, event| {
			if matches!(
				event,
				tauri::tray::TrayIconEvent::Click {
					button: tauri::tray::MouseButton::Left,
					button_state: tauri::tray::MouseButtonState::Up,
					..
				}
			) {
				if let Err(error) = restore(tray.app_handle()) {
					tracing::warn!("Could not restore SimpleMC: {error}");
				}
			}
		});
	if let Some(icon) = app.default_window_icon() {
		tray = tray.icon(icon.clone());
	}
	tray.build(app)?;
	Ok(())
}

#[cfg(test)]
mod tests {
	use super::*;
	#[test]
	fn close_schedule_respects_disabled_and_launch_only() {
		let state = DesktopState::default();
		assert!(!state.check_on_close());
		for (enabled, timing, expected) in [
			(false, UpdateTiming::Both, false),
			(true, UpdateTiming::Launch, false),
			(true, UpdateTiming::Close, true),
			(true, UpdateTiming::Both, true),
		] {
			*state.preferences.lock().unwrap() = Some((enabled, timing));
			assert_eq!(state.check_on_close(), expected);
		}
	}
}
