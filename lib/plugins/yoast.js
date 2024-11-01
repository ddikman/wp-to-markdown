class YoastPlugin {
  static get name() {
    return 'Yoast';
  }

  /**
   * Update the metadata with yoast-specific SEO data
   *
   * @param {Object} extractedMetadata The metadata extracted by the default exporter or prior plugins
   * @param {string} postContent The post content json pbject as from the Wordpress API
   * @returns {Object} A new metadata object with the yoast-specific SEO data added
   */
  static processFrontMatter(extractedMetadata, postContent) {
    const yoast = postContent.yoast_head_json;

    // Use the Yoast description instead as it won't have html tags
    // perhaps there are more information that can be added in here from Yoast?
    return {
      ...extractedMetadata,
      excerpt: yoast.description,
    };
  }

  /**
   * Process the post content
   *
   * @param {string} postContent The post from the Wordpress API
   * @returns {string} The processed post content
   */
  static processPostContent(postContent) {
    return postContent;
  }
}

export default YoastPlugin;