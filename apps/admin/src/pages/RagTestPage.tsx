import type { KnowledgeBase, RagQueryNode } from '@openworker/shared'
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Form,
  Input,
  InputNumber,
  Select,
  Space,
  Typography,
  message
} from 'antd'
import { useEffect, useState } from 'react'

import { fetchKnowledgeBases } from '../api/knowledge-api'
import { queryRag } from '../api/rag-api'

/**
 * RAG 服务测试页
 *
 * 支持指定知识库或清空选择以全库关键词检索；可选 withAnswer（需 API 配置 RAG_LLM_*）。
 */
export function RagTestPage() {
  const [bases, setBases] = useState<KnowledgeBase[]>([])
  const [loadingBases, setLoadingBases] = useState(true)
  const [querying, setQuerying] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [nodes, setNodes] = useState<RagQueryNode[]>([])
  const [answer, setAnswer] = useState<string | undefined>()
  const [form] = Form.useForm<{
    knowledgeBaseId?: string
    query: string
    topK: number
    withAnswer: boolean
  }>()

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoadingBases(true)
      try {
        const list = await fetchKnowledgeBases()
        if (!cancelled) setBases(list)
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err))
        }
      } finally {
        if (!cancelled) setLoadingBases(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <Typography.Title level={4} style={{ margin: 0 }}>
        RAG 测试
      </Typography.Title>
      <Typography.Paragraph type="secondary" style={{ margin: 0 }}>
        当前为关键词检索。知识库留空表示检索全部知识库并合并 top-k。生成回答需在 API 配置
        RAG_LLM_API_KEY / RAG_LLM_MODEL。
      </Typography.Paragraph>
      {error ? <Alert type="error" showIcon message={error} /> : null}

      <Form
        form={form}
        layout="vertical"
        initialValues={{ topK: 5, withAnswer: false }}
        onFinish={async (values) => {
          setQuerying(true)
          setError(null)
          setAnswer(undefined)
          try {
            const result = await queryRag({
              query: values.query,
              knowledgeBaseId: values.knowledgeBaseId || undefined,
              topK: values.topK,
              withAnswer: values.withAnswer
            })
            setNodes(result.nodes)
            setAnswer(result.answer)
            if (result.nodes.length === 0) {
              message.info('未命中任何片段')
            }
          } catch (err) {
            setNodes([])
            setAnswer(undefined)
            const msg = err instanceof Error ? err.message : String(err)
            setError(msg)
            message.error(msg)
          } finally {
            setQuerying(false)
          }
        }}
      >
        <Form.Item name="knowledgeBaseId" label="知识库（可清空 = 全库）">
          <Select
            allowClear
            loading={loadingBases}
            placeholder="全部知识库"
            options={bases.map((b) => ({ value: b.id, label: b.name }))}
          />
        </Form.Item>
        <Form.Item name="query" label="问题" rules={[{ required: true, message: '请输入问题' }]}>
          <Input.TextArea rows={3} placeholder="输入要检索的问题或关键词" />
        </Form.Item>
        <Space wrap>
          <Form.Item name="topK" label="topK" style={{ marginBottom: 0 }}>
            <InputNumber min={1} max={50} />
          </Form.Item>
          <Form.Item name="withAnswer" valuePropName="checked" style={{ marginBottom: 0 }}>
            <Checkbox>生成回答</Checkbox>
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={querying}>
            检索
          </Button>
        </Space>
      </Form>

      {answer !== undefined ? (
        <Card size="small" title="回答">
          <Typography.Paragraph style={{ whiteSpace: 'pre-wrap', marginBottom: 0 }}>
            {answer}
          </Typography.Paragraph>
        </Card>
      ) : null}

      <Card size="small" title={`检索片段（${nodes.length}）`}>
        {nodes.length === 0 ? (
          <Typography.Text type="secondary">暂无结果</Typography.Text>
        ) : (
          <Space direction="vertical" style={{ width: '100%' }} size="middle">
            {nodes.map((n) => (
              <Card key={n.id} type="inner" size="small" title={n.id}>
                <Typography.Text type="secondary">
                  库：{n.knowledgeBaseName ?? n.knowledgeBaseId}
                  {n.documentId ? ` · 文档：${n.documentId}` : ''}
                  {n.score !== undefined ? ` · score：${n.score.toFixed(3)}` : ''}
                </Typography.Text>
                <Typography.Paragraph
                  style={{ whiteSpace: 'pre-wrap', marginTop: 8, marginBottom: 0 }}
                >
                  {n.text}
                </Typography.Paragraph>
              </Card>
            ))}
          </Space>
        )}
      </Card>
    </Space>
  )
}
