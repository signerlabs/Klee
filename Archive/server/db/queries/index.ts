/**
 * 查询函数统一导出
 *
 * 每个模块负责自己的业务逻辑：
 * - chat.ts: 聊天会话和消息相关
 * - chatConfig.ts: 聊天配置相关
 * - note.ts: 笔记相关
 * - knowledgebase.ts: 知识库和文件相关
 *
 * 后续新增模块只需新建文件并在此处导出即可
 */

// 聊天相关
export {
  getUserChats,
  getChatById,
  getChatMessages,
  createChatSession,
  updateChatSession,
  deleteChatSession,
  insertChatMessage,
  saveMessages,
  upsertChatWithMessage,
  type UpdateChatSessionData,
} from "./chat.js"

// 聊天配置相关
export {
  getUserChatConfigs,
  getChatConfigById,
  getChatConfigByShareSlug,
  getChatConfigKnowledgeBases,
  createChatConfig,
  updateChatConfig,
  deleteChatConfig,
  addKnowledgeBaseToChatConfig,
  removeKnowledgeBaseFromChatConfig,
  setChatConfigKnowledgeBases,
  shareChatConfig,
  installAgent,
  checkAgentInstalled,
} from "./chatConfig.js"

// 知识库相关
export {
  getUserKnowledgeBasesList,
  getKnowledgeBaseById,
  createKnowledgeBase,
  updateKnowledgeBase,
  deleteKnowledgeBase,
  getKnowledgeBaseFiles,
  createKnowledgeBaseFile,
  deleteKnowledgeBaseFile,
  shareKnowledgeBase,
  validateKnowledgeBaseAccess,
} from "./knowledgebase.js"

// 笔记相关
export {
  getNotes,
  getNoteById,
  createNote,
  updateNote,
  deleteNote,
  validateNoteAccess,
  embedNote,
} from "./note.js"

// 市场相关
export {
  getPublicAgents,
  getPublicKnowledgeBases,
  getAgentByShareSlug,
  getKnowledgeBaseByShareSlug,
  countPublicAgents,
  countPublicKnowledgeBases,
} from "./marketplace.js"
