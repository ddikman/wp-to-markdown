/**
 * This is an example plugin that adjusts the image paths.
 */
class ExampleFixPathsPlugin {
  static get name() {
    return 'ExampleFixPaths';
  }

  static _replaceUrl(content) {
    return content.replace(
      /static\/images\/blogs\//g,
      '/images/blogs/'
    );
  }

  static processFrontMatter(extractedMetadata, _) {
    return {
      ...extractedMetadata,
      featured_image: extractedMetadata.featured_image != null
        ? this._replaceUrl(extractedMetadata.featured_image)
        : null,
    };
  }

  static processHtml(html) {
    return html;
  }

  static processMarkdown(markdown) {
    return this._replaceUrl(markdown);
  }
}

export default ExampleFixPathsPlugin;