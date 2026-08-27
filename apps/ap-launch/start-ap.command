#!/usr/bin/env bash
# AI 任务助手 — macOS 双击启动
# 只在脚本所在目录执行；内部命令不在用户可见文案中出现。

set -u

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "此启动文件仅支持 macOS。"
  read -r _
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

NODE_VERSION="25.9.0"
NODE_VERSION_TAG="v${NODE_VERSION}"
AP_CONFIG="${SCRIPT_DIR}/.agents/ap-config/ap-config.json"

STEP1_TITLE="准备运行环境"
STEP2_TITLE="安装 AI 任务助手"
STEP3_TITLE="检查更新"
STEP4_TITLE="准备项目"
STEP5_TITLE="打开看板"

# 橘黄色（RGB 255,200,90）；非 TTY 时不着色
if [[ -t 1 ]]; then
  AP_ORANGE=$'\033[38;2;255;200;90m'
  AP_RESET=$'\033[0m'
else
  AP_ORANGE=''
  AP_RESET=''
fi

AP_SEP="============================================================"

# ---------- 用户可见输出 ----------
say() {
  printf '%s%s%s\n' "${AP_ORANGE}" "$1" "${AP_RESET}"
}

show_logo() {
  printf '\033]0;OpenWorker\007'
  if [[ -t 1 ]] && command -v clear >/dev/null 2>&1; then
    clear
  fi
  echo ""
  while IFS= read -r line; do
    printf '%s%s%s\n' "${AP_ORANGE}" "${line}" "${AP_RESET}"
  done <<'EOF'
                                  /\_/\ 
                                ( >o.o< )
                               (   =w=   )
                              (           )
                             (             )
                            (               )~
                             (_____________)
                               u         u
EOF
}

show_welcome() {
  show_logo
  echo ""
  say "你好，这里是 AI 任务助手。"
  say "我先帮你做一点准备工作，一共 5 小步，通常很快。"
  say "准备的时候请先不要关掉这个窗口，好了之后会帮你打开看板。"
  echo ""
}

show_step() {
  echo ""
  say "${AP_SEP}"
  say "[${1}/5] ${2}"
}

show_indent() {
  say "${1}"
}

pause_exit() {
  echo ""
  say "按 Enter 键关闭本窗口。"
  read -r _
  exit "${1:-0}"
}

fail_step() {
  local step_num="$1"
  local step_title="$2"
  local reason="$3"
  echo ""
  say "抱歉，第 ${step_num} 步没有完成：${step_title}"
  echo ""
  say "${reason}"
  say "请先看看上面的说明。常见原因是网络不通，稍后再试一次即可。"
  say "需要帮助时，把本窗口内容截图保存下来。"
  pause_exit 1
}

# ---------- 运行环境 ----------
resolve_node_home() {
  echo "${HOME}/.openworker/nodejs/${NODE_VERSION}"
}

detect_platform() {
  local arch
  arch="$(uname -m)"
  case "${arch}" in
    arm64 | aarch64) echo "darwin-arm64" ;;
    x86_64) echo "darwin-x64" ;;
    *) echo "unsupported" ;;
  esac
}

node_binary() {
  local home="$1"
  echo "${home}/bin/node"
}

node_version_ok() {
  local bin
  bin="$(command -v node 2>/dev/null || true)"
  if [[ -z "${bin}" ]]; then
    return 1
  fi
  local ver
  ver="$("${bin}" -v 2>/dev/null || true)"
  [[ "${ver}" == "${NODE_VERSION_TAG}" ]]
}

use_node_from_home() {
  local home="$1"
  local bin
  bin="$(node_binary "${home}")"
  if [[ -x "${bin}" ]]; then
    export PATH="${home}/bin:${PATH}"
    return 0
  fi
  return 1
}

ensure_node_on_path() {
  if node_version_ok; then
    return 0
  fi
  local home
  home="$(resolve_node_home)"
  if use_node_from_home "${home}" && node_version_ok; then
    return 0
  fi
  return 1
}

install_portable_node() {
  local platform home url archive tmpdir extract_dir node_bin
  platform="$(detect_platform)"
  if [[ "${platform}" == "unsupported" ]]; then
    fail_step 1 "${STEP1_TITLE}" "当前 Mac 暂时不支持自动准备运行环境。"
  fi

  home="$(resolve_node_home)"
  mkdir -p "$(dirname "${home}")"

  archive="node-${NODE_VERSION_TAG}-${platform}.tar.gz"
  url="https://nodejs.org/dist/${NODE_VERSION_TAG}/${archive}"

  tmpdir="$(mktemp -d)"

  show_indent "正在下载运行环境，请稍候…"
  if ! curl -fL --progress-bar -o "${tmpdir}/${archive}" "${url}"; then
    rm -rf "${tmpdir}"
    fail_step 1 "${STEP1_TITLE}" "下载运行环境没有成功，请检查网络后重试。"
  fi

  show_indent "正在解压，请稍候…"
  if ! tar -xzf "${tmpdir}/${archive}" -C "${tmpdir}"; then
    rm -rf "${tmpdir}"
    fail_step 1 "${STEP1_TITLE}" "运行环境文件可能不完整，关掉窗口再打开一次试试。"
  fi

  extract_dir="${tmpdir}/node-${NODE_VERSION_TAG}-${platform}"
  rm -rf "${home}"
  mkdir -p "${home}"
  cp -R "${extract_dir}/." "${home}/"
  rm -rf "${tmpdir}"

  node_bin="$(node_binary "${home}")"
  if [[ ! -x "${node_bin}" ]]; then
    fail_step 1 "${STEP1_TITLE}" "运行环境没有准备好，请关掉窗口再试一次。"
  fi

  local ver
  ver="$("${node_bin}" -v 2>/dev/null || true)"
  if [[ "${ver}" != "${NODE_VERSION_TAG}" ]]; then
    fail_step 1 "${STEP1_TITLE}" "运行环境版本不对，请关掉窗口再试一次。"
  fi

  export PATH="${home}/bin:${PATH}"
}

step_prepare_runtime() {
  show_step 1 "${STEP1_TITLE}"
  if ensure_node_on_path; then
    show_indent "已经就绪，继续下一步。"
    return 0
  fi
  install_portable_node
  show_indent "运行环境已准备好。"
}

npm_cmd() {
  if command -v npm >/dev/null 2>&1; then
    echo "npm"
    return 0
  fi
  return 1
}

ap_installed() {
  if ! command -v ap >/dev/null 2>&1; then
    return 1
  fi
  local npm
  npm="$(npm_cmd)" || return 1
  "${npm}" list -g --depth=0 @openworker/ap >/dev/null 2>&1
}

step_install_assistant() {
  show_step 2 "${STEP2_TITLE}"
  if ap_installed; then
    show_indent "已经安装过，继续下一步。"
    return 0
  fi
  local npm
  npm="$(npm_cmd)" || fail_step 2 "${STEP2_TITLE}" "暂时找不到安装工具，请先完成上一步。"
  show_indent "正在安装 AI 任务助手，可能需要一点时间…"
  if ! "${npm}" install @openworker/ap -g; then
    fail_step 2 "${STEP2_TITLE}" "安装没有成功，请检查网络；若多次失败，把窗口截图发给支持的人。"
  fi
  if ! command -v ap >/dev/null 2>&1; then
    fail_step 2 "${STEP2_TITLE}" "安装后仍无法启动，请把窗口截图发给支持的人。"
  fi
  show_indent "AI 任务助手已安装。"
}

step_update_assistant() {
  show_step 3 "${STEP3_TITLE}"
  local npm
  npm="$(npm_cmd)" || fail_step 3 "${STEP3_TITLE}" "暂时找不到更新工具，请把窗口截图发给支持的人。"
  show_indent "正在确认是否有新版本，请稍候…"
  if ! "${npm}" update @openworker/ap -g; then
    fail_step 3 "${STEP3_TITLE}" "更新没有成功，请检查网络；若多次失败，把窗口截图发给支持的人。"
  fi
  if ! command -v ap >/dev/null 2>&1; then
    fail_step 3 "${STEP3_TITLE}" "更新后仍无法启动，请把窗口截图发给支持的人。"
  fi
  show_indent "已经是最新版本。"
}

project_initialized() {
  [[ -f "${AP_CONFIG}" ]]
}

step_prepare_project() {
  show_step 4 "${STEP4_TITLE}"
  if project_initialized; then
    show_indent "这个文件夹已经准备过，继续下一步。"
    return 0
  fi
  show_indent "正在准备项目文件…"
  if ! ap init -C "${SCRIPT_DIR}"; then
    fail_step 4 "${STEP4_TITLE}" "项目没有准备好，请确认这个文件夹可以写入。"
  fi
  if ! project_initialized; then
    fail_step 4 "${STEP4_TITLE}" "项目没有准备好，请确认这个文件夹可以写入。"
  fi
  show_indent "项目已准备好。"
}

step_open_board() {
  show_step 5 "${STEP5_TITLE}"
  show_indent "即将在浏览器中打开任务看板。"
  show_indent "请保持本窗口开着；关掉窗口，看板也会一起关掉。"
  echo ""
  local exit_code=0
  ap view -C "${SCRIPT_DIR}" || exit_code=$?
  echo ""
  if [[ "${exit_code}" -ne 0 ]]; then
    fail_step 5 "${STEP5_TITLE}" "看板没能打开，请保留上面的说明，关掉后重试。"
  fi
  say "看板已关闭。"
  pause_exit 0
}

# ---------- 主流程 ----------
show_welcome
step_prepare_runtime
step_install_assistant
step_update_assistant
step_prepare_project
step_open_board
