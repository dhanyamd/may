import * as fs from 'fs-extra';
import * as path from 'path';
import { glob } from 'glob';
import * as diff from 'diff';
import { ToolResult, AgentContext, Tool } from '../types/index';
import { logger } from '../utils/logger';

export class FileSystemTools {
  
  static async readFile(filePath: string, context: AgentContext): Promise<ToolResult> {
    try {
      const fullPath = path.resolve(context.workingDirectory, filePath);
      
      if (!await fs.pathExists(fullPath)) {
        return {
          success: false,
          error: `File does not exist: ${filePath}`
        };
      }

      const content = await fs.readFile(fullPath, 'utf-8');
      logger.debug(`Read file: ${filePath} (${content.length} characters)`);
      
      // Add to recent files
      if (!context.recentFiles.includes(filePath)) {
        context.recentFiles.unshift(filePath);
        context.recentFiles = context.recentFiles.slice(0, 10); // Keep last 10
      }

      return {
        success: true,
        data: {
          path: filePath,
          content,
          size: content.length,
          lines: content.split('\n').length
        }
      };
    } catch (error) {
      logger.error(`Failed to read file ${filePath}:`, error);
      return {
        success: false,
        error: `Failed to read file: ${error}`
      };
    }
  }

  static async writeFile(filePath: string, content: string, context: AgentContext): Promise<ToolResult> {
    try {
      const fullPath = path.resolve(context.workingDirectory, filePath);
      const dir = path.dirname(fullPath);
      
      // Ensure directory exists
      await fs.ensureDir(dir);
      
      // Create backup if file exists
      if (await fs.pathExists(fullPath)) {
        const backupPath = `${fullPath}.backup.${Date.now()}`;
        await fs.copy(fullPath, backupPath);
        logger.debug(`Created backup: ${backupPath}`);
      }

      await fs.writeFile(fullPath, content, 'utf-8');
      logger.info(`Wrote file: ${filePath} (${content.length} characters)`);
      
      // Add to recent files
      if (!context.recentFiles.includes(filePath)) {
        context.recentFiles.unshift(filePath);
        context.recentFiles = context.recentFiles.slice(0, 10);
      }

      return {
        success: true,
        data: {
          path: filePath,
          size: content.length,
          lines: content.split('\n').length
        }
      };
    } catch (error) {
      logger.error(`Failed to write file ${filePath}:`, error);
      return {
        success: false,
        error: `Failed to write file: ${error}`
      };
    }
  }

  static async modifyFile(filePath: string, changes: string, context: AgentContext): Promise<ToolResult> {
    try {
      const fullPath = path.resolve(context.workingDirectory, filePath);
      
      if (!await fs.pathExists(fullPath)) {
        return {
          success: false,
          error: `File does not exist: ${filePath}`
        };
      }

      const originalContent = await fs.readFile(fullPath, 'utf-8');
      
      // Create backup
      const backupPath = `${fullPath}.backup.${Date.now()}`;
      await fs.copy(fullPath, backupPath);
      
      // Apply changes (this is a simplified implementation)
      // In a real implementation, you'd parse the changes format
      const modifiedContent = this.applyChanges(originalContent, changes);
      
      await fs.writeFile(fullPath, modifiedContent, 'utf-8');
      
      const diffResult = diff.createPatch(filePath, originalContent, modifiedContent);
      
      logger.info(`Modified file: ${filePath}`);
      logger.debug(`Diff:\n${diffResult}`);

      return {
        success: true,
        data: {
          path: filePath,
          originalSize: originalContent.length,
          newSize: modifiedContent.length,
          diff: diffResult,
          backupPath
        }
      };
    } catch (error) {
      logger.error(`Failed to modify file ${filePath}:`, error);
      return {
        success: false,
        error: `Failed to modify file: ${error}`
      };
    }
  }

  static async listFiles(dirPath: string, context: AgentContext, pattern: string = '**/*'): Promise<ToolResult> {
    try {
      const fullPath = path.resolve(context.workingDirectory, dirPath);
      
      if (!await fs.pathExists(fullPath)) {
        return {
          success: false,
          error: `Directory does not exist: ${dirPath}`
        };
      }

      const files = await glob(pattern, {
        cwd: fullPath,
        ignore: ['node_modules/**', '.git/**', 'dist/**', 'build/**', '*.log'],
        dot: false
      });

      const fileDetails = await Promise.all(
        files.map(async (file) => {
          const filePath = path.join(fullPath, file);
          const stats = await fs.stat(filePath);
          return {
            path: file,
            type: stats.isDirectory() ? 'directory' : 'file',
            size: stats.size,
            modified: stats.mtime
          };
        })
      );

      logger.debug(`Listed ${files.length} files in ${dirPath}`);

      return {
        success: true,
        data: {
          directory: dirPath,
          files: fileDetails,
          count: files.length
        }
      };
    } catch (error) {
      logger.error(`Failed to list files in ${dirPath}:`, error);
      return {
        success: false,
        error: `Failed to list files: ${error}`
      };
    }
  }

  static async searchFiles(dirPath: string, searchTerm: string, context: AgentContext, filePattern: string = '**/*.{js,ts,jsx,tsx,py,java,cpp,c,h,css,html,md,json,yaml,yml}'): Promise<ToolResult> {
    try {
      const fullPath = path.resolve(context.workingDirectory, dirPath);
      
      if (!await fs.pathExists(fullPath)) {
        return {
          success: false,
          error: `Directory does not exist: ${dirPath}`
        };
      }

      const files = await glob(filePattern, {
        cwd: fullPath,
        ignore: ['node_modules/**', '.git/**', 'dist/**', 'build/**']
      });

      const results: Array<{
        file: string;
        matches: Array<{
          line: number;
          content: string;
          context: string[];
        }>;
      }> = [];

      const searchRegex = new RegExp(searchTerm, 'gi');

      for (const file of files) {
        const filePath = path.join(fullPath, file);
        try {
          const content = await fs.readFile(filePath, 'utf-8');
          const lines = content.split('\n');
          const matches: Array<{
            line: number;
            content: string;
            context: string[];
          }> = [];

          lines.forEach((line, index) => {
            if (searchRegex.test(line)) {
              const contextStart = Math.max(0, index - 2);
              const contextEnd = Math.min(lines.length, index + 3);
              const context = lines.slice(contextStart, contextEnd);
              
              matches.push({
                line: index + 1,
                content: line.trim(),
                context
              });
            }
          });

          if (matches.length > 0) {
            results.push({ file, matches });
          }
        } catch (error) {
          // Skip files that can't be read
          logger.debug(`Skipped file ${file}: ${error}`);
        }
      }

      logger.info(`Found ${results.length} files with matches for "${searchTerm}"`);

      return {
        success: true,
        data: {
          searchTerm,
          directory: dirPath,
          results,
          totalMatches: results.reduce((sum, r) => sum + r.matches.length, 0)
        }
      };
    } catch (error) {
      logger.error(`Failed to search files in ${dirPath}:`, error);
      return {
        success: false,
        error: `Failed to search files: ${error}`
      };
    }
  }

  static async deleteFile(filePath: string, context: AgentContext): Promise<ToolResult> {
    try {
      const fullPath = path.resolve(context.workingDirectory, filePath);
      
      if (!await fs.pathExists(fullPath)) {
        return {
          success: false,
          error: `File does not exist: ${filePath}`
        };
      }

      // Create backup before deletion
      const backupPath = `${fullPath}.deleted.${Date.now()}`;
      await fs.move(fullPath, backupPath);
      
      logger.info(`Deleted file: ${filePath} (backup: ${backupPath})`);

      return {
        success: true,
        data: {
          path: filePath,
          backupPath
        }
      };
    } catch (error) {
      logger.error(`Failed to delete file ${filePath}:`, error);
      return {
        success: false,
        error: `Failed to delete file: ${error}`
      };
    }
  }

  private static applyChanges(_originalContent: string, changes: string): string {
    // This is a simplified implementation
    // In a real implementation, you'd parse a proper diff format
    // For now, we'll assume changes is the new content
    return changes;
  }

  static getTools(): Tool[] {
    return [
      {
        name: 'read_file',
        description: 'Read the contents of a file',
        parameters: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'The path to the file to read'
            }
          },
          required: ['path']
        },
        execute: async (args: { path: string }, context: AgentContext) => {
          return FileSystemTools.readFile(args.path, context);
        }
      },
      {
        name: 'write_file',
        description: 'Write content to a file (creates or overwrites)',
        parameters: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'The path to the file to write'
            },
            content: {
              type: 'string',
              description: 'The content to write to the file'
            }
          },
          required: ['path', 'content']
        },
        execute: async (args: { path: string; content: string }, context: AgentContext) => {
          return FileSystemTools.writeFile(args.path, args.content, context);
        },
        requiresApproval: true
      },
      {
        name: 'modify_file',
        description: 'Apply targeted changes to a file',
        parameters: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'The path to the file to modify'
            },
            changes: {
              type: 'string',
              description: 'The changes to apply to the file'
            }
          },
          required: ['path', 'changes']
        },
        execute: async (args: { path: string; changes: string }, context: AgentContext) => {
          return FileSystemTools.modifyFile(args.path, args.changes, context);
        },
        requiresApproval: true
      },
      {
        name: 'list_files',
        description: 'List files and directories',
        parameters: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'The directory path to list',
              default: '.'
            },
            pattern: {
              type: 'string',
              description: 'Glob pattern to filter files',
              default: '**/*'
            }
          },
          required: ['path']
        },
        execute: async (args: { path: string; pattern?: string }, context: AgentContext) => {
          return FileSystemTools.listFiles(args.path, context, args.pattern);
        }
      },
      {
        name: 'search_files',
        description: 'Search for text within files',
        parameters: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'The directory path to search in',
              default: '.'
            },
            searchTerm: {
              type: 'string',
              description: 'The text to search for'
            },
            filePattern: {
              type: 'string',
              description: 'Glob pattern to filter files to search',
              default: '**/*.{js,ts,jsx,tsx,py,java,cpp,c,h,css,html,md,json,yaml,yml}'
            }
          },
          required: ['searchTerm']
        },
        execute: async (args: { path?: string; searchTerm: string; filePattern?: string }, context: AgentContext) => {
          return FileSystemTools.searchFiles(args.path || '.', args.searchTerm, context, args.filePattern);
        }
      },
      {
        name: 'delete_file',
        description: 'Delete a file (creates backup)',
        parameters: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'The path to the file to delete'
            }
          },
          required: ['path']
        },
        execute: async (args: { path: string }, context: AgentContext) => {
          return FileSystemTools.deleteFile(args.path, context);
        },
        requiresApproval: true
      }
    ];
  }
}
