const CHAT_UPDATED_EVENT = 'chat:updated'

export const emitChatUpdated = () => {
  if (typeof window === 'undefined') {
    return
  }
  window.dispatchEvent(new Event(CHAT_UPDATED_EVENT))
}

export const subscribeChatUpdated = (callback: () => void) => {
  if (typeof window === 'undefined') {
    return () => {}
  }
  window.addEventListener(CHAT_UPDATED_EVENT, callback)
  return () => {
    window.removeEventListener(CHAT_UPDATED_EVENT, callback)
  }
}
