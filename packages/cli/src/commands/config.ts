// CLI config command for cloud integration
import { Command } from 'commander';
import { ConfigManager } from '../utils/config-manager';

export const configCommand = new Command('config')
  .description('Configure CLI settings')
  .option('--cloud-url <url>', 'Set cloud API endpoint')
  .option('--api-key <key>', 'Set API key for cloud')
  .option('--reset', 'Reset configuration to defaults')
  .action(async (options) => {
    const configManager = new ConfigManager();
    
    if (options.reset) {
      configManager.reset();
      console.log('✅ Configuration reset to defaults');
      return;
    }
    
    if (options.cloudUrl) {
      configManager.set('cloudUrl', options.cloudUrl);
      console.log(`✅ Cloud URL set to: ${options.cloudUrl}`);
    }
    
    if (options.apiKey) {
      configManager.set('apiKey', options.apiKey);
      console.log('✅ API key saved');
    }
    
    if (!options.cloudUrl && !options.apiKey && !options.reset) {
      // Show current config
      const config = configManager.getAll();
      console.log('Current configuration:');
      console.log(JSON.stringify(config, null, 2));
    }
  });
