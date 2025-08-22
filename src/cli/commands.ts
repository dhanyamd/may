import { Command } from 'commander';
import { ClineAgent } from '../core/agent';
import { ModeManager } from '../core/modes';
import { ConfirmationSystem } from '../core/confirmation';
import { config } from '../utils/config';
import { logger } from '../utils/logger';
import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';

export class CLICommands {
  private agent: ClineAgent;
  private modeManager: ModeManager;
  private confirmation: ConfirmationSystem;
  private program: Command;

  constructor() {
    this.agent = new ClineAgent();
    this.modeManager = new ModeManager(this.agent);
    this.confirmation = new ConfirmationSystem();
    this.program = new Command();
  }

  public async initialize(): Promise<void> {
    await this.agent.initialize();
  }

  public setupCommands(): void {
    this.program
      .name('cline-cli')
      .description('AI-powered coding assistant CLI')
      .version('1.0.0')
      .option('-v, --verbose', 'Enable verbose logging')
      .option('-q, --quiet', 'Quiet mode (minimal output)')
      .hook('preAction', (thisCommand) => {
        const opts = thisCommand.opts();
        if (opts.verbose) {
          logger.setLogLevel('debug');
        } else if (opts.quiet) {
          logger.setLogLevel('error');
        }
      });

    // Main interactive command
    this.program
      .argument('[prompt]', 'Natural language prompt for the AI assistant')
      .option('-p, --plan', 'Start in Plan mode')
      .option('-a, --act', 'Start in Act mode')
      .option('-y, --yes', 'Auto-approve all actions')
      .action(async (prompt, options) => {
        await this.handleMainCommand(prompt, options);
      });

    // Config commands
    const configCmd = this.program
      .command('config')
      .description('Configuration management');

    configCmd
      .command('set-api-key')
      .description('Set OpenAI API key')
      .argument('<key>', 'OpenAI API key')
      .action(async (key) => {
        await config.setApiKey(key);
        logger.success('API key saved successfully');
      });

    configCmd
      .command('set-model')
      .description('Set AI model')
      .argument('<model>', 'Model name (e.g., gpt-4-turbo-preview)')
      .action(async (model) => {
        await config.setModel(model);
        logger.success(`Model set to: ${model}`);
      });

    configCmd
      .command('set-working-dir')
      .description('Set working directory')
      .argument('<dir>', 'Working directory path')
      .action(async (dir) => {
        await config.setWorkingDirectory(dir);
        logger.success(`Working directory set to: ${dir}`);
      });

    configCmd
      .command('toggle-auto-approve')
      .description('Toggle auto-approve mode')
      .action(async () => {
        const enabled = await config.toggleAutoApprove();
        logger.success(`Auto-approve mode ${enabled ? 'enabled' : 'disabled'}`);
        this.confirmation.setAutoApprove(enabled);
      });

    configCmd
      .command('show')
      .description('Show current configuration')
      .action(() => {
        const cfg = config.getAll();
        console.log(chalk.blue.bold('\nCurrent Configuration:'));
        console.log(chalk.gray('====================='));
        Object.entries(cfg).forEach(([key, value]) => {
          console.log(`${chalk.yellow(key)}: ${value}`);
        });
        console.log();
      });

    configCmd
      .command('reset')
      .description('Reset configuration to defaults')
      .action(async () => {
        const confirm = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'reset',
            message: 'Reset configuration to defaults?',
            default: false
          }
        ]);
        
        if (confirm.reset) {
          await config.reset();
          logger.success('Configuration reset to defaults');
        }
      });

    // Mode commands
    const modeCmd = this.program
      .command('mode')
      .description('Mode management');

    modeCmd
      .command('plan')
      .description('Switch to Plan mode')
      .action(async () => {
        await this.modeManager.switchMode('plan');
        logger.success('Switched to Plan mode');
        console.log(chalk.gray(this.modeManager.getModeDescription()));
      });

    modeCmd
      .command('act')
      .description('Switch to Act mode')
      .action(async () => {
        const confirm = await this.confirmation.confirmModeSwitch('plan', 'act');
        if (confirm) {
          await this.modeManager.switchMode('act');
          logger.success('Switched to Act mode');
          console.log(chalk.gray(this.modeManager.getModeDescription()));
        }
      });

    modeCmd
      .command('status')
      .description('Show current mode')
      .action(() => {
        const mode = this.modeManager.getMode();
        console.log(chalk.blue.bold(`Current mode: ${mode}`));
        console.log(chalk.gray(this.modeManager.getModeDescription()));
      });

    // Conversation commands
    const convCmd = this.program
      .command('conversation')
      .description('Conversation management');

    convCmd
      .command('clear')
      .description('Clear conversation history')
      .action(() => {
        this.agent.clearConversation();
        logger.success('Conversation history cleared');
      });

    convCmd
      .command('save')
      .description('Save conversation to file')
      .argument('<file>', 'Output file path')
      .action(async (file) => {
        await this.agent.saveConversation(file);
        logger.success(`Conversation saved to: ${file}`);
      });

    convCmd
      .command('load')
      .description('Load conversation from file')
      .argument('<file>', 'Input file path')
      .action(async (file) => {
        await this.agent.loadConversation(file);
        logger.success(`Conversation loaded from: ${file}`);
      });

    // Tool commands
    const toolCmd = this.program
      .command('tools')
      .description('Tool information');

    toolCmd
      .command('list')
      .description('List available tools')
      .action(() => {
        const tools = this.agent.getTools();
        console.log(chalk.blue.bold('\nAvailable Tools:'));
        console.log(chalk.gray('================'));
        tools.forEach(tool => {
          console.log(chalk.yellow(`\n${tool.name}`));
          console.log(chalk.gray(`  ${tool.description}`));
          console.log(chalk.gray(`  Requires approval: ${tool.requiresApproval ? 'Yes' : 'No'}`));
        });
        console.log();
      });

    // Help command
    this.program
      .command('help')
      .description('Display help information')
      .action(() => {
        this.program.help();
      });
  }

  private async handleMainCommand(prompt: string | undefined, options: any): Promise<void> {
    try {
      // Set auto-approve if requested
      if (options.yes) {
        this.confirmation.setAutoApprove(true);
        config.set('autoApprove', true);
      }

      // Set initial mode
      if (options.plan) {
        await this.modeManager.switchMode('plan');
      } else if (options.act) {
        await this.modeManager.switchMode('act');
      }

      // If prompt provided, process it directly
      if (prompt) {
        await this.processPrompt(prompt);
        return;
      }

      // Otherwise, start interactive mode
      await this.startInteractiveMode();
    } catch (error) {
      logger.error('Failed to start CLI:', error);
      process.exit(1);
    }
  }

  private async processPrompt(prompt: string): Promise<void> {
    const spinner = ora('Processing your request...').start();
    
    try {
      const response = await this.agent.processMessage(prompt);
      spinner.succeed('Response ready:');
      console.log(chalk.green(response));
    } catch (error : any | Error) {
      spinner.fail('Failed to process request:');
      logger.error(error);
      process.exit(1);
    }
  }

  private async startInteractiveMode(): Promise<void> {
    console.log(chalk.blue.bold('\n🤖 Welcome to Cline CLI - AI Coding Assistant'));
    console.log(chalk.gray('==============================================='));
    console.log(chalk.gray('Type your coding requests in natural language, or "help" for commands.'));
    console.log(chalk.gray('Press Ctrl+C to exit.\n'));

    const context = this.agent.getContext();
    console.log(chalk.yellow(`📁 Working directory: ${context.workingDirectory}`));
    console.log(chalk.yellow(`📊 Project type: ${context.projectType || 'Unknown'}`));
    console.log(chalk.yellow(`🔧 Current mode: ${this.modeManager.getMode()}`));
    console.log(chalk.gray(this.modeManager.getModeDescription()));
    console.log();

    // Main interaction loop
    while (true) {
      try {
        const answers = await inquirer.prompt([
          {
            type: 'input',
            name: 'input',
            message: chalk.blue('>'),
            prefix: ''
          }
        ]);

        const input = (answers.input as string).trim();
        
        if (!input) continue;

        // Handle built-in commands
        if (input.toLowerCase() === 'exit' || input.toLowerCase() === 'quit') {
          const confirm = await this.confirmation.confirmExit();
          if (confirm) {
            console.log(chalk.blue('Goodbye! 👋'));
            process.exit(0);
          }
          continue;
        }

        if (input.toLowerCase() === 'help') {
          this.program.help();
          continue;
        }

        if (input.toLowerCase() === 'clear') {
          console.clear();
          continue;
        }

        // Process with AI agent
        const spinner = ora('Thinking...').start();
        const response = await this.agent.processMessage(input);
        spinner.succeed('Response:');
        console.log(chalk.green(response));
        console.log();

        } catch (error: any) {
          logger.error('Error in interactive mode:', error.message);
          console.log(chalk.red('An error occurred. Please try again.'));
        }
    }
  }

  public parse(argv: string[]): void {
    this.program.parse(argv);
  }

  public getProgram(): Command {
    return this.program;
  }
}
