const express = require('express');
const path = require('path');
const session = require('express-session');
const cors = require('cors');
const routes = require('./routes');
const hbs  = require('express-handlebars');
const bodyParser = require('body-parser');
const i18n = require('i18n');

const app = express();
// Configuration //
//app.use(cors());
//app.use(bodyParser.json());
//app.use(session({ secret: 'slartibartfast', cookie: { maxAge: 60000 }, resave: false, saveUninitialized: false }));
app.use(session({
    secret: 'Py0Bf3aWZC8kYkYTpRztmYMyS22pFFGi'
}));
i18n.configure({
    locales:['en-US'],  //声明包含的语言
    directory: __dirname + '/locales',  //翻译json文件的路径
    defaultLocale: 'en-US'   //默认的语言，即为上述标准4
});
app.use(i18n.init);
// View engine //
hbsInstance = hbs.create({
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

// 定义setLocale中间件
function setLocale(req, res, next){
    var locale;
    // 当req进入i18n中间件的时候，已经通过sessionId信息获取了用户数据
    // 获取用户数据中的locale数据
    if(req.user){
        locale = req.user.locale;
    }
    // 获取cookie中的locale数据
    else if(req.signedCookies['locale']){
        locale = req.signedCookies['locale'];
    }
    // 获取浏览器第一个偏好语言，这个函数是express提供的
    else if(req.acceptsLanguages()){
        locale = req.acceptsLanguages();
    }
    // 没有语言偏好的时候网站使用的语言为中文
    else{
        locale = 'en-US';
    }
    // 如果cookie中保存的语言偏好与此处使用的语言偏好不同，更新cookie中的语言偏好设置
    if(req.signedCookies['locale'] !== locale){
        res.cookie('locale', locale, { signed: true, httpOnly: true });
    }
    // 设置i18n对这个请求所使用的语言
    req.setLocale(locale);
    next();
};