import { Button, Input } from 'antd'

import type { ChatPlanCardProps } from './types.js'

const { TextArea } = Input

/**
 * 计划模式产出的可编辑计划卡。
 *
 * 宿主从 CUSTOM(openworker.plan) 解析后传入，便于用户编辑后再构建。
 *
 * @param props - 计划正文与保存/构建操作
 */
export function ChatPlanCard({
  title,
  markdown,
  onMarkdownChange,
  onSave,
  onBuild,
  saving = false,
  building = false,
  buildDisabled = false
}: ChatPlanCardProps) {
  return (
    <div className="app-plan-card" data-testid="plan-card">
      <div className="app-plan-card-header">
        <div className="app-plan-card-title">{title?.trim() || '实施计划'}</div>
        <div className="app-plan-card-actions">
          <Button size="small" onClick={() => onSave()} loading={saving}>
            保存到工作区
          </Button>
          <Button
            type="primary"
            size="small"
            className="app-plan-card-build-btn"
            onClick={() => onBuild()}
            loading={building}
            disabled={buildDisabled}
          >
            开始构建
          </Button>
        </div>
      </div>
      <TextArea
        className="app-plan-card-editor"
        value={markdown}
        onChange={(e) => onMarkdownChange(e.target.value)}
        autoSize={{ minRows: 2, maxRows: 5 }}
      />
      <div className="app-plan-card-hint">
        可继续在「计划」模式追问细化，或直接编辑上文后点击「开始构建」。
      </div>
    </div>
  )
}
