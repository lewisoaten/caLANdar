use rocket::http::Status;
use rocket::response::Responder;
use rocket::serde::json::Json;
use rocket::serde::{Deserialize, Serialize};
use rocket::{response, Request};
use rocket_okapi::gen::OpenApiGenerator;
use rocket_okapi::okapi::openapi3::Responses;
use rocket_okapi::okapi::schemars::JsonSchema;
use rocket_okapi::response::OpenApiResponderInner;
use rocket_okapi::util::{produce_any_responses, set_status_code};
use rocket_okapi::OpenApiError;

/// Merge responses from a vector of responses into a single response.
pub fn merge_responses(codes: Vec<Responses>) -> Result<Responses, OpenApiError> {
    let mut responses = Responses::default();

    for code in codes {
        responses = produce_any_responses(responses.clone(), code)?;
    }

    Ok(responses)
}

// custom_errors!(SteamGameError,
//[
//    Unauthorized,
//    NotFound,
//]);
macro_rules! custom_errors {
    ($error_enum_name: ident, $( $errors:ident ),+) => {
        #[allow(dead_code)]
        pub enum $error_enum_name {
            $( $errors(String) ),+,
        }

        impl<'r, 'o: 'r> rocket::response::Responder<'r, 'o> for $error_enum_name {
            fn respond_to(self, req: &'r rocket::Request<'_>) -> rocket::response::Result<'o> {
                match self {
                    $( $error_enum_name::$errors(inner) => crate::error::$errors(inner).respond_to(req) ),+,
                }
            }
        }

        impl rocket_okapi::response::OpenApiResponderInner for $error_enum_name {
            fn responses(generator: &mut rocket_okapi::gen::OpenApiGenerator) -> Result<rocket_okapi::okapi::openapi3::Responses, rocket_okapi::OpenApiError> {
                crate::error::merge_responses(vec![
                    $( <crate::error::$errors as rocket_okapi::response::OpenApiResponderInner>::responses(generator)? ),+,
                ])
            }
        }
    };
}

// Error implementation based on json_error_template! macro in catcher.rs. e.g:
// {
//  "error": {
//    "code": "404",
//    "reason": "Not Found",
//    "description": "The requested resource was not found."
//  }
//}
#[derive(Serialize, Deserialize, JsonSchema, Debug)]
#[serde(crate = "rocket::serde")]
struct ErrorResponse {
    error: Error,
}

#[derive(Serialize, Deserialize, JsonSchema, Debug)]
#[serde(crate = "rocket::serde")]
struct Error {
    code: u16,
    reason: String,
    description: String,
}

impl ErrorResponse {
    const fn new(code: u16, reason: String, description: String) -> Self {
        Self {
            error: Error {
                code,
                reason,
                description,
            },
        }
    }
}

macro_rules! generate_error {
    ($responder: ident, $status: literal, $title: literal) => {
        pub struct $responder(pub String);

        /// Sets the status code of the response to 404 Not Found.
        impl<'r, 'o: 'r> Responder<'r, 'o> for $responder {
            fn respond_to(self, req: &'r Request<'_>) -> response::Result<'o> {
                log::error!("Error, {}: {}", $title, self.0);
                (
                    Status::$responder,
                    Json(ErrorResponse::new(
                        Status::$responder.code,
                        $title.to_string(),
                        self.0,
                    )),
                )
                    .respond_to(req)
            }
        }

        impl OpenApiResponderInner for $responder {
            fn responses(gen: &mut OpenApiGenerator) -> rocket_okapi::Result<Responses> {
                let mut responses = <Json<ErrorResponse> as OpenApiResponderInner>::responses(gen)?;
                set_status_code(&mut responses, Status::$responder.code)?;
                Ok(responses)
            }
        }
    };
}

// Implement errors for each Status we may want to return
generate_error!(BadRequest, 400, "Bad Request");
generate_error!(Unauthorized, 401, "Unauthorized");
generate_error!(PaymentRequired, 402, "Payment Required");
generate_error!(Forbidden, 403, "Forbidden");
generate_error!(NotFound, 404, "Not Found");
generate_error!(MethodNotAllowed, 405, "Method Not Allowed");
generate_error!(NotAcceptable, 406, "Not Acceptable");
generate_error!(
    ProxyAuthenticationRequired,
    407,
    "Proxy Authentication Required"
);
generate_error!(RequestTimeout, 408, "Request Timeout");
generate_error!(Conflict, 409, "Conflict");
generate_error!(Gone, 410, "Gone");
generate_error!(LengthRequired, 411, "Length Required");
generate_error!(PreconditionFailed, 412, "Precondition Failed");
generate_error!(PayloadTooLarge, 413, "Payload Too Large");
generate_error!(UriTooLong, 414, "URI Too Long");
generate_error!(UnsupportedMediaType, 415, "Unsupported Media Type");
generate_error!(RangeNotSatisfiable, 416, "Range Not Satisfiable");
generate_error!(ExpectationFailed, 417, "Expectation Failed");
generate_error!(ImATeapot, 418, "I'm a teapot");
generate_error!(MisdirectedRequest, 421, "Misdirected Request");
generate_error!(UnprocessableEntity, 422, "Unprocessable Entity");
generate_error!(Locked, 423, "Locked");
generate_error!(FailedDependency, 424, "Failed Dependency");
generate_error!(UpgradeRequired, 426, "Upgrade Required");
generate_error!(PreconditionRequired, 428, "Precondition Required");
generate_error!(TooManyRequests, 429, "Too Many Requests");
generate_error!(
    RequestHeaderFieldsTooLarge,
    431,
    "Request Header Fields Too Large"
);
generate_error!(
    UnavailableForLegalReasons,
    451,
    "Unavailable For Legal Reasons"
);
generate_error!(InternalServerError, 500, "Internal Server Error");
generate_error!(NotImplemented, 501, "Not Implemented");
