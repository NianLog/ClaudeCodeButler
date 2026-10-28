import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdir, mkdtemp, readFile, realpath, symlink, writeFile, rm } from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import builtin from '../../../src/shared/builtin-tool-registry.json'
import { AgentResourceService } from '../../../src/main/services/agent-resource-service'
import { ToolDetectionService } from '../../../src/main/services/tool-detection-service'
vi.mock('../../../src/main/utils/logger.ts', () => ({logger: {info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn()}}))

const evidenceRoot = os.tmpdir()
let root, service, definitions
const skill = name => '---\nname: '+name+'\ndescription: Audit fixture\n---\nRead changes.\n'
const put = async (relative, content) => {
  const file=path.join(root,relative)
  await mkdir(path.dirname(file),{recursive:true})
  await writeFile(file,content)
  return file
}
beforeEach(async ()=>{
  root=await realpath(await mkdtemp(path.join(evidenceRoot,'fixture-')))
  definitions=structuredClone(builtin.tools)
  const registry={getTool:async id=>definitions.find(t=>t.toolId===id)}
  const detection=new ToolDetectionService({pathVariables:{HOME:root,CCB_DATA:path.join(root,'.ccb'),XDG_CONFIG_HOME:path.join(root,'.config')}})
  const backups=path.join(root,'.ccb','resource-backups')
  service=new AgentResourceService({home:root,backupDirectory:backups,registryService:registry,detectionService:detection})
})


describe('resource discovery and format regression cases',()=>{

  it('R1 a junction entry must not hide valid sibling skills',async()=>{
    await put('.claude/skills/good/SKILL.md',skill('good'))
    await put('.agents/skills/linked/SKILL.md',skill('linked'))
    await symlink(path.join(root,'.agents/skills/linked'),path.join(root,'.claude/skills/linked'),'junction')
    const list=await service.listResources({toolId:'claude-code',kind:'SKILL'})
    expect(list.resources.map(r=>r.name)).toContain('good')
    expect(list.warnings.length).toBeGreaterThan(0)
  })

  it('R2 one oversized skill must not hide valid siblings',async()=>{
    await put('.claude/skills/good/SKILL.md',skill('good'))
    await put('.claude/skills/bad/SKILL.md','x'.repeat(1024*1024+1))
    expect((await service.listResources({toolId:'claude-code',kind:'SKILL'})).resources.map(r=>r.name)).toContain('good')
  })

  it('R3 an unrelated linked source root must not abort all default discovery',async()=>{
    await put('.claude.json','{"mcpServers":{"good":{"command":"node"}}}')
    await mkdir(path.join(root,'external'),{recursive:true})
    await mkdir(path.join(root,'.cursor'),{recursive:true})
    await symlink(path.join(root,'external'),path.join(root,'.cursor/skills'),'junction')
    const sources=await service.discoverImportSources({},7)
    expect(sources.some(s=>s.toolId==='claude-code' && s.kinds.includes('MCP'))).toBe(true)
  })

  it('R7 OpenCode native filename-based role must be convertible',async()=>{
    const file=await put('review.md','---\ndescription: Review code\nmode: subagent\n---\nReview changes.\n')
    const source=await service.registerFile('opencode','SUBAGENT',file,9)
    const item=(await service.listImportResources({sourceId:source.sourceId,kind:'SUBAGENT'},9)).resources[0]
    const preview=await service.previewResourceImport({sourceId:source.sourceId,targetToolId:'claude-code',kind:'SUBAGENT',resourceIds:[item.resourceId]},9)
    expect(preview.items[0].status).toBe('READY')
  })

  it('R8 default discovery includes the Qoder official project .mcp.json',async()=>{
    const file=await put('project/.mcp.json','{"mcpServers":{"good":{"command":"node"}}}')
    const context=await service.registerProject(path.dirname(file),10)
    const sources=await service.discoverImportSources(context,10)
    expect(sources.some(s=>s.toolId==='qoder' && s.kinds.includes('MCP'))).toBe(true)
  })

 it('R15 malformed MCP sibling must not hide all valid definitions',async()=>{
   await put('.claude.json','{"mcpServers":{"bad":null,"good":{"command":"node"}}}')
   const list=await service.listResources({toolId:'claude-code',kind:'MCP'})
   expect(list.resources.map(r=>r.name)).toContain('good')
   expect(list.warnings.length).toBeGreaterThan(0)
 })

 it('R16 an empty higher-priority Qoder layer must not hide base definitions',async()=>{
   const file=await put('project/.qoder/settings.json','{"mcpServers":{"good":{"command":"node"}}}')
   await put('project/.qoder/settings.local.json','{}')
   const context=await service.registerProject(path.dirname(path.dirname(file)),15)
   const sources=(await service.discoverImportSources(context,15)).filter(s=>s.toolId==='qoder'&&s.kinds.includes('MCP'))
   const layers=await Promise.all(sources.map(source=>service.listImportResources({sourceId:source.sourceId,kind:'MCP'},15)))
   expect(layers.flatMap(list=>list.resources.map(r=>r.name))).toContain('good')
 })

 it('R17 Claude Skill name and description are optional in the native format',async()=>{
   const original='---\nuser-invocable: true\n---\nReview changes.\n'
   await put('.claude/skills/good/SKILL.md',original)
   const q={toolId:'claude-code',kind:'SKILL'}
   const item=(await service.listResources(q)).resources[0]
   await expect(service.saveResource({...q,name:'good',content:original+'More context.\n',resourceId:item.resourceId,expectedRevision:item.revision})).resolves.toBeTruthy()
 })

 it('R19 a managed custom config path must remain discoverable for mutual import',async()=>{
   const defs=structuredClone(builtin.tools)
   const artifact=defs.find(t=>t.toolId==='gemini-cli').artifacts.find(a=>a.artifactId==='user-settings')
   artifact.paths={WINDOWS:['${HOME}/.custom/gemini.json'],MACOS:['${HOME}/.custom/gemini.json'],LINUX:['${HOME}/.custom/gemini.json']}
   await put('.custom/gemini.json','{"mcpServers":{"good":{"command":"node"}}}')
   const custom=new AgentResourceService({
     home:root,backupDirectory:path.join(root,'.ccb/resource-backups'),
     registryService:{getTool:async id=>defs.find(t=>t.toolId===id)},
     detectionService:new ToolDetectionService({pathVariables:{HOME:root,CCB_DATA:path.join(root,'.ccb')}})
   })
   expect((await custom.listResources({toolId:'gemini-cli',kind:'MCP'})).resources).toHaveLength(1)
   const sources=await custom.discoverImportSources({},19)
   expect(sources.some(s=>s.toolId==='gemini-cli' && s.kinds.includes('MCP'))).toBe(true)
 })

 it('shows known shared Skill junctions as read-only, allows explicit copying and refuses source writes',async()=>{
   const original=skill('shared')
   await put('.agents/skills/shared/SKILL.md',original)
   await put('.agents/skills/shared/references/binary.bin',Buffer.from([0,255,17]))
   await mkdir(path.join(root,'.claude/skills'),{recursive:true})
   const link=path.join(root,'.claude/skills/shared')
   await symlink(path.join(root,'.agents/skills/shared'),link,'junction')
   const q={toolId:'claude-code',kind:'SKILL'}
   const listed=await service.listResources(q)
   const row=listed.resources.find(item=>item.name==='shared')
   expect(row).toMatchObject({status:'READ_ONLY',writable:false})
   expect((await service.readResource({...q,resourceId:row.resourceId})).content).toBe(original)
   await expect(service.saveResource({...q,name:row.name,resourceId:row.resourceId,expectedRevision:row.revision,content:original+'Changed.'})).rejects.toThrow('只读')
   await expect(service.deleteResource({...q,resourceId:row.resourceId,expectedRevision:row.revision})).rejects.toThrow('只读')
   const source=(await service.discoverImportSources({kind:'SKILL'},51)).find(item=>item.toolId==='claude-code'&&item.kinds.includes('SKILL'))
   const item=(await service.listImportResources({sourceId:source.sourceId,kind:'SKILL'},51)).resources.find(item=>item.name==='shared')
   const preview=await service.previewResourceImport({sourceId:source.sourceId,targetToolId:'gemini-cli',kind:'SKILL',resourceIds:[item.resourceId]},51)
   expect(preview.items[0].status).toBe('READY')
   expect((await service.applyResourceImport({previewId:preview.previewId,decisions:[{resourceId:item.resourceId,action:'IMPORT'}]},51)).results[0].status).toBe('IMPORTED')
   expect(await readFile(path.join(root,'.gemini/skills/shared/references/binary.bin'))).toEqual(Buffer.from([0,255,17]))
   expect(await readFile(path.join(root,'.agents/skills/shared/SKILL.md'),'utf8')).toBe(original)
 })

 it('rechecks a junction target and its independent whitelist before every read and import',async()=>{
   await put('.agents/skills/shared/SKILL.md',skill('shared'))
   await put('private/shared/SKILL.md',skill('shared')+'PRIVATE-UNAUTHORIZED')
   await mkdir(path.join(root,'.claude/skills'),{recursive:true})
   const link=path.join(root,'.claude/skills/shared')
   await symlink(path.join(root,'.agents/skills/shared'),link,'junction')
   const q={toolId:'claude-code',kind:'SKILL'}
   const row=(await service.listResources(q)).resources[0]
   const source=(await service.discoverImportSources({kind:'SKILL'},52)).find(item=>item.toolId==='claude-code'&&item.kinds.includes('SKILL'))
   const preview=await service.previewResourceImport({sourceId:source.sourceId,targetToolId:'gemini-cli',kind:'SKILL',resourceIds:[row.resourceId]},52)
   await rm(link)
   await symlink(path.join(root,'private/shared'),link,'junction')
   const restricted=await service.listResources(q)
   expect(restricted.resources[0]).toMatchObject({status:'BLOCKED',writable:false})
   expect(JSON.stringify(restricted)).not.toContain('PRIVATE-UNAUTHORIZED')
   await expect(service.readResource({...q,resourceId:row.resourceId})).rejects.toThrow()
   await expect(service.applyResourceImport({previewId:preview.previewId,decisions:[{resourceId:row.resourceId,action:'IMPORT'}]},52)).rejects.toThrow()
   await expect(readFile(path.join(root,'.gemini/skills/shared/SKILL.md'))).rejects.toThrow()
   await rm(link)
   await symlink(path.join(root,'.agents/skills/shared'),link,'junction')
   definitions.find(tool=>tool.toolId==='codex-cli').artifacts.find(artifact=>artifact.artifactId==='skills').capabilities=['DISCOVER']
   expect((await service.listResources(q)).resources[0]).toMatchObject({status:'BLOCKED',writable:false})
 })

 it('reads an authorized linked collection as references while refusing every write through its root',async()=>{
   await put('.agents/skills/shared/SKILL.md',skill('shared'))
   await mkdir(path.join(root,'.claude'),{recursive:true})
   await symlink(path.join(root,'.agents/skills'),path.join(root,'.claude/skills'),'junction')
   const q={toolId:'claude-code',kind:'SKILL'}
   const listed=await service.listResources(q)
   expect(listed.writable).toBe(false)
   expect(listed.resources[0]).toMatchObject({status:'READ_ONLY',writable:false})
   expect((await service.readResource({...q,resourceId:listed.resources[0].resourceId})).content).toContain('Read changes.')
   await expect(service.saveResource({...q,name:'new',content:skill('new')})).rejects.toThrow()
   const sources=await service.discoverImportSources({kind:'SKILL'},53)
   const source=sources.find(item=>item.toolId==='claude-code'&&item.kinds.includes('SKILL'))
   expect(source.status).toBe('FOUND')
   expect((await service.listImportResources({sourceId:source.sourceId,kind:'SKILL'},53)).resources[0].status).toBe('READ_ONLY')
 })

 it('retains invalid resource placeholders so same-name creation cannot overwrite their files',async()=>{
   const bad='x'.repeat(1024*1024+1)
   await put('.claude/skills/bad/SKILL.md',bad)
   await put('.claude/skills/good/SKILL.md',skill('good'))
   const q={toolId:'claude-code',kind:'SKILL'}
   const list=await service.listResources(q)
   expect(list.resources.find(row=>row.name==='bad')).toMatchObject({status:'INVALID',writable:false})
   await expect(service.saveResource({...q,name:'bad',content:skill('bad')})).rejects.toThrow('同名')
   expect(await readFile(path.join(root,'.claude/skills/bad/SKILL.md'),'utf8')).toBe(bad)
   await put('.claude.json','{"mcpServers":{"bad":null,"good":{"command":"old"}}}')
   const mcp={toolId:'claude-code',kind:'MCP'}
   const rows=(await service.listResources(mcp)).resources
   expect(rows.find(row=>row.name==='bad')).toMatchObject({status:'INVALID',writable:false})
   await expect(service.saveResource({...mcp,name:'bad',content:'{"command":"new"}'})).rejects.toThrow('同名')
   const good=rows.find(row=>row.name==='good')
   await service.saveResource({...mcp,name:'good',content:'{"command":"new"}',resourceId:good.resourceId,expectedRevision:good.revision})
   expect(JSON.parse(await readFile(path.join(root,'.claude.json'),'utf8')).mcpServers).toEqual({bad:null,good:{command:'new'}})
 })

 it('scans only the requested kind and refreshes a reused source id through missing, valid and invalid states',async()=>{
   await mkdir(path.join(root,'outside'),{recursive:true})
   await mkdir(path.join(root,'.cursor'),{recursive:true})
   await symlink(path.join(root,'outside'),path.join(root,'.cursor/skills'),'junction')
   const first=await service.discoverImportSources({kind:'MCP'},54)
   expect(first.some(item=>item.location.includes(path.join('.cursor','skills')))).toBe(false)
   const missing=first.find(item=>item.toolId==='cursor')
   expect(missing).toMatchObject({status:'NOT_FOUND',kinds:[]})
   await put('.cursor/mcp.json','{"mcpServers":{"docs":{"command":"node"}}}')
   const valid=(await service.discoverImportSources({kind:'MCP'},54)).find(item=>item.toolId==='cursor')
   expect(valid).toMatchObject({sourceId:missing.sourceId,status:'FOUND',kinds:['MCP']})
   expect(valid.warnings.join()).not.toContain('不存在')
   await put('.cursor/mcp.json','{broken')
   const invalid=(await service.discoverImportSources({kind:'MCP'},54)).find(item=>item.toolId==='cursor')
   expect(invalid).toMatchObject({sourceId:missing.sourceId,status:'INVALID',kinds:[]})
   await expect(service.listImportResources({sourceId:valid.sourceId,kind:'MCP'},54)).rejects.toThrow('JSON')
 })

 it('does not read a managed import path after the effective registry changes',async()=>{
   await put('.gemini/settings.json','{"mcpServers":{"docs":{"command":"node"}}}')
   const source=(await service.discoverImportSources({kind:'MCP'},55)).find(item=>item.toolId==='gemini-cli'&&item.kinds.includes('MCP'))
   definitions.find(tool=>tool.toolId==='gemini-cli').artifacts.find(artifact=>artifact.artifactId==='user-settings').paths={WINDOWS:['${HOME}/other.json'],MACOS:['${HOME}/other.json'],LINUX:['${HOME}/other.json']}
   await expect(service.listImportResources({sourceId:source.sourceId,kind:'MCP'},55)).rejects.toThrow('不再被')
 })

 it('accepts a native plain Cursor Skill while reporting missing requirements of a different target',async()=>{
   const body='# Plain native skill\nRead changes.\n'
   await put('.cursor/skills/plain/SKILL.md',body)
   const source=(await service.discoverImportSources({kind:'SKILL'},56)).find(item=>item.toolId==='cursor'&&item.kinds.includes('SKILL'))
   const item=(await service.listImportResources({sourceId:source.sourceId,kind:'SKILL'},56)).resources[0]
   const compatible=await service.previewResourceImport({sourceId:source.sourceId,targetToolId:'claude-code',kind:'SKILL',resourceIds:[item.resourceId]},56)
   expect(compatible.items[0].status).toBe('READY')
   expect((await service.applyResourceImport({previewId:compatible.previewId,decisions:[{resourceId:item.resourceId,action:'IMPORT'}]},56)).results[0].status).toBe('IMPORTED')
   expect(await readFile(path.join(root,'.claude/skills/plain/SKILL.md'),'utf8')).toBe(body)
   const blocked=await service.previewResourceImport({sourceId:source.sourceId,targetToolId:'codex-cli',kind:'SKILL',resourceIds:[item.resourceId]},56)
   expect(blocked.items[0].status).toBe('BLOCKED')
   expect(blocked.items[0].errors.join()).toContain('目标 Skill')
 })

 it('does not activate an OpenCode Skill whose known native configuration denies Skill access',async()=>{
   await put('.config/opencode/opencode.jsonc','{"permission":{"skill":{"secret":"deny"}}}')
   await put('.config/opencode/skills/secret/SKILL.md',skill('secret'))
   const source=(await service.discoverImportSources({kind:'SKILL'},57)).find(item=>item.toolId==='opencode'&&item.kinds.includes('SKILL'))
   const item=(await service.listImportResources({sourceId:source.sourceId,kind:'SKILL'},57)).resources[0]
   const preview=await service.previewResourceImport({sourceId:source.sourceId,targetToolId:'claude-code',kind:'SKILL',resourceIds:[item.resourceId]},57)
   expect(preview.items[0].status).toBe('BLOCKED')
   await expect(service.applyResourceImport({previewId:preview.previewId,decisions:[{resourceId:item.resourceId,action:'IMPORT'}]},57)).rejects.toThrow()
   await expect(readFile(path.join(root,'.claude/skills/secret/SKILL.md'))).rejects.toThrow()
 })

 it('expires an OpenCode Skill preview when its global permission policy changes',async()=>{
   await put('.config/opencode/opencode.jsonc','{}')
   await put('.config/opencode/skills/review/SKILL.md',skill('review'))
   const source=(await service.discoverImportSources({kind:'SKILL'},58)).find(item=>item.toolId==='opencode'&&item.kinds.includes('SKILL'))
   const item=(await service.listImportResources({sourceId:source.sourceId,kind:'SKILL'},58)).resources[0]
   const preview=await service.previewResourceImport({sourceId:source.sourceId,targetToolId:'claude-code',kind:'SKILL',resourceIds:[item.resourceId]},58)
   await put('.config/opencode/opencode.jsonc','{"tools":{"skill":false}}')
   await expect(service.applyResourceImport({previewId:preview.previewId,decisions:[{resourceId:item.resourceId,action:'IMPORT'}]},58)).rejects.toThrow()
   await expect(readFile(path.join(root,'.claude/skills/review/SKILL.md'))).rejects.toThrow()
 })

 it.each(['MCP','SUBAGENT'])('blocks OpenCode %s when the native global/inline policy cannot be carried with that resource',async kind=>{
   await put('.config/opencode/opencode.jsonc','{"permission":{"edit":"deny"},"mcp":{"review":{"type":"local","command":["node"]}},"agent":{"review":{"permission":{"bash":"deny"}}}}')
   await put('.config/opencode/agents/review.md','---\ndescription: Review changes\nmode: subagent\n---\nRead only.\n')
   const source=(await service.discoverImportSources({kind},59)).find(item=>item.toolId==='opencode'&&item.kinds.includes(kind))
   const item=(await service.listImportResources({sourceId:source.sourceId,kind},59)).resources[0]
   const preview=await service.previewResourceImport({sourceId:source.sourceId,targetToolId:'claude-code',kind,resourceIds:[item.resourceId]},59)
   expect(preview.items[0].status).toBe('BLOCKED')
   expect(preview.items[0].errors.join()).toContain('权限')
 })

 it('reports an unconfirmed TRAE desktop MCP location as blocked instead of not installed',async()=>{
   const source=(await service.discoverImportSources({kind:'MCP'},60)).find(item=>item.toolId==='trae')
   expect(source).toMatchObject({status:'BLOCKED',kinds:[]})
   expect(source.warnings.join()).toContain('桌面全局默认位置尚未确认')
 })
})

afterEach(async () => {
  vi.unstubAllGlobals()
  if (path.dirname(root) !== await realpath(evidenceRoot) || !path.basename(root).startsWith('fixture-')) throw new Error('Unexpected fixture cleanup path')
  await rm(root, { recursive: true, force: true })
})
