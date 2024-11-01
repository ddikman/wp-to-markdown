# WordPress to Markdown Exporter

A Node.js tool to export WordPress posts to Markdown files with YAML frontmatter, while preserving images and code blocks.

## Features

- Exports WordPress posts to individual Markdown files
- Preserves YAML frontmatter with post metadata (title, date, categories, tags, etc.)
- Downloads and saves images locally, updating references in the Markdown
- Intelligent code block handling with language detection
- Configurable post limit and output directory
- Supports custom code block class names

## Running it

I recommend using `npx` for simplicity.


```bash
npx wp-to-markdown \
  --url="https://example.com" \
  --username="admin" \
  --password="password" \
  --output="path/to/output" \
  --limit=10 \
  --code-classes="EnlighterJSRAW" \
  --preserve-tags="iframe,script"
```

### Parameters

- `url`: The URL of the WordPress site.
- `username`: The username for authentication.
- `password`: The password for authentication.
- `output`: The path to the output directory.
- `limit`: The maximum number of posts to export.
- `code-classes`: The class name of the code block to use.
- `preserve-tags`: The HTML tags to preserve as they are.
- `plugins`: Optional plugins to use.

### Limiting

If you want to limit the number of posts exported, you can use the `--limit` parameter. This is useful if you want to test the tool or only export a subset of your posts.

### Code Block Classes

If you want to use a custom code block class, you can use the `--code-classes` parameter. This is useful if you want to use a specific syntax highlighter.

It's a bit basic and will try to guess the language based on the contents of the code block but it's not perfect, only better than nothing.

### Preserving tags

If you want to preserve certain tags, you can use the `--preserve-tags` parameter.

By default it will preserve `iframe` and `script` tags.

### Image download

Images are downloaded and saved locally, updating references in the Markdown.

### Plugins

You can use built-in plugins or add your own. Run them by adding the `--plugins` parameter.

```bash
npx wp-to-markdown ... --plugins="Yoast"
```

The built-in plugins are:

- `Yoast`: Extracts the Yoast SEO description as the excerpt.

Want to contribute another one?

To run your own plugins see advanced usage below.

## Example output

![Example output](example-output.png)

## Metadata

The articles will include a markdown meta data header section with data taken from the Wordpress post:

```
---
title: Get the innerText of an element in Scrapy
date: '2023-01-18T13:31:19'
modified: '2023-01-18T13:32:52'
slug: get-the-innertext-of-an-element-in-scrapy
status: publish
categories:
  - Automation
tags:
  - python
  - scrapy
author: David
excerpt: >-
  How do you get the innerText when using Scrapy? Short answer is, you don't.
  But by adding BeautifulSoup you can.
featured_image: images/get-the-innertext-of-an-element-in-scrapy/Untitled_Artwork.png
original_url: https://greycastle.se/get-the-innertext-of-an-element-in-scrapy
---
```

## Advanced usage

### Custom post types

If you've added custom post types using some third party plugin or so you can use the `--post-type` parameter to specify which post types to export.

```bash
npx wp-to-markdown \
  --url="https://example.com" \
  --username="admin" \
  --password="password" \
  --output="path/to/output" \
  --post-type="custom_post_type"
```

If you haven't done so already, you will also need to enable accessing this post type via the REST API.

Add this following in the bottom of the `functions.php` file, replacing `your_custom_post_type` with your actual post type:

```php
function register_custom_post_type() {
    $args = array(
        'public' => true,
        'label'  => 'Your custom post type',
        'show_in_rest' => true,
        'rest_base' => 'your_custom_post_type',
    );
    register_post_type('your_custom_post_type', $args);
}
add_action('init', 'register_custom_post_type');
```

Example:

```bash
npx wp-to-markdown \
  --url http://some.wordpress.com \
  --username admin \
  --password 'xxx' \
  --output listings \
  --custom-post-type listings
```

### Running your own plugins

The built-in plugins are loaded from the `lib/plugins` directory but, you can also add your own simply by adding a `.js` file in the folder you are running the tool from.

The file should export a class with static `name`, `processFrontMatter` and `processPostContent` methods.

Copy the [Yoast plugin](lib/plugins/yoast.js) as a template and modify it to your needs.

If you try to run your plugin and it's not found, check the console will tell you what plugins are loaded. If your plugin does not appear there, chances are it does not match the expected interface or is in the wrong directory.