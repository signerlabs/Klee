/**
 * 查询键工厂函数
 * 用于生成一致的、层级化的查询键，支持精确的缓存失效策略
 *
 * 层级结构:
 * - 一级: ['knowledgeBases'] - 所有知识库查询的根键
 * - 二级: ['knowledgeBases', 'list'] - 列表查询
 * - 二级: ['knowledgeBases', 'detail', id] - 详情查询
 * - 三级: ['knowledgeBases', 'detail', id, 'files'] - 文件列表查询
 *
 * 使用 `as const` 确保 TypeScript 类型推断为字面量类型
 */
export const knowledgeBaseKeys = {
  /**
   * 一级：所有知识库查询的根键
   * 用法: queryClient.invalidateQueries({ queryKey: knowledgeBaseKeys.all })
   * 效果: 失效所有知识库相关的查询
   */
  all: ['knowledgeBases'] as const,

  /**
   * 二级：列表查询
   * @param mode - 运行模式 ('cloud' | 'private')
   * 用法: useQuery({ queryKey: knowledgeBaseKeys.lists(mode) })
   * 效果: 查询知识库列表（按模式隔离缓存）
   */
  lists: (mode?: 'cloud' | 'private') =>
    mode ? ([...knowledgeBaseKeys.all, 'list', mode] as const) : ([...knowledgeBaseKeys.all, 'list'] as const),

  /**
   * 二级：详情查询的基础键
   * 用法: 仅用于内部组合，不直接使用
   */
  details: (mode?: 'cloud' | 'private') =>
    mode ? ([...knowledgeBaseKeys.all, 'detail', mode] as const) : ([...knowledgeBaseKeys.all, 'detail'] as const),

  /**
   * 二级：特定知识库的详情查询
   * @param id - 知识库 ID
   * @param mode - 运行模式 ('cloud' | 'private')
   * 用法: useQuery({ queryKey: knowledgeBaseKeys.detail(id, mode) })
   * 效果: 查询特定知识库的详情（包含文件列表）
   */
  detail: (id: string, mode?: 'cloud' | 'private') =>
    mode ? ([...knowledgeBaseKeys.details(mode), id] as const) : ([...knowledgeBaseKeys.details(), id] as const),

  /**
   * 三级：特定知识库的文件列表查询
   * @param knowledgeBaseId - 知识库 ID
   * 用法: useQuery({ queryKey: knowledgeBaseKeys.files(knowledgeBaseId) })
   * 效果: 查询特定知识库的文件列表
   *
   * 注意: 文件列表通常已包含在详情查询中，此键用于独立的文件列表查询场景
   */
  files: (knowledgeBaseId: string) =>
    [...knowledgeBaseKeys.detail(knowledgeBaseId), 'files'] as const,
}

/**
 * 会话查询键工厂函数
 * 用于生成会话相关的查询键，支持精确的缓存失效策略
 *
 * 层级结构:
 * - 一级: ['conversations'] - 所有会话查询的根键
 * - 二级: ['conversations', 'list'] - 列表查询
 * - 二级: ['conversations', 'detail', id] - 详情查询（含消息历史）
 *
 * 使用 `as const` 确保 TypeScript 类型推断为字面量类型
 */
export const conversationKeys = {
  /**
   * 一级：所有会话查询的根键
   * 用法: queryClient.invalidateQueries({ queryKey: conversationKeys.all })
   * 效果: 失效所有会话相关的查询
   */
  all: ['conversations'] as const,

  /**
   * 二级：会话列表查询
   * 用法: useQuery({ queryKey: conversationKeys.lists() })
   * 效果: 查询会话列表
   */
  lists: () => [...conversationKeys.all, 'list'] as const,

  /**
   * 二级：详情查询的基础键
   * 用法: 仅用于内部组合，不直接使用
   */
  details: () => [...conversationKeys.all, 'detail'] as const,

  /**
   * 二级：特定会话的详情查询
   * @param id - 会话 ID
   * 用法: useQuery({ queryKey: conversationKeys.detail(id) })
   * 效果: 查询特定会话的详情（包含消息历史）
   */
  detail: (id: string) => [...conversationKeys.details(), id] as const,
}

/**
 * 聊天配置查询键工厂函数
 * 用于生成聊天配置相关的查询键，支持精确的缓存失效策略
 *
 * 层级结构:
 * - 一级: ['chatConfigs'] - 所有配置查询的根键
 * - 二级: ['chatConfigs', 'list'] - 列表查询
 * - 二级: ['chatConfigs', 'detail', id] - 详情查询（含关联知识库）
 *
 * 使用 `as const` 确保 TypeScript 类型推断为字面量类型
 */
/**
 * 笔记查询键工厂函数
 * 用于生成笔记相关的查询键，支持精确的缓存失效策略
 *
 * 层级结构:
 * - 一级: ['notes'] - 所有笔记查询的根键
 * - 二级: ['notes', 'list', mode] - 列表查询（按模式隔离）
 * - 二级: ['notes', 'detail', mode, id] - 详情查询（按模式隔离）
 *
 * 使用 `as const` 确保 TypeScript 类型推断为字面量类型
 */
export const noteKeys = {
  /**
   * 一级：所有笔记查询的根键
   * @param mode - 运行模式 ('cloud' | 'private')
   * 用法: queryClient.invalidateQueries({ queryKey: noteKeys.all(mode) })
   * 效果: 失效指定模式下的所有笔记查询
   */
  all: (mode: 'cloud' | 'private') => ['notes', mode] as const,

  /**
   * 二级：笔记列表查询
   * @param mode - 运行模式 ('cloud' | 'private')
   * 用法: useQuery({ queryKey: noteKeys.lists(mode) })
   * 效果: 查询笔记列表（按模式隔离缓存）
   */
  lists: (mode: 'cloud' | 'private') => [...noteKeys.all(mode), 'list'] as const,

  /**
   * 二级：详情查询的基础键
   * @param mode - 运行模式 ('cloud' | 'private')
   * 用法: 仅用于内部组合，不直接使用
   */
  details: (mode: 'cloud' | 'private') => [...noteKeys.all(mode), 'detail'] as const,

  /**
   * 二级：特定笔记的详情查询
   * @param id - 笔记 ID
   * @param mode - 运行模式 ('cloud' | 'private')
   * 用法: useQuery({ queryKey: noteKeys.detail(id, mode) })
   * 效果: 查询特定笔记的详情（按模式隔离缓存）
   */
  detail: (id: string, mode: 'cloud' | 'private') => [...noteKeys.details(mode), id] as const,
}

export const chatConfigKeys = {
  /**
   * 一级：所有配置查询的根键
   * 用法: queryClient.invalidateQueries({ queryKey: chatConfigKeys.all })
   * 效果: 失效所有配置相关的查询
   */
  all: ['chatConfigs'] as const,

  /**
   * 二级：配置列表查询
   * 用法: useQuery({ queryKey: chatConfigKeys.lists() })
   * 效果: 查询配置列表
   */
  lists: () => [...chatConfigKeys.all, 'list'] as const,

  /**
   * 二级：详情查询的基础键
   * 用法: 仅用于内部组合，不直接使用
   */
  details: () => [...chatConfigKeys.all, 'detail'] as const,

  /**
   * 二级：特定配置的详情查询
   * @param id - 配置 ID
   * 用法: useQuery({ queryKey: chatConfigKeys.detail(id) })
   * 效果: 查询特定配置的详情（包含关联的知识库）
   */
  detail: (id: string) => [...chatConfigKeys.details(), id] as const,
}

/**
 * 市场查询键工厂函数
 * 用于生成市场相关的查询键，支持精确的缓存失效策略
 *
 * 层级结构:
 * - 一级: ['marketplace'] - 所有市场查询的根键
 * - 二级: ['marketplace', 'agents'] - Agents 列表查询
 * - 二级: ['marketplace', 'knowledgeBases'] - 知识库列表查询
 * - 三级: ['marketplace', 'agents', 'detail', shareSlug] - Agent 详情查询
 * - 三级: ['marketplace', 'knowledgeBases', 'detail', shareSlug] - 知识库详情查询
 *
 * 使用 `as const` 确保 TypeScript 类型推断为字面量类型
 */
export const marketplaceKeys = {
  /**
   * 一级：所有市场查询的根键
   * 用法: queryClient.invalidateQueries({ queryKey: marketplaceKeys.all })
   * 效果: 失效所有市场相关的查询
   */
  all: ['marketplace'] as const,

  /**
   * 二级：Agents 列表查询的基础键
   * 用法: 仅用于内部组合，不直接使用
   */
  agents: () => [...marketplaceKeys.all, 'agents'] as const,

  /**
   * 二级：Agents 列表查询（支持分页和搜索）
   * @param page - 页码（可选）
   * @param search - 搜索关键词（可选）
   * 用法: useQuery({ queryKey: marketplaceKeys.agentsList({ page, search }) })
   * 效果: 查询市场 Agents 列表
   */
  agentsList: (filters?: { page?: number; search?: string }) =>
    [...marketplaceKeys.agents(), 'list', filters] as const,

  /**
   * 三级：Agent 详情查询
   * @param shareSlug - Agent 分享标识符
   * 用法: useQuery({ queryKey: marketplaceKeys.agentDetail(shareSlug) })
   * 效果: 查询特定 Agent 的详情（包含关联知识库）
   */
  agentDetail: (shareSlug: string) =>
    [...marketplaceKeys.agents(), 'detail', shareSlug] as const,

  /**
   * 二级：知识库列表查询的基础键
   * 用法: 仅用于内部组合，不直接使用
   */
  knowledgeBases: () => [...marketplaceKeys.all, 'knowledgeBases'] as const,

  /**
   * 二级：知识库列表查询（支持分页和搜索）
   * @param page - 页码（可选）
   * @param search - 搜索关键词（可选）
   * 用法: useQuery({ queryKey: marketplaceKeys.knowledgeBasesList({ page, search }) })
   * 效果: 查询市场知识库列表
   */
  knowledgeBasesList: (filters?: { page?: number; search?: string }) =>
    [...marketplaceKeys.knowledgeBases(), 'list', filters] as const,

  /**
   * 三级：知识库详情查询
   * @param shareSlug - 知识库分享标识符
   * 用法: useQuery({ queryKey: marketplaceKeys.knowledgeBaseDetail(shareSlug) })
   * 效果: 查询特定知识库的详情（包含文件列表）
   */
  knowledgeBaseDetail: (shareSlug: string) =>
    [...marketplaceKeys.knowledgeBases(), 'detail', shareSlug] as const,
}

/**
 * Ollama 模型查询键工厂函数
 * 用于生成 Ollama 模型相关的查询键，支持精确的缓存失效策略
 *
 * 层级结构:
 * - 一级: ['ollamaModels'] - 所有模型查询的根键
 * - 二级: ['ollamaModels', 'installed'] - 已安装模型列表
 * - 二级: ['ollamaModels', 'available'] - 可下载模型列表（配置 + 安装状态合并）
 *
 * 使用 `as const` 确保 TypeScript 类型推断为字面量类型
 */
export const ollamaModelKeys = {
  /**
   * 一级：所有 Ollama 模型查询的根键
   * 用法: queryClient.invalidateQueries({ queryKey: ollamaModelKeys.all })
   * 效果: 失效所有模型相关的查询
   */
  all: ['ollamaModels'] as const,

  /**
   * 二级：已安装模型列表查询
   * 用法: useQuery({ queryKey: ollamaModelKeys.installed() })
   * 效果: 查询 Ollama 已安装的模型列表（来自 /api/tags）
   */
  installed: () => [...ollamaModelKeys.all, 'installed'] as const,

  /**
   * 二级：可下载模型列表查询
   * 用法: useQuery({ queryKey: ollamaModelKeys.available() })
   * 效果: 查询可下载的模型列表（配置文件 + 安装状态合并）
   */
  available: () => [...ollamaModelKeys.all, 'available'] as const,

  /**
   * 二级：模型列表查询（别名，指向 available）
   * 用法: useQuery({ queryKey: ollamaModelKeys.lists() })
   * 效果: 查询所有模型（包含下载状态）
   */
  lists: () => ollamaModelKeys.available(),
}
