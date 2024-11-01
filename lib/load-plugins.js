import chalk from 'chalk';
import { promises as fs } from 'fs';
import path from 'path';

/**
 * Load plugins from the current and lib/plugins directories
 *
 * @returns {Array} An array of plugin classes
 */
async function loadPlugins() {
  try {
    const plugins = [];
    const pluginDirs = [
      path.join(process.cwd()), // current working directory
      path.join(path.dirname(new URL(import.meta.url).pathname), 'plugins') // lib/plugins directory
    ];

    for (const pluginsDir of pluginDirs) {
      try {
        const files = await fs.readdir(pluginsDir);

        for (const file of files) {
          if (file.endsWith('.js')) {
            const pluginModule = await import(path.join(pluginsDir, file));
            const PluginClass = pluginModule.default;

            // Check if it exports a class with static name getter and process method
            if (
              typeof PluginClass === 'function' && // Is a class
              typeof PluginClass.name === 'string' && // Has static name
              typeof PluginClass.processFrontMatter === 'function' && // Has static processFrontMatter method
              typeof PluginClass.processHtml === 'function' && // Has static processHtml method
              typeof PluginClass.processMarkdown === 'function' // Has static processMarkdown method
            ) {
              plugins.push(PluginClass);
            }
          }
        }
      } catch (error) {
        console.error(chalk.red('Error loading plugins from:', pluginsDir), error);
        if (error.code !== 'ENOENT') {
          throw error;
        }
      }
    }

    return plugins;
  } catch (error) {
    console.error(chalk.red('Error loading plugins:'), error);
    process.exit(1);
  }
}

export default loadPlugins;