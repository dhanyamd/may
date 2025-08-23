import inquirer from 'inquirer';
import chalk from 'chalk';
import { ToolCall, ToolResult } from '../types/index';
import { logger } from '../utils/logger';
import { config } from '../utils/config';

export class ConfirmationSystem {
  private autoApprove: boolean;

  constructor() {
    this.autoApprove = config.get('autoApprove') || false;
  }

  public async confirmToolExecution(toolCall: ToolCall, context: any): Promise<boolean> {
    // Check if auto-approve is enabled
    if (this.autoApprove) {
      logger.info(`Auto-approving tool execution: ${toolCall.function.name}`);
      return true;
    }

    // Check if the tool requires approval
    const requiresApproval = this.toolRequiresApproval(toolCall.function.name);
    if (!requiresApproval) {
      return true;
    }

    // Display what the tool will do
    this.displayToolAction(toolCall, context);

    // Ask for user confirmation
    const answers = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirm',
        message: 'Do you want to proceed with this action?',
        default: false
      }
    ]);

    return answers.confirm;
  }

  public async confirmDestructiveOperation(
    operation: string,
    details: string,
    filePath?: string
  ): Promise<boolean> {
    if (this.autoApprove) {
      logger.info(`Auto-approving destructive operation: ${operation}`);
      return true;
    }

    console.log('\n' + chalk.red.bold('⚠️  DESTRUCTIVE OPERATION WARNING ⚠️'));
    console.log(chalk.red(`Operation: ${operation}`));
    console.log(chalk.red(`Details: ${details}`));
    if (filePath) {
      console.log(chalk.red(`File: ${filePath}`));
    }
    console.log(chalk.yellow('This action cannot be undone!\n'));

    const answers = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirm',
        message: 'Are you absolutely sure you want to proceed?',
        default: false
      }
    ]);

    return answers.confirm;
  }

  public async confirmPlanExecution(planTitle: string, steps: any[]): Promise<boolean> {
    if (this.autoApprove) {
      logger.info(`Auto-approving plan execution: ${planTitle}`);
      return true;
    }

    console.log('\n' + chalk.blue.bold('📋 EXECUTION PLAN'));
    console.log(chalk.blue(`Plan: ${planTitle}`));
    console.log(chalk.blue(`Steps: ${steps.length}\n`));

    steps.forEach((step, index) => {
      console.log(`${index + 1}. ${step.description}`);
      if (step.type === 'file_operation') {
        console.log(chalk.gray(`   File: ${step.details.path}`));
      } else if (step.type === 'command') {
        console.log(chalk.gray(`   Command: ${step.details.command}`));
      }
    });

    console.log();

    const answers = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirm',
        message: 'Do you want to execute this plan?',
        default: false
      }
    ]);

    return answers.confirm;
  }

  public async confirmModeSwitch(fromMode: string, toMode: string): Promise<boolean> {
    if (this.autoApprove) {
      logger.info(`Auto-approving mode switch: ${fromMode} → ${toMode}`);
      return true;
    }

    const answers = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirm',
        message: `Switch from ${fromMode} mode to ${toMode} mode?`,
        default: true
      }
    ]);

    return answers.confirm;
  }

  private toolRequiresApproval(toolName: string): boolean {
    const destructiveTools = [
      'write_file',
      'modify_file',
      'delete_file',
      'execute_command',
      'execute_interactive_command'
    ];

    return destructiveTools.includes(toolName);
  }

  private displayToolAction(toolCall: ToolCall, _context: any): void {
    console.log('\n' + chalk.yellow.bold('🔧 TOOL EXECUTION REQUEST'));
    console.log(chalk.yellow(`Tool: ${toolCall.function.name}`));
    
    try {
      const args = JSON.parse(toolCall.function.arguments);
      console.log(chalk.yellow('Arguments:'));
      
      Object.entries(args).forEach(([key, value]) => {
        if (key === 'content' && typeof value === 'string' && value.length > 100) {
          console.log(chalk.gray(`  ${key}: ${value.substring(0, 100)}...`));
        } else {
          console.log(chalk.gray(`  ${key}: ${JSON.stringify(value)}`));
        }
      });
    } catch (error) {
      console.log(chalk.gray(`Arguments: ${toolCall.function.arguments}`));
    }

    console.log();
  }

  public async confirmFileOverwrite(filePath: string, fileSize?: number): Promise<boolean> {
    if (this.autoApprove) {
      logger.info(`Auto-approving file overwrite: ${filePath}`);
      return true;
    }

    let message = `File ${filePath} already exists. Overwrite?`;
    if (fileSize) {
      message += ` (Current size: ${fileSize} bytes)`;
    }

    const answers = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirm',
        message,
        default: false
      }
    ]);

    return answers.confirm;
  }

  public async confirmDirectoryCreation(dirPath: string): Promise<boolean> {
    if (this.autoApprove) {
      logger.info(`Auto-approving directory creation: ${dirPath}`);
      return true;
    }

    const answers = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirm',
        message: `Create directory: ${dirPath}?`,
        default: true
      }
    ]);

    return answers.confirm;
  }

  public async selectFromOptions(
    message: string,
    options: string[],
    defaultValue?: string
  ): Promise<string> {
    const answers = await inquirer.prompt([
      {
        type: 'list',
        name: 'selection',
        message,
        choices: options,
        default: defaultValue
      }
    ]);

    return answers.selection;
  }

  public async inputText(message: string, defaultValue?: string): Promise<string> {
    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'input',
        message,
        default: defaultValue
      }
    ]);

    return answers.input;
  }

  public async multiSelect(
    message: string,
    options: string[],
    defaults?: string[]
  ): Promise<string[]> {
    const answers = await inquirer.prompt([
      {
        type: 'checkbox',
        name: 'selections',
        message,
        choices: options,
        default: defaults
      }
    ]);

    return answers.selections;
  }

  public setAutoApprove(enabled: boolean): void {
    this.autoApprove = enabled;
    logger.info(`Auto-approve set to: ${enabled}`);
  }

  public isAutoApproveEnabled(): boolean {
    return this.autoApprove;
  }

  public async confirmToolResults(results: ToolResult[]): Promise<boolean> {
    if (this.autoApprove) {
      return true;
    }

    console.log('\n' + chalk.green.bold('✅ TOOL EXECUTION RESULTS'));
    
    results.forEach((result, index) => {
      if (result.success) {
        console.log(chalk.green(`✓ Step ${index + 1}: Success`));
        if (result.data) {
          console.log(chalk.gray(`  Data: ${JSON.stringify(result.data, null, 2)}`));
        }
      } else {
        console.log(chalk.red(`✗ Step ${index + 1}: Failed`));
        if (result.error) {
          console.log(chalk.red(`  Error: ${result.error}`));
        }
      }
    });

    console.log();

    const answers = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirm',
        message: 'Results look good?',
        default: true
      }
    ]);

    return answers.confirm;
  }

  public async askQuestion(question: string, defaultValue?: string): Promise<string> {
    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'question',
        message: question,
        default: defaultValue
      }
    ]);

    return answers.question;
  }

  public async confirmExit(): Promise<boolean> {
    if (this.autoApprove) {
      return true;
    }

    const answers = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirm',
        message: 'Are you sure you want to exit?',
        default: true
      }
    ]);

    return answers.confirm;
  }
}
