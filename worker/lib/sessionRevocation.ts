// 会话撤销名单。
//
// 会话是无状态 JWT，签名有效就一直有效到 exp（默认 7 天）。在加上这层之前，
// `POST /api/logout` 只清了 isolate 内存缓存，token 本身照样能调所有后台接口——
// 也就是说在共享设备上点「退出登录」实际不产生任何撤销效果。
//
// 用 token 的 SHA-256 而不是 token 本身做 KV key：key 长度可控，而且 KV 被 dump
// 时不会连带泄露一批仍在有效期内的 token。
//
// 不引入 `jti`：按 token 摘要撤销对签发这个改动之前的老 token 同样有效，
// 不需要把所有人踢下线一次。

const REVOKED_PREFIX = 'revoked:'

async function tokenDigest(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))
  let hex = ''
  for (const byte of new Uint8Array(digest)) hex += byte.toString(16).padStart(2, '0')
  return hex
}

export async function revokedSessionKey(token: string): Promise<string> {
  return `${REVOKED_PREFIX}${await tokenDigest(token)}`
}

// TTL 取 token 的剩余寿命：过了 exp 之后签名校验本来就会拒绝，
// 墓碑再留着只是白占 KV。
export async function revokeSession(
  kv: KVNamespace,
  token: string,
  expiresAt: number,
  now = Date.now(),
): Promise<void> {
  const ttlSeconds = Math.ceil((expiresAt - now) / 1000)
  if (ttlSeconds <= 0) return

  await kv.put(await revokedSessionKey(token), '1', {
    // KV 的 expirationTtl 下限是 60 秒，比这更短的直接按 60 秒写入。
    expirationTtl: Math.max(60, ttlSeconds),
  })
}

export async function isSessionRevoked(kv: KVNamespace, token: string): Promise<boolean> {
  return (await kv.get(await revokedSessionKey(token))) !== null
}
