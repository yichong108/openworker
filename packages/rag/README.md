# @openworker/rag

单知识库检索存储。提供稳定的 `RagStore` 接口，供 `services/api` 使用。

- **默认**：本地关键词索引（`index.json`）
- **语义**：配置 Ollama embedding 后，内部使用 **LlamaIndex.TS** + `OllamaEmbedding`；并双写关键词索引，query 侧 embedding 失败时可回退

**无 HTTP / MySQL**：不感知 `knowledgeBaseId`；宿主负责元数据与 `persistDir` 映射。

## 安装

```json
"@openworker/rag": "workspace:*"
```

本地语义检索依赖 Ollama。仓库根目录：

```bash
pnpm rag:setup-ollama
```

会安装 Ollama、拉取 `nomic-embed-text`，并写入 `services/api/.env`（`RAG_EMBEDDING_PROVIDER=ollama` 等）。安装包**始终优先从中国国内镜像**下载（CNB / ghproxy 等），全部失败才回退海外源或 winget；可用 `OLLAMA_SETUP_URL` 指定安装包地址。

## 用法

### 关键词

```ts
import { createRagStore } from '@openworker/rag'

const store = createRagStore({ persistDir: './data/rag/kb-1' })

await store.upsertDocument({
  id: 'doc-1',
  text: 'OpenWorker 支持多知识库检索。',
  metadata: { filename: 'intro.md' }
})

const { nodes } = await store.query({ text: '知识库', topK: 5 })
await store.deleteDocument('doc-1')
```

### 语义（Ollama）

```ts
import { createRagStore } from '@openworker/rag'

const store = createRagStore({
  persistDir: './data/rag/kb-1',
  embedding: {
    provider: 'ollama',
    model: 'nomic-embed-text',
    baseUrl: 'http://127.0.0.1:11434'
  }
})
```

## 磁盘布局

```text
{persistDir}/
  index.json          # 关键词索引（语义模式也会双写，供回退）
  llamaindex/         # LlamaIndex 持久化（仅语义模式）
```

原文文件由 API 另存于 `files/`；本包只维护检索索引。
