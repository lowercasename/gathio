// Extra marked renderer (used to render plaintext event description for page metadata)
// Adapted from https://dustinpfister.github.io/2017/11/19/nodejs-marked/

import { marked } from "marked";

// &#63; to ? helper
function htmlEscapeToText(text: string) {
    return text.replace(/\&\#[0-9]*;|&amp;/g, function (escapeCode) {
        if (escapeCode.match(/amp/)) {
            return "&";
        }
        const code = escapeCode.match(/[0-9]+/);
        return String.fromCharCode(Number(code));
    });
}

export const renderPlain = () => {
    var render = new marked.Renderer();
    // render just the text of a link, strong, em
    render.link = function (href, title, text) {
        return text;
    };
    render.strong = function (text) {
        return text;
    };
    render.em = function (text) {
        return text;
    };
    // render just the text of a paragraph
    render.paragraph = function (text) {
        return htmlEscapeToText(text) + "\r\n";
    };
    // render nothing for headings, images, and br
    render.heading = function (text, level) {
        return "";
    };
    render.image = function (href, title, text) {
        return "";
    };
    render.br = function () {
        return "";
    };
    return render;
};
