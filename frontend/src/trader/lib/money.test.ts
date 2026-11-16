import { describe, expect, it } from 'vitest'
import { fen, paisa, parseYuan } from './money'

describe('trader money helpers', () => {
  it('formats fen', () => {
    expect(fen(123450)).toBe('¥1,234.50')
    expect(fen(5)).toBe('¥0.05')
  })
  it('formats paisa', () => expect(paisa(123400)).toBe('Rs 1,234'))
  it('parses yuan', () => {
    expect(parseYuan('1,234.5')).toBe(123450)
    expect(parseYuan('abc')).toBeNull()
  })
})
