import { ApAgentWithAGUI } from '@openworker/ap-agent'
import { getChatModel } from '@openworker/llm'

import { TaskFsError } from '@/lib/task-fs-error'

import { readAiConfig } from './config'
import { loadApEnv } from './load-env'

const DEEPSEEK_BASE_URL = 'https://api.deepseek.com/v1'

/**
 * 从 AI 配置与环境变量解析 DeepSeek LanguageModel。
 *
 * @returns AI SDK 聊天模型
 * @throws 未配置 API Key 时抛出 401
 */
function resolveDeepseekProvider() {
  loadApEnv()
  const config = readAiConfig()
  const apiKey = config.deepseek.apiKey.trim() || process.env.DEEPSEEK_API_KEY?.trim() || ''
  const model = getChatModel({
    apiKey,
    baseURL: DEEPSEEK_BASE_URL,
    model: config.deepseek.model
  })
  if (!model) {
    throw new TaskFsError('未填写 DeepSeek API Key，请先完成 AI 配置', 401, 'ai_auth')
  }
  return model
}

/**
 * 创建 ap-web 使用的 AP AG-UI Agent（DeepSeek + 工作区 cwd）。
 *
 * @param cwd - 工作区根目录
 * @param agentId - AG-UI agent 标识
 * @returns ApAgentWithAGUI 实例
 */
export function createApWebAgent(cwd: string, agentId: string): ApAgentWithAGUI {
  return new ApAgentWithAGUI({
    agentId,
    description: 'AP Web agent',
    cwd,
    provider: resolveDeepseekProvider()
  })
}
