pub mod auth;
pub mod event_games;
pub mod event_invitations;
pub mod event_seating;
pub mod events;
pub mod gamers;
pub mod games;
pub mod profiles;
pub mod rooms;
pub mod seat_reservations;
pub mod seats;

/// Trait for adds examples to API documentation
trait SchemaExample {
    fn example() -> Self;
}
