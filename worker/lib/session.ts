import type { LoginResp } from '../../shared/types'
import { cacheValidatedSession } from '../middleware/auth'
import type { Env, SessionValue } from '../types'
import { getJwtSecret, signJwt } from './jwt'

const DEFAULT_SESSION_TTL_SECONDS = 7 * 24 * 60 * 60

export function getSessionTtlSeconds(raw: string | undefined): number {
  const parsed = Number.parseInt(raw ?? '', 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_SESSION_TTL_SECONDS
}

export async function createSession(env: Env, username: string): Promise<LoginResp> {
  const ttlSeconds = getSessionTtlSeconds(env.SESSION_TTL)
  const expires_at = Date.now() + ttlSeconds * 1000
  
  const secret = await getJwtSecret(env.DB)
  const session: SessionValue = { username, exp: expires_at }
  const token = await signJwt(session as unknown as Record<string, unknown>, secret)

  cacheValidatedSession(token, session)

  return { token, expires_at, username }
}
