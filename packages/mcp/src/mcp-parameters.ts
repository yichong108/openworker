/**
 * 把 MCP listTools 的 JSON Schema 包成 AI SDK Schema，供 defineTool.parameters。
 */

import { jsonSchema, type JSONSchema7 } from 'ai'

const EMPTY_OBJECT_SCHEMA: JSONSchema7 = { type: 'object', additionalProperties: true }

export function mcpInputSchemaToParameters(inputSchema: unknown) {
  if (inputSchema && typeof inputSchema === 'object') {
    return jsonSchema(inputSchema as JSONSchema7)
  }
  return jsonSchema(EMPTY_OBJECT_SCHEMA)
}
