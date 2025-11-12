import { marked } from "marked";
import { JSDOM } from "jsdom";
import DOMPurify from "dompurify";

// &#63; to ? helper
function htmlEscapeToText(text: string) {
  return text.replace(/&#[0-9]*;|&amp;/g, function (escapeCode) {
    if (escapeCode.match(/amp/)) {
      return "&";
    }
    const code = escapeCode.match(/[0-9]+/);
    return String.fromCharCode(Number(code));
  });
}

// Extra marked renderer (used to render plaintext event description for page metadata)
// Adapted from https://dustinpfister.github.io/2017/11/19/nodejs-marked/

export const renderPlain = () => {
  const render = new marked.Renderer();
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
  render.heading = function (_text, _level) {
    return "";
  };
  render.image = function (_href, _title, _text) {
    return "";
  };
  render.br = function () {
    return "";
  };
  return render;
};

export const markdownToSanitizedHTML = (markdown: string) => {
  const html = marked.parse(markdown) as string;
  const window = new JSDOM("").window;
  const purify = DOMPurify(window);
  const clean = purify.sanitize(html);
  return clean;
};
