import { homedir } from 'os';
import { join } from 'path';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';

interface Config {
  cloudUrl?: string;
  apiKey?: string;
  ollamaUrl?: string;
  sla?: 'L1' | 'L2' | 'L3';
}

export class ConfigManager {
  private configPath: string;
  private config: Config;

  constructor() {
    this.configPath = join(homedir(), '.opencodereview', 'config.json');
    this.config = this.load();
  }

  private load(): Config {
    if (!existsSync(this.configPath)) {
      return {};
    }
    
    try {
      return JSON.parse(readFileSync(this.configPath, 'utf-8'));
    } catch {
      return {};
    }
  }

  private save(): void {
    const dir = join(homedir(), '.opencodereview');
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(this.configPath, JSON.stringify(this.config, null, 2));
  }

  get<K extends keyof Config>(key: K): Config[K] {
    return this.config[key];
  }

  set<K extends keyof Config>(key: K, value: Config[K]): void {
    this.config[key] = value;
    this.save();
  }

  getAll(): Config {
    return { ...this.config };
  }

  reset(): void {
    this.config = {};
    this.save();
  }
}
