// Profile DTOs
use rocket::serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(crate = "rocket::serde")]
pub struct ProfileDto {
    pub email: String,
    pub name: String,
    pub steam_id: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(crate = "rocket::serde")]
pub struct ProfileUpdateDto {
    pub name: String,
    pub steam_id: Option<String>,
}