# 架构

- **Deciders:** Wang Zhang

## Context

这是整个系统的全局架构说明。

## Decision

### 物理文件夹的划分

- apps
- services
- packages

根据实际场景和最佳实践划分，apps表示客户端，services表示服务端，packages表示公用包，公用包可以全局使用或者较少依赖环境的独立包，代表了较强的通用性。

### 开发任务的划分

- apps/admin 已移除。
- apps/cli 已移除。
- apps/phone 已移除。
- services/api 已移除。
- services/langfuse-local 已移除。

- apps/desktop 目前阶段正在开发。
- apps/landing 目前阶段正在开发。
- packages 目前阶段正在开发。
- services/native 目前阶段正在开发。

### 当前阶段的系统心智架构

```
┌────────────────────────┐
│        Desktop         │
└────────────────────────┘
            ▲
            │
     http协议,AG-UI协议
            │
            ▼
┌────────────────────────┐
│         Server         │
└────────────────────────┘
            ▲
            │
           API
            │
            ▼
┌────────────────────────┐
│         Agent          │
└────────────────────────┘

```

说明：

- Desktop采用瘦客户端架构，主要由渲染进程和Server通信，少量主进程也可以和Server通信。瘦客户端可以保持主进程的稳定性，以及对提升开发效率明显。
- Server 负责和 Agent 进行交互，Agent不能直接和Desktop进行交互。这样后续需要不同功能的扩展服务或者在服务器运行Agent的情况下更易扩展。

## Alternatives considered

## Consequences
