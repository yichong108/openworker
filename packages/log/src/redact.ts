/** pino redact paths — 结构化字段值打码，非字符串全文搜索 */
export const REDACT_PATHS = [
  'apiKey',
  '*.apiKey',
  'tavilyApiKey',
  '*.tavilyApiKey',
  'settings.apiKey',
  'settings.tavilyApiKey',
  'settings.providerProfiles.*.apiKey',
  'providerProfiles.*.apiKey',
  'mcpServers[*].env',
  'authorization',
  '*.authorization',
  '*.token',
  '*.password'
] as const

export const REDACT_CENSOR = '[Redacted]'
