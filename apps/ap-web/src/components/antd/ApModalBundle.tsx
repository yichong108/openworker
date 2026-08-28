'use client'

import { ConfigProvider, Modal } from 'antd'
import type { ModalProps } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import type { ReactNode } from 'react'

import { apWebAntdTheme } from './ap-web-antd-theme'

export type ApModalProps = {
  open: boolean
  onClose: () => void
  title?: ReactNode
  subtitle?: ReactNode
  children: ReactNode
  footer?: ReactNode | null
  width?: number | string
  centered?: boolean
  closable?: boolean
  maskClosable?: boolean
  destroyOnClose?: boolean
  zIndex?: number
  classNames?: ModalProps['classNames']
  styles?: ModalProps['styles']
}

/**
 * antd Modal 实现层：统一 ap-web 弹窗样式与主题。
 */
export function ApModalBundle({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer = null,
  width = 520,
  centered = true,
  closable = true,
  maskClosable = true,
  destroyOnClose,
  zIndex,
  classNames,
  styles
}: ApModalProps) {
  const modalTitle =
    title === undefined ? undefined : subtitle ? (
      <div className="ap-modal-title-block">
        <div className="font-display text-2xl">{title}</div>
        <p className="ap-modal-subtitle">{subtitle}</p>
      </div>
    ) : (
      title
    )

  return (
    <ConfigProvider locale={zhCN} theme={apWebAntdTheme}>
      <Modal
        open={open}
        onCancel={onClose}
        title={modalTitle}
        footer={footer}
        width={width}
        centered={centered}
        closable={closable}
        maskClosable={maskClosable}
        destroyOnHidden={destroyOnClose}
        zIndex={zIndex}
        className="ap-modal"
        classNames={classNames}
        styles={{
          mask: { background: 'rgba(0, 0, 0, 0.55)' },
          ...styles
        }}
        getContainer={() => document.body}
      >
        {children}
      </Modal>
    </ConfigProvider>
  )
}
