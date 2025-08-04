#!/bin/bash

# CaLANdar dev container initialization script
# This script sets up the development environment with Nix

set -e

echo "Setting up CaLANdar development environment..."

# Create necessary directories
mkdir -p ~/.cargo
mkdir -p ~/.cache/nix

# Create a shell wrapper that automatically enters the Nix environment
cat > ~/.nix-shell-wrapper << 'EOF'
#!/bin/bash
# Check if we're already in a nix shell
if [ -z "$IN_NIX_SHELL" ]; then
  echo "Activating CaLANdar development environment..."
  exec nix develop --impure --command bash --rcfile <(echo "source ~/.bashrc; echo 'CaLANdar development environment activated! Run just --list to see available commands.'")
else
  # Already in nix shell, just run bash normally
  exec bash "$@"
fi
EOF

chmod +x ~/.nix-shell-wrapper

# Set the wrapper as the default shell for new terminals
echo 'export SHELL=~/.nix-shell-wrapper' >> ~/.bashrc
echo 'exec ~/.nix-shell-wrapper' >> ~/.bashrc

echo "Development environment setup complete!"