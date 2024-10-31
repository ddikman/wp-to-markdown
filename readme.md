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

## Example output

![Example output](example-output.png)


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