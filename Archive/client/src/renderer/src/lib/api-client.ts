import { supabase } from './supabase'

class APIClient {
  private baseURL = '/api'

  private isFileProtocol() {
    try {
      return typeof window !== 'undefined' && window.location.protocol === 'file:'
    } catch {
      return false
    }
  }

  private async getFileAuthHeader(): Promise<Record<string, string>> {
    const headers: Record<string, string> = {}
    if (!this.isFileProtocol()) return headers
    const client = supabase
    if (!client) {
      return headers
    }
    const { data, error } = await client.auth.getSession()
    if (!error && data.session?.access_token) {
      headers['Authorization'] = `Bearer ${data.session.access_token}`
    }
    return headers
  }

  private async createHeaders(init?: HeadersInit) {
    const headers = new Headers(init)
    const authHeaders = await this.getFileAuthHeader()
    Object.entries(authHeaders).forEach(([key, value]) => {
      headers.set(key, value)
    })
    return headers
  }

  private prepareRequestBody(body: any, headers: Headers) {
    if (body === undefined || body === null) {
      return undefined
    }

    const isFormData = typeof FormData !== 'undefined' && body instanceof FormData
    if (isFormData) {
      headers.delete('Content-Type')
      return body as FormData
    }

    if (
      typeof body === 'string' ||
      body instanceof Blob ||
      body instanceof ArrayBuffer ||
      body instanceof URLSearchParams ||
      (typeof ReadableStream !== 'undefined' && body instanceof ReadableStream)
    ) {
      return body as BodyInit
    }

    if (!headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json')
    }

    return JSON.stringify(body)
  }

  async get(path: string, options?: RequestInit) {
    const headers = await this.createHeaders(options?.headers)
    return fetch(`${this.baseURL}${path}`, {
      ...options,
      method: 'GET',
      credentials: 'include',
      headers,
    })
  }

  async post(path: string, body?: any, options?: RequestInit) {
    const headers = await this.createHeaders(options?.headers)
    const requestBody = this.prepareRequestBody(body, headers)

    return fetch(`${this.baseURL}${path}`, {
      ...options,
      method: 'POST',
      credentials: 'include',
      headers,
      body: requestBody,
    })
  }

  async delete(path: string, options?: RequestInit) {
    const headers = await this.createHeaders(options?.headers)
    return fetch(`${this.baseURL}${path}`, {
      ...options,
      method: 'DELETE',
      credentials: 'include',
      headers,
    })
  }

  async put(path: string, body?: any, options?: RequestInit) {
    const headers = await this.createHeaders(options?.headers)
    const requestBody = this.prepareRequestBody(body, headers)

    return fetch(`${this.baseURL}${path}`, {
      ...options,
      method: 'PUT',
      credentials: 'include',
      headers,
      body: requestBody,
    })
  }
}

export const apiClient = new APIClient()
