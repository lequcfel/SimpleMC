use crate::api::Result;
use std::sync::{Arc, Mutex};
use tauri::http::HeaderValue;
use tauri::http::header::ACCEPT;
use tauri::{Manager, ResourceId, Runtime, Webview};
use tauri_plugin_http::reqwest;
use tauri_plugin_http::reqwest::ClientBuilder;
use tauri_plugin_updater::Error;
use tauri_plugin_updater::Update;
use theseus::{
	LoadingBarType, emit_loading, init_loading, launcher_user_agent,
};
use tokio::time::Instant;

#[derive(Default)]
pub struct PendingUpdateData(pub Mutex<Option<(Arc<Update>, Vec<u8>)>>);

#[derive(Default)]
pub struct UpdateCheckState {
	metadata: tokio::sync::Mutex<Option<UpdateMetadata>>,
	download: tokio::sync::Mutex<()>,
	generation: std::sync::atomic::AtomicU64,
}

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateMetadata {
	pub rid: ResourceId,
	pub version: String,
	pub current_version: String,
}

#[tauri::command]
pub async fn check_app_update(
	webview: Webview,
) -> Result<Option<UpdateMetadata>> {
	use tauri_plugin_updater::UpdaterExt;
	let state = webview.state::<UpdateCheckState>();
	if !crate::are_updates_enabled(webview.app_handle().clone()) {
		return Err(Error::Network(
			"Updates are disabled in this build".into(),
		)
		.into());
	}
	let mut cached = state.metadata.lock().await;
	let update = webview
		.updater_builder()
		.timeout(std::time::Duration::from_secs(10))
		.build()?
		.check()
		.await?;
	let Some(update) = update else {
		return Ok(None);
	};
	if let Some(metadata) = cached.as_ref() {
		if metadata.version == update.version
			&& webview
				.resources_table()
				.get::<Update>(metadata.rid)
				.is_ok()
		{
			return Ok(Some(metadata.clone()));
		}
	}
	let metadata = UpdateMetadata {
		version: update.version.clone(),
		current_version: update.current_version.clone(),
		rid: webview.resources_table().add(update),
	};
	if let Some(previous) = cached.replace(metadata.clone()) {
		let _ = webview.resources_table().close(previous.rid);
	}
	Ok(Some(metadata))
}

pub async fn prepare_close_update(
	app: &tauri::AppHandle,
) -> std::result::Result<(), String> {
	let work = async {
		let generation = app
			.state::<UpdateCheckState>()
			.generation
			.load(std::sync::atomic::Ordering::Acquire);
		if app.state::<PendingUpdateData>().0.lock().unwrap().is_some() {
			return Ok(());
		}
		let webview =
			app.get_webview("main").ok_or("Main webview unavailable")?;
		if let Some(update) = check_app_update(webview.clone())
			.await
			.map_err(|error| error.to_string())?
		{
			if !app.state::<crate::desktop::DesktopState>().check_on_close()
				|| generation
					!= app
						.state::<UpdateCheckState>()
						.generation
						.load(std::sync::atomic::Ordering::Acquire)
			{
				return Ok(());
			}
			if !theseus::prelude::is_network_metered()
				.await
				.map_err(|error| error.to_string())?
			{
				enqueue_update_for_installation(webview, update.rid)
					.await
					.map_err(|error| error.to_string())?;
			}
		}
		Ok::<(), String>(())
	};
	tokio::time::timeout(std::time::Duration::from_secs(15), work)
		.await
		.map_err(|_| {
			"Exit update check timed out; the launcher will close normally"
				.to_string()
		})?
}

// Reimplementation of Update::download mostly, minus the actual download part
#[tauri::command]
pub async fn get_update_size<R: Runtime>(
	webview: Webview<R>,
	rid: ResourceId,
) -> Result<Option<u64>> {
	let update = webview.resources_table().get::<Update>(rid)?;

	let mut headers = update.headers.clone();
	if !headers.contains_key(ACCEPT) {
		headers.insert(
			ACCEPT,
			HeaderValue::from_static("application/octet-stream"),
		);
	}

	let mut request = ClientBuilder::new().user_agent(launcher_user_agent());
	if let Some(timeout) = update.timeout {
		request = request.timeout(timeout);
	}
	if let Some(ref proxy) = update.proxy {
		let proxy = reqwest::Proxy::all(proxy.as_str())?;
		request = request.proxy(proxy);
	}
	let response = request
		.build()?
		.head(update.download_url.clone())
		.headers(headers)
		.send()
		.await?;

	if !response.status().is_success() {
		return Err(Error::Network(format!(
			"Download request failed with status: {}",
			response.status()
		))
		.into());
	}

	let content_length = response
		.headers()
		.get("Content-Length")
		.and_then(|value| value.to_str().ok())
		.and_then(|value| value.parse().ok());

	Ok(content_length)
}

#[tauri::command]
pub async fn enqueue_update_for_installation<R: Runtime>(
	webview: Webview<R>,
	rid: ResourceId,
) -> Result<()> {
	let pending_data = webview.state::<PendingUpdateData>().inner();
	let service = webview.state::<UpdateCheckState>();
	let generation = service
		.generation
		.load(std::sync::atomic::Ordering::Acquire);
	let _download = service.download.lock().await;
	if generation
		!= service
			.generation
			.load(std::sync::atomic::Ordering::Acquire)
	{
		return Err(
			Error::Network("Update download was cancelled".into()).into()
		);
	}

	let update = webview.resources_table().get::<Update>(rid)?;
	if pending_data
		.0
		.lock()
		.unwrap()
		.as_ref()
		.is_some_and(|(pending, _)| pending.version == update.version)
	{
		return Ok(());
	}

	let progress = init_loading(
		LoadingBarType::LauncherUpdate {
			version: update.version.clone(),
			current_version: update.current_version.clone(),
		},
		1.0,
		"Downloading update...",
	)
	.await?;

	let download_start = Instant::now();
	let update_data = update
		.download(
			|chunk_size, total_size| {
				let Some(total_size) = total_size else {
					return;
				};
				if let Err(e) = emit_loading(
					&progress,
					chunk_size as f64 / total_size as f64,
					None,
				) {
					tracing::error!(
						"Failed to update download progress bar: {e}"
					);
				}
			},
			|| {},
		)
		.await?;
	let download_duration = download_start.elapsed();
	tracing::info!("Downloaded update in {download_duration:?}");

	let mut pending = pending_data.0.lock().unwrap();
	if generation
		!= service
			.generation
			.load(std::sync::atomic::Ordering::Acquire)
	{
		return Err(
			Error::Network("Update download was cancelled".into()).into()
		);
	}
	pending.replace((update, update_data));

	Ok(())
}

#[tauri::command]
pub fn remove_enqueued_update<R: Runtime>(webview: Webview<R>) {
	let pending_data = webview.state::<PendingUpdateData>().inner();
	let mut pending = pending_data.0.lock().unwrap();
	webview
		.state::<UpdateCheckState>()
		.generation
		.fetch_add(1, std::sync::atomic::Ordering::AcqRel);
	pending.take();
}
