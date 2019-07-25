require('dotenv').config();

const mongoose = require('mongoose');

const databaseCredentials = require('./config/database.js');

mongoose.connect(databaseCredentials.url, { useNewUrlParser: true });
mongoose.Promise = global.Promise;
mongoose.connection
  .on('connected', () => {
    console.log(`Mongoose connection open on ${process.env.DATABASE}`);
  })
  .on('error', (err) => {
    console.log(`Connection error: ${err.message}`);
  });

require('./models/Event');
require('./models/User');
require('./models/Log');

const app = require('./app');

const server = app.listen(3000, () => {
  console.log(`Express is running on port ${server.address().port}`);
});
