# gathio

Self-destructing, shareable, no-registration event pages.

You can use the publicly hosted version [here](https://gath.io).

# Installation

1. Clone the repository
2. Open the directory, run `npm install`
3. Rename `config/api-example.js` and `config/database-example.js` and `config/domain-example.js` to  `config/api.js` and `config/database.js` and `config/domain.js`. For locally hosted versions, the local MongoDB configuration will work fine. To send emails, you need to set up a Sendgrid account and get an API key, which you should paste into `config/api.js`.
4. Run `npm start`. Enjoy!
