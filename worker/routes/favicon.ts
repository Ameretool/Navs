import { Hono } from 'hono'
import type { Context } from 'hono'
import { ErrCode, type FaviconResp, type SiteMetaResp } from '../../shared/types'
import {
  extractIconCandidates,
  fetchPageHtml,
  fetchWithTimeout,
  hostnameFallbackTitle,
  parseTargetUrl,
  pickBookmarkTitle,
} from '../lib/pageMetadata'
import { fail, ok } from '../lib/response'
import type { HonoEnv } from '../types'

type AppContext = Context<HonoEnv>

const ICON_ACCEPT = 'image/avif,image/webp,image/apng,image/*,*/*;q=0.1'
const OVERALL_DEADLINE_MS = 6000
// 站点名称只需要一次页面抓取，不用像图标那样逐个探测候选，deadline 相应更短。
const SITE_META_DEADLINE_MS = 4000

function badRequest(c: AppContext, msg: string) {
  return c.json(fail(ErrCode.BAD_REQUEST, msg))
}

async function canFetchIcon(url: string): Promise<boolean> {
  try {
    const headResponse = await fetchWithTimeout(url, {
      method: 'HEAD',
      redirect: 'follow',
      headers: {
        Accept: ICON_ACCEPT,
      },
    })

    if (headResponse.ok) {
      return true
    }

    if (headResponse.status !== 403 && headResponse.status !== 405) {
      return false
    }
  } catch {
    // Some hosts reject or mishandle HEAD; fall through to a tiny GET probe.
  }

  try {
    const getResponse = await fetchWithTimeout(url, {
      method: 'GET',
      redirect: 'follow',
      headers: {
        Accept: ICON_ACCEPT,
        Range: 'bytes=0-0',
      },
    })

    return getResponse.ok
  } catch {
    return false
  }
}

function buildFaviconImFallback(hostname: string): string {
  return `https://favicon.im/${encodeURIComponent(hostname)}?larger=true`
}

export const faviconRoutes = new Hono<HonoEnv>()

faviconRoutes.get('/fetch-favicon', async (c) => {
  const targetUrl = parseTargetUrl(new URL(c.req.url).searchParams.get('url'))
  if (!targetUrl) {
    return badRequest(c, 'invalid url')
  }

  // 解析逻辑：站内 <link> → /favicon.ico → Google 兜底。
  async function resolveIcon(): Promise<string> {
    let fallbackOrigin = targetUrl!.origin
    let fallbackHostname = targetUrl!.hostname

    const page = await fetchPageHtml(targetUrl!.toString())
    if (page) {
      const finalUrl = new URL(page.finalUrl)
      fallbackOrigin = finalUrl.origin
      fallbackHostname = finalUrl.hostname

      if (page.html) {
        const candidates = extractIconCandidates(page.html, page.finalUrl).slice(0, 6)
        for (const candidate of candidates) {
          if (await canFetchIcon(candidate)) {
            return candidate
          }
        }
      }
    }

    const originFavicon = `${fallbackOrigin}/favicon.ico`
    if (await canFetchIcon(originFavicon)) {
      return originFavicon
    }

    return buildFaviconImFallback(fallbackHostname)
  }

  try {
    // 整体兜底：无论解析链多慢，最多 OVERALL_DEADLINE_MS 后返回 favicon.im 兜底，
    // 避免前端「一键获取」按钮长时间转圈。
    const deadline = new Promise<string>((resolve) =>
      setTimeout(() => resolve(buildFaviconImFallback(targetUrl!.hostname)), OVERALL_DEADLINE_MS),
    )
    const icon = await Promise.race([resolveIcon(), deadline])
    return c.json(ok<FaviconResp>({ icon }))
  } catch {
    // 任何异常也回退到 favicon.im 兜底，保证总能给出一个可用图标
    return c.json(ok<FaviconResp>({ icon: buildFaviconImFallback(targetUrl.hostname) }))
  }
})

// 新增书签时解析站点名称。这是便利功能，任何失败都回退到域名，不向前端报错。
faviconRoutes.get('/fetch-site-meta', async (c) => {
  const targetUrl = parseTargetUrl(new URL(c.req.url).searchParams.get('url'))
  if (!targetUrl) {
    return badRequest(c, 'invalid url')
  }

  const requestedUrl = targetUrl.toString()
  const fallback: SiteMetaResp = {
    title: hostnameFallbackTitle(requestedUrl),
    final_url: requestedUrl,
  }

  async function resolveSiteMeta(): Promise<SiteMetaResp> {
    const page = await fetchPageHtml(requestedUrl)
    if (!page) {
      return fallback
    }

    return {
      title: pickBookmarkTitle({ html: page.html, finalUrl: page.finalUrl, requestedUrl }),
      final_url: page.finalUrl || requestedUrl,
    }
  }

  try {
    const deadline = new Promise<SiteMetaResp>((resolve) =>
      setTimeout(() => resolve(fallback), SITE_META_DEADLINE_MS),
    )
    return c.json(ok<SiteMetaResp>(await Promise.race([resolveSiteMeta(), deadline])))
  } catch {
    return c.json(ok<SiteMetaResp>(fallback))
  }
})

export default faviconRoutes
