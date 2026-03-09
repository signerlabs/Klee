# Types 类型系统

## 概述

Klee 项目采用**按模式分离**的类型管理策略，将 Cloud Mode 和 Private Mode 的类型定义清晰分开：

```
types/
├── index.ts              # 统一导出入口 ⭐️
├── cloud/                # Cloud Mode 类型（从 Hono RPC 推断）
│   ├── index.ts
│   ├── chat.ts
│   ├── knowledge-base.ts
│   ├── agent.ts
│   ├── note.ts
│   └── marketplace.ts
├── local/                # Private Mode 类型（本地定义）
│   ├── index.ts
│   ├── chat.ts
│   ├── conversation.ts
│   └── model.ts
└── shared.ts             # 共享类型（两种模式通用）
```

## 使用方式

### 1. 推荐方式：从统一入口导入

```typescript
// ✅ 推荐：从统一入口导入
import { KnowledgeBase, ChatConfig, LocalChatMessage, OllamaModel } from '@/types'
```

### 2. 按模式导入（更清晰）

```typescript
// Cloud Mode 类型
import { KnowledgeBase, ChatConfig } from '@/types/cloud'

// Private Mode 类型
import { LocalChatMessage, OllamaModel } from '@/types/local'

// 共享类型
import { AppMode, MessageRole } from '@/types/shared'
```

### 3. 直接从具体模块导入（最细粒度）

```typescript
// 只导入知识库相关类型
import { KnowledgeBase, UpdateKnowledgeBasePayload } from '@/types/cloud/knowledge-base'

// 只导入本地聊天类型
import { LocalChatMessage, dbMessageToLocalMessage } from '@/types/local/chat'
```

## Cloud Mode 类型

### 特点

- **自动推断**：从 Hono RPC 自动推断，零手动定义
- **类型安全**：端到端类型安全，从数据库到 UI
- **单一数据源**：后端 schema 是唯一真相来源

### 类型链

```
数据库 Schema (schema.ts)
  ↓ drizzle-zod
Zod 验证器
  ↓ Hono API
Hono RPC 类型
  ↓ InferResponseType/InferRequestType
客户端类型定义 (types/cloud/*.ts)
  ↓
TanStack Query Hooks
  ↓
React Components
```

### 示例

```typescript
import { KnowledgeBase, UpdateKnowledgeBasePayload } from '@/types'

// 1. 在 hook 中使用
function useUpdateKnowledgeBase() {
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: UpdateKnowledgeBasePayload }) => {
      const res = await honoClient.api.knowledgebase[':id'].$put({
        param: { id },
        json: data, // 类型安全 ✅
      })
      return res.json()
    },
  })
}

// 2. 在组件中使用
function KnowledgeBaseCard({ kb }: { kb: KnowledgeBase }) {
  return <div>{kb.name}</div> // 类型安全 ✅
}
```

### 可用类型

#### 知识库 (knowledge-base.ts)
- `KnowledgeBase` - 知识库详情
- `KnowledgeBaseListItem` - 知识库列表项
- `KnowledgeBaseFile` - 知识库文件
- `CreateKnowledgeBasePayload` - 创建知识库请求
- `UpdateKnowledgeBasePayload` - 更新知识库请求

#### 聊天 (chat.ts)
- `Conversation` - 会话
- `ChatConfig` - 聊天配置
- `CreateConversationPayload` - 创建会话请求
- `UpdateConversationPayload` - 更新会话请求
- `CreateChatConfigPayload` - 创建聊天配置请求
- `UpdateChatConfigPayload` - 更新聊天配置请求

#### 笔记 (note.ts)
- `Note` - 笔记

#### 市场 (marketplace.ts)
- `ShareAgentPayload` - 分享 Agent 请求
- `ShareAgentResponse` - 分享 Agent 响应

## Private Mode 类型

### 特点

- **本地定义**：不依赖后端，完全离线
- **SQLite 集成**：与本地数据库 schema 对应
- **转换函数**：提供数据库类型 → 应用层类型的转换

### 示例

```typescript
import {
  LocalChatMessage,
  DBLocalChatMessage,
  dbMessageToLocalMessage,
  localMessageToUIMessage,
} from '@/types'

// 1. 从 IPC 接收数据库消息
const dbMessages: DBLocalChatMessage[] = await window.electron.ipcRenderer.invoke(
  'local:getMessages',
  conversationId
)

// 2. 转换为应用层消息
const messages: LocalChatMessage[] = dbMessages.map(dbMessageToLocalMessage)

// 3. 转换为 AI SDK 格式
const uiMessages = localMessagesToUIMessages(messages)
```

### 可用类型

#### 聊天消息 (chat.ts)
- `LocalChatMessage` - 本地聊天消息（应用层）
- `DBLocalChatMessage` - 数据库消息（IPC 传输）
- `dbMessageToLocalMessage()` - 转换函数
- `localMessageToUIMessage()` - 转换为 AI SDK UIMessage
- `localMessagesToUIMessages()` - 批量转换

#### 会话 (conversation.ts)
- `LocalConversation` - 本地会话
- `DBLocalConversation` - 数据库会话
- `dbConversationToLocal()` - 转换函数

#### 模型 (model.ts)
- `OllamaModel` - Ollama 模型信息
- `OllamaModelListResponse` - 模型列表响应
- `OllamaSource` - Ollama 来源 (`'none' | 'system' | 'embedded'`)
- `OllamaInitProgress` - 初始化进度
- `OllamaReadyStatus` - 就绪状态

## 共享类型

适用于 Cloud 和 Private 两种模式的通用类型：

```typescript
import { AppMode, MessageRole, PaginatedResponse } from '@/types/shared'

// 模式判断
const mode: AppMode = 'cloud' // 或 'private'

// 消息角色
const role: MessageRole = 'user' // 或 'assistant' | 'system'

// 分页数据
const result: PaginatedResponse<KnowledgeBase> = {
  data: knowledgeBases,
  total: 100,
  page: 1,
  pageSize: 20,
  hasMore: true,
}
```

## 最佳实践

### ✅ DO

1. **从统一入口导入**
   ```typescript
   import { KnowledgeBase, LocalChatMessage } from '@/types'
   ```

2. **依赖 Hono RPC 推断**
   ```typescript
   // types/cloud/chat.ts
   export type ChatConfig = InferResponseType<
     typeof honoClient.api['chat-configs']['$get']
   >['chatConfigs'][number]
   ```

3. **为 Private Mode 提供转换函数**
   ```typescript
   export function dbMessageToLocalMessage(message: DBLocalChatMessage): LocalChatMessage {
     // 转换逻辑
   }
   ```

### ❌ DON'T

1. **不要手动定义已有的推断类型**
   ```typescript
   // ❌ 错误
   export type KnowledgeBase = {
     id: string
     name: string
     // ...
   }

   // ✅ 正确
   export type KnowledgeBase = GetKnowledgeBaseResponse['knowledgeBase']
   ```

2. **不要在多个地方重复定义类型**
   ```typescript
   // ❌ 错误：在 hook 中定义
   function useUpdateKnowledgeBase() {
     type Payload = { name: string; description: string } // 重复定义
   }

   // ✅ 正确：使用集中定义的类型
   import { UpdateKnowledgeBasePayload } from '@/types'
   ```

3. **不要混用 Cloud 和 Local 类型**
   ```typescript
   // ❌ 错误：混用
   function handleMessage(message: KnowledgeBase | LocalChatMessage) {}

   // ✅ 正确：分开处理
   function handleCloudKB(kb: KnowledgeBase) {}
   function handleLocalMessage(msg: LocalChatMessage) {}
   ```

## 迁移指南

### 从旧的 `infer-types.ts` 迁移

```typescript
// 旧方式 ❌
import { KnowledgeBase } from '@/types/infer-types'

// 新方式 ✅
import { KnowledgeBase } from '@/types'
```

### 从行内类型推断迁移

```typescript
// 旧方式 ❌
import type { InferResponseType } from 'hono/client'
type ResponseType = InferResponseType<typeof honoClient.api.knowledgebase['$get']>

// 新方式 ✅
import { GetKnowledgeBasesResponse } from '@/types'
```

## 常见问题

### Q: 为什么 Cloud 类型要从 Hono RPC 推断？
A: 确保类型安全和单一数据源。后端 schema 变更时，前端类型自动更新，避免类型不一致。

### Q: Private Mode 为什么不用 RPC 推断？
A: Private Mode 完全本地运行，没有 Hono 服务器，因此需要独立定义类型。

### Q: 如何添加新的类型？
A:
- Cloud Mode: 在 `types/cloud/*.ts` 中添加 `InferResponseType`/`InferRequestType`
- Private Mode: 在 `types/local/*.ts` 中手动定义
- 两者都用: 在 `types/shared.ts` 中定义

### Q: 类型推断失败怎么办？
A: 确保 server 先构建（`npm run build`），生成 `.d.ts` 类型声明文件。

## 相关文档

- [CLAUDE.md](../../../CLAUDE.md) - TanStack Query 使用规范
- [hooks/README.md](../hooks/README.md) - Hooks 组织结构
- [Private Mode 架构](../../../docs/private-mode-architecture.md)
