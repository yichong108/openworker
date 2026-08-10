# @openworker/rag

单知识库检索存储（**关键词 MVP**）。提供稳定的 `RagStore` 接口，供 `services/api` 使用；后续可在包内替换为 LlamaIndex / Embedding 语义实现而不改调用方。

**无 HTTP / MySQL**：不感知 `knowledgeBaseId`；宿主负责元数据与 `persistDir` 映射。

## 安装

```json
"@openworker/rag": "workspace:*"
```

## 用法

```ts
import { createRagStore } from '@openworker/rag'

const store = createRagStore({ persistDir: './data/rag/kb-1' })

await store.upsertDocument({
  id: 'doc-1',
  text: 'OpenWorker 支持多知识库关键词检索。',
  metadata: { filename: 'intro.md' }
})

const { nodes } = await store.query({ text: '知识库', topK: 5 })
await store.deleteDocument('doc-1')
```

## 磁盘布局

```text
{persistDir}/
  index.json   # version + documents（全文与 chunks）
```

原文文件由 API 另存于 `files/`；本包只维护检索索引。

## 设计边界

- 做：单库 upsert / delete / 关键词 query
- 不做：跨库合并、Embedding、LLM 生成回答（由 API 编排）
- 后续：保持 `createRagStore` / `RagStore` 签名，内部换语义索引
