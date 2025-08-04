// Game DTOs
use rocket::serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(crate = "rocket::serde")]
pub struct GameDto {
    pub id: i32,
    pub name: String,
    pub app_id: Option<i32>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(crate = "rocket::serde")]
pub struct GameCreateDto {
    pub name: String,
    pub app_id: Option<i32>,
}