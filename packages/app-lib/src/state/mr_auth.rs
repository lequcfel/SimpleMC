use crate::state::{CacheBehaviour, CachedEntry};
use crate::util::fetch::{FetchSemaphore, fetch_advanced};
use chrono::{DateTime, Duration, Utc};
use reqwest::Method;
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ModrinthCredentials {
    pub session: String,
    pub expires: DateTime<Utc>,
    pub user_id: String,
    pub active: bool,
}

impl ModrinthCredentials {
    pub async fn get_and_refresh(
        _exec: impl sqlx::Executor<'_, Database = sqlx::Sqlite> + Copy,
        _semaphore: &FetchSemaphore,
    ) -> crate::Result<Option<Self>> {
        Ok(None)
    }

    pub async fn get_active(
        _exec: impl sqlx::Executor<'_, Database = sqlx::Sqlite>,
    ) -> crate::Result<Option<Self>> {
        Ok(None)
    }

    pub async fn get_all(
        _exec: impl sqlx::Executor<'_, Database = sqlx::Sqlite>,
    ) -> crate::Result<Vec<Self>> {
        Ok(Vec::new())
    }

    pub async fn upsert(
        &self,
        exec: impl sqlx::Executor<'_, Database = sqlx::Sqlite> + Copy,
    ) -> crate::Result<()> {
        let expires = self.expires.timestamp();

        if self.active {
            Self::deactivate_all(exec).await?;
        }

        sqlx::query!(
            "
            INSERT INTO modrinth_users (id, active, session_id, expires)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (id) DO UPDATE SET
                active = $2,
                session_id = $3,
                expires = $4
            ",
            self.user_id,
            self.active,
            self.session,
            expires,
        )
        .execute(exec)
        .await?;

        Ok(())
    }

    pub async fn deactivate_all(
        exec: impl sqlx::Executor<'_, Database = sqlx::Sqlite>,
    ) -> crate::Result<()> {
        sqlx::query!(
            "
                UPDATE modrinth_users
                SET active = FALSE
                "
        )
        .execute(exec)
        .await?;

        Ok(())
    }

    pub async fn remove(
        user_id: &str,
        exec: impl sqlx::Executor<'_, Database = sqlx::Sqlite>,
    ) -> crate::Result<()> {
        sqlx::query!(
            "
            DELETE FROM modrinth_users WHERE id = $1
            ",
            user_id,
        )
        .execute(exec)
        .await?;

        Ok(())
    }

    pub(crate) async fn refresh_all() -> crate::Result<()> {
        let state = crate::State::get().await?;
        let all = Self::get_all(&state.pool).await?;

        let user_ids = all.into_iter().map(|x| x.user_id).collect::<Vec<_>>();

        CachedEntry::get_user_many(
            &user_ids.iter().map(|x| &**x).collect::<Vec<_>>(),
            Some(CacheBehaviour::Bypass),
            &state.pool,
            &state.fetch_semaphore,
        )
        .await?;

        Ok(())
    }
}

pub const fn get_login_url() -> &'static str {
    concat!(env!("MODRINTH_URL"), "auth/sign-in")
}

pub const fn get_signup_url() -> &'static str {
    concat!(env!("MODRINTH_URL"), "auth/sign-up")
}

pub async fn finish_login_flow(
    code: &str,
    semaphore: &FetchSemaphore,
    exec: impl sqlx::Executor<'_, Database = sqlx::Sqlite>,
) -> crate::Result<ModrinthCredentials> {
    // The authorization code actually is the access token, since labrinth doesn't
    // issue separate authorization codes. Therefore, this is equivalent to an
    // implicit OAuth grant flow, and no additional exchanging or finalization is
    // needed. TODO not do this for the reasons outlined at
    // https://oauth.net/2/grant-types/implicit/

    let info = fetch_info(code, semaphore, exec).await?;

    Ok(ModrinthCredentials {
        session: code.to_string(),
        expires: Utc::now() + Duration::weeks(2),
        user_id: info.id,
        active: true,
    })
}

async fn fetch_info(
    token: &str,
    semaphore: &FetchSemaphore,
    exec: impl sqlx::Executor<'_, Database = sqlx::Sqlite>,
) -> crate::Result<crate::state::cache::User> {
    let result = fetch_advanced(
        Method::GET,
        concat!(env!("MODRINTH_API_URL"), "user"),
        None,
        None,
        Some(("Authorization", token)),
        None,
        None,
        Some("/v2/user"),
        semaphore,
        exec,
    )
    .await?;
    let value = serde_json::from_slice(&result)?;

    Ok(value)
}
