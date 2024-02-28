# Configuration

Gathio is configured through a config file located at `config/config.toml`. The config options are as follows:

## `[general]` section

| Option                    | Default Value         | Description                                                                                                                                                                                                                                           |
| ------------------------- | --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `domain`                  | "localhost:3000"      | Your instance domain. If there is a port it should be 'domain.com:port', but otherwise just 'domain.com'.                                                                                                                                             |
| `port`                    | "3000"                | The port on which Gathio will serve the site.                                                                                                                                                                                                         |
| `email`                   | "contact@example.com" | Your contact email, from which the emails Gathio sends are addressed.                                                                                                                                                                                 |
| `site_name`               | "Gathio"              | Your instance's name, shown in various places on the frontend.                                                                                                                                                                                        |
| `is_federated`            | true                  | If set to `true`, ActivityPub federation features will be enabled.                                                                                                                                                                                    |
| `delete_after_days`       | 7                     | Events will be deleted this many days after they have ended. Set to 0 to disable automatic deletion (old events will never be deleted).                                                                                                               |
| `email_logo_url`          | ""                    | If left blank, this defaults to https://yourdomain.com/images/gathio-email-logo.gif. Set a full URL here to change it to your own logo (or just change the file itself).                                                                              |
| `show_kofi`               | false                 | Show a Ko-Fi box to donate money to Raphael (Gathio's creator) on the front page.                                                                                                                                                                     |
| `show_public_event_list`  | false                 | Show a list of events and groups on the front page which have been marked as 'Display this event/group on the public event/group list'. This list becomes the home page, and the about page with information on Gathio remains available at `/about`. |
| `mail_service`            | "nodemailer"          | Which mail service to use to send emails to hosts and attendees. Options are 'nodemailer' or 'sendgrid'.                                                                                                                                              |
| `creator_email_addresses` | []                    | An array of email addresses which are permitted to create events. If this is empty, anyone can create events. For example: ["test@test.com", "admin@test.com"]                                                                                        |

## `[database]` section

| Option        | Default Value                      | Description                                                                                                                 |
| ------------- | ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `mongodb_url` | "mongodb://localhost:27017/gathio" | Set up for a locally running MongoDB connection. Change this to 'mongodb://mongo:27017/gathio' for a Dockerised connection. |

## `[nodemailer]` section

| Option          | Default Value | Description                   |
| --------------- | ------------- | ----------------------------- |
| `smtp_server`   | ""            | The Nodemailer SMTP server.   |
| `smtp_port`     | ""            | The Nodemailer SMTP port.     |
| `smtp_username` | ""            | The Nodemailer SMTP username. |
| `smtp_password` | ""            | The Nodemailer SMTP password. |

## `[sendgrid]` section

| Option    | Default Value | Description           |
| --------- | ------------- | --------------------- |
| `api_key` | ""            | The Sendgrid API key. |

## `[[static_pages]]` sections

| Option         | Description                                                                                                   |
| -------------- | ------------------------------------------------------------------------------------------------------------- |
| `static_pages` | Links to static pages, which will be displayed in the footer. See [Customization](customization.md) for more. |
