import Link from 'next/link'
import { withBasePath } from '../lib/base-path'

const GITHUB_URL = 'https://github.com/yichong108/openworker'

export default function Home() {
  return (
    <main className="bg-weave min-h-screen text-[var(--ink)]">
      <header className="absolute top-0 left-0 right-0 z-20">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <span className="font-display text-lg font-semibold tracking-tight text-white">
            OpenWorker
          </span>
          <nav className="flex items-center gap-5 text-sm text-white/80">
            <a href="#features" className="transition hover:text-white">
              功能
            </a>
            <Link href="/docs" className="transition hover:text-white">
              文档
            </Link>
            <a
              href={GITHUB_URL}
              className="transition hover:text-white"
              target="_blank"
              rel="noreferrer"
            >
              GitHub
            </a>
          </nav>
        </div>
      </header>

      <section className="relative flex min-h-screen items-end overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url('${withBasePath('/openworker-ui.png')}')` }}
          aria-hidden
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[var(--panel)] via-[rgba(12,18,34,0.78)] to-[rgba(12,18,34,0.45)]" />
        <div className="relative z-10 mx-auto w-full max-w-6xl px-6 pb-20 pt-32">
          <p className="font-display anim-rise text-5xl font-semibold tracking-tight text-white sm:text-7xl">
            OpenWorker
          </p>
          <h1 className="anim-rise anim-delay-1 mt-5 max-w-2xl text-2xl font-medium leading-snug text-white/95 sm:text-3xl">
            日常信息处理的 AI 伙伴，帮助你解决问题
          </h1>
          <p className="anim-rise anim-delay-2 mt-4 max-w-xl text-base leading-relaxed text-white/75 sm:text-lg">
            本地优先的桌面智能助手：对话、整理资料、在工作区里完成任务，需要时再接入外部工具。
          </p>
          <div className="anim-rise anim-delay-3 mt-8 flex flex-wrap gap-3">
            <Link
              href="/docs#introduction"
              className="rounded-md bg-[var(--teal-bright)] px-5 py-3 text-sm font-semibold text-[var(--panel)] transition hover:bg-white"
            >
              了解产品
            </Link>
            <Link
              href="/docs#quick-start"
              className="rounded-md border border-white/35 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
            >
              快速开始
            </Link>
          </div>
        </div>
      </section>

      <section id="features" className="scroll-mt-8 border-t border-[var(--line)]">
        <div className="mx-auto grid max-w-6xl gap-12 px-6 py-20 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
          <div className="anim-fade">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--teal)]">
              产品能力
            </p>
            <h2 className="font-display mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
              把 AI 助手放进你的电脑里
            </h2>
            <p className="mt-4 text-lg leading-relaxed text-[var(--ink-soft)]">
              OpenWorker
              桌面端（以及配套移动端）面向日常使用：对话、整理资料、在工作区里完成任务。数据尽量留在本地，工具按需接入。
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/docs#introduction"
                className="rounded-md bg-[var(--ink)] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[var(--ink-soft)]"
              >
                阅读产品说明
              </Link>
              <Link
                href="/docs#installation"
                className="rounded-md border border-[var(--line)] bg-white/60 px-5 py-3 text-sm font-semibold transition hover:bg-white"
              >
                安装指南
              </Link>
            </div>
          </div>

          <ul className="space-y-5 text-[var(--ink-soft)]">
            <FeaturePoint
              title="智能对话与任务执行"
              description="用自然语言提问、写文档、改代码、跑流程。助手会调用工具，并把思考与操作过程展示在时间线里。"
            />
            <FeaturePoint
              title="Workspace 工作区"
              description="围绕项目文件夹组织会话与上下文，让助手真正读懂你正在做的事，而不是只会闲聊。"
            />
            <FeaturePoint
              title="Skills 与斜杠菜单"
              description="内置与自定义技能（如排错、代码评审、工作流）。在输入框输入 / 即可快速调用。"
            />
            <FeaturePoint
              title="知识库与记忆"
              description="可结合知识库检索回答问题；会话会压缩关键信息，并逐步形成偏好与项目画像，让后续对话更贴合你。"
            />
            <FeaturePoint
              title="本地优先与可扩展工具"
              description="核心体验偏本地与隐私友好。需要连接外部能力时，可通过 MCP 接入文件、数据库、API 等服务。"
            />
          </ul>
        </div>
      </section>

      <section className="border-t border-[var(--line)]">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-16 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="font-display text-2xl font-semibold tracking-tight">从文档开始</h2>
            <p className="mt-2 max-w-xl text-[var(--ink-soft)]">
              了解产品定位，然后按安装与快速开始上手。产品仍在 alpha，功能与文档会持续完善。
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/docs"
              className="rounded-md bg-[var(--ink)] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[var(--ink-soft)]"
            >
              打开文档
            </Link>
            <Link
              href="/docs#quick-start"
              className="rounded-md border border-[var(--line)] bg-white/70 px-5 py-3 text-sm font-semibold transition hover:bg-white"
            >
              快速开始
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-[var(--line)] py-8 text-center text-sm text-[var(--ink-soft)]">
        OpenWorker · MIT License ·{' '}
        <a
          href={GITHUB_URL}
          className="underline-offset-2 hover:underline"
          target="_blank"
          rel="noreferrer"
        >
          GitHub
        </a>
      </footer>
    </main>
  )
}

function FeaturePoint({ title, description }: { title: string; description: string }) {
  return (
    <li className="border-l-2 border-[var(--teal)] pl-4">
      <h3 className="text-base font-semibold text-[var(--ink)]">{title}</h3>
      <p className="mt-1 text-sm leading-relaxed">{description}</p>
    </li>
  )
}
