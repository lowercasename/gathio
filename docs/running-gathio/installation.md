# Installation

Gathio can be set up to run on your own server in two ways – as a self-hosted service, or via Docker.

## Self-hosting on Linux or macOS

### Prerequisites

- [Node.js](https://nodejs.org/) v18 or greater
- [pnpm](https://pnpm.io/) v7 or greater
- **SQLite** (no separate install required – the `sqlite3` package is pulled in by Prisma)

### Ubuntu / Debian

Let’s suppose we’re installing on a fresh Ubuntu system.

1. Clone the code:

    ```bash
    cd /srv/
    sudo git clone https://github.com/lowercasename/gathio.git
    sudo chown -R $USER:$USER gathio
    cd gathio
    ```

2. Install pnpm (if you don’t already have it):

    ```bash
    curl -fsSL https://get.pnpm.io/install.sh | sh -
    export PATH="$HOME/.local/share/pnpm:$PATH"
    ```

3. Install dependencies, build TypeScript, and generate Prisma client:

    ```bash
    pnpm install
    pnpm build
    # Initialize your SQLite database:
    # create .env file with the default DATABASE_URL
    echo 'DATABASE_URL="file:./dev.db"' > .env
    pnpm prisma migrate dev --name init
    pnpm prisma generate
    ```

4. Copy and edit your config:

    ```bash
    cp config/config.example.toml config/config.toml
    $EDITOR config/config.toml
    ```

    - Make sure `database.url` (or `DATABASE_URL` in `.env`) points to your SQLite file.
    - Update `general.domain`, `general.port`, and any mail-service settings if needed.

5. (Optionally) Create a dedicated system user:

    ```bash
    sudo adduser --system --home /srv/gathio --group gathio
    sudo chown -R gathio:gathio /srv/gathio
    ```

6. Create a `systemd` service unit (`/etc/systemd/system/gathio.service`):

    ```ini
    [Unit]
    Description=Gathio event hosting
    After=network.target

    [Service]
    Type=simple
    WorkingDirectory=/srv/gathio
    User=gathio
    Environment=NODE_ENV=production
    EnvironmentFile=/srv/gathio/.env
    ExecStart=/usr/bin/pnpm start
    Restart=on-failure

    [Install]
    WantedBy=multi-user.target
    ```

7. Reload and start the service:

    ```bash
    sudo systemctl daemon-reload
    sudo systemctl enable gathio
    sudo systemctl start gathio
    ```

8. Verify it’s listening on port 3000:

    ```bash
    sudo netstat -tunap | grep LISTEN
    ```

9. (Optional) Proxy through Nginx for TLS, custom domains, etc.

## Docker

We provide a `docker-compose.yml` ready for Prisma/SQLite:

1. Create your directories:

    ```bash
    mkdir -p ~/docker/gathio/{config,static,events,db}
    ```

2. Copy the example config:

    ```bash
    cp config/config.example.toml ~/docker/gathio/config/config.toml
    ```

3. Copy or create `docker-compose.yml` in `~/docker/gathio/` with something like:

    ```yaml
    version: "3.8"
    services:
      gathio:
        image: ghcr.io/lowercasename/gathio:latest
        container_name: gathio
        ports:
          - "3000:3000"
        environment:
          - DATABASE_URL=file:./db/dev.db
        volumes:
          - ./config:/app/config
          - ./static:/app/static
          - ./events:/app/public/events
          - ./db:/app/db
        restart: unless-stopped
    ```

4. Adjust the toml in `config/config.toml`:

    ```toml
    [database]
    url = "file:./db/dev.db"

    mail_service = "none"  # or "nodemailer"/"sendgrid"/"mailgun"
    ```

5. Bring up the stack:

    ```bash
    cd ~/docker/gathio
    docker-compose up -d
    ```

Gathio will now be running on `http://localhost:3000`, using SQLite (persisted in your `db/` folder) and storing uploaded images in `events/`.
