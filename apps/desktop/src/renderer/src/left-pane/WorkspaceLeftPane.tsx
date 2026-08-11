import { SettingsModal } from './modals'
import { useWorkspaceLeftPane } from './useWorkspaceLeftPane'
import {
  FolderAddOutlined,
  InboxOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  PlusOutlined,
  RightOutlined,
  SettingOutlined
} from '@ant-design/icons'
import { Button, Dropdown, Input, Modal, Typography } from 'antd'
import type { DragEvent } from 'react'
import { createPortal } from 'react-dom'

const { Text } = Typography

export type WorkspaceLeftPaneProps = {
  /** 顶栏左侧挂载点：侧栏收起时仅将「展开」按钮 portal 到此，展开时按钮在侧栏内 */
  leftTogglePortalHost?: HTMLElement | null
}

export function WorkspaceLeftPane({ leftTogglePortalHost }: WorkspaceLeftPaneProps) {
  const p = useWorkspaceLeftPane()

  const leftToggleInTopbar = (
    <Button
      type="text"
      icon={<MenuUnfoldOutlined />}
      onClick={p.handleSidebarCollapseToggle}
      className="app-settings-btn app-sidebar-collapse-btn app-topbar-pane-toggle"
      title="展开侧边栏"
      aria-label="展开侧边栏"
    />
  )

  return (
    <>
      {p.isSidebarCollapsed && leftTogglePortalHost
        ? createPortal(leftToggleInTopbar, leftTogglePortalHost)
        : null}
      <div
        className={`app-sidebar ${p.isSidebarCollapsed ? 'is-collapsed' : ''}`}
        style={{ width: `${p.sidebarWidth}px` }}
      >
        <div className={`app-sidebar-inner ${p.isSidebarCollapsed ? 'is-collapsed' : ''}`}>
          <div className="app-sidebar-header">
            {!p.isSidebarCollapsed ? (
              <Button
                type="text"
                icon={<MenuFoldOutlined />}
                onClick={p.handleSidebarCollapseToggle}
                className="app-settings-btn app-sidebar-collapse-btn"
                title="收起侧边栏"
                aria-label="收起侧边栏"
              />
            ) : null}
          </div>
          {!p.isSidebarCollapsed && (
            <div className="app-new-session-wrap">
              <Button
                block
                type="primary"
                icon={<PlusOutlined />}
                className="app-new-session-btn"
                onClick={p.openBlankConversationForActiveWorkspace}
              >
                新会话
              </Button>
            </div>
          )}
          {!p.isSidebarCollapsed && (
            <div className="app-workspace-section-header">
              <Text className="app-workspace-section-title">工作区</Text>
              <button
                type="button"
                className="app-workspace-add-btn"
                aria-label="添加工作区"
                title="添加工作区"
                onClick={() => void p.pickWorkspace()}
              >
                <FolderAddOutlined aria-hidden />
              </button>
            </div>
          )}
          {!p.isSidebarCollapsed && (
            <div className="app-workspace-tree">
              {p.workspacesForSidebar.length === 0 ? (
                <div className="app-workspace-tree-empty" role="status">
                  <Text type="secondary">{p.workspaceTreeEmptyMessage}</Text>
                </div>
              ) : (
                p.workspacesForSidebar.map((workspace) => {
                  const isActiveWorkspace = workspace.id === p.activeWorkspaceId
                  const isExpanded = p.expandedWorkspaceIds.has(workspace.id)
                  const dropMarkerPlacement =
                    !!p.draggingWorkspaceId &&
                    p.draggingWorkspaceId !== workspace.id &&
                    p.workspaceDropMarker?.workspaceId === workspace.id
                      ? p.workspaceDropMarker.placement
                      : null
                  const workspaceSessions = p.sessionsByWorkspaceForSidebar[workspace.id] || []
                  return (
                    <div
                      key={workspace.id}
                      className={`app-workspace-node ${isActiveWorkspace ? 'is-active' : ''} ${dropMarkerPlacement === 'before' ? 'is-drop-before' : ''} ${dropMarkerPlacement === 'after' ? 'is-drop-after' : ''}`}
                    >
                      <div
                        className="app-workspace-node-header is-draggable"
                        draggable
                        onDragStart={(event: DragEvent<HTMLDivElement>) =>
                          p.handleWorkspaceDragStart(event, workspace.id)
                        }
                        onDragOver={(event: DragEvent<HTMLDivElement>) =>
                          p.handleWorkspaceDragOver(event, workspace.id)
                        }
                        onDrop={(event: DragEvent<HTMLDivElement>) =>
                          void p.handleWorkspaceDrop(event, workspace.id)
                        }
                        onDragEnd={p.handleWorkspaceDragEnd}
                      >
                        <button
                          type="button"
                          className="app-workspace-chevron-btn"
                          aria-label={isExpanded ? '收起工作区会话' : '展开工作区会话'}
                          onClick={(event) => {
                            event.stopPropagation()
                            p.handleWorkspaceToggle(workspace.id)
                          }}
                        >
                          <RightOutlined
                            className={`app-workspace-chevron ${isExpanded ? 'is-open' : ''}`}
                            aria-hidden="true"
                          />
                        </button>
                        {p.handleRemoveWorkspaceFromSidebar ? (
                          <Dropdown
                            menu={{
                              items: [
                                {
                                  key: 'remove-from-sidebar',
                                  label: '从侧边栏移除',
                                  onClick: () =>
                                    void p.handleRemoveWorkspaceFromSidebar?.(workspace)
                                }
                              ]
                            }}
                            trigger={['contextMenu']}
                          >
                            <span className="app-workspace-name-btn" role="presentation">
                              <Text className="app-workspace-name">{workspace.name}</Text>
                            </span>
                          </Dropdown>
                        ) : (
                          <span className="app-workspace-name-btn">
                            <Text className="app-workspace-name">{workspace.name}</Text>
                          </span>
                        )}
                        <button
                          type="button"
                          className="app-workspace-add-session-btn"
                          aria-label={`在${workspace.name}下打开空白对话`}
                          title="空白对话"
                          onClick={(event) => {
                            event.stopPropagation()
                            void p.openBlankConversationInWorkspace(workspace.id)
                          }}
                        >
                          <PlusOutlined />
                        </button>
                      </div>
                      {isExpanded && (
                        <div className="app-session-sublist">
                          {workspaceSessions.map((session) => {
                            const isDraft = session.id === '__draft__'
                            const isActiveSession =
                              session.id === p.activeSessionId ||
                              (isDraft && p.activeSessionId === null)
                            const sessionRow = (
                              <div
                                className={`app-session-item app-session-item-sub ${isActiveSession ? 'is-active' : ''}`}
                                onClick={() => {
                                  if (isDraft) return
                                  void p.handleSessionClick(workspace.id, session.id)
                                }}
                              >
                                <div className="app-session-item-inner">
                                  <div className="app-session-title">{session.name}</div>
                                  {!isDraft ? (
                                    <button
                                      type="button"
                                      className="app-session-archive-btn"
                                      title="归档"
                                      aria-label="归档"
                                      onClick={(event) => {
                                        event.stopPropagation()
                                        p.handleRemoveSessionFromSidebar(workspace.id, session)
                                      }}
                                    >
                                      <InboxOutlined aria-hidden />
                                    </button>
                                  ) : null}
                                </div>
                              </div>
                            )
                            if (isDraft) return <div key={session.id}>{sessionRow}</div>
                            return (
                              <Dropdown
                                key={session.id}
                                menu={{
                                  items: [
                                    {
                                      key: 'rename',
                                      label: '重命名',
                                      onClick: () => p.handleSessionRenameRequest(session)
                                    }
                                  ]
                                }}
                                trigger={['contextMenu']}
                              >
                                {sessionRow}
                              </Dropdown>
                            )
                          })}
                          {workspaceSessions.length === 0 && (
                            <div className="app-session-placeholder">当前工作区暂无会话</div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })
              )}
            </div>
          )}
          {!p.isSidebarCollapsed ? (
            <div className="app-sidebar-footer">
              <div className="app-sidebar-footer-spacer" />
              <Button
                type="text"
                icon={<SettingOutlined />}
                onClick={p.openSettings}
                className="app-settings-btn app-sidebar-footer-settings"
                title="设置"
                aria-label="设置"
              />
            </div>
          ) : null}
        </div>
      </div>
      <div
        className={`app-sidebar-resizer ${p.isSidebarResizing ? 'is-dragging' : ''} ${p.isSidebarCollapsed ? 'is-hidden' : ''}`}
        role="separator"
        aria-orientation="vertical"
        aria-label="调整侧边栏宽度"
        onMouseDown={p.isSidebarCollapsed ? undefined : p.handleSidebarResizeStart}
      />
      <SettingsModal open={p.settingsOpen} onClose={p.closeSettings} />

      <Modal
        title="重命名会话"
        open={!!p.renameModal.renameId}
        onOk={p.renameModal.confirmRename}
        onCancel={p.renameModal.closeRename}
        okText="保存"
        destroyOnHidden
        centered
      >
        <Input
          value={p.renameModal.renameName}
          onChange={(e) => p.renameModal.setRenameName(e.target.value)}
          placeholder="名称"
        />
      </Modal>
    </>
  )
}
