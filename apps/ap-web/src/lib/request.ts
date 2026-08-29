/**
 * fetch 封装：默认不走缓存。返回值与 fetch 相同。
 *
 * @param url - 请求地址
 * @param init - fetch 选项
 * @returns fetch 响应
 */
export function request(url: string, init: RequestInit = {}): Promise<Response> {
  return fetch(url, { cache: 'no-store', ...init })
}
