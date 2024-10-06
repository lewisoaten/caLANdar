pub mod auth;
pub mod event_games;
pub mod event_invitations;
pub mod events;
pub mod gamers;
pub mod games;
pub mod profiles;

/// Trait for adds examples to API documentation
trait SchemaExample {
    fn example() -> Self;
}
