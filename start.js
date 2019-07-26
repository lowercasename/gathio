require('dotenv').config();

const path = require('path');

const mongoose = require('mongoose');

const databaseCredentials = require('./config/database.js');

mongoose.connect(databaseCredentials.url, { useNewUrlParser: true });
mongoose.Promise = global.Promise;
mongoose.connection
  .on('connected', () => {
    console.log('Mongoose connection open!');
  })
  .on('error', (err) => {
    console.log('Connection error: ${err.message}');
  });

require('./models/Event');
require('./models/Log');

const app = require('./app');

global.appRoot = path.resolve(__dirname);

const server = app.listen(3000, () => {
  console.log(`Welcome to gathio! The app is now running on http://localhost:${server.address().port}`);
});
