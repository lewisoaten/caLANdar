FROM rust:1.63.0

WORKDIR /usr/src/app/calandar

EXPOSE 8000

RUN cargo install cargo-watch

COPY . .

# This isn't really used yet, but putting it hear when these containers help with both dev and prod
RUN cargo build --release
# CMD ["./target/release/api"]

CMD ["cargo-watch", "-x run"]
