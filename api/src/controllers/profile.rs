use sqlx::PgPool;

use crate::{
    controllers::Error,
    repositories::profile,
    routes::profiles::{Profile, ProfileSubmit},
};

// Implement From for Profile from repositories::profile::Profile
impl From<crate::repositories::profile::Profile> for Profile {
    fn from(profile: crate::repositories::profile::Profile) -> Self {
        Self {
            email: profile.email,
            steam_id: profile.steam_id.to_string(),
        }
    }
}

pub async fn get(pool: &PgPool, email: String) -> Result<Profile, Error> {
    // Return profile from repository for selected email address
    match profile::read(pool, email.clone()).await {
        Ok(Some(profile)) => Ok(profile.into()),
        Ok(None) => Err(Error::NoData(format!("Profile for {email} not found"))),
        Err(e) => Err(Error::Controller(format!(
            "Unable to get profile due to: {e}"
        ))),
    }
}

pub async fn edit(
    pool: &PgPool,
    email: String,
    new_profile: ProfileSubmit,
) -> Result<Profile, Error> {
    let new_steam_id = match new_profile.steam_id.parse::<i64>() {
        Ok(id) => id,
        Err(_) => return Err(Error::BadInput("Unable to parse steam ID".to_string())),
    };

    match profile::update(pool, email.clone(), Some(new_steam_id), None).await {
        Ok(profile) => Ok(Profile::from(profile)),
        Err(e) => Err(Error::Controller(format!(
            "Unable to update profile due to: {e}"
        ))),
    }
}
