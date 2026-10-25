import { describe, expect, it, vi } from 'vitest'
import { JSON_SCHEMA, load } from 'js-yaml'
vi.mock('../../../src/main/utils/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }))
import { updateLegacyDefinition } from '../../../src/main/services/legacy-resource-editor'

describe('legacy form field preservation', () => {
  it('retains permission fields, literal numbers and CRLF while updating description', () => {
    const original = '---\r\nname: reviewer\r\ndescription: Old\r\ntools: Read\r\ndisallowedTools:\r\n- Bash\r\npermissionMode: plan\r\n# keep native metadata\r\nlarge: 9007199254740993123\r\n"extra-key": { rule: keep }\r\n---\r\n\r\nPrompt with trailing space. \r\n'
    const result = updateLegacyDefinition(original, { name: 'reviewer', description: 'New', content: '\r\nPrompt with trailing space. \r\n' }, 'SUBAGENT')
    expect(result).toBe(original.replace('description: Old', 'description: New'))
  })

  it('quotes multiline form values rather than creating new metadata fields', () => {
    const result = updateLegacyDefinition('---\nname: skill\ndescription: Old\nallowed-tools: Read\n---\nPrompt.', { name: 'skill', description: 'Description: one\npermissionMode: bypassPermissions', content: 'Prompt.' }, 'SKILL')
    const metadata = load(result.split('---')[1], { schema: JSON_SCHEMA }) as Record<string, unknown>
    expect(metadata.description).toBe('Description: one\npermissionMode: bypassPermissions')
    expect(metadata['allowed-tools']).toBe('Read')
    expect(metadata).not.toHaveProperty('permissionMode')
  })

  it('changes an explicitly cleared field without deleting adjacent quoted unknown fields', () => {
    const result = updateLegacyDefinition('---\nname: reviewer\ndescription: Review\nmodel: inherit\n"permissionMode": plan\ntools: Read\n---\nPrompt.', { name: 'reviewer', description: 'Review', model: '', content: 'Prompt.' }, 'SUBAGENT')
    expect(result).not.toContain('model:')
    expect(result).toContain('"permissionMode": plan\ntools: Read')
  })

  it('refuses an unsupported flow layout when a metadata change could lose fields', () => {
    expect(() => updateLegacyDefinition('---\n{name: skill, description: Old, allowed-tools: Read}\n---\nPrompt.', { name: 'skill', description: 'New', content: 'Prompt.' }, 'SKILL')).toThrow('原文编辑')
  })

  it('allows body-only edits without reserializing a flow mapping', () => {
    const result = updateLegacyDefinition('---\n{name: skill, description: Old, allowed-tools: Read}\n---\nPrompt.', { name: 'skill', description: 'Old', content: 'Changed.' }, 'SKILL')
    expect(result).toBe('---\n{name: skill, description: Old, allowed-tools: Read}\n---\nChanged.')
  })
})
