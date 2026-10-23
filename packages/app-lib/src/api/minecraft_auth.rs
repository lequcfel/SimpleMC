//! Authentication flow interface

use reqwest::StatusCode;

use crate::State;
use crate::state::{Credentials, MinecraftLoginFlow};
use crate::util::fetch::INSECURE_REQWEST_CLIENT;

#[derive(serde::Serialize)]
pub struct StoredMinecraftProfile {
	pub id: String,
	pub name: String,
}

#[derive(serde::Serialize)]
pub struct StoredMinecraftAccount {
	pub profile: StoredMinecraftProfile,
	pub active: bool,
}

/// Read account display data without refreshing tokens or fetching online profiles.
pub async fn stored_accounts() -> crate::Result<Vec<StoredMinecraftAccount>> {
	let state = State::get().await?;
	read_stored_accounts(&state.pool).await
}

async fn read_stored_accounts(
	exec: impl sqlx::Executor<'_, Database = sqlx::Sqlite>,
) -> crate::Result<Vec<StoredMinecraftAccount>> {
	let rows = sqlx::query_as::<_, (String, String, bool)>(
		"SELECT uuid, username, active FROM minecraft_users ORDER BY username COLLATE NOCASE",
	).fetch_all(exec).await?;
	Ok(rows.into_iter().map(|(id, name, active)| StoredMinecraftAccount {
		profile: StoredMinecraftProfile { id, name }, active,
	}).collect())
}

#[cfg(test)]
mod stored_account_tests {
	use super::*;

	#[tokio::test]
	async fn account_display_reads_only_local_public_fields() {
		let pool = sqlx::SqlitePool::connect("sqlite::memory:").await.unwrap();
		sqlx::query("CREATE TABLE minecraft_users (uuid TEXT, username TEXT, active INTEGER)").execute(&pool).await.unwrap();
		assert!(read_stored_accounts(&pool).await.unwrap().is_empty());
		sqlx::query("INSERT INTO minecraft_users VALUES ('b', 'Zulu', 0), ('a', 'Alex', 1)").execute(&pool).await.unwrap();
		let accounts = read_stored_accounts(&pool).await.unwrap();
		assert_eq!(accounts[0].profile.name, "Alex");
		assert!(accounts[0].active);
		assert!(!accounts[1].active);
		let json = serde_json::to_value(accounts).unwrap();
		assert!(json[0].get("access_token").is_none());
		assert!(json[0].get("refresh_token").is_none());
	}
}

#[tracing::instrument]
pub async fn check_reachable() -> crate::Result<()> {
    let resp = INSECURE_REQWEST_CLIENT
        .get("https://sessionserver.mojang.com/session/minecraft/hasJoined")
        .send()
        .await?;
    if resp.status() == StatusCode::NO_CONTENT {
        return Ok(());
    }
    resp.error_for_status()?;
    Ok(())
}

#[tracing::instrument]
pub async fn begin_login() -> crate::Result<MinecraftLoginFlow> {
    let state = State::get().await?;

    crate::state::login_begin(&state.pool).await
}

#[tracing::instrument]
pub async fn finish_login(
    code: &str,
    flow: MinecraftLoginFlow,
) -> crate::Result<Credentials> {
    let state = State::get().await?;

    let credentials =
        crate::state::login_finish(code, flow, &state.pool).await?;

    if let Err(error) =
        crate::onboarding_checklist::mark_logged_into_minecraft().await
    {
        tracing::warn!(
            "Failed to mark Minecraft login in onboarding checklist: {error}"
        );
    }

    Ok(credentials)
}

#[tracing::instrument]
pub async fn get_default_user() -> crate::Result<Option<uuid::Uuid>> {
    let state = State::get().await?;
    let user = Credentials::get_default_credential(&state.pool).await?;
    Ok(user.map(|user| user.offline_profile.id))
}

#[tracing::instrument]
pub async fn set_default_user(user: uuid::Uuid) -> crate::Result<()> {
    let state = State::get().await?;
    let users = Credentials::get_all(&state.pool).await?;
    let (_, mut user) = users.remove(&user).ok_or_else(|| {
        crate::ErrorKind::OtherError(format!(
            "Tried to get nonexistent user with ID {user}"
        ))
        .as_error()
    })?;

    user.active = true;
    user.upsert(&state.pool).await?;

    Ok(())
}

/// Remove a user account from the database
#[tracing::instrument]
pub async fn remove_user(uuid: uuid::Uuid) -> crate::Result<()> {
    let state = State::get().await?;

    let users = Credentials::get_all(&state.pool).await?;

    if let Some((uuid, user)) = users.remove(&uuid) {
        Credentials::remove(uuid, &state.pool).await?;

        if user.active
            && let Some((_, mut user)) = users.into_iter().next()
        {
            user.active = true;
            user.upsert(&state.pool).await?;
        }
    }

    Ok(())
}

/// Get a copy of the list of all user credentials
#[tracing::instrument]
pub async fn users() -> crate::Result<Vec<Credentials>> {
    let state = State::get().await?;
    let users = Credentials::get_all(&state.pool).await?;
    Ok(users.into_iter().map(|x| x.1).collect())
}
