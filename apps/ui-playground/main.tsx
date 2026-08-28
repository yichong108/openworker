import { App as AntdApp, ConfigProvider } from 'antd'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import zhCN from 'antd/locale/zh_CN'

import { AgentPlaygroundApp } from './AgentPlaygroundApp'
import { HttpDialogPlaygroundApp } from './HttpDialogPlaygroundApp'
import { HttpPlaygroundApp } from './HttpPlaygroundApp'
import { PlaygroundApp } from './PlaygroundApp'
import { usePlaygroundPage } from './playground-nav'
import './playground.scss'

/**
 * 按 hash 在模拟数据页、Base Agent 页、HTTP 封装页与对话框页之间切换。
 */
function PlaygroundRoot() {
  const page = usePlaygroundPage()
  if (page === 'agent') return <AgentPlaygroundApp />
  if (page === 'http') return <HttpPlaygroundApp />
  if (page === 'dialog') return <HttpDialogPlaygroundApp />
  return <PlaygroundApp />
}

const root = document.getElementById('root')
if (!root) throw new Error('缺少 #root')

createRoot(root).render(
  <StrictMode>
    <ConfigProvider locale={zhCN} theme={{ token: { fontSize: 13 } }}>
      <AntdApp>
        <PlaygroundRoot />
      </AntdApp>
    </ConfigProvider>
  </StrictMode>
)
