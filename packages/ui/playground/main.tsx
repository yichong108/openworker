import { App as AntdApp, ConfigProvider } from 'antd'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import zhCN from 'antd/locale/zh_CN'

import { PlaygroundApp } from './PlaygroundApp'
import './playground.scss'

const root = document.getElementById('root')
if (!root) throw new Error('缺少 #root')

createRoot(root).render(
  <StrictMode>
    <ConfigProvider locale={zhCN} theme={{ token: { fontSize: 13 } }}>
      <AntdApp>
        <PlaygroundApp />
      </AntdApp>
    </ConfigProvider>
  </StrictMode>
)
