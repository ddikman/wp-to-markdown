/**
 * This is an example plugin that adjusts the image paths.
 */
class ExampleFixPathsPlugin {
  static get name() {
    return 'ExampleFixPaths';
  }

  static processFrontMatter(extractedMetadata, _) {
    return extractedMetadata;
  }

  static processHtml(html) {
    return html;
  }

  static processMarkdown(markdown) {
    // Example of a plugin that fixes the image paths
    return markdown.replace(
      /images\//g,
      '/images/blogs/'
    );
  }
}

export default ExampleFixPathsPlugin;