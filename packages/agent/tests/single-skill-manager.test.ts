import { afterEach, describe, expect, it } from 'vitest'

import { SkillManager } from '@openworker/skills'

import { disposeSingleSkillManager, getSingleSkillManager } from '../src/single-skill-manager.js'

afterEach(() => {
  disposeSingleSkillManager()
})

describe('getSingleSkillManager', () => {
  it('returns same instance without side effects before init', () => {
    const a = getSingleSkillManager()
    const b = getSingleSkillManager()
    expect(a).toBe(b)
    expect(a).toBeInstanceOf(SkillManager)
    expect(a.getSkills()).toEqual([])
  })

  it('disposeSingleSkillManager clears singleton', () => {
    const a = getSingleSkillManager()
    disposeSingleSkillManager()
    const b = getSingleSkillManager()
    expect(b).not.toBe(a)
  })
})
