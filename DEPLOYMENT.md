# Deploying to IONOS (VPS) via Docker

Two common approaches are shown: (A) build and run on the IONOS VPS using Docker/Docker Compose, or (B) build locally, push to a registry, and pull on the VPS.

Prerequisites on the IONOS VPS
- An active IONOS VPS (SSH access)
- Docker and Docker Compose installed (or use Docker Engine + docker compose plugin)

Option A — Build and run on the VPS
1. SSH into your VPS:

```bash
ssh root@your-vps-ip
```

2. Install Docker (if not installed): follow Docker's Linux instructions for your distro or run the convenience script for quick setup.

3. Clone this repo on the VPS and change to the project directory.

```bash
git clone <repo-url> app
cd app
```

4. Build and start with Docker Compose:

```bash
docker compose up -d --build
```

5. Confirm the container is running and listening on port 3000:

```bash
docker compose ps
curl -I http://localhost:3000
```

Option B — Build locally and run on VPS
1. Build an image locally and push to your Docker registry (Docker Hub, GitHub Container Registry, etc.):

```bash
docker build -t youruser/ai-studio-applet:latest .
docker push youruser/ai-studio-applet:latest
```

2. On the VPS, pull and run the image:

```bash
docker pull youruser/ai-studio-applet:latest
docker run -d -p 3000:3000 --env PORT=3000 --name ai-studio-app youruser/ai-studio-applet:latest
```

Notes and tips
- Use a reverse proxy (nginx) and TLS certs (Let's Encrypt) for production traffic.
- Store secrets in environment variables or a secrets manager; do not commit `.env` files.
- If you prefer systemd, create a systemd unit that runs the `docker compose` command or `docker run` command.
