# Installation

Gathio can be set up to run on your own server in two ways - as a self-hosted service, or via Docker.

## Self-hosting on Linux or macOS

### Prerequisites

- [Node.js](https://nodejs.org/en/) v18 or greater
- [MongoDB](https://www.mongodb.com/docs/manual/administration/install-on-linux/#std-label-install-mdb-community-edition-linux)

### Ubuntu

Let's suppose we're installing on a fresh Ubuntu system.

First, let's get the code:

```bash
cd /srv/
sudo git clone https://github.com/lowercasename/gathio/
```

We'll need to install [`pnpm`](https://pnpm.io/) for this. It should be installed somewhere accessible by any user account. You may also have to link `/usr/bin/node` and `/usr/bin/nodejs` to be accessible to all users, too.

```bash
export PNPM_HOME="/usr/.pnpm"
curl -fsSL https://get.pnpm.io/install.sh | sh -
sudo ln -s /usr/.pnpm/pnpm /usr/bin/pnpm
# you may also have to link /usr/bin/node or /usr/bin/nodejs to your local copy of node
```

`pnpm` installation instructions for [other systems](https://pnpm.io/installation) are available.

Now, we'll install the dependencies:

```bash
cd gathio
pnpm install
# as "checkJs" is set to "true" in "tsconfig.json", this fails because of type-checking
#   however, it builds the output folder "dist", so we can ignore the errors and carry on
pnpm build
```

Let's copy the config file in place:

```bash
cp config/config.example.toml config/config.toml
```

We can edit this file if needed, as it contains settings which will need to be adjusted to your local setup to successfully format emails.

```bash
$EDITOR config/config.toml
```

Either way, we'll need to have MongoDB running. Follow the [MongoDB Community Edition Ubuntu instructions](https://www.mongodb.com/docs/manual/tutorial/install-mongodb-on-ubuntu), which are probably what you want.

Next, let's create a dedicated user:

```bash
sudo adduser --home /srv/gathio --disabled-login gathio
sudo chown -R gathio:gathio /srv/gathio
# check user can access pnpm
cd / && sudo -u gathio /usr/bin/pnpm --version
```

Next, we'll copy the `systemd` service and reload `systemd`

```bash
sudo cp gathio.service /etc/systemd/system/
sudo systemctl daemon-reload
```

Finally, we can start `gathio`:

```bash
# start locally in terminal
cd /srv/gathio
/usr/bin/pnpm start
# start service to run in background
sudo systemctl start gathio
```

It should now be listening on port 3000:

```bash
$ sudo netstat -tunap | grep LISTEN
[...]
tcp        0      0 0.0.0.0:22              0.0.0.0:*               LISTEN      952/sshd
tcp6       0      0 :::3000                 :::*                    LISTEN      5655/node
[...]
```

(this doesn't mean it's only listening on IPv6, because sockets under Linux are
dual-stack by default...)

It is now available on port 3000, and we can continue by setting up a reverse
proxy, which allows us to make it available on another port, or from another
server; and to enable TLS on the connection (see for example [Linode's guide on
the subject](https://www.linode.com/docs/web-servers/nginx/use-nginx-reverse-proxy/#configure-nginx))

## Docker

The easiest way to run Gathio using Docker is by using the provided
`docker-compose` configuration. We provide a Docker image at [GitHub
Container Repository](https://github.com/lowercasename/gathio/pkgs/container/gathio).

Clone the Gathio repository onto your system - you'll need a few files from it in a minute.

Create a few directories on your system:

- One where you'll keep the Gathio configuration file
- One where you'll keep Gathio's static files, such as the instance description
  and any custom pages you may want to create
- And another where Gathio can store user-uploaded event images.

```bash
mkdir -p ~/docker/gathio-docker/{config,images,static}
```

Copy the example config file from the Gathio repository directory into the Docker config directory,
renaming it to `config.toml`:

```bash
cp config/config.example.toml ~/docker/gathio-docker/config/config.toml
```

In the `docker-compose.yml` configuration file, adjust
the `volumes` configuration to match the three folders you created:

```dockerfile
volumes:
    - '/home/username/docker/gathio-docker/config:/app/config'
    - '/home/username/docker/gathio-docker/static:/app/static'
    - '/home/username/docker/gathio-docker/images:/app/public/events'
```

As with all things in the Docker universe, two things seperated by a colon
means `<thing on host computer>:<thing inside Docker container>`.  So
here you're saying "any files I put in the folder called
`/home/username/docker/gathio-docker/config` on my computer will appear inside
the Docker container at the path `/app/static`. Don't change the paths on the
Docker container side - only the ones on the host side!

Adjust any settings in the config file, especially the MongoDB URL, which should
read as follows for the standard Docker Compose config, and the email service if you
want to enable it:

```ini
mongodb_url = "mongodb://mongo:27017/gathio"
mail_service = "nodemailer"
```

You can copy the `docker-compose.yml` file into that same `gathio-docker`
directory you created - you don't need to keep any of the other source code. Once
you're done, your directory should look something like this:

```tree
gathio-docker
├── config
│  └── config.toml
├── docker-compose.yml
├── images
└── static
   ├── instance-description.md
   └── privacy-policy.md
```

Finally, from wherever you've put your `docker-compose.yml` file, start the Docker Compose stack:

```bash
cd gathio-docker
docker-compose up -d
```

Gathio should now be running on `http://localhost:3000`, storing data in a
Docker volume, and storing images on your filesystem.
