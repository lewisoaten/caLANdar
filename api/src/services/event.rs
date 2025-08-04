// Event service - Business logic for event management
use crate::dto::{ServiceError, ServiceResult, event::{EventDto, EventSubmitDto}};
use crate::controllers::{event as event_controller, Error as ControllerError};
use crate::routes::events::{Event, EventSubmit};
use sqlx::PgPool;

pub struct EventService;

impl EventService {
    pub async fn get_all_events(pool: &PgPool) -> ServiceResult<Vec<EventDto>> {
        match event_controller::get_all(pool).await {
            Ok(events) => Ok(events.into_iter().map(|e| e.into()).collect()),
            Err(e) => Err(map_controller_error(e)),
        }
    }

    pub async fn get_all_user_events(pool: &PgPool, user_email: String) -> ServiceResult<Vec<EventDto>> {
        match event_controller::get_all_user(pool, user_email).await {
            Ok(events) => Ok(events.into_iter().map(|e| e.into()).collect()),
            Err(e) => Err(map_controller_error(e)),
        }
    }

    pub async fn get_event(pool: &PgPool, id: i32) -> ServiceResult<EventDto> {
        match event_controller::get(pool, id).await {
            Ok(event) => Ok(event.into()),
            Err(e) => Err(map_controller_error(e)),
        }
    }

    pub async fn get_user_event(pool: &PgPool, id: i32, user_email: String) -> ServiceResult<EventDto> {
        match event_controller::get_user(pool, id, user_email).await {
            Ok(event) => Ok(event.into()),
            Err(e) => Err(map_controller_error(e)),
        }
    }

    pub async fn create_event(pool: &PgPool, event_data: EventSubmitDto) -> ServiceResult<EventDto> {
        let event_submit = EventSubmit::from(event_data);
        match event_controller::create(pool, event_submit).await {
            Ok(event) => Ok(event.into()),
            Err(e) => Err(map_controller_error(e)),
        }
    }

    pub async fn update_event(pool: &PgPool, id: i32, event_data: EventSubmitDto) -> ServiceResult<()> {
        let event_submit = EventSubmit::from(event_data);
        match event_controller::edit(pool, id, event_submit).await {
            Ok(_) => Ok(()),
            Err(e) => Err(map_controller_error(e)),
        }
    }

    pub async fn delete_event(pool: &PgPool, id: i32) -> ServiceResult<()> {
        match event_controller::delete(pool, id).await {
            Ok(_) => Ok(()),
            Err(e) => Err(map_controller_error(e)),
        }
    }
}

// Helper function to map controller errors to service errors
fn map_controller_error(error: ControllerError) -> ServiceError {
    match error {
        ControllerError::BadInput(msg) => ServiceError::BadInput(msg),
        ControllerError::NoData(msg) => ServiceError::NotFound(msg),
        ControllerError::NotPermitted(msg) => ServiceError::NotPermitted(msg),
        ControllerError::Controller(msg) => ServiceError::InternalError(msg),
    }
}

// Conversion implementations
impl From<Event> for EventDto {
    fn from(event: Event) -> Self {
        Self {
            id: event.id,
            created_at: event.created_at,
            last_modified: event.last_modified,
            title: event.title,
            description: event.description,
            image: event.image,
            time_begin: event.time_begin,
            time_end: event.time_end,
        }
    }
}

impl From<EventSubmitDto> for EventSubmit {
    fn from(dto: EventSubmitDto) -> Self {
        Self {
            title: dto.title,
            description: dto.description,
            image: dto.image,
            time_begin: dto.time_begin,
            time_end: dto.time_end,
        }
    }
}