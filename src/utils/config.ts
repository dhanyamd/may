import * as fs from 'fs-extra';
import * as path from 'path';
import * as os from 'os';
import { CLIConfig } from '../types/index';

const CONFIG_DIR = path.join(os.homedir(), '.cline-cli');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

const DEFAULT_CONFIG: CLIConfig = {
  model: 'gemini-1.5-flash',
  maxTokens: 4096,
  temperature: 0.1,
  geminiApiKey: process.env.GEMINI_API_KEY || "", 
  workingDirectory: process.cwd(),
  autoApprove: false,
  logLevel: 'info'
};

export class ConfigManager {
  private config: CLIConfig;

  constructor() {
    this.config = { ...DEFAULT_CONFIG };
    this.loadConfig();
  }

  private async loadConfig(): Promise<void> {
    try {
      await fs.ensureDir(CONFIG_DIR);
      
      if (await fs.pathExists(CONFIG_FILE)) {
        const configData = await fs.readJson(CONFIG_FILE);
        this.config = { ...DEFAULT_CONFIG, ...configData };
      }

      // Load environment variables
      if (process.env.GEMINI_API_KEY) {
        this.config.geminiApiKey = process.env.GEMINI_API_KEY;
      }
      if (process.env.CLINE_MODEL) {
        this.config.model = process.env.CLINE_MODEL;
      }
      if (process.env.CLINE_AUTO_APPROVE === 'true') {
        this.config.autoApprove = true;
      }
    } catch (error) {
      console.warn('Failed to load config, using defaults:', error);
    }
  }

  public async saveConfig(): Promise<void> {
    try {
      await fs.ensureDir(CONFIG_DIR);
      await fs.writeJson(CONFIG_FILE, this.config, { spaces: 2 });
    } catch (error) {
      throw new Error(`Failed to save config: ${error}`);
    }
  }

  public get(key: keyof CLIConfig): any {
    return this.config[key];
  }

  public set(key: keyof CLIConfig, value: any): void {
    (this.config as any)[key] = value;
  }

  public getAll(): CLIConfig {
    return { ...this.config };
  }

  public async setApiKey(apiKey: string): Promise<void> {
    this.config.geminiApiKey = apiKey;
    await this.saveConfig();
  }

  public async setModel(model: string): Promise<void> {
    this.config.model = model;
    await this.saveConfig();
  }

  public async setWorkingDirectory(dir: string): Promise<void> {
    if (await fs.pathExists(dir)) {
      this.config.workingDirectory = path.resolve(dir);
      await this.saveConfig();
    } else {
      throw new Error(`Directory does not exist: ${dir}`);
    }
  }

  public async toggleAutoApprove(): Promise<boolean> {
    this.config.autoApprove = !this.config.autoApprove;
    await this.saveConfig();
    return this.config.autoApprove;
  }

  public validate(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!this.config.geminiApiKey) {
      errors.push('Gemini API key is required. Set it with: cline-cli config --set-api-key YOUR_KEY');
    }

    if (!this.config.model) {
      errors.push('Model is required');
    }

    if (!this.config.workingDirectory || !fs.pathExistsSync(this.config.workingDirectory)) {
      errors.push('Working directory does not exist');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  public getConfigPath(): string {
    return CONFIG_FILE;
  }

  public async reset(): Promise<void> {
    this.config = { ...DEFAULT_CONFIG };
    await this.saveConfig();
  }
}

export const config = new ConfigManager();
