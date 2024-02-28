# Customization

A Gathio installation can be customized, mostly through the `config.toml` file (see [Configuration](configuration.md) for more details). Some information on specific customization techniques is set out here.

## Static pages

Static pages are Markdown pages which are linked in the footer of your instance's frontend pages.

Create static pages as Markdown files in the `static/` directory. For instance, a privacy policy page might look like this:

```markdown
# static/privacy-policy.md

This is an example privacy policy. It **supports Markdown!**
```

In `config.toml`, for each static page you create, add a configuration block that looks like this:

```toml
[[static_pages]]
title = "Privacy Policy"
path = "/privacy"
filename = "privacy-policy.md"
```

The filename is relative to the `static/` directory.

Paths can be internal (beginning with a slash) or absolute (beginning with https://). For internal paths, the path value will correspond to the page's frontend path, so be aware that setting it to the same path as an existing page (for instance `/new` or `/events`) will result in undefined behaviour and should be avoided.

The title will appear at the top of the page and in the footer menu.

## Instance description

The instance description is a block of text which appears at the top of the public event list page (which is the home page on instances where `show_public_event_list` is set to `true`) and the 'About' page (which is the home page on instances where `show_public_event_list` is set to `false`).

The instance description is rendered from the Markdown file `static/instance-description.md`; if this file is missing, it will default to a generic line of text.

Within the instance description, you can use most Markdown formatting, as on static pages, and also you can supply the template string `{{ siteName }}`, which will be converted to the value of `site_name` as specified in `config.toml`.

The default instance description is:

```markdown
# static/instance-description.md

**{{ siteName }}** is running on Gathio — a simple, federated, privacy-first event hosting platform.
```
