// 관리자 비밀번호 해시(PBKDF2-SHA256)입니다. 서버에는 비밀번호 대신 이 값만 비밀값(ADMIN_PASSWORD_HASH)으로 둡니다.
// 형식: pbkdf2-sha256$<반복 횟수>$<소금(base64)>$<해시(base64)>
// scripts/admin-password.mjs가 같은 방식으로 만듭니다(시험: server/password.test.ts).
// Cloudflare Workers의 PBKDF2는 반복 횟수를 10만 번까지만 허용합니다.
export const PASSWORD_ITERATIONS = 100_000

const toBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes))
const fromBase64 = (text: string) => Uint8Array.from(atob(text), (char) => char.charCodeAt(0))

async function derive(password: string, salt: Uint8Array, iterations: number) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits'])
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256))
}

export async function hashPassword(password: string, salt = crypto.getRandomValues(new Uint8Array(16))) {
  return `pbkdf2-sha256$${PASSWORD_ITERATIONS}$${toBase64(salt)}$${toBase64(await derive(password, salt, PASSWORD_ITERATIONS))}`
}

export async function verifyPassword(password: string, stored: string) {
  const [scheme, rounds, salt, hash] = stored.split('$')
  const iterations = Number(rounds)
  if (scheme !== 'pbkdf2-sha256' || !Number.isInteger(iterations) || iterations < 1 || iterations > PASSWORD_ITERATIONS || !salt || !hash) return false
  try {
    return constantTimeEqual(await derive(password, fromBase64(salt), iterations), fromBase64(hash))
  } catch {
    return false
  }
}

export function constantTimeEqual(a: Uint8Array, b: Uint8Array) {
  if (a.length !== b.length) return false
  let different = 0
  for (let index = 0; index < a.length; index++) different |= a[index] ^ b[index]
  return different === 0
}
