export interface ToolResult {
  success: boolean;
  data?: any;
  error?: string;
  output?: string;
}

export interface FileOperation {
  type: 'read' | 'write' | 'modify' | 'delete' | 'list';
  path: string;
  content?: string;
  changes?: string;
}

export interface CommandExecution {
  command: string;
  cwd?: string;
  timeout?: number;
  requiresApproval?: boolean;
}

export interface ConversationMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  toolCalls?: ToolCall[];
  toolResults?: ToolResult[];
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface AgentContext {
  workingDirectory: string;
  projectFiles: string[];
  recentFiles: string[];
  conversationHistory: ConversationMessage[];
  currentMode: 'plan' | 'act';
  projectType?: string | undefined;
  dependencies?: string[] | undefined;
}

export interface Tool {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, any>;
    required: string[];
  };
  execute: (args: any, context: AgentContext) => Promise<ToolResult>;
  requiresApproval?: boolean;
}

export interface CLIConfig {
  geminiApiKey?: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  workingDirectory?: string;
  autoApprove?: boolean;
  logLevel?: 'debug' | 'info' | 'warn' | 'error';
}

export interface ProjectAnalysis {
  type: string;
  language: string;
  framework?: string;
  dependencies: string[];
  structure: {
    [key: string]: string[];
  };
  entryPoints: string[];
  configFiles: string[];
}

export type Mode = 'plan' | 'act';

export interface PlanStep {
  id: string;
  description: string;
  type: 'analysis' | 'file_operation' | 'command' | 'confirmation';
  details: any;
  completed: boolean;
}

export interface ExecutionPlan {
  id: string;
  title: string;
  description: string;
  steps: PlanStep[];
  estimatedTime?: string;
  risks?: string[];
  created: Date;
  approved: boolean;
}
