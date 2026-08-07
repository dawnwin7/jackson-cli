import { describe, expect, it } from 'vitest'

import { hashToken, normalizeUsername, verifyToken } from './tokens.js'

describe('token helpers', () => {
  it('normalizes usernames with the archived ASCII rules', () => {
    expect(normalizeUsername(' Alice Smith! ')).toBe('alice-smith')
    expect(normalizeUsername('..Alice_Name--')).toBe('alice_name')
    expect(() => normalizeUsername(' ... !!! ')).toThrow('username is required')
  })

  it('hashes tokens deterministically and verifies without retaining plaintext', () => {
    const tokenHash = hashToken('secret')
    expect(tokenHash).toMatch(/^[a-f0-9]{64}$/)
    expect(tokenHash).not.toContain('secret')
    expect(verifyToken('secret', tokenHash)).toBe(true)
    expect(verifyToken('other', tokenHash)).toBe(false)
  })
})
