#!/usr/bin/env node

import { promises as fs } from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import TurndownService from 'turndown';
import sanitize from 'sanitize-filename';
import { JSDOM } from 'jsdom';
import { Command } from 'commander';
import chalk from 'chalk';
import https from 'https';
import detectLang from 'lang-detector';

class WordPressExporter {
  constructor(config) {
    this.wpUrl = config.wpUrl.replace(/\/$/, '');
    this.username = config.username;
    this.password = config.password;
    this.baseDir = config.outputDir || 'blog_export';
    this.imagesDir = path.join(this.baseDir, 'images');
    this.codeClasses = config.codeClasses || [];

    this.limit = config.limit ?? Infinity;

    // Configure TurndownService with code block handling
    this.turndown = new TurndownService({
      headingStyle: 'atx',
      codeBlockStyle: 'fenced'
    });

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

  async init() {
    await fs.mkdir(this.baseDir, { recursive: true });
    await fs.mkdir(this.imagesDir, { recursive: true });
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
    console.log(chalk.blue('Fetching posts...'));

    while (true) {
      try {
        // Calculate how many posts we still need
        const remainingPosts = (this.limit ?? infinite) - allPosts.length;
        if (remainingPosts <= 0) break;

        // Adjust per_page to not fetch more than we need
        const perPage = Math.min(100, remainingPosts);

        const response = await fetch(
          `${this.wpUrl}/wp-json/wp/v2/posts?page=${page}&per_page=${perPage}&_embed=1`,
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
        console.log(chalk.blue(`Fetched ${allPosts.length} posts${this.limit < Infinity ? ` (limit: ${this.limit})` : ''}...`));

        if (allPosts.length >= this.limit) {
          allPosts = allPosts.slice(0, this.limit);
          break;
        }

        page++;
      } catch (error) {
        console.error(chalk.red(`Failed to fetch posts: ${error.message}`));
        if (error.response?.status === 400) break;
        throw error;
      }
    }

    console.log(chalk.green(`Found ${allPosts.length} posts${this.limit < Infinity ? ` (limited to ${this.limit})` : ''}`));
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

      // Return path relative to the base directory
      return path.relative(this.baseDir, imagePath);
    } catch (error) {
      console.error(chalk.yellow(`Warning: Failed to download image ${imageUrl}: ${error.message}`));
      return null;
    }
  }

  async processImages(content, postSlug) {
    const dom = new JSDOM(content);
    const images = dom.window.document.getElementsByTagName('img');
    let downloadedImages = [];

    for (const img of images) {
      const imageUrl = img.src;
      if (!imageUrl) continue;

      const newPath = await this.downloadImage(imageUrl, postSlug);
      if (newPath) {
        img.src = newPath;
        downloadedImages.push(newPath);
      }
    }

    console.log(chalk.blue(`Downloaded ${downloadedImages.length} images for post: ${postSlug}`));

    return dom.window.document.body.innerHTML;
  }

  extractTermNames(terms) {
    return terms ? terms.map(term => term.name) : [];
  }

  createFrontMatter(post) {
    // Extract categories and tags from _embedded data
    const categories = this.extractTermNames(post._embedded?.['wp:term']?.[0]);
    const tags = this.extractTermNames(post._embedded?.['wp:term']?.[1]);
    const author = post._embedded?.['author']?.[0]?.name || post.author;

    const frontMatter = {
      title: post.title.rendered,
      date: post.date,
      modified: post.modified,
      slug: post.slug,
      status: post.status,
      categories: categories,
      tags: tags,
      author: author,
      original_url: `${this.wpUrl}/${post.slug}`,
    };

    return `---\n${yaml.dump(frontMatter)}---\n\n`;
  }

  async convertPostToMarkdown(post) {
    // Process images before converting to markdown
    const processedContent = await this.processImages(post.content.rendered, post.slug);
    const markdown = this.turndown.turndown(processedContent);
    const frontMatter = this.createFrontMatter(post);
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
  .requiredOption('-u, --url <url>', 'WordPress site URL')
  .requiredOption('--username <username>', 'WordPress username')
  .requiredOption('--password <password>', 'WordPress password')
  .option('-l, --limit <limit>', 'Limit the number of posts to export', null)
  .option('-o, --output <directory>', 'Output directory', 'blog_export')
  .option('--code-classes <classes>', 'Comma-separated list of class names to treat as code blocks', (value) => {
    return value.split(',').map(c => c.trim()).filter(Boolean);
  })
  .parse(process.argv);

const options = program.opts();

const exporter = new WordPressExporter({
  wpUrl: options.url,
  username: options.username,
  password: options.password,
  outputDir: options.output,
  limit: options.limit,
  codeClasses: options.codeClasses
});

console.log(chalk.cyan('\nStarting WordPress export...\n'));
exporter.exportPosts();