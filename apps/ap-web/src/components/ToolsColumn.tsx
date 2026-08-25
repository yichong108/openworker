/**
 * 工具集列占位：第一期不接 API、不提供操作。
 */
export function ToolsColumn() {
  return (
    <section className="flex min-h-0 min-w-0 flex-col rounded-2xl border border-dashed border-[var(--panel-edge)] bg-[var(--panel)]/60 p-4">
      <header className="mb-3 flex items-baseline justify-between">
        <h2 className="font-display text-xl tracking-wide text-[var(--paper)]">工具集</h2>
      </header>
      <div className="flex flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-[var(--panel-edge)] px-4 py-10 text-center">
        <p className="font-display text-lg text-[var(--brass)]">即将推出</p>
        <p className="mt-2 max-w-[16rem] text-sm leading-6 text-[var(--mist)]">
          此列预留给后续工具入口，当前不读取任务、不提供操作。
        </p>
      </div>
    </section>
  )
}
