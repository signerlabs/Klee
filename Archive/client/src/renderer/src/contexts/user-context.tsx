"use client"

import * as React from "react"
import { getAvatar } from "@/lib/tiptap-collab-utils"

export type User = {
  id: string
  name: string
  color: string
  avatar: string
}

export type UserContextValue = {
  user: User
}

export const UserContext = React.createContext<UserContextValue>({
  user: { color: "", id: "", name: "", avatar: "" },
})

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [user] = React.useState<User>({
    color: getColorFromLocalStorage(),
    name: getUsernameFromLocalStorage(),
    id: getUserIdFromLocalStorage(),
    avatar: getAvatar(getUsernameFromLocalStorage()),
  })

  React.useEffect(() => {
    window.localStorage.setItem("_tiptap_username", user.name)
    window.localStorage.setItem("_tiptap_color", user.color)
    window.localStorage.setItem("_tiptap_user_id", user.id)
  }, [user])

  return (
    <UserContext.Provider value={{ user }}>{children}</UserContext.Provider>
  )
}

export const useUser = () => React.useContext(UserContext)

export const FIRST_NAMES = [
  "John",
  "Jane",
  "Alice",
  "Bob",
  "Eve",
  "Charlie",
  "David",
  "Frank",
  "Grace",
  "Helen",
]

export const LAST_NAMES = [
  "Smith",
  "Johnson",
  "Williams",
  "Jones",
  "Brown",
  "Davis",
  "Miller",
  "Wilson",
  "Moore",
  "Taylor",
  "Anderson",
  "Thomas",
]

export const USER_COLORS = [
  "#fb7185",
  "#fdba74",
  "#d9f99d",
  "#a7f3d0",
  "#a5f3fc",
  "#a5b4fc",
  "#f0abfc",
  "#fda58d",
  "#f2cc8f",
  "#9ae6b4",
]

const uuid = (): string => {
  const template = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx"
  return template.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === "x" ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

const getRandomArrayItem = (array: string[]) => {
  if (array.length === 0) {
    throw new Error("Cannot get random item from empty array")
  }
  return array[Math.floor(Math.random() * array.length)]!
}

const generateRandomUsername = (): string => {
  const names = [getRandomArrayItem(FIRST_NAMES)]

  if (Math.random() > 0.85) {
    names.push(getRandomArrayItem(FIRST_NAMES))
  }
  names.push(getRandomArrayItem(LAST_NAMES))

  return names.join(" ")
}

const generateRandomColor = (): string => {
  return getRandomArrayItem(USER_COLORS) ?? "#9ae6b4"
}

const getFromLocalStorage = (
  key: string,
  fallback: () => string,
  isServer: boolean = typeof window === "undefined"
): string => {
  if (isServer) {
    return fallback()
  }
  const value = window.localStorage.getItem(key)
  return value !== null ? value : fallback()
}

const getUsernameFromLocalStorage = (): string => {
  return getFromLocalStorage("_tiptap_username", generateRandomUsername)
}

const getColorFromLocalStorage = (): string => {
  return getFromLocalStorage("_tiptap_color", generateRandomColor)
}

const getUserIdFromLocalStorage = (): string => {
  return getFromLocalStorage("_tiptap_user_id", () => uuid())
}
