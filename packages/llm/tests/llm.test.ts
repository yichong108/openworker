/**
 * @file llm 单元测试
 */

import { describe, expect, it } from 'vitest'
import { getChatModel } from '../src/index.js'

describe('getChatModel', () => {
  it('未配置 API Key 时返回 null', () => {
    expect(
      getChatModel({
        apiKey: '',
        baseURL: 'https://api.openai.com/v1',
        model: 'gpt-4o'
      })
    ).toBeNull()
  })
})
