{
  description = "CaLANdar LAN organisation app";
  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-25.05";
    flake-utils.url = "github:numtide/flake-utils";
    rust-overlay = {
      url = "github:oxalica/rust-overlay";
      inputs = {
        nixpkgs.follows = "nixpkgs";
      };
    };
  };
  outputs = { self, nixpkgs, flake-utils, rust-overlay }:
    flake-utils.lib.eachDefaultSystem
      (system:
        let
          overlays = [ (import rust-overlay) ];
          pkgs = import nixpkgs {
            inherit system overlays;
          };
          rustToolchain = pkgs.pkgsBuildHost.rust-bin.fromRustupToolchainFile ./api/rust-toolchain.toml;

          # Descriptions from https://discourse.nixos.org/t/use-buildinputs-or-nativebuildinputs-for-nix-shell/8464/2
          # nativeBuildInputs: Should be used for commands which need to run at build time (e.g. cmake) or shell hooks (e.g. autoPatchelfHook). These packages will be of the buildPlatforms architecture, and added to PATH.
          nativeBuildInputs = with pkgs; [
            rustToolchain
            cargo-watch
            cargo-shuttle
            sqlx-cli
            pkg-config
            postgresql
            pre-commit
            nodejs_22
            just
          ];

          # buildInputs: Should be used for things that need to be linked against (e.g. openssl). These will be of the hostPlaform's architecture. With strictDeps = true; (or by extension cross-platform builds), these will not be added to PATH. However, linking related variables will capture these packages (e.g. NIX_LD_FLAGS, CMAKE_PREFIX_PATH, PKG_CONFIG_PATH)
          buildInputs = with pkgs; [
            openssl
          ];
        in
        with pkgs;
        {
          devShells.default = mkShell {
            inherit buildInputs nativeBuildInputs;

            shellHook = ''
              export ROOT_PATH=$(git rev-parse --show-toplevel)
              # Set CARGO_HOME to a project-local directory.
              # This tells cargo to use this path for its home, instead of ~/.cargo.
              # This effectively isolates it from your global ~/.cargo directory,
              # preventing it from picking up binaries like an old cargo-shuttle from there.
              # Cargo will create this directory if it doesn't exist and needs to write.
              export CARGO_HOME="$ROOT_PATH/.cargo"
              export RUSTUP_HOME="$ROOT_PATH/.rustup"

              # Initialize rustup only if it's available and not already set up
              if command -v rustup >/dev/null 2>&1; then
                rustup install stable 2>/dev/null || true
                rustup default stable 2>/dev/null || true
              fi
              
              echo "CaLANdar development environment activated! Run 'just --list' to see available commands."
            '';
          };
        }
      );
}
