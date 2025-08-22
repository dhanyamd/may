import { Mode, AgentContext, ExecutionPlan, PlanStep } from '../types/index';
import { logger } from '../utils/logger';
import { ClineAgent } from './agent';

export class ModeManager {
  private agent: ClineAgent;
  private currentMode: Mode;
  private executionPlans: Map<string, ExecutionPlan>;
  private activePlanId: string | null;

  constructor(agent: ClineAgent) {
    this.agent = agent;
    this.currentMode = 'plan';
    this.executionPlans = new Map();
    this.activePlanId = null;
  }

  public getMode(): Mode {
    return this.currentMode;
  }

  public async switchMode(newMode: Mode): Promise<void> {
    const oldMode = this.currentMode;
    this.currentMode = newMode;
    
    logger.info(`Switched from ${oldMode} mode to ${newMode} mode`);
    
    // Notify the agent of the mode change
    const context = this.agent.getContext();
    context.currentMode = newMode;
  }

  public isInPlanMode(): boolean {
    return this.currentMode === 'plan';
  }

  public isInActMode(): boolean {
    return this.currentMode === 'act';
  }

  public async createPlan(title: string, description: string, steps: PlanStep[]): Promise<ExecutionPlan> {
    const plan: ExecutionPlan = {
      id: this.generatePlanId(),
      title,
      description,
      steps: steps.map(step => ({ ...step, completed: false })),
      created: new Date(),
      approved: false
    };

    this.executionPlans.set(plan.id, plan);
    logger.info(`Created execution plan: ${title}`);
    
    return plan;
  }

  public async approvePlan(planId: string): Promise<boolean> {
    const plan = this.executionPlans.get(planId);
    if (!plan) {
      throw new Error(`Plan not found: ${planId}`);
    }

    plan.approved = true;
    this.activePlanId = planId;
    
    logger.info(`Plan approved: ${plan.title}`);
    return true;
  }

  public async rejectPlan(planId: string): Promise<boolean> {
    const plan = this.executionPlans.get(planId);
    if (!plan) {
      throw new Error(`Plan not found: ${planId}`);
    }

    this.executionPlans.delete(planId);
    if (this.activePlanId === planId) {
      this.activePlanId = null;
    }
    
    logger.info(`Plan rejected: ${plan.title}`);
    return true;
  }

  public getActivePlan(): ExecutionPlan | null {
    if (!this.activePlanId) {
      return null;
    }
    return this.executionPlans.get(this.activePlanId) || null;
  }

  public getPlan(planId: string): ExecutionPlan | null {
    return this.executionPlans.get(planId) || null;
  }

  public getAllPlans(): ExecutionPlan[] {
    return Array.from(this.executionPlans.values());
  }

  public async executePlanStep(planId: string, stepId: string): Promise<boolean> {
    const plan = this.executionPlans.get(planId);
    if (!plan) {
      throw new Error(`Plan not found: ${planId}`);
    }

    if (!plan.approved) {
      throw new Error('Plan must be approved before execution');
    }

    const step = plan.steps.find(s => s.id === stepId);
    if (!step) {
      throw new Error(`Step not found: ${stepId}`);
    }

    if (step.completed) {
      logger.warn(`Step already completed: ${step.description}`);
      return true;
    }

    // In Plan mode, only mark as planned, don't execute
    if (this.isInPlanMode()) {
      logger.info(`Step planned (not executed in Plan mode): ${step.description}`);
      return true;
    }

    // In Act mode, execute the step
    try {
      logger.info(`Executing step: ${step.description}`);
      
      // Here you would implement the actual step execution logic
      // This would involve calling the appropriate tools based on step type
      await this.executeStepLogic(step);
      
      step.completed = true;
      logger.success(`Step completed: ${step.description}`);
      return true;
    } catch (error) {
      logger.error(`Step failed: ${step.description}`, error);
      throw new Error(`Step execution failed: ${error}`);
    }
  }

  private async executeStepLogic(step: PlanStep): Promise<void> {
    // This is where you'd implement the actual execution logic
    // based on the step type and details
    
    switch (step.type) {
      case 'analysis':
        // Handle analysis steps
        break;
      case 'file_operation':
        // Handle file operations
        break;
      case 'command':
        // Handle command execution
        break;
      case 'confirmation':
        // Handle confirmation steps
        break;
      default:
        throw new Error(`Unknown step type: ${step.type}`);
    }
  }

  public async completePlan(planId: string): Promise<boolean> {
    const plan = this.executionPlans.get(planId);
    if (!plan) {
      throw new Error(`Plan not found: ${planId}`);
    }

    const allCompleted = plan.steps.every(step => step.completed);
    if (!allCompleted) {
      throw new Error('Not all steps are completed');
    }

    logger.success(`Plan completed: ${plan.title}`);
    
    // Clear active plan
    if (this.activePlanId === planId) {
      this.activePlanId = null;
    }

    return true;
  }

  public async cancelActivePlan(): Promise<boolean> {
    if (!this.activePlanId) {
      return false;
    }

    const plan = this.executionPlans.get(this.activePlanId);
    if (plan) {
      logger.info(`Cancelled active plan: ${plan.title}`);
    }

    this.activePlanId = null;
    return true;
  }

  private generatePlanId(): string {
    return `plan_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  public getPlanProgress(planId: string): { completed: number; total: number; percentage: number } {
    const plan = this.executionPlans.get(planId);
    if (!plan) {
      return { completed: 0, total: 0, percentage: 0 };
    }

    const completed = plan.steps.filter(step => step.completed).length;
    const total = plan.steps.length;
    const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;

    return { completed, total, percentage };
  }

  public async suggestModeSwitch(context: AgentContext): Promise<Mode | null> {
    // Analyze the context and suggest appropriate mode
    const lastMessage = context.conversationHistory[context.conversationHistory.length - 1];
    
    if (!lastMessage) {
      return null;
    }

    const content = lastMessage.content.toLowerCase();
    
    // Suggest Act mode for execution-related requests
    if (content.includes('execute') || 
        content.includes('run') || 
        content.includes('create') || 
        content.includes('modify') || 
        content.includes('delete') ||
        content.includes('install') ||
        content.includes('build')) {
      return 'act';
    }

    // Suggest Plan mode for analysis-related requests
    if (content.includes('analyze') || 
        content.includes('plan') || 
        content.includes('understand') || 
        content.includes('explore') || 
        content.includes('investigate')) {
      return 'plan';
    }

    return null;
  }

  public getModeDescription(): string {
    switch (this.currentMode) {
      case 'plan':
        return 'Plan Mode: Read-only analysis and planning. No file modifications or command execution.';
      case 'act':
        return 'Act Mode: Full execution capabilities. Can modify files and run commands (with approval).';
      default:
        return 'Unknown mode';
    }
  }

  public async validateModeForOperation(operationType: string): Promise<boolean> {
    // Validate if current mode allows the operation
    switch (operationType) {
      case 'file_write':
      case 'file_modify':
      case 'file_delete':
      case 'command_execute':
        if (this.isInPlanMode()) {
          logger.warn(`Operation ${operationType} not allowed in Plan mode`);
          return false;
        }
        return true;
      
      case 'file_read':
      case 'file_list':
      case 'file_search':
        return true; // Always allowed
      
      default:
        logger.warn(`Unknown operation type: ${operationType}`);
        return false;
    }
  }
}
