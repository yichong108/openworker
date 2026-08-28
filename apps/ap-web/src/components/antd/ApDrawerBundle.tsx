'use client'

import { ConfigProvider, Drawer } from 'antd'
import type { DrawerProps } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import type { ReactNode } from 'react'

import { apWebAntdTheme } from './ap-web-antd-theme'

export type ApDrawerProps = {
  open: boolean
  onClose: () => void
  children: ReactNode
  width?: number | string
  placement?: DrawerProps['placement']
  closable?: boolean
  maskClosable?: boolean
  destroyOnClose?: boolean
  zIndex?: number
  classNames?: DrawerProps['classNames']
  styles?: DrawerProps['styles']
}

/**
 * antd Drawer 实现层：统一 ap-web 侧滑面板样式与主题。
 */
export function ApDrawerBundle({
  open,
  onClose,
  children,
  width = 'min(42rem, 92vw)',
  placement = 'right',
  closable = false,
  maskClosable = true,
  destroyOnClose,
  zIndex = 70,
  classNames,
  styles
}: ApDrawerProps) {
  return (
    <ConfigProvider locale={zhCN} theme={apWebAntdTheme}>
      <Drawer
        open={open}
        onClose={onClose}
        placement={placement}
        width={width}
        closable={closable}
        maskClosable={maskClosable}
        destroyOnHidden={destroyOnClose}
        zIndex={zIndex}
        className="ap-drawer"
        classNames={classNames}
        styles={{
          mask: { background: 'rgba(0, 0, 0, 0.6)' },
          body: { padding: 0, overflow: 'hidden' },
          ...styles
        }}
        getContainer={() => document.body}
      >
        {children}
      </Drawer>
    </ConfigProvider>
  )
}
