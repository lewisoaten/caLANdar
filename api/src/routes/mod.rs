pub mod auth;
pub mod event_games;
pub mod event_invitations;
pub mod events;
pub mod games;

/// Trait for adds examples to API documentation
trait SchemaExample {
    fn example() -> Self;
}
