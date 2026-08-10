import type { KnowledgeBase, KnowledgeDocument } from '@openworker/shared'
import {
  Button,
  Form,
  Input,
  List,
  Modal,
  Popconfirm,
  Space,
  Table,
  Tag,
  Typography,
  Upload,
  Alert,
  message
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import dayjs from 'dayjs'
import { useCallback, useEffect, useState } from 'react'

import {
  createKnowledgeBase,
  deleteKnowledgeBase,
  deleteKnowledgeDocument,
  fetchKnowledgeBases,
  fetchKnowledgeDocuments,
  updateKnowledgeBase,
  uploadKnowledgeDocument
} from '../api/knowledge-api'

/**
 * 文档状态 Tag 颜色
 *
 * @param status - 文档索引状态
 */
function statusColor(status: string): string {
  if (status === 'ready') return 'green'
  if (status === 'error') return 'red'
  return 'default'
}

/**
 * 知识库与文档管理页
 *
 * 左侧管理多知识库，右侧管理当前库的 `.txt`/`.md` 文档上传与删除。
 * 当前检索后端为关键词 MVP（无需 Embedding）。
 */
export function KnowledgePage() {
  const [bases, setBases] = useState<KnowledgeBase[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([])
  const [loadingBases, setLoadingBases] = useState(true)
  const [loadingDocs, setLoadingDocs] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [renameOpen, setRenameOpen] = useState(false)
  const [form] = Form.useForm<{ name: string; description?: string }>()
  const [renameForm] = Form.useForm<{ name: string; description?: string }>()

  const selected = bases.find((b) => b.id === selectedId) ?? null

  const loadBases = useCallback(async () => {
    setLoadingBases(true)
    setError(null)
    try {
      const list = await fetchKnowledgeBases()
      setBases(list)
      setSelectedId((prev) => {
        if (prev && list.some((b) => b.id === prev)) return prev
        return list[0]?.id ?? null
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoadingBases(false)
    }
  }, [])

  const loadDocuments = useCallback(async (kbId: string) => {
    setLoadingDocs(true)
    setError(null)
    try {
      const list = await fetchKnowledgeDocuments(kbId)
      setDocuments(list)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setDocuments([])
    } finally {
      setLoadingDocs(false)
    }
  }, [])

  useEffect(() => {
    void loadBases()
  }, [loadBases])

  useEffect(() => {
    if (!selectedId) {
      setDocuments([])
      return
    }
    void loadDocuments(selectedId)
  }, [selectedId, loadDocuments])

  const docColumns: ColumnsType<KnowledgeDocument> = [
    { title: '文件名', dataIndex: 'filename', key: 'filename', ellipsis: true },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: string) => <Tag color={statusColor(status)}>{status}</Tag>
    },
    {
      title: '大小',
      dataIndex: 'byteSize',
      key: 'byteSize',
      width: 100,
      render: (n: number) => `${n} B`
    },
    {
      title: '上传时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 180,
      render: (v: number) => dayjs(v).format('YYYY-MM-DD HH:mm:ss')
    },
    {
      title: '操作',
      key: 'actions',
      width: 90,
      render: (_, row) => (
        <Popconfirm
          title="删除该文档？"
          onConfirm={async () => {
            if (!selectedId) return
            try {
              await deleteKnowledgeDocument(selectedId, row.id)
              message.success('已删除')
              await loadDocuments(selectedId)
            } catch (err) {
              message.error(err instanceof Error ? err.message : String(err))
            }
          }}
        >
          <Button type="link" danger size="small">
            删除
          </Button>
        </Popconfirm>
      )
    }
  ]

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <Typography.Title level={4} style={{ margin: 0 }}>
        知识库文档
      </Typography.Title>
      <Typography.Paragraph type="secondary" style={{ margin: 0 }}>
        当前为关键词检索（无需 Embedding）。支持上传 .txt / .md / .markdown。
      </Typography.Paragraph>
      {error ? <Alert type="error" showIcon message={error} /> : null}

      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
        <div style={{ width: 280, flexShrink: 0 }}>
          <Space style={{ marginBottom: 8 }}>
            <Button type="primary" size="small" onClick={() => setCreateOpen(true)}>
              新建知识库
            </Button>
            <Button size="small" loading={loadingBases} onClick={() => void loadBases()}>
              刷新
            </Button>
          </Space>
          <List
            loading={loadingBases}
            bordered
            size="small"
            dataSource={bases}
            locale={{ emptyText: '暂无知识库' }}
            renderItem={(item) => (
              <List.Item
                style={{
                  cursor: 'pointer',
                  background: item.id === selectedId ? '#e6f4ff' : undefined
                }}
                onClick={() => setSelectedId(item.id)}
                actions={[
                  <Button
                    key="edit"
                    type="link"
                    size="small"
                    onClick={(e) => {
                      e.stopPropagation()
                      setSelectedId(item.id)
                      renameForm.setFieldsValue({
                        name: item.name,
                        description: item.description ?? undefined
                      })
                      setRenameOpen(true)
                    }}
                  >
                    编辑
                  </Button>,
                  <Popconfirm
                    key="del"
                    title="删除知识库及其文档？"
                    onConfirm={async (e) => {
                      e?.stopPropagation()
                      try {
                        await deleteKnowledgeBase(item.id)
                        message.success('已删除知识库')
                        await loadBases()
                      } catch (err) {
                        message.error(err instanceof Error ? err.message : String(err))
                      }
                    }}
                  >
                    <Button type="link" danger size="small" onClick={(e) => e.stopPropagation()}>
                      删除
                    </Button>
                  </Popconfirm>
                ]}
              >
                <List.Item.Meta
                  title={item.name}
                  description={item.description || item.id.slice(0, 8)}
                />
              </List.Item>
            )}
          />
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <Space style={{ marginBottom: 12 }} wrap>
            <Typography.Text strong>{selected ? selected.name : '请选择知识库'}</Typography.Text>
            {selectedId ? (
              <Upload
                accept=".txt,.md,.markdown,text/plain,text/markdown"
                showUploadList={false}
                beforeUpload={async (file) => {
                  try {
                    await uploadKnowledgeDocument(selectedId, file)
                    message.success('上传成功')
                    await loadDocuments(selectedId)
                  } catch (err) {
                    message.error(err instanceof Error ? err.message : String(err))
                  }
                  return false
                }}
              >
                <Button type="primary">上传文档</Button>
              </Upload>
            ) : null}
          </Space>
          <Table<KnowledgeDocument>
            rowKey="id"
            loading={loadingDocs}
            columns={docColumns}
            dataSource={documents}
            pagination={{ pageSize: 20, showSizeChanger: true }}
            locale={{ emptyText: selectedId ? '暂无文档' : '请先选择知识库' }}
          />
        </div>
      </div>

      <Modal
        title="新建知识库"
        open={createOpen}
        onCancel={() => setCreateOpen(false)}
        onOk={async () => {
          try {
            const values = await form.validateFields()
            await createKnowledgeBase({
              name: values.name,
              description: values.description ?? null
            })
            message.success('已创建')
            setCreateOpen(false)
            form.resetFields()
            await loadBases()
          } catch (err) {
            if (err && typeof err === 'object' && 'errorFields' in err) return
            message.error(err instanceof Error ? err.message : String(err))
          }
        }}
        destroyOnClose
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="名称" rules={[{ required: true, message: '请输入名称' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="编辑知识库"
        open={renameOpen}
        onCancel={() => setRenameOpen(false)}
        onOk={async () => {
          if (!selectedId) return
          try {
            const values = await renameForm.validateFields()
            await updateKnowledgeBase(selectedId, {
              name: values.name,
              description: values.description ?? null
            })
            message.success('已更新')
            setRenameOpen(false)
            await loadBases()
          } catch (err) {
            if (err && typeof err === 'object' && 'errorFields' in err) return
            message.error(err instanceof Error ? err.message : String(err))
          }
        }}
        destroyOnClose
      >
        <Form form={renameForm} layout="vertical">
          <Form.Item name="name" label="名称" rules={[{ required: true, message: '请输入名称' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>
    </Space>
  )
}
