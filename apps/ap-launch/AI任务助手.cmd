@echo off
setlocal EnableExtensions EnableDelayedExpansion
chcp 936 >nul 2>&1
title OpenWorker
cd /d "%~dp0"
set "SCRIPT_DIR=%CD%"
set "NODE_VERSION=25.9.0"
set "NODE_VERSION_TAG=v%NODE_VERSION%"
set "AP_CONFIG=%SCRIPT_DIR%\.agents\ap-config\ap-config.json"
set "NODE_HOME=%LOCALAPPDATA%\OpenWorker\nodejs\%NODE_VERSION%"

goto :main

:init_color
if defined AP_COLOR_INIT exit /b 0
for /F "delims=" %%a in ('powershell -NoProfile -Command "[char]27"') do set "ESC=%%a"
set "AP_ORANGE=!ESC![38;2;255;200;90m"
set "AP_RESET=!ESC![0m"
set "AP_COLOR_INIT=1"
exit /b 0

:say
call :init_color
set "AP_SAY=%~1"
echo !AP_ORANGE!!AP_SAY!!AP_RESET!
set "AP_SAY="
exit /b 0

:show_logo
call :say "                                  /\_/\ "
call :say "                                ( >o.o< )"
call :say "                               (   =w=   )"
call :say "                              (           )"
call :say "                             (             )"
call :say "                            (               )~"
call :say "                             (_____________)"
call :say "                               u         u"
exit /b 0

:show_welcome
title OpenWorker
cls
echo.
call :show_logo
echo.
call :say "你好，这里是 AI 任务助手。"
call :say "我先帮你做一点准备工作，一共 5 小步，通常很快。"
call :say "准备的时候请先不要关掉这个窗口，好了之后会帮你打开看板。"
echo.
exit /b 0

:show_step
echo.
call :say "============================================================"
call :say "[%~1/5] %~2"
exit /b 0

:show_indent
call :say "%~1"
exit /b 0

:pause_exit
echo.
call :say "按任意键关闭本窗口。"
pause >nul
exit /b %~1

:fail_step
echo.
call :say "抱歉，第 %~1 步没有完成：%~2"
echo.
call :say "%~3"
call :say "请先看看上面的说明。常见原因是网络不通，稍后再试一次即可。"
call :say "需要帮助时，把本窗口内容截图保存下来。"
echo.
call :say "按任意键关闭本窗口。"
pause >nul
exit /b 1

:ensure_node_path
set "PATH=%NODE_HOME%;%APPDATA%\npm;%PATH%"
exit /b 0

:node_version_ok
set "NODE_VER="
for /f "delims=" %%v in ('node -v 2^>nul') do set "NODE_VER=%%v"
if "!NODE_VER!"=="%NODE_VERSION_TAG%" exit /b 0
exit /b 1

:step_prepare_runtime
call :show_step 1 "准备运行环境"
call :node_version_ok
if not errorlevel 1 (
  call :show_indent "已经就绪，继续下一步。"
  exit /b 0
)

if exist "%NODE_HOME%\node.exe" (
  call :ensure_node_path
  call :node_version_ok
  if not errorlevel 1 (
    call :show_indent "已经就绪，继续下一步。"
    exit /b 0
  )
)

call :install_portable_node
if errorlevel 1 exit /b 1
call :show_indent "运行环境已准备好。"
exit /b 0

:install_portable_node
set "ARCH=x64"
if /i "%PROCESSOR_ARCHITECTURE%"=="ARM64" set "ARCH=arm64"
if /i "%PROCESSOR_ARCHITEW6432%"=="ARM64" set "ARCH=arm64"

set "ARCHIVE=node-%NODE_VERSION_TAG%-win-%ARCH%.zip"
set "URL=https://nodejs.org/dist/%NODE_VERSION_TAG%/%ARCHIVE%"
set "TMP_DIR=%TEMP%\openworker-node-%RANDOM%"
mkdir "%TMP_DIR%" 2>nul

call :show_indent "正在下载运行环境，请稍候..."
curl -fL --progress-bar -o "%TMP_DIR%\%ARCHIVE%" "%URL%"
if errorlevel 1 (
  rmdir /s /q "%TMP_DIR%" 2>nul
  call :fail_step 1 "准备运行环境" "下载运行环境没有成功，请检查网络后重试。"
  exit /b 1
)

call :show_indent "正在解压，请稍候..."
tar -xf "%TMP_DIR%\%ARCHIVE%" -C "%TMP_DIR%"
if errorlevel 1 (
  rmdir /s /q "%TMP_DIR%" 2>nul
  call :fail_step 1 "准备运行环境" "运行环境文件可能不完整，关掉窗口再打开一次试试。"
  exit /b 1
)

if exist "%NODE_HOME%" rmdir /s /q "%NODE_HOME%" 2>nul
mkdir "%NODE_HOME%" 2>nul
xcopy /E /I /Y "%TMP_DIR%\node-%NODE_VERSION_TAG%-win-%ARCH%\*" "%NODE_HOME%\" >nul
rmdir /s /q "%TMP_DIR%" 2>nul

if not exist "%NODE_HOME%\node.exe" (
  call :fail_step 1 "准备运行环境" "运行环境没有准备好，请关掉窗口再试一次。"
  exit /b 1
)

call :ensure_node_path
call :node_version_ok
if errorlevel 1 (
  call :fail_step 1 "准备运行环境" "运行环境版本不对，请关掉窗口再试一次。"
  exit /b 1
)
exit /b 0

:ap_installed
where ap >nul 2>&1
if errorlevel 1 exit /b 1
call npm list -g --depth=0 @openworker/ap >nul 2>&1
if errorlevel 1 exit /b 1
exit /b 0

:step_install_assistant
call :show_step 2 "安装 AI 任务助手"
call :ap_installed
if not errorlevel 1 (
  call :show_indent "已经安装过，继续下一步。"
  exit /b 0
)

where npm >nul 2>&1
if errorlevel 1 (
  call :fail_step 2 "安装 AI 任务助手" "暂时找不到安装工具，请先完成上一步。"
  exit /b 1
)

call :show_indent "正在安装 AI 任务助手，可能需要一点时间..."
call npm install @openworker/ap -g
if errorlevel 1 (
  call :fail_step 2 "安装 AI 任务助手" "安装没有成功，请检查网络；若多次失败，把窗口截图发给支持的人。"
  exit /b 1
)

where ap >nul 2>&1
if errorlevel 1 (
  call :fail_step 2 "安装 AI 任务助手" "安装后仍无法启动，请把窗口截图发给支持的人。"
  exit /b 1
)

call :show_indent "AI 任务助手已安装。"
exit /b 0

:step_update_assistant
call :show_step 3 "检查更新"
where npm >nul 2>&1
if errorlevel 1 (
  call :fail_step 3 "检查更新" "暂时找不到更新工具，请把窗口截图发给支持的人。"
  exit /b 1
)

call :show_indent "正在确认是否有新版本，请稍候..."
call npm update @openworker/ap -g
if errorlevel 1 (
  call :fail_step 3 "检查更新" "更新没有成功，请检查网络；若多次失败，把窗口截图发给支持的人。"
  exit /b 1
)

where ap >nul 2>&1
if errorlevel 1 (
  call :fail_step 3 "检查更新" "更新后仍无法启动，请把窗口截图发给支持的人。"
  exit /b 1
)

call :show_indent "已经是最新版本。"
exit /b 0

:step_prepare_project
call :show_step 4 "准备项目"
if exist "%AP_CONFIG%" (
  call :show_indent "这个文件夹已经准备过，继续下一步。"
  exit /b 0
)

call :show_indent "正在准备项目文件..."
call ap init -C "%SCRIPT_DIR%"
if errorlevel 1 (
  call :fail_step 4 "准备项目" "项目没有准备好，请确认这个文件夹可以写入。"
  exit /b 1
)

if not exist "%AP_CONFIG%" (
  call :fail_step 4 "准备项目" "项目没有准备好，请确认这个文件夹可以写入。"
  exit /b 1
)

call :show_indent "项目已准备好。"
exit /b 0

:step_open_board
call :show_step 5 "打开看板"
call :show_indent "即将在浏览器中打开任务看板。"
call :show_indent "请保持本窗口开着；关掉窗口，看板也会一起关掉。"
echo.

call ap view -C "%SCRIPT_DIR%"
set "VIEW_EXIT=!ERRORLEVEL!"
echo.
if not "!VIEW_EXIT!"=="0" (
  call :fail_step 5 "打开看板" "看板没能打开，请保留上面的说明，关掉后重试。"
  exit /b 1
)

call :say "看板已关闭。"
call :pause_exit 0
exit /b 0

:main
call :init_color
call :show_welcome

call :step_prepare_runtime
if errorlevel 1 goto :main_fail

call :step_install_assistant
if errorlevel 1 goto :main_fail

call :step_update_assistant
if errorlevel 1 goto :main_fail

call :step_prepare_project
if errorlevel 1 goto :main_fail

call :step_open_board
set "MAIN_EXIT=!ERRORLEVEL!"
if not "!MAIN_EXIT!"=="0" goto :main_fail
exit /b 0

:main_fail
exit /b 1