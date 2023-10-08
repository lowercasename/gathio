module.exports = {
    apps: [
        {
            name: "gathio-prod",
            script: "pnpm start",
            watch: false,
            instances: 1,
            autorestart: true,
            max_restarts: 10,
            max_memory_restart: "512M",
        },
    ],

    deploy: {
        production: {
            user: "raphael",
            host: "gath.io",
            ref: "origin/main",
            repo: "git@github.com:lowercasename/gathio",
            path: "/home/raphael/gathio-production",
            "post-deploy": "./deploy.sh",
        },
    },
};
