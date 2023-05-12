require('dotenv').config();

const path = require('path');

const mongoose = require('mongoose');

const databaseCredentials = require('./config/database.js');
const port = require('./config/domain.js').port;

mongoose.connect(databaseCredentials.url, { useNewUrlParser: true, useUnifiedTopology: true });
mongoose.set('useCreateIndex', true);
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
require('./models/EventGroup');

const app = require('./app.js');

global.appRoot = path.resolve(__dirname);

const server = app.listen(port, () => {
  console.log(`Welcome to gathio! The app is now running on http://localhost:${server.address().port}`);
});
