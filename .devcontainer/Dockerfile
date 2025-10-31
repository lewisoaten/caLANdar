# CaLANdar Development Container Dockerfile
# This Dockerfile replicates the feature-based devcontainer setup

FROM mcr.microsoft.com/devcontainers/base:ubuntu-22.04

# Install system dependencies
RUN apt-get update && export DEBIAN_FRONTEND=noninteractive \
    && apt-get -y install --no-install-recommends \
        build-essential \
        curl \
        git \
        ca-certificates \
        gnupg \
        lsb-release \
        xz-utils \
    && apt-get clean -y && rm -rf /var/lib/apt/lists/*

# Install Docker (Docker-in-Docker)
RUN curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null \
    && apt-get update \
    && apt-get -y install --no-install-recommends docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin \
    && apt-get clean -y && rm -rf /var/lib/apt/lists/*

# Install GitHub CLI
RUN curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg \
    && chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | tee /etc/apt/sources.list.d/github-cli.list > /dev/null \
    && apt-get update \
    && apt-get -y install --no-install-recommends gh \
    && apt-get clean -y && rm -rf /var/lib/apt/lists/*

# Install Nix (multi-user installation for better container compatibility)
RUN curl -L https://nixos.org/nix/install | sh -s -- --daemon \
    && echo "experimental-features = nix-command flakes" >> /etc/nix/nix.conf

# Configure environment for vscode user
USER vscode

# Set up Nix for the vscode user
RUN mkdir -p /home/vscode/.config/nix \
    && echo "experimental-features = nix-command flakes" > /home/vscode/.config/nix/nix.conf

# Copy initialization script
COPY init-dev-env.sh /home/vscode/.devcontainer-init.sh
RUN sudo chmod +x /home/vscode/.devcontainer-init.sh

USER root

# Enable Docker service
RUN systemctl enable docker || true

# Add vscode user to docker group
RUN usermod -aG docker vscode

# Set default user
USER vscode
