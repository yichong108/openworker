import { CheckOutlined, PlusOutlined, SendOutlined, StopOutlined } from '@ant-design/icons'
import type { AgentComposerMode } from '@openworker/shared'
import { Button, Dropdown, Input, type MenuProps } from 'antd'
import type { InputRef } from 'antd/es/input'
import { useMemo, useRef } from 'react'

import { ComposerSkillMenu } from './ComposerSkillMenu.js'
import { getComposerTextarea } from './session-utils.js'
import type { ChatComposerProps } from './types.js'

const { TextArea } = Input

/**
 * 将 composer 模式转为中文标签。
 *
 * @param mode - build / ask / plan
 */
function composerModeLabel(mode: AgentComposerMode): string {
  if (mode === 'ask') return '问答'
  if (mode === 'plan') return '计划'
  return '构建'
}

/**
 * 聊天输入区：斜杠技能菜单、模式切换、发送/停止。
 *
 * 斜杠 token 解析由宿主完成；本组件只渲染菜单并转发键盘导航。
 *
 * @param props - 受控输入与操作回调
 */
export function ChatComposer({
  value,
  onChange,
  onSend,
  onStop,
  placeholder = '输入 / 选择技能，Enter 发送，Shift+Enter 换行',
  isRun = false,
  canSend,
  sendDisabled = false,
  composerMode,
  onComposerModeChange,
  skillMenu
}: ChatComposerProps) {
  const composerInputRef = useRef<InputRef>(null)
  const skillMenuOpen = Boolean(skillMenu?.open)
  const filteredSkills = skillMenu?.skills ?? []
  const showSendButton = !isRun
  const showStopButton = Boolean(isRun && onStop)

  const composerPlusMenuItems = useMemo<MenuProps['items']>(
    () =>
      (['build', 'ask', 'plan'] as const).map((mode) => ({
        key: mode,
        label: (
          <span className="app-composer-plus-menu-title">
            <span>{composerModeLabel(mode)}</span>
            {composerMode === mode ? (
              <CheckOutlined className="app-composer-plus-menu-check" aria-hidden />
            ) : null}
          </span>
        )
      })),
    [composerMode]
  )

  const handleComposerPlusMenuClick: NonNullable<MenuProps['onClick']> = ({ key }) => {
    if (key === 'build' || key === 'ask' || key === 'plan') {
      onComposerModeChange(key)
    }
  }

  return (
    <div className="app-composer">
      {skillMenuOpen && skillMenu ? (
        <ComposerSkillMenu
          skills={filteredSkills}
          activeIndex={skillMenu.activeIndex}
          loading={skillMenu.loading}
          onSelect={skillMenu.onSelect}
          onActiveIndexChange={skillMenu.onActiveIndexChange}
        />
      ) : null}
      <div className="app-composer-inner">
        <TextArea
          ref={composerInputRef}
          value={value}
          onChange={(e) => {
            const next = e.target.value
            onChange(next, e.target.selectionStart ?? next.length)
          }}
          onClick={(e) => {
            const cursor = (e.target as HTMLTextAreaElement).selectionStart ?? value.length
            onChange(value, cursor)
          }}
          onKeyUp={(e) => {
            if (
              e.key === 'ArrowLeft' ||
              e.key === 'ArrowRight' ||
              e.key === 'Home' ||
              e.key === 'End'
            ) {
              const textarea = getComposerTextarea(composerInputRef.current)
              onChange(value, textarea?.selectionStart ?? value.length)
            }
          }}
          onBlur={() => {
            window.setTimeout(() => skillMenu?.onClose(), 120)
          }}
          autoSize={{ minRows: 1, maxRows: 12 }}
          variant="borderless"
          placeholder={placeholder}
          className="app-composer-input"
          onKeyDown={(e) => {
            if (!skillMenuOpen || !skillMenu) return
            if (e.key === 'Escape') {
              e.preventDefault()
              skillMenu.onClose()
              return
            }
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              if (!filteredSkills.length) return
              skillMenu.onActiveIndexChange((skillMenu.activeIndex + 1) % filteredSkills.length)
              return
            }
            if (e.key === 'ArrowUp') {
              e.preventDefault()
              if (!filteredSkills.length) return
              skillMenu.onActiveIndexChange(
                (skillMenu.activeIndex - 1 + filteredSkills.length) % filteredSkills.length
              )
              return
            }
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              const skill = filteredSkills[skillMenu.activeIndex]
              if (skill) skillMenu.onSelect(skill)
            }
          }}
          onPressEnter={(e) => {
            if (skillMenuOpen) {
              e.preventDefault()
              return
            }
            if (!e.shiftKey) {
              e.preventDefault()
              if (!isRun) onSend()
            }
          }}
        />
        <div className="app-composer-footer">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Dropdown
              menu={{
                items: composerPlusMenuItems,
                onClick: handleComposerPlusMenuClick
              }}
              trigger={['hover']}
              placement="topLeft"
            >
              <Button
                type="default"
                className="app-composer-plus-btn"
                icon={<PlusOutlined />}
                aria-label="对话模式"
              />
            </Dropdown>
            {composerMode !== 'build' ? (
              <span className="app-composer-mode-hint">{composerModeLabel(composerMode)}</span>
            ) : null}
          </div>
          <div className="app-composer-actions">
            {showSendButton ? (
              <Button
                type="primary"
                icon={<SendOutlined />}
                onClick={() => onSend()}
                disabled={sendDisabled || !canSend}
                className="app-send-btn"
              >
                发送
              </Button>
            ) : null}
            {showStopButton ? (
              <Button danger icon={<StopOutlined />} onClick={onStop} className="app-stop-btn">
                停止
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}
