#!/usr/bin/env node

import { promises as fs } from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';
import sanitize from 'sanitize-filename';
import { JSDOM } from 'jsdom';
import { Command } from 'commander';
import chalk from 'chalk';
import https from 'https';
import detectLang from 'lang-detector';
import loadPlugins from './load-plugins.js';

class WordPressExporter {
  constructor(config) {
    this.wpUrl = config.wpUrl.replace(/\/$/, '');
    this.username = config.username;
    this.password = config.password;
    this.baseDir = config.outputDir;
    this.imagesDir = config.imagesDir;
    this.codeClasses = config.codeClasses || [];
    this.customPostType = config.customPostType;
    this.limit = config.limit ?? Infinity;
    this.preserveTags = config.preserveTags ?? [];
    this.plugins = config.plugins ?? [];
    this.loadedPlugins = [];
    // Configure TurndownService with code block handling
    this.turndown = new TurndownService({
      headingStyle: 'atx',
      codeBlockStyle: 'fenced'
    });

    this.turndown.use(gfm);

    // Preserve certain tags
    this.turndown.keep(this.preserveTags);

    // Add custom rule for code blocks
    this.turndown.addRule('codeBlocks', {
      filter: (node) => this.codeClasses.some(className => node.className.indexOf(className) !== -1),
      replacement: (content, node) => {
        const code = node.textContent
        .replace(/\\n/g, '\n')  // Replace literal '\n' with actual line breaks
        .replace(/\r\n/g, '\n') // Normalize Windows line endings
        .replace(/\r/g, '\n')   // Normalize old Mac line endings
        .trim();

        // Map common language names to their markdown equivalents
        const languageMap = {
          'JavaScript': 'javascript',
          'C': 'c',
          'C++': 'cpp',
          'Python': 'python',
          'Java': 'java',
          'HTML': 'html',
          'CSS': 'css',
          'Ruby': 'ruby',
          'Go': 'go',
          'PHP': 'php',
          'Unknown': ''
        };

        let language = languageMap[detectLang(code)];
        if (!language && this.isJson(code)) {
          language = 'json';
        }
        return `\`\`\`${language || ''}\n${code}\n\`\`\`\n\n`;
      }
    });

    this.authHeader = Buffer.from(`${this.username}:${this.password}`).toString('base64');
    this.agent = new https.Agent({
      rejectUnauthorized: false
    });
  }

  isJson(code) {
    try {
      JSON.parse(code);
      return true;
    } catch (e) {
      return false;
    }
  }

  showConfig() {
    // Log configuration
    console.log(chalk.yellow('\nExport configuration:'));
    console.log(chalk.yellow('------------------'));
    console.log(`WordPress URL: ${this.wpUrl}`);
    console.log(`Output directory: ${this.baseDir}`);
    console.log(`Post limit: ${this.limit}`);
    console.log(`Code block classes: ${this.codeClasses}`);
    console.log(`Custom post type: ${this.customPostType}`);
    console.log(`Preserve tags: ${this.preserveTags}`);
    console.log(`Plugins: ${this.plugins}`);
    console.log(chalk.yellow('------------------\n'));
  }

  async _loadPlugins() {
    const allPlugins = await loadPlugins(this.plugins);
    const missingPlugins = [];
    for (const pluginName of this.plugins) {
      const plugin = allPlugins.find(p => p.name === pluginName);
      if (!plugin) {
        missingPlugins.push(pluginName);
      } else {
        this.loadedPlugins.push(plugin);
      }
    }
    if (missingPlugins.length) {
      const availablePluginNames = allPlugins.map(p => p.name).join(', ');
      console.error(chalk.red(`Plugins not found: ${missingPlugins.join(', ')}`));
      console.error(chalk.red(`Available plugins: ${availablePluginNames}`));
      process.exit(1);
    }
  }

  async init() {
    await fs.mkdir(this.baseDir, { recursive: true });
    await fs.mkdir(this.imagesDir, { recursive: true });
    await this._loadPlugins();
  }

  async fetchFromWP(endpoint) {
    const response = await fetch(
      `${this.wpUrl}/wp-json/wp/v2/${endpoint}`,
      {
        headers: {
          'Authorization': `Basic ${this.authHeader}`
        },
        agent: this.agent
      }
    );

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return response.json();
  }

  async fetchPosts() {
    let page = 1;
    let allPosts = [];
    const postType = this.customPostType ?? 'posts';
    console.log(chalk.blue(`Fetching ${postType} entries...`));

    while (true) {
      try {
        // Calculate how many posts we still need
        const remainingPosts = (this.limit ?? infinite) - allPosts.length;
        if (remainingPosts <= 0) break;

        // Adjust per_page to not fetch more than we need
        const perPage = Math.min(100, remainingPosts);

        const response = await fetch(
          `${this.wpUrl}/wp-json/wp/v2/${postType}?page=${page}&per_page=${perPage}&_embed=1`,
          {
            headers: {
              'Authorization': `Basic ${this.authHeader}`
            },
            agent: this.agent
          }
        );

        if (response.status === 404) {
          console.error(chalk.red('Error: WordPress REST API v2 not found.'));
          console.error(chalk.red('Please verify that:'));
          console.error(chalk.red('1. The site URL is correct'));
          console.error(chalk.red('2. The WordPress REST API v2 is enabled on the site'));
          process.exit(1);
        }

        if (response.status === 400) break; // No more posts
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const posts = await response.json();
        if (!posts.length) break;

        allPosts = [...allPosts, ...posts];
        console.log(chalk.blue(`Fetched ${allPosts.length} ${postType}${this.limit < Infinity ? ` (limit: ${this.limit})` : ''}...`));

        if (allPosts.length >= this.limit) {
          allPosts = allPosts.slice(0, this.limit);
          break;
        }

        page++;
      } catch (error) {
        console.error(chalk.red(`Failed to fetch ${postType}: ${error.message}`));
        if (error.response?.status === 400) break;
        throw error;
      }
    }

    console.log(chalk.green(`Found ${allPosts.length} ${postType}${this.limit < Infinity ? ` (limited to ${this.limit})` : ''}`));
    return allPosts;
  }

  async downloadImage(imageUrl, postSlug) {
    try {
      const response = await fetch(imageUrl, {
        agent: this.agent
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const buffer = await response.arrayBuffer();
      const urlParts = imageUrl.split('/');
      const originalFilename = urlParts[urlParts.length - 1];

      // Create a post-specific image directory
      const postImageDir = path.join(this.imagesDir, sanitize(postSlug));
      await fs.mkdir(postImageDir, { recursive: true });

      const imagePath = path.join(postImageDir, sanitize(originalFilename));
      await fs.writeFile(imagePath, Buffer.from(buffer));

      return imagePath;
    } catch (error) {
      console.error(chalk.yellow(`Warning: Failed to download image ${imageUrl}: ${error.message}`));
      return null;
    }
  }

  async processImages(content, postSlug) {
    const dom = new JSDOM(content);
    const images = dom.window.document.getElementsByTagName('img');
    let downloadedImages = [];

    // Keep track of image URL mappings
    const imageUrlMap = new Map();

    // First pass - download images and build mapping
    for (const img of images) {
      const imageUrl = img.src;
      if (!imageUrl) continue;

      const newPath = await this.downloadImage(imageUrl, postSlug);
      if (newPath) {
        img.src = newPath;
        downloadedImages.push(newPath);
        imageUrlMap.set(imageUrl, newPath);
      }
    }

    // Second pass - update any <a> tags that link to downloaded images
    const links = dom.window.document.getElementsByTagName('a');
    for (const link of links) {
      const href = link.href;
      if (href && imageUrlMap.has(href)) {
        link.href = imageUrlMap.get(href);
        console.log(chalk.yellow(`Updated link: ${href} -> ${link.href}`));
      }
    }

    console.log(chalk.blue(`Downloaded ${downloadedImages.length} images for post: ${postSlug}`));

    return { imageUrlMap, content: dom.window.document.body.innerHTML };
  }

  extractTermNames(terms) {
    return terms ? terms.map(term => term.name) : [];
  }

  async extractFeaturedImage(post, imageUrlMap) {
    const embeddedMedia = post['_embedded']?.['wp:featuredmedia']?.[0];
    if (!embeddedMedia) {
      return null;
    }

    const sourceUrl = embeddedMedia.source_url;
    if (imageUrlMap.has(sourceUrl)) {
      return imageUrlMap.get(sourceUrl);
    }
    return await this.downloadImage(sourceUrl, post.slug);
  }

  async createFrontMatter(post, imageUrlMap) {
    // Extract categories and tags from _embedded data
    const categories = this.extractTermNames(post._embedded?.['wp:term']?.[0]);
    const tags = this.extractTermNames(post._embedded?.['wp:term']?.[1]);
    const author = post._embedded?.['author']?.[0]?.name || post.author;
    const featuredMediaUrl = await this.extractFeaturedImage(post, imageUrlMap);

    let frontMatter = {
      title: post.title.rendered,
      date: post.date,
      modified: post.modified,
      slug: post.slug,
      status: post.status,
      categories: categories,
      tags: tags,
      author: author,
      excerpt: post.excerpt.rendered,
      original_url: `${this.wpUrl}/${post.slug}`,
    };

    if (featuredMediaUrl) {
      frontMatter.featured_image = featuredMediaUrl;
    }

    for (const plugin of this.loadedPlugins) {
      frontMatter = plugin.processFrontMatter(frontMatter, post);
    }

    return `---\n${yaml.dump(frontMatter)}---\n\n`;
  }

  async convertPostToMarkdown(post) {
    // Download all images, updating references in the html
    const rawHtml = post.content.rendered;
    const { imageUrlMap, content } = await this.processImages(rawHtml, post.slug);

    // Let plugins have a go at the html
    let processedHtml = content;
    for (const plugin of this.loadedPlugins) {
      processedHtml = plugin.processHtml(processedHtml, imageUrlMap);
    }

    // Convert to markdown
    let markdown = this.turndown.turndown(processedHtml);
    for (const plugin of this.loadedPlugins) {
      markdown = plugin.processMarkdown(markdown);
    }

    // Create the front matter metadata and return the full markdown
    const frontMatter = await this.createFrontMatter(post, imageUrlMap);
    return frontMatter + markdown;
  }

  async exportPosts() {
    try {
      await this.init();
      const posts = await this.fetchPosts();

      console.log(chalk.blue('\nConverting posts to Markdown...'));
      let converted = 0;

      for (const post of posts) {
        console.log(chalk.blue(`\nProcessing post: ${post.slug}`));
        const markdown = await this.convertPostToMarkdown(post);
        const filename = `${sanitize(post.slug)}.md`;
        const filePath = path.join(this.baseDir, filename);

        await fs.writeFile(filePath, markdown, 'utf8');
        converted++;
        console.log(chalk.blue(`Progress: ${converted}/${posts.length} posts converted`));
      }

      console.log(chalk.green(`\nSuccessfully exported ${posts.length} posts to ${chalk.blue(this.baseDir)}`));
    } catch (error) {
      console.error(chalk.red('\nExport failed:', error.message));
      process.exit(1);
    }
  }
}

// CLI Configuration
const program = new Command();

program
  .version('1.0.0')
  .description('Export WordPress posts to Markdown files with YAML frontmatter')
  .requiredOption('-u, --url <URL>', 'WordPress site URL')
  .requiredOption('--username <USERNAME>', 'WordPress username')
  .requiredOption('--password <PASSWORD>', 'WordPress password')
  .option('-l, --limit <LIMIT>', 'Limit the number of posts to export', null)
  .option('-o, --output <OUTPUT-DIR>', 'Output directory', 'blog_export')
  .option('--images-dir <IMAGES-DIR>', 'Images directory', 'blog_export/images')
  .option('--custom-post-type <POST-TYPE>', 'Custom post type to export', null)
  .option('--plugins <PLUGINS>', 'Comma separated list of plugins to use', (value) => {
    return value.split(',').map(c => c.trim()).filter(Boolean);
  }, '')
  .option('--preserve-tags <TAGS>', 'Comma separated list of HTML tags to preserve as they are', (value) => {
    return value.split(',').map(c => c.trim()).filter(Boolean);
  }, 'iframe,script')
  .option('--code-classes <CLASSES>', 'Comma-separated list of class names to treat as code blocks', (value) => {
    return value.split(',').map(c => c.trim()).filter(Boolean);
  }, '')
  .parse(process.argv);

const options = program.opts();

const exporter = new WordPressExporter({
  wpUrl: options.url,
  username: options.username,
  password: options.password,
  outputDir: options.output,
  limit: options.limit,
  codeClasses: options.codeClasses,
  customPostType: options.customPostType,
  preserveTags: options.preserveTags,
  imagesDir: options.imagesDir,
  plugins: options.plugins
});

exporter.showConfig();


console.log(chalk.cyan('\nStarting WordPress export...\n'));
exporter.exportPosts();