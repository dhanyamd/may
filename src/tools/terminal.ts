import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import { ToolResult, AgentContext, Tool } from '../types/index';
import { logger } from '../utils/logger';

const execAsync = promisify(exec);

export class TerminalTools {
  
  static async executeCommand(
    command: string, 
    context: AgentContext, 
    options: {
      cwd?: string;
      timeout?: number;
      env?: Record<string, string>;
    } = {}
  ): Promise<ToolResult> {
    try {
      const cwd = options.cwd ? path.resolve(context.workingDirectory, options.cwd) : context.workingDirectory;
      const timeout = options.timeout || 30000; // 30 seconds default
      
      logger.info(`Executing command: ${command}`);
      logger.debug(`Working directory: ${cwd}`);

      const startTime = Date.now();
      
      const { stdout, stderr } = await execAsync(command, {
        cwd,
        timeout,
        env: { ...process.env, ...options.env },
        maxBuffer: 1024 * 1024 * 10 // 10MB buffer
      });

      const executionTime = Date.now() - startTime;
      
      logger.info(`Command completed in ${executionTime}ms`);
      
      if (stderr && stderr.trim()) {
        logger.warn(`Command stderr: ${stderr}`);
      }

      return {
        success: true,
        data: {
          command,
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          executionTime,
          cwd
        },
        output: stdout.trim()
      };
    } catch (error: any) {
      logger.error(`Command failed: ${command}`, error);
      
      return {
        success: false,
        error: `Command failed: ${error.message}`,
        data: {
          command,
          stdout: error.stdout || '',
          stderr: error.stderr || '',
          code: error.code,
          signal: error.signal
        }
      };
    }
  }

  static async executeInteractiveCommand(
    command: string,
    context: AgentContext,
    options: {
      cwd?: string;
      env?: Record<string, string>;
      input?: string;
    } = {}
  ): Promise<ToolResult> {
    return new Promise((resolve) => {
      const cwd = options.cwd ? path.resolve(context.workingDirectory, options.cwd) : context.workingDirectory;
      
      logger.info(`Executing interactive command: ${command}`);
      logger.debug(`Working directory: ${cwd}`);

      const args = command.split(' ');
      const cmd = args.shift()!;
      
      const child = spawn(cmd, args, {
        cwd,
        env: { ...process.env, ...options.env },
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';
      const startTime = Date.now();

      child.stdout?.on('data', (data) => {
        const output = data.toString();
        stdout += output;
        logger.debug(`Command output: ${output}`);
      });

      child.stderr?.on('data', (data) => {
        const output = data.toString();
        stderr += output;
        logger.debug(`Command error: ${output}`);
      });

      child.on('close', (code, signal) => {
        const executionTime = Date.now() - startTime;
        
        if (code === 0) {
          logger.info(`Interactive command completed in ${executionTime}ms`);
          resolve({
            success: true,
            data: {
              command,
              stdout: stdout.trim(),
              stderr: stderr.trim(),
              executionTime,
              cwd,
              exitCode: code
            },
            output: stdout.trim()
          });
        } else {
          logger.error(`Interactive command failed with code ${code}`);
          resolve({
            success: false,
            error: `Command failed with exit code ${code}`,
            data: {
              command,
              stdout: stdout.trim(),
              stderr: stderr.trim(),
              executionTime,
              cwd,
              exitCode: code,
              signal
            }
          });
        }
      });

      child.on('error', (error) => {
        logger.error(`Failed to start command: ${command}`, error);
        resolve({
          success: false,
          error: `Failed to start command: ${error.message}`,
          data: {
            command,
            cwd
          }
        });
      });

      // Send input if provided
      if (options.input) {
        child.stdin?.write(options.input);
        child.stdin?.end();
      }
    });
  }

  static async checkCommandExists(command: string): Promise<boolean> {
    try {
      const checkCmd = process.platform === 'win32' ? `where ${command}` : `which ${command}`;
      await execAsync(checkCmd);
      return true;
    } catch {
      return false;
    }
  }

  static async getSystemInfo(context: AgentContext): Promise<ToolResult> {
    try {
      const info: any = {
        platform: process.platform,
        arch: process.arch,
        nodeVersion: process.version,
        cwd: context.workingDirectory
      };

      // Get additional system information
      try {
        if (process.platform === 'win32') {
          const { stdout } = await execAsync('systeminfo | findstr /B /C:"OS Name" /C:"OS Version"');
          info.os = stdout.trim();
        } else {
          const { stdout } = await execAsync('uname -a');
          info.os = stdout.trim();
        }
      } catch {
        // Ignore if system info commands fail
      }

      // Check for common development tools
      const tools = ['git', 'node', 'npm', 'yarn', 'python', 'pip', 'java', 'mvn', 'gradle'];
      const availableTools: string[] = [];
      
      for (const tool of tools) {
        if (await this.checkCommandExists(tool)) {
          availableTools.push(tool);
        }
      }
      
      info.availableTools = availableTools;

      return {
        success: true,
        data: info
      };
    } catch (error) {
      logger.error('Failed to get system info:', error);
      return {
        success: false,
        error: `Failed to get system info: ${error}`
      };
    }
  }

  static async runTests(context: AgentContext, testCommand?: string): Promise<ToolResult> {
    try {
      // Try to detect test command if not provided
      if (!testCommand) {
        const packageJsonPath = path.join(context.workingDirectory, 'package.json');
        try {
          const fs = require('fs-extra');
          const packageJson = await fs.readJson(packageJsonPath);
          if (packageJson.scripts?.test) {
            testCommand = 'npm test';
          } else if (packageJson.scripts?.['test:unit']) {
            testCommand = 'npm run test:unit';
          } else if (await this.checkCommandExists('pytest')) {
            testCommand = 'pytest';
          } else if (await this.checkCommandExists('mvn')) {
            testCommand = 'mvn test';
          } else {
            return {
              success: false,
              error: 'No test command found. Please specify a test command.'
            };
          }
        } catch {
          return {
            success: false,
            error: 'Could not detect test command. Please specify one.'
          };
        }
      }

      logger.info(`Running tests with command: ${testCommand}`);
      return await this.executeCommand(testCommand, context, { timeout: 120000 }); // 2 minutes timeout
    } catch (error) {
      logger.error('Failed to run tests:', error);
      return {
        success: false,
        error: `Failed to run tests: ${error}`
      };
    }
  }

  static getTools(): Tool[] {
    return [
      {
        name: 'execute_command',
        description: 'Execute a shell command',
        parameters: {
          type: 'object',
          properties: {
            command: {
              type: 'string',
              description: 'The command to execute'
            },
            cwd: {
              type: 'string',
              description: 'Working directory for the command (relative to project root)'
            },
            timeout: {
              type: 'number',
              description: 'Timeout in milliseconds (default: 30000)'
            },
            env: {
              type: 'object',
              description: 'Environment variables to set'
            }
          },
          required: ['command']
        },
        execute: async (args: {
          command: string;
          cwd?: string;
          timeout?: number;
          env?: Record<string, string>;
        }, context: AgentContext) => {
          const options: {
            cwd?: string;
            timeout?: number;
            env?: Record<string, string>;
          } = {};
          if (args.cwd !== undefined) options.cwd = args.cwd;
          if (args.timeout !== undefined) options.timeout = args.timeout;
          if (args.env !== undefined) options.env = args.env;
          
          return TerminalTools.executeCommand(args.command, context, options);
        },
        requiresApproval: true
      },
      {
        name: 'execute_interactive_command',
        description: 'Execute an interactive command with input',
        parameters: {
          type: 'object',
          properties: {
            command: {
              type: 'string',
              description: 'The command to execute'
            },
            cwd: {
              type: 'string',
              description: 'Working directory for the command'
            },
            input: {
              type: 'string',
              description: 'Input to send to the command'
            },
            env: {
              type: 'object',
              description: 'Environment variables to set'
            }
          },
          required: ['command']
        },
        execute: async (args: {
          command: string;
          cwd?: string;
          input?: string;
          env?: Record<string, string>;
        }, context: AgentContext) => {
          const options: {
            cwd?: string;
            input?: string;
            env?: Record<string, string>;
          } = {};
          if (args.cwd !== undefined) options.cwd = args.cwd;
          if (args.input !== undefined) options.input = args.input;
          if (args.env !== undefined) options.env = args.env;
          
          return TerminalTools.executeInteractiveCommand(args.command, context, options);
        },
        requiresApproval: true
      },
      {
        name: 'get_system_info',
        description: 'Get system information and available development tools',
        parameters: {
          type: 'object',
          properties: {},
          required: []
        },
        execute: async (_args: { [key: string]: any }, context: AgentContext) => {
          return TerminalTools.getSystemInfo(context);
        }
      },
      {
        name: 'run_tests',
        description: 'Run project tests',
        parameters: {
          type: 'object',
          properties: {
            testCommand: {
              type: 'string',
              description: 'Custom test command (auto-detected if not provided)'
            }
          },
          required: []
        },
        execute: async (args: { testCommand?: string }, context: AgentContext) => {
          return TerminalTools.runTests(context, args.testCommand);
        },
        requiresApproval: true
      }
    ];
  }
}
