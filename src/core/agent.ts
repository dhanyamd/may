import { GoogleGenerativeAI } from '@google/generative-ai';
import { ToolResult, AgentContext, Tool, ConversationMessage, ToolCall, Mode, ExecutionPlan } from '../types/index';
import { FileSystemTools } from '../tools/filesystem';
import { TerminalTools } from '../tools/terminal';
import { config } from '../utils/config';
import { logger } from '../utils/logger';
import * as fs from 'fs-extra';
import * as path from 'path';

export class ClineAgent {
  private genAI: GoogleGenerativeAI;
  private model: any;
  private context: AgentContext;
  private tools: Tool[];
  private systemPrompt: string;
  private modeManager: any;

  constructor(modeManager?: any) {
    this.modeManager = modeManager;
    const apiKey = config.get('geminiApiKey');
    if (!apiKey) {
      console.error("Gemini API key not found in config.");
      throw new Error('Gemini API key is required. Set it with: cline-cli config --set-api-key YOUR_KEY');
    }

    this.genAI = new GoogleGenerativeAI(apiKey);
    this.model = this.genAI.getGenerativeModel({
      model: config.get('model') || 'gemini-1.5-flash',
      generationConfig: {
        temperature: config.get('temperature') || 0.1,
        maxOutputTokens: config.get('maxTokens') || 4096,
      },
    });

    this.context = {
      workingDirectory: config.get('workingDirectory') || process.cwd(),
      projectFiles: [],
      recentFiles: [],
      conversationHistory: [],
      currentMode: 'plan',
      projectType: undefined,
      dependencies: []
    };

    // Initialize tools
    this.tools = [
      ...FileSystemTools.getTools(),
      ...TerminalTools.getTools(),
      {
        name: 'create_plan',
        description: 'Create an execution plan',
        parameters: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            description: { type: 'string' },
            steps: { type: 'array', items: { type: 'object' } }
          },
          required: ['title', 'description', 'steps']
        },
        execute: async (args: any) => {
          return this.createPlan(args);
        }
      }
    ];
    this.systemPrompt = this.generateSystemPrompt();
  }

  private generateSystemPrompt(): string {
    return `You are Cline, an AI coding assistant that helps developers build software through natural language interaction.

    Core Capabilities:
    1. File System Operations: Read, write, modify, search, and delete files
    2. Terminal Command Execution: Run shell commands and interact with the system
    3. Code Analysis: Understand project structure and dependencies
    4. Plan/Act Mode: Strategic planning followed by tactical execution

    Operating Modes:
    - Plan Mode: Read-only analysis and planning (default)
    - Act Mode: Execute file modifications and commands (requires user approval)

    Key Principles:
    1. Always explain your reasoning and proposed actions clearly
    2. In Plan Mode, only analyze and propose plans with code - never execute
    3. In Act Mode, execute actions but always request user approval for destructive operations
    4. Maintain conversation context and refer to previous files/commands when relevant
    5. Be conservative with changes - prefer small, safe steps
    6. Always verify the working directory and project structure before operations

    When users ask for help:
    1. First analyze the project structure and requirements
    2. Create a clear plan with specific steps
    3. Present the plan and ask for approval before execution
    4. Execute steps one by one with clear explanations
    5. Verify results and handle errors gracefully

    Available Tools:
    ${this.tools.map(tool => `- ${tool.name}: ${tool.description}`).join('\n')}

    CRITICAL: When you need to use a tool, you MUST output a JSON array of tool calls in the following format, *preceded by the string "TOOL_CALLS:"*. DO NOT deviate from this format.
    TOOL_CALLS:[
      {
        "name": "tool_name",
        "arguments": {
          "param1": "value1",
          "param2": "value2"
        }
      },
      {
        "name": "another_tool",
        "arguments": {
          "paramA": "valueA"
        }
      }
    ]
    After the TOOL_CALLS block, you can provide additional natural language response.
    You MUST use the appropriate tools for file operations and command execution. Never make assumptions about file contents or project structure - verify first.`;
  }

  public async initialize(): Promise<void> {
    logger.info('Initializing Cline Agent...');
    await this.analyzeProject();
    logger.info(`Working directory: ${this.context.workingDirectory}`);
    logger.info(`Project type: ${this.context.projectType || 'Unknown'}`);
    logger.info(`Available dependencies: ${this.context.dependencies?.length || 0}`);
  }

  private async analyzeProject(): Promise<void> {
    try {
      // Check for common project files
      const projectFiles = await fs.readdir(this.context.workingDirectory);
      this.context.projectFiles = projectFiles;

      // Detect project type
      if (projectFiles.includes('package.json')) {
        this.context.projectType = 'Node.js';
        try {
          const packageJson = await fs.readJson(path.join(this.context.workingDirectory, 'package.json'));
          this.context.dependencies = [
            ...Object.keys(packageJson.dependencies || {}),
            ...Object.keys(packageJson.devDependencies || {})
          ];
        } catch (error) {
          logger.warn('Failed to read package.json:', error);
        }
      } else if (projectFiles.includes('requirements.txt')) {
        this.context.projectType = 'Python';
      } else if (projectFiles.includes('pom.xml')) {
        this.context.projectType = 'Java/Maven';
      } else if (projectFiles.includes('build.gradle')) {
        this.context.projectType = 'Java/Gradle';
      } else if (projectFiles.includes('Cargo.toml')) {
        this.context.projectType = 'Rust';
      } else {
        this.context.projectType = undefined;
      }

      logger.debug('Project analysis completed');
    } catch (error) {
      logger.warn('Failed to analyze project:', error);
    }
  }

  public async processMessage(userMessage: string): Promise<string> {
    try {
      // Add user message to conversation history
      this.context.conversationHistory.push({
        role: 'user',
        content: userMessage,
        timestamp: new Date()
      });

      logger.info(`Processing message: ${userMessage}`);

      // Get AI response with tool calling
      const response = await this.getAIResponse();

      // Process tool calls if any
      if (response.toolCalls && response.toolCalls.length > 0) {
        const toolResults = await this.executeToolCalls(response.toolCalls);

        // Add tool results to conversation and get final response
        this.context.conversationHistory.push({
          role: 'assistant',
          content: response.content,
          timestamp: new Date(),
          toolCalls: response.toolCalls,
          toolResults: toolResults
        });

        // Get final response after tool execution
        const finalResponse = await this.getAIResponse();
        this.context.conversationHistory.push({
          role: 'assistant',
          content: finalResponse.content,
          timestamp: new Date()
        });

        return finalResponse.content;
      } else {
        // Simple response without tool calls
        this.context.conversationHistory.push({
          role: 'assistant',
          content: response.content,
          timestamp: new Date()
        });
        return response.content;
      }
    } catch (error) {
      logger.error('Failed to process message:', error);
      const errorMessage = `Sorry, I encountered an error: ${error}`;
      this.context.conversationHistory.push({
        role: 'assistant',
        content: errorMessage,
        timestamp: new Date()
      });
      return errorMessage;
    }
  }

  private async getAIResponse(): Promise<{ content: string; toolCalls?: ToolCall[] }> {
    try {
      // Format messages for Gemini API
      const history = this.context.conversationHistory.map(msg => ({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.content }]
      }));

      // Add system prompt as first message
      const chat = this.model.startChat({
        history: [
          { role: 'user', parts: [{ text: this.systemPrompt }] },
          { role: 'model', parts: [{ text: 'I understand. I will act as Cline, an AI coding assistant with the capabilities and principles you described.' }] },
          ...history
        ],
        generationConfig: {
          temperature: config.get('temperature') || 0.1,
          maxOutputTokens: config.get('maxTokens') || 4096,
        },
      });

      // For now, Gemini doesn't support function calling in the same way as OpenAI
      // We'll simulate tool calls by parsing the response for tool usage patterns
      const result = await chat.sendMessage('Continue the conversation based on the context provided.');
      const response = await result.response;
      let text = response.text();
      const toolCalls: ToolCall[] = [];

      const toolCallsBlockPattern = /TOOL_CALLS:(\s*\[\s*{[^\]]*?}\s*\])/s;
      const toolCallsBlockMatch = text.match(toolCallsBlockPattern);

      if (toolCallsBlockMatch) {
        try {
          const toolCallsJson = toolCallsBlockMatch[1];
          const parsedToolCalls = JSON.parse(toolCallsJson);

          for (const call of parsedToolCalls) {
            toolCalls.push({
              id: `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              type: 'function',
              function: {
                name: call.name,
                arguments: JSON.stringify(call.arguments)
              }
            });
          }
          text = text.replace(toolCallsBlockPattern, '').trim();
        } catch (e) {
          logger.error('Failed to parse tool calls JSON:', e);
        }
      }

      // Check for plan creation pattern (still support old format for now)
      const planPattern = /CREATE_PLAN:\s*({.*})/s;
      const planMatch = text.match(planPattern);

      if (planMatch) {
        try {
          const planData = JSON.parse(planMatch[1]);
          toolCalls.push({
            id: `plan_call_${Date.now()}`,
            type: 'function',
            function: {
              name: 'create_plan',
              arguments: JSON.stringify(planData)
            }
          });
          text = text.replace(planPattern, '').trim();
        } catch (e) {
          logger.warn('Failed to parse plan data:', e);
        }
      }

      if (toolCalls.length > 0) {
        return {
          content: text,
          toolCalls
        };
      } else {
        return {
          content: text
        };
      }
    } catch (error) {
      logger.error('Failed to get AI response:', error);
      throw new Error(`AI service error: ${error}`);
    }
  }

  private async executeToolCalls(toolCalls: ToolCall[]): Promise<ToolResult[]> {
    const results: ToolResult[] = [];

    for (const toolCall of toolCalls) {
      const tool = this.tools.find(t => t.name === toolCall.function.name);
      
      if (!tool) {
        results.push({
          success: false,
          error: `Unknown tool: ${toolCall.function.name}`
        });
        continue;
      }

      try {
        logger.info(`Executing tool: ${tool.name}`);
        const args = JSON.parse(toolCall.function.arguments);
        
        // Directly execute the tool. Approval logic is handled by ModeManager for plan steps.
        const result = await tool.execute(args, this.context);
        results.push(result);
      } catch (error) {
        logger.error(`Tool execution failed: ${tool.name}`, error);
        results.push({
          success: false,
          error: `Tool execution failed: ${error}`
        });
      }
    }

    return results;
  }

  async createPlan(planData: any): Promise<ToolResult> {
    try {
      // Basic validation
      if (!planData.title || !planData.description || !planData.steps) {
        return {
          success: false,
          error: 'Invalid plan data: title, description, and steps are required'
        };
      }

      const plan: ExecutionPlan = await this.modeManager.createPlan(
        planData.title,
        planData.description,
        planData.steps
      );

      return {
        success: true,
        data: {
          planId: plan.id
        }
      };
    } catch (error) {
      logger.error('Failed to create plan:', error);
      return {
        success: false,
        error: `Failed to create plan: ${error}`
      };
    }
  }

  public getContext(): AgentContext {
    return { ...this.context };
  }

  public getMode(): Mode {
    return this.context.currentMode;
  }

  public setMode(mode: Mode): void {
    this.context.currentMode = mode;
    logger.info(`Switched to ${mode} mode`);
  }

  public getTools(): Tool[] {
    return [...this.tools];
  }

  public getConversationHistory(): ConversationMessage[] {
    return [...this.context.conversationHistory];
  }

  public clearConversation(): void {
    this.context.conversationHistory = [];
    logger.info('Conversation history cleared');
  }

  public async saveConversation(filePath: string): Promise<void> {
    try {
      const fullPath = path.resolve(this.context.workingDirectory, filePath);
      await fs.writeJson(fullPath, this.context.conversationHistory, { spaces: 2 });
      logger.info(`Conversation saved to: ${filePath}`);
    } catch (error) {
      logger.error('Failed to save conversation:', error);
      throw new Error(`Failed to save conversation: ${error}`);
    }
  }

  public async loadConversation(filePath: string): Promise<void> {
    try {
      const fullPath = path.resolve(this.context.workingDirectory, filePath);
      const history = await fs.readJson(fullPath);
      this.context.conversationHistory = history;
      logger.info(`Conversation loaded from: ${filePath}`);
    } catch (error) {
      logger.error('Failed to load conversation:', error);
      throw new Error(`Failed to load conversation: ${error}`);
    }
  }
}
