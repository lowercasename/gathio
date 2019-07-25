const express = require('express');
const path = require('path');
const session = require('express-session');
const cors = require('cors');
const routes = require('./routes');
const hbs  = require('express-handlebars');
const bodyParser = require('body-parser');

const app = express();

// Configuration //

//app.use(cors());
//app.use(bodyParser.json());
//app.use(session({ secret: 'slartibartfast', cookie: { maxAge: 60000 }, resave: false, saveUninitialized: false }));


// View engine //

app.engine('handlebars', hbs({defaultLayout: 'main'}));
app.set('view engine', 'handlebars');

// Static files //

app.use(express.static('public'));

// Router //

app.use(bodyParser.urlencoded({ extended: true }));
app.use('/', routes);

module.exports = app;
