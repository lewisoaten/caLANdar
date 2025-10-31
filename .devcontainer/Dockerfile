# CaLANdar Development Container
# Base image with Ubuntu 22.04
FROM mcr.microsoft.com/devcontainers/base:ubuntu-22.04

# Install git (included in base but ensuring it's present)
RUN apt-get update && export DEBIAN_FRONTEND=noninteractive \
    && apt-get -y install --no-install-recommends git

# Install GitHub CLI
RUN apt-get update && export DEBIAN_FRONTEND=noninteractive \
    && apt-get -y install --no-install-recommends curl \
    && curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg \
    && chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | tee /etc/apt/sources.list.d/github-cli.list > /dev/null \
    && apt-get update \
    && apt-get -y install gh

# Install Docker (Docker-in-Docker setup)
RUN apt-get update && export DEBIAN_FRONTEND=noninteractive \
    && apt-get -y install --no-install-recommends \
        ca-certificates \
        curl \
        gnupg \
        lsb-release \
    && curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null \
    && apt-get update \
    && apt-get -y install --no-install-recommends docker-ce docker-ce-cli containerd.io docker-compose-plugin docker-buildx-plugin

# Install Nix
RUN curl -L https://nixos.org/nix/install | sh -s -- --no-daemon \
    && echo "experimental-features = nix-command flakes" >> /etc/nix/nix.conf

# Set up environment for Nix
ENV PATH="/root/.nix-profile/bin:${PATH}"

# Create necessary directories
RUN mkdir -p /home/vscode/.cargo /home/vscode/.cache/nix \
    && chown -R vscode:vscode /home/vscode/.cargo /home/vscode/.cache/nix

# Switch to vscode user for remaining setup
USER vscode

# Install Nix for vscode user
RUN curl -L https://nixos.org/nix/install | sh -s -- --no-daemon

# Set up environment for vscode user
ENV PATH="/home/vscode/.nix-profile/bin:${PATH}"
RUN echo "experimental-features = nix-command flakes" >> /home/vscode/.config/nix/nix.conf || mkdir -p /home/vscode/.config/nix && echo "experimental-features = nix-command flakes" >> /home/vscode/.config/nix/nix.conf

# Copy initialization script
COPY init-dev-env.sh /home/vscode/.devcontainer/init-dev-env.sh
RUN chmod +x /home/vscode/.devcontainer/init-dev-env.sh

# Switch back to root for final setup
USER root

# Clean up
RUN apt-get autoremove -y && apt-get clean -y && rm -rf /var/lib/apt/lists/*

# Set default user
USER vscode
