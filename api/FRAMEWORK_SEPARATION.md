# API Framework Separation Refactoring

This document summarizes the refactoring work done to create better separation between the hosting framework (Rocket) and the rest of the Rust code in the CaLANdar API.

## Architecture Overview

The refactoring introduces a clean layered architecture:

```
┌─────────────────┐
│   Routes        │  ← Framework-specific (Rocket)
│   (HTTP Layer)  │  ← Thin adapters, OpenAPI annotations
├─────────────────┤
│   Services      │  ← Framework-agnostic business logic
│   (Business)    │  ← Uses DTOs, returns Result types
├─────────────────┤
│   Controllers   │  ← Legacy layer (being phased out)
│   (Legacy)      │  ← Still used by non-refactored routes
├─────────────────┤
│   Repositories  │  ← Data access layer
│   (Data)        │  ← Database operations
└─────────────────┘
```

## Key Components

### 1. DTOs (Data Transfer Objects) - `src/dto/`
Framework-agnostic data structures for transferring data between layers:

- `EventDto` / `EventSubmitDto` - Event-related data structures
- `AuthDto` / `UserDto` - Authentication data structures  
- `ProfileDto` / `GameDto` - Other domain objects
- `ServiceError` / `ServiceResult<T>` - Common error handling

### 2. Services - `src/services/`
Framework-agnostic business logic:

- `EventService` - Event management operations
- Input: DTOs and primitive types
- Output: `ServiceResult<DTO>` or `ServiceResult<()>`
- No dependencies on web framework types

### 3. Web Abstraction - `src/web/`
Traits that abstract web framework specifics:

- `UserExtractor` - Extract user info from requests
- `ResponseBuilder` - Build HTTP responses
- `Dependencies` - Dependency injection abstraction
- Rocket implementations in `src/web/rocket.rs`

### 4. Refactored Routes - `src/routes/`
Thin adapters that:

- Extract data from framework types (Rocket's `Json<T>`, `State<T>`)
- Convert to DTOs
- Call service layer
- Convert DTOs back to framework response types
- Preserve OpenAPI annotations

## Benefits Achieved

### 1. Framework Independence
- Business logic in services is not tied to Rocket
- Easy to swap Rocket for other frameworks (Axum, Warp, etc.)
- Services can be tested without web framework dependencies

### 2. Clean Separation of Concerns
- Routes: HTTP handling only
- Services: Business logic only  
- Clear data flow with DTOs

### 3. Maintained OpenAPI Documentation
- All `#[openapi]` annotations preserved
- API documentation still available at `/api/docs`
- Response types maintain JsonSchema support

### 4. Consistent Error Handling
- Service layer uses framework-agnostic error types
- Errors are mapped to appropriate HTTP status codes
- Centralized error handling logic

## Example Refactoring Pattern

**Before** (tightly coupled to Rocket):
```rust
#[get("/events")]
pub async fn get_all(pool: &State<PgPool>) -> Result<Json<Vec<Event>>, Error> {
    match event::controller_function(pool).await {
        Ok(events) => Ok(Json(events)),
        Err(e) => Err(Error::InternalServer(e.to_string())),
    }
}
```

**After** (framework-agnostic service layer):
```rust
#[get("/events")]  
pub async fn get_all(pool: &State<PgPool>) -> Result<Json<Vec<Event>>, Error> {
    match EventService::get_all_events(pool.inner()).await {
        Ok(event_dtos) => {
            let events = event_dtos.into_iter().map(Event::from).collect();
            Ok(Json(events))
        }
        Err(service_error) => Err(map_to_http_error(service_error)),
    }
}
```

## Migration Strategy

The refactoring was done incrementally:

1. ✅ Created DTO and service layer infrastructure
2. ✅ Created web framework abstraction traits
3. ✅ Refactored 2 event endpoints as proof of concept
4. 🔄 Remaining routes can be refactored using the same pattern
5. 🔄 Eventually remove the legacy controller layer

## Testing Strategy

- Services can be unit tested without web framework
- Routes integration tests verify HTTP layer works correctly
- OpenAPI spec tests ensure documentation accuracy

## Future Extensibility

To add support for a new web framework:

1. Implement the traits in `src/web/` for the new framework
2. Create route handlers that use the same service calls
3. No changes needed to business logic in services

This architecture makes it easy to:
- Add new web frameworks
- Test business logic independently
- Maintain consistent API behavior across different frameworks
- Evolve the API without framework lock-in