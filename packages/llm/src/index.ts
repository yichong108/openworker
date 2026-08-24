/**
 * @file LLM调用层
 * @description 因为目前LLM下面的大模型即使基于OpenAI Chat Completions 规范,实际各个模型也没统一规范。所以这里需要对LLM层进行封装，提高这层的确定统一性稳定性。
 *
 * 目前只做OpenAI的兼容，后续可以考虑其他模型。
 */

export * from './provider.js'

export * from './stream-chat.js'
