// Which of these fields are used depends on the 'mailService' config entry in config/domain.js
module.exports = {
    'sendgrid' : '', // If using SendGrid, the Sendgrid API key goes here
    'smtpServer': '', // If using Nodemailer, your SMTP server hostname goes here
    'smtpPort': '', // If using Nodemailer, your SMTP server port goes here
    'smtpUsername': '', // If using Nodemailer, your SMTP server username goes here
    'smtpPassword': '', // If using Nodemailer, your SMTP password goes here
    'smtpSecure': true // true for 465, false for other ports
};
