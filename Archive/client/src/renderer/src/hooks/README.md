# Hooks 组织结构

本目录按功能模块组织所有自定义 React Hooks。

## 目录结构

```
hooks/
├── chat/                           # 聊天模块
│   ├── queries/                    # 聊天查询钩子（只读操作）
│   │   ├── useConversation.ts      # 单个会话详情
│   │   ├── useConversations.ts     # 会话列表
│   │   ├── useChatConfig.ts        # 单个聊天配置
│   │   └── useChatConfigs.ts       # 聊天配置列表
│   ├── mutations/                  # 聊天变更钩子（写操作）
│   │   ├── useCreateConversation.ts
│   │   ├── useUpdateConversation.ts
│   │   ├── useDeleteConversation.ts
│   │   ├── useCreateChatConfig.ts
│   │   ├── useUpdateChatConfig.ts
│   │   ├── useDeleteChatConfig.ts
│   │   └── useSetConfigKnowledgeBases.ts
│   └── useChatLogic.ts             # 聊天业务逻辑钩子
│
├── knowledge-base/                 # 知识库模块
│   ├── queries/                    # 知识库查询钩子
│   │   ├── useKnowledgeBase.ts     # 单个知识库详情
│   │   └── useKnowledgeBases.ts    # 知识库列表
│   ├── mutations/                  # 知识库变更钩子
│   │   ├── useCreateKnowledgeBase.ts
│   │   ├── useUpdateKnowledgeBase.ts
│   │   ├── useDeleteKnowledgeBase.ts
│   │   ├── useUploadKnowledgeBaseFile.ts
│   │   └── useDeleteKnowledgeBaseFile.ts
│   └── useKnowledgeBaseRPC.ts      # 知识库 RPC 钩子
│
├── note/                           # 笔记模块
│   └── useNoteRPC.ts               # 笔记 RPC 钩子
│
├── agent/                          # 代理模块
│   └── useAgentAPI.ts              # 代理 API 钩子
│
└── common/                         # 通用钩子
    ├── use-mobile.tsx              # 移动端检测钩子
    └── useActiveNavItem.ts         # 导航活动项检测钩子
```

## 使用指南

### 导入示例

```typescript
// Chat 模块
import { useConversations } from '@/hooks/chat/queries/useConversations'
import { useCreateConversation } from '@/hooks/chat/mutations/useCreateConversation'
import { useChatLogic } from '@/hooks/chat/useChatLogic'

// Knowledge Base 模块
import { useKnowledgeBases } from '@/hooks/knowledge-base/queries/useKnowledgeBases'
import { useCreateKnowledgeBase } from '@/hooks/knowledge-base/mutations/useCreateKnowledgeBase'

// Note 模块
import { useNoteRPC } from '@/hooks/note/useNoteRPC'

// Agent 模块
import { useAgentAPI } from '@/hooks/agent/useAgentAPI'

// Common 通用钩子
import { useActiveNavItem } from '@/hooks/common/useActiveNavItem'
import { useMobile } from '@/hooks/common/use-mobile'
```

## 命名约定

### Queries（查询钩子）
- **单数形式** (use{Entity}): 获取单个实体详情
  - 例: `useConversation`, `useKnowledgeBase`, `useChatConfig`
- **复数形式** (use{Entities}): 获取实体列表
  - 例: `useConversations`, `useKnowledgeBases`, `useChatConfigs`

### Mutations（变更钩子）
- **use{Action}{Entity}**: 执行数据变更操作
  - Create: `useCreateConversation`, `useCreateKnowledgeBase`
  - Update: `useUpdateConversation`, `useUpdateKnowledgeBase`
  - Delete: `useDeleteConversation`, `useDeleteKnowledgeBase`
  - Upload: `useUploadKnowledgeBaseFile`
  - Set: `useSetConfigKnowledgeBases`

### 业务逻辑钩子
- **use{Feature}Logic**: 封装特定功能的业务逻辑
  - 例: `useChatLogic`

### RPC/API 钩子
- **use{Feature}RPC**: 封装 RPC 调用逻辑
  - 例: `useKnowledgeBaseRPC`, `useNoteRPC`
- **use{Feature}API**: 封装 API 调用逻辑
  - 例: `useAgentAPI`

## 添加新钩子

当添加新的自定义钩子时，请遵循以下规则：

1. **确定功能模块**: 将钩子放在对应的功能目录（chat, knowledge-base, note, agent, common）
2. **区分操作类型**:
   - 只读操作 → `queries/`
   - 写操作 → `mutations/`
   - 业务逻辑 → 模块根目录
3. **遵循命名约定**: 使用上述命名规则
4. **更新此 README**: 在目录结构中添加新钩子的说明

## TanStack Query 集成

本项目使用 TanStack Query v4 进行数据缓存和状态管理。查询和变更钩子遵循以下模式：

### Query Hooks 模式
```typescript
import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '@/lib/queryKeys'

export function useEntity(id: string) {
  return useQuery({
    queryKey: queryKeys.entity.detail(id),
    queryFn: async () => {
      const res = await honoClient.api.entity[':id'].$get({ param: { id } })
      return res.json()
    },
  })
}
```

### Mutation Hooks 模式
```typescript
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/lib/queryKeys'

export function useUpdateEntity() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, data }) => {
      const res = await honoClient.api.entity[':id'].$put({ param: { id }, json: data })
      return res.json()
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.entity.detail(variables.id) })
    },
  })
}
```

## 相关文档

- [TanStack Query 文档](https://tanstack.com/query/latest)
- [React Hooks 最佳实践](https://react.dev/reference/react)
- [项目 CLAUDE.md](../../../CLAUDE.md) - 完整的开发指南
