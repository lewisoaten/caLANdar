extern crate rocket;

use rocket::{
    request::{self, FromRequest, Outcome},
    serde::{json, Deserialize, Serialize},
};
use rocket_okapi::okapi::openapi3::{
    Object, SecurityRequirement, SecurityScheme, SecuritySchemeData,
};
use rocket_okapi::{
    gen::OpenApiGenerator,
    request::{OpenApiFromRequest, RequestHeaderInput},
};
use rusty_paseto::prelude::*;

#[derive(Debug)]
pub enum UserError {
    TokenError,
    MissingToken,
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(crate = "rocket::serde")]
pub struct PasetoToken {
    exp: String,
    iat: String,
    nbf: String,
    pub r: Option<String>,
    pub sub: String,
}

#[cfg(test)]
mod tests {
    use chrono::{Duration, Utc};
    use rusty_paseto::prelude::*;

    #[test]
    fn test_authorise_paseto_header() {
        let email = "test@test.invalid";
        let paseto_symmetric_key = PasetoSymmetricKey::<V4, Local>::from(Key::from([0; 32]));
        let expiration_claim =
            ExpirationClaim::try_from((Utc::now() + Duration::days(7)).to_rfc3339())
                .expect("Valid date 7 days in the future.");

        let token = PasetoBuilder::<V4, Local>::default()
            .set_claim(expiration_claim)
            .set_claim(IssuerClaim::from("calandar.org"))
            .set_claim(TokenIdentifierClaim::from("api"))
            .set_claim(SubjectClaim::from(email))
            .build(&paseto_symmetric_key)
            .expect("Valid token built.");

        let token = format!("Bearer {token}");

        let result = super::authorise_paseto_header(&paseto_symmetric_key, &token, false);
        assert_eq!(result.expect("Email provided for test."), email);

        let result = super::authorise_paseto_header(&paseto_symmetric_key, &token, true);
        match result.expect_err("Error because we are not an admin.") {
            super::UserError::TokenError => (),
            super::UserError::MissingToken => panic!("Expected TokenError"),
        };
    }
}

/// Validate Bearer header string is a valid `CaLANdar` API token and in-date.
fn authorise_paseto_header(
    key: &PasetoSymmetricKey<V4, Local>,
    authorization_header: &str,
    must_be_admin: bool,
) -> Result<String, UserError> {
    match authorization_header.strip_prefix("Bearer ") {
        Some(token) => {
            let generic_token = match PasetoParser::<V4, Local>::default()
                .check_claim(IssuerClaim::from("calandar.org"))
                .check_claim(TokenIdentifierClaim::from("api"))
                .parse(token, key)
            {
                Ok(generic_token) => generic_token,
                Err(_) => {
                    return Err(UserError::TokenError);
                }
            };

            let typed_token: PasetoToken = match json::from_value(generic_token) {
                Ok(typed_token) => typed_token,
                Err(_) => {
                    return Err(UserError::TokenError);
                }
            };

            if must_be_admin && typed_token.sub != "lewis@oaten.name" {
                return Err(UserError::TokenError);
            }

            Ok(typed_token.sub)
        }
        None => Err(UserError::MissingToken),
    }
}

pub struct User {
    pub email: String,
}

#[rocket::async_trait]
impl<'r> FromRequest<'r> for User {
    type Error = UserError;

    async fn from_request(request: &'r rocket::Request<'_>) -> request::Outcome<Self, Self::Error> {
        let authorization_header = request.headers().get_one("Authorization");

        authorization_header.map_or(
            request::Outcome::Failure((
                rocket::http::Status::Unauthorized,
                UserError::MissingToken,
            )),
            |authorization_header| {
                let key = request
                    .rocket()
                    .state::<PasetoSymmetricKey<V4, Local>>()
                    .expect("PASETO encryption key found in config.");

                authorise_paseto_header(key, authorization_header, false).map_or(
                    request::Outcome::Failure((
                        rocket::http::Status::Unauthorized,
                        UserError::MissingToken,
                    )),
                    |email| Outcome::Success(Self { email }),
                )
            },
        )
    }
}

impl<'a> OpenApiFromRequest<'a> for User {
    fn from_request_input(
        _gen: &mut OpenApiGenerator,
        _name: String,
        _required: bool,
    ) -> rocket_okapi::Result<RequestHeaderInput> {
        // Setup global requirement for Security scheme
        let security_scheme = SecurityScheme {
            description: Some(
                "Requires an Bearer token to access, token is: `mytoken`.".to_owned(),
            ),
            // Setup data requirements.
            // In this case the header `Authorization: mytoken` needs to be set.
            data: SecuritySchemeData::Http {
                scheme: "bearer".to_owned(), // `basic`, `digest`, ...
                // Just gives use a hint to the format used
                bearer_format: Some("bearer".to_owned()),
            },
            extensions: Object::default(),
        };
        // Add the requirement for this route/endpoint
        // This can change between routes.
        let mut security_req = SecurityRequirement::new();
        // Each security requirement needs to be met before access is allowed.
        security_req.insert("User".to_owned(), Vec::new());
        // These vvvvvvv-----^^^^^^^^ values need to match exactly!
        Ok(RequestHeaderInput::Security(
            "User".to_owned(),
            security_scheme,
            security_req,
        ))
    }
}

pub struct AdminUser {
    #[allow(dead_code)]
    pub email: String,
}

#[rocket::async_trait]
impl<'r> FromRequest<'r> for AdminUser {
    type Error = UserError;

    async fn from_request(request: &'r rocket::Request<'_>) -> request::Outcome<Self, Self::Error> {
        // API call must specify it wants to access administrative data, otherwise it is Forwarded, and potentially treated as a user request
        match request.query_value::<bool>("as_admin") {
            Some(Ok(true)) => {}
            Some(Ok(false) | Err(_)) => return Outcome::Forward(()),
            None => {
                match request.query_value::<bool>("_as_admin") {
                    Some(Ok(true)) => {}
                    Some(Ok(false) | Err(_)) | None => return Outcome::Forward(()),
                };
            }
        };

        let authorization_header = request.headers().get_one("Authorization");

        authorization_header.map_or(
            request::Outcome::Failure((
                rocket::http::Status::Unauthorized,
                UserError::MissingToken,
            )),
            |authorization_header| {
                let key = request
                    .rocket()
                    .state::<PasetoSymmetricKey<V4, Local>>()
                    .expect("PASETO encryption key found in config.");

                authorise_paseto_header(key, authorization_header, true)
                    .map_or(Outcome::Forward(()), |email| {
                        Outcome::Success(Self { email })
                    })
            },
        )
    }
}

impl<'a> OpenApiFromRequest<'a> for AdminUser {
    fn from_request_input(
        _gen: &mut OpenApiGenerator,
        _name: String,
        _required: bool,
    ) -> rocket_okapi::Result<RequestHeaderInput> {
        // Setup global requirement for Security scheme
        let security_scheme = SecurityScheme {
            description: Some(
                "Requires an Bearer token to access, token is: `mytoken`.".to_owned(),
            ),
            // Setup data requirements.
            // In this case the header `Authorization: mytoken` needs to be set.
            data: SecuritySchemeData::Http {
                scheme: "bearer".to_owned(), // `basic`, `digest`, ...
                // Just gives use a hint to the format used
                bearer_format: Some("bearer".to_owned()),
            },
            extensions: Object::default(),
        };
        // Add the requirement for this route/endpoint
        // This can change between routes.
        let mut security_req = SecurityRequirement::new();
        // Each security requirement needs to be met before access is allowed.
        security_req.insert("User".to_owned(), Vec::new());
        // These vvvvvvv-----^^^^^^^^ values need to match exactly!
        Ok(RequestHeaderInput::Security(
            "User".to_owned(),
            security_scheme,
            security_req,
        ))
    }
}
