// Service Worker 注册与页面侧配合逻辑。
//
// 拆成独立模块是为了可测：单元测试跑在 node 环境，没有真实的
// navigator.serviceWorker 和 performance 条目，只能靠注入替身。

const PRECACHE_ASSET_PREFIX = '/assets/'
const PRECACHE_LIMIT = 50

export type PrecacheMessage = { type: 'precache-assets'; urls: string[] }

// 从本次文档实际加载过的资源里挑出构建产物。
//
// 为什么不用写死的清单：/assets/* 文件名带 hash，每次构建都变，写死会立刻失效，
// 而生成清单要引入构建插件。读 performance 条目既准确又零构建成本。
export function collectPrecacheAssetUrls(
  timeline: Pick<Performance, 'getEntriesByType'>,
  origin = typeof location === 'undefined' ? '' : location.origin,
): string[] {
  let entries: Array<{ name: string }> = []
  try {
    entries = timeline.getEntriesByType('resource') as Array<{ name: string }>
  } catch {
    return []
  }

  const urls = new Set<string>()
  for (const entry of entries) {
    if (urls.size >= PRECACHE_LIMIT) break

    try {
      const url = new URL(entry.name, origin || undefined)
      if (url.origin === origin && url.pathname.startsWith(PRECACHE_ASSET_PREFIX)) {
        urls.add(url.pathname)
      }
    } catch {
      // 忽略无法解析的条目
    }
  }

  return [...urls]
}

export function createPrecacheMessage(urls: string[]): PrecacheMessage | null {
  return urls.length > 0 ? { type: 'precache-assets', urls } : null
}

type ServiceWorkerContainerLike = {
  register: (url: string) => Promise<{ active?: { postMessage: (message: unknown) => void } | null }>
  controller?: { postMessage: (message: unknown) => void } | null
  addEventListener?: (type: 'message', listener: (event: { data?: unknown }) => void) => void
}

export async function registerServiceWorker(
  container: ServiceWorkerContainerLike,
  getAssetUrls: () => string[],
  onShellUpdated?: () => void,
): Promise<void> {
  if (onShellUpdated) {
    container.addEventListener?.('message', (event) => {
      if ((event.data as { type?: unknown } | undefined)?.type === 'shell-updated') onShellUpdated()
    })
  }

  let registration: Awaited<ReturnType<ServiceWorkerContainerLike['register']>>
  try {
    registration = await container.register('/sw.js')
  } catch {
    // 注册失败不影响应用主体功能
    return
  }

  const message = createPrecacheMessage(getAssetUrls())
  if (!message) return

  // 首次访问时 controller 还是 null（SW 尚未接管），此时用 registration.active。
  // 正是这一次最需要预热：SW 拦不到当次的 JS/CSS 请求，不主动送清单的话
  // Cache Storage 里一个构建产物都不会有。
  const target = container.controller ?? registration.active ?? null
  target?.postMessage(message)
}
