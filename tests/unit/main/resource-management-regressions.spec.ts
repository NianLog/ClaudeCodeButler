import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdir, mkdtemp, readFile, realpath, symlink, writeFile, rm } from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import builtin from '../../../src/shared/builtin-tool-registry.json'
import { AgentResourceService } from '../../../src/main/services/agent-resource-service'
import { ToolDetectionService } from '../../../src/main/services/tool-detection-service'
import { ToolArtifactDiscoveryService } from '../../../src/main/services/tool-artifact-discovery-service'
import { ToolArtifactManagementService } from '../../../src/main/services/tool-artifact-management-service'
import { digest } from '../../../src/main/services/agent-resource-files'
import { SkillsManagementService } from '../../../src/main/services/skills-management-service'
import { agentsManagementService } from '../../../src/main/services/agents-management-service'
import { useSkillsManagementStore } from '../../../src/renderer/src/store/skills-management-store'
import { useAgentsManagementStore } from '../../../src/renderer/src/store/agents-management-store'
import { LegacyResourceEditor } from '../../../src/main/services/legacy-resource-editor'
vi.mock('../../../src/main/utils/logger.ts', () => ({logger: {info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn()}}))

const evidenceRoot = os.tmpdir()
let root, service, artifacts, editor
const skill = name => '---\nname: '+name+'\ndescription: Audit fixture\n---\nRead changes.\n'
const put = async (relative, content) => {
  const file=path.join(root,relative)
  await mkdir(path.dirname(file),{recursive:true})
  await writeFile(file,content)
  return file
}
beforeEach(async ()=>{
  root=await realpath(await mkdtemp(path.join(evidenceRoot,'fixture-')))
  const definitions=structuredClone(builtin.tools)
  const registry={getTool:async id=>definitions.find(t=>t.toolId===id)}
  const detection=new ToolDetectionService({pathVariables:{HOME:root,CCB_DATA:path.join(root,'.ccb'),XDG_CONFIG_HOME:path.join(root,'.config')}})
  const backups=path.join(root,'.ccb','resource-backups')
  service=new AgentResourceService({home:root,backupDirectory:backups,registryService:registry,detectionService:detection})
  artifacts=new ToolArtifactManagementService({discoveryService:new ToolArtifactDiscoveryService({registryService:registry,detectionService:detection}),backupDirectory:path.join(backups,'artifacts')})
  editor=new LegacyResourceEditor(service,root)
  useSkillsManagementStore.setState({ skills: [], editingSkill: null, isFormModalOpen: true })
  useAgentsManagementStore.setState({ agents: [], editingAgent: null, isFormModalOpen: true })
})


describe('resource write and recovery regression cases',()=>{

  it('R4 MCP deletion must expose a resource-level restorable backup',async()=>{
    await put('.claude.json','{"theme":"old","mcpServers":{"good":{"command":"node"}}}')
    const q={toolId:'claude-code',kind:'MCP'}
    const item=(await service.listResources(q)).resources[0]
    await service.deleteResource({...q,resourceId:item.resourceId,expectedRevision:item.revision})
    expect((await service.discoverResourceBackups(q,7)).some(source=>source.kinds.includes('MCP'))).toBe(true)
  })

  it('R5 restore must retain the current native file as a rollback point',async()=>{
    const original='{"theme":"old","mcpServers":{"good":{"command":"node"}}}'
    const changed='{"theme":"new","mcpServers":{"later":{"command":"node"}}}'
    const file=await put('.claude.json',original)
    const backup=await artifacts.createBackup('claude-code','mcp-registry',file)
    await writeFile(file,changed)
    await artifacts.restoreBackup(backup.backupId,digest(changed))
    const backups=await artifacts.listBackups('claude-code','mcp-registry',file)
    expect(backups.length).toBe(2)
    const snapshots=await Promise.all(backups.map(b=>readFile(path.join(root,'.ccb/resource-backups/artifacts',b.backupId+'.backup'),'utf8')))
    expect(snapshots).toContain(changed)
  })

  it('R6 Qoder native excluded state must not become an enabled Codex server',async()=>{
    await put('.qoder/settings.json','{"mcp":{"excluded":["blocked"]},"mcpServers":{"blocked":{"command":"node"}}}')
    const source=(await service.discoverImportSources({},8)).find(s=>s.toolId==='qoder')
    const item=(await service.listImportResources({sourceId:source.sourceId,kind:'MCP'},8)).resources[0]
    const preview=await service.previewResourceImport({sourceId:source.sourceId,targetToolId:'codex-cli',kind:'MCP',resourceIds:[item.resourceId]},8)
    const receipt=await service.applyResourceImport({previewId:preview.previewId,decisions:[{resourceId:item.resourceId,action:'IMPORT'}]},8)
    const imported=(await service.listResources({toolId:'codex-cli',kind:'MCP'})).resources[0]
    const native=await service.readResource({toolId:'codex-cli',kind:'MCP',resourceId:imported.resourceId})
    expect(receipt.results[0].status).toBe('IMPORTED')
    expect(native.content).toMatch(/enabled\s*=\s*false/)
  })

  it('R9 corrupt unrelated backup metadata must not hide valid recovery points',async()=>{
    const q={toolId:'claude-code',kind:'SUBAGENT'}
    const saved=await service.saveResource({...q,name:'good',content:skill('good')})
    await service.deleteResource({...q,resourceId:saved.resourceId,expectedRevision:saved.revision})
    await put('.ccb/resource-backups/11111111-1111-4111-8111-111111111111/metadata.json','{broken')
    const sources=await service.discoverResourceBackups(q,11)
    expect(sources.some(source=>source.kinds.includes('SUBAGENT'))).toBe(true)
  })

  it('R10 backup content tampering must be rejected before any restore write',async()=>{
    const file=await put('.claude.json','{"mcpServers":{"good":{"command":"node"}}}')
    const backup=await artifacts.createBackup('claude-code','mcp-registry',file)
    const current='{"theme":"keep","mcpServers":{}}'
    await writeFile(file,current)
    await writeFile(path.join(root,'.ccb/resource-backups/artifacts',backup.backupId+'.backup'),'{"mcpServers":{"changed":{"command":"different"}}}')
    await expect(artifacts.restoreBackup(backup.backupId,digest(current))).rejects.toThrow(/摘要|校验|损坏|大小/)
    expect(await readFile(file,'utf8')).toBe(current)
  })

 it('R11 stale native-file editing must reject overwriting external changes',async()=>{
   const file=await put('.codex/config.toml','model="original"\n')
   const snapshot=await readFile(file,'utf8')
   await writeFile(file,'model="external-change"\n')
   await expect(artifacts.editArtifact('codex-cli','user-config',file,snapshot+'# draft\n',digest(snapshot))).rejects.toThrow('变化')
   expect(await readFile(file,'utf8')).toBe('model="external-change"\n')
 })

 it('R12 editing a legacy Skill must preserve package attachments',async()=>{
   await put('.claude/skills/good/SKILL.md',skill('good'))
   const attachment=await put('.claude/skills/good/references/notes.txt','keep attachment')
   const legacy=new SkillsManagementService(path.join(root,'.claude/skills'))
   vi.stubGlobal('window',{electronAPI:{skills:{
     delete:async id=>{await legacy.deleteSkill(id);return {success:true}},
     add:async data=>({success:true,data:await legacy.addSkill(data)}),
     update:async (id,data,revision)=>({success:true,data:await editor.updateSkill(id,data,revision)}),
     scan:async()=>({success:true,data:await legacy.scanSkills()})
   }}})
   await useSkillsManagementStore.getState().loadSkills()
   await useSkillsManagementStore.getState().updateSkill('good',{name:'good',description:'Changed',content:'Changed prompt.'})
   expect(await readFile(attachment,'utf8')).toBe('keep attachment')
 })

 it('R13 failed legacy Skill update must leave the old package in place',async()=>{
   const file=await put('.claude/skills/good/SKILL.md',skill('good'))
   const legacy=new SkillsManagementService(path.join(root,'.claude/skills'))
   vi.stubGlobal('window',{electronAPI:{skills:{
     delete:async id=>{await legacy.deleteSkill(id);return {success:true}},
     add:async()=>({success:false,error:'injected write failure'}),
     update:async()=>({success:false,error:'injected write failure'})
   }}})
   useSkillsManagementStore.setState({skills:[await legacy.getSkill('good')]})
   await expect(useSkillsManagementStore.getState().updateSkill('good',{name:'good',description:'Changed',content:'Changed.'})).rejects.toThrow('injected')
   expect(await readFile(file,'utf8')).toBe(skill('good'))
 })

 it('R14 failed legacy Agent update must leave the old role in place',async()=>{
   const file=await put('.claude/agents/good.md',skill('good'))
   const legacy=new agentsManagementService.constructor()
   legacy.agentsDir=path.join(root,'.claude/agents')
   vi.stubGlobal('window',{electronAPI:{agents:{
     delete:async id=>{await legacy.deleteAgent(id);return {success:true}},
     add:async()=>({success:false,error:'injected write failure'}),
     update:async()=>({success:false,error:'injected write failure'})
   }}})
   useAgentsManagementStore.setState({agents:[await legacy.getAgent('good')]})
   await expect(useAgentsManagementStore.getState().updateAgent('good',{name:'good',description:'Changed',content:'Changed.'})).rejects.toThrow('injected')
   expect(await readFile(file,'utf8')).toBe(skill('good'))
 })

 it('R18 legacy role editing must retain disallowed tools and permission mode',async()=>{
   const original='---\nname: good\ndescription: Review\ndisallowedTools: Bash\npermissionMode: plan\n---\nRead only.\n'
   const file=await put('.claude/agents/good.md',original)
   const legacy=new agentsManagementService.constructor()
   legacy.agentsDir=path.join(root,'.claude/agents')
   vi.stubGlobal('window',{electronAPI:{agents:{
     delete:async id=>{await legacy.deleteAgent(id);return {success:true}},
     add:async data=>({success:true,data:await legacy.addAgent(data)}),
     update:async (id,data,revision)=>({success:true,data:await editor.updateAgent(id,data,revision)}),
     scan:async()=>({success:true,data:await legacy.scanAgents()})
   }}})
   await useAgentsManagementStore.getState().loadAgents()
   await useAgentsManagementStore.getState().updateAgent('good',{name:'good',description:'Changed',content:'Changed prompt.'})
   const updated=await readFile(file,'utf8')
   expect(updated).toContain('disallowedTools: Bash')
   expect(updated).toContain('permissionMode: plan')
 })
})

afterEach(async () => {
  vi.unstubAllGlobals()
  if (path.dirname(root) !== await realpath(evidenceRoot) || !path.basename(root).startsWith('fixture-')) throw new Error('Unexpected fixture cleanup path')
  await rm(root, { recursive: true, force: true })
})
