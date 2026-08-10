import { Navigate, Route, Routes } from 'react-router-dom'

import { AdminLayout } from './layouts/AdminLayout'
import { KnowledgePage } from './pages/KnowledgePage'
import { RagTestPage } from './pages/RagTestPage'
import { UsersPage } from './pages/UsersPage'

/**
 * 后台管理根路由
 *
 * 默认进入用户列表；含知识库文档管理与 RAG 测试页。
 */
export function App() {
  return (
    <Routes>
      <Route path="/" element={<AdminLayout />}>
        <Route index element={<Navigate to="/users" replace />} />
        <Route path="users" element={<UsersPage />} />
        <Route path="knowledge" element={<KnowledgePage />} />
        <Route path="rag-test" element={<RagTestPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/users" replace />} />
    </Routes>
  )
}
