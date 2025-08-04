#!/bin/bash

# CaLANdar dev container initialization script
# This script sets up the development environment with Nix

set -e

echo "Setting up CaLANdar development environment..."

# Create necessary directories
mkdir -p ~/.cargo
mkdir -p ~/.cache/nix

# Create a simple script to activate the Nix environment
cat > ~/.activate-nix-env << 'EOF'
#!/bin/bash
# Activate CaLANdar development environment if not already active
if [ -z "$IN_NIX_SHELL" ]; then
  echo "Activating CaLANdar development environment..."
  exec nix develop --impure
fi
EOF

chmod +x ~/.activate-nix-env

# Add activation to bashrc, but only for interactive shells and avoid recursion
cat >> ~/.bashrc << 'EOF'

# Auto-activate CaLANdar Nix environment for interactive shells
if [[ $- == *i* ]] && [ -z "$IN_NIX_SHELL" ] && [ -z "$NIX_ENV_ACTIVATED" ]; then
  export NIX_ENV_ACTIVATED=1
  echo "Activating CaLANdar development environment..."
  exec nix develop --impure
fi
EOF

echo "Development environment setup complete!"