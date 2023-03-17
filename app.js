const express = require('express');
const path = require('path');
const session = require('express-session');
const cors = require('cors');
const routes = require('./routes');
const hbs  = require('express-handlebars');
const bodyParser = require('body-parser');
// const i18n = require('i18n');
const { I18n } = require('i18n');

const app = express();
// Configuration //
//app.use(cors());
//app.use(bodyParser.json());
//app.use(session({ secret: 'slartibartfast', cookie: { maxAge: 60000 }, resave: false, saveUninitialized: false }));
app.use(session({
    secret: 'Py0Bf3aWZC8kYkYTpRztmYMyS22pFFGi'
}));

// Internationalization //
const i18n = new I18n({
    locales:['en-US'],  //include langs
    directory: path.join(__dirname, 'locales'),
    defaultLocale: 'en-US'
});
app.use(i18n.init);

// View engine //
const hbsInstance = hbs.create({
    defaultLayout: 'main',
    partialsDir: ['views/partials/'],
    layoutsDir: 'views/layouts/',
    helpers: {
        plural: function(number, text) {
            var singular = number === 1;
            // If no text parameter was given, just return a conditional s.
            if (typeof text !== 'string') return singular ? '' : 's';
            // Split with regex into group1/group2 or group1(group3)
            var match = text.match(/^([^()\/]+)(?:\/(.+))?(?:\((\w+)\))?/);
            // If no match, just append a conditional s.
            if (!match) return text + (singular ? '' : 's');
            // We have a good match, so fire away
            return singular && match[1] // Singular case
                ||
                match[2] // Plural case: 'bagel/bagels' --> bagels
                ||
                match[1] + (match[3] || 's'); // Plural case: 'bagel(s)' or 'bagel' --> bagels
        }
    }
});
app.engine('handlebars', hbsInstance.engine);
app.set('view engine', 'handlebars');
app.set('hbsInstance', hbsInstance);

// Static files //

app.use(express.static('public'));

// Router //
app.use(bodyParser.json({ type: "application/activity+json" })); // support json encoded bodies
app.use(bodyParser.urlencoded({ extended: true }));
app.use('/', routes);

app.use(setLocale);
module.exports = app;

// def setLocale
function setLocale(req, res, next){
    var locale;
    // Get the locale data in the user data
    if(req.user){
        locale = req.user.locale;
    }
    // Get the locale data in the cookie
    else if(req.signedCookies['locale']){
        locale = req.signedCookies['locale'];
    }
    // Get the first preferred language of the browser, this function is provided by express
    // User-selected languages will be added later
    else if(req.acceptsLanguages()){
        locale = req.acceptsLanguages();
    }
    // When there is no language preference, the language used on the website is English
    else {
        locale = 'en-US';
    }
    // If the language preference saved in the cookie is different from the language preference used here, update the language preference setting in the cookie
    if(req.signedCookies['locale'] !== locale){
        res.cookie('locale', locale, { signed: true, httpOnly: true });
    }
    // Set the language that i18n will use for this request
    req.setLocale(locale);
    next();
};