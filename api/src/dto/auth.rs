// Authentication DTOs
use rocket::serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(crate = "rocket::serde")]
pub struct UserDto {
    pub email: String,
    pub is_admin: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(crate = "rocket::serde")]
pub struct LoginRequestDto {
    pub email: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(crate = "rocket::serde")]
pub struct LoginResponseDto {
    pub token: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(crate = "rocket::serde")]
pub struct VerifyEmailRequestDto {
    pub token: String,
}