import { lazy, Suspense, useState } from 'react'
import { Skeleton, Tabs } from 'antd'
import { AGENT_LABELS, useAgentContextStore } from '../../store/agent-context-store'
import { useTranslation } from '../../locales/useTranslation'

const ClaudeConfigurations = lazy(() => import('./ModernConfigPanel'))
const NativeConfigurations = lazy(() => import('../AIToolManagement/AIToolManagementPanel'))
const ToolConfigSetPanel = lazy(() => import('./ToolConfigSetPanel'))

export default function ConfigurationWorkspace(): React.JSX.Element {
  const { t } = useTranslation()
  const toolId = useAgentContextStore((s) => s.selectedToolId)
  const [tab, setTab] = useState('configurations')
  return <div className="configuration-workspace">
    <Tabs activeKey={tab} onChange={(next) => { useAgentContextStore.getState().requestChange(() => setTab(next)) }} items={[
      { key: 'configurations', label: t('resources.configSets') },
      { key: 'native', label: t('resources.nativeFiles') }
    ]} />
    <Suspense fallback={<Skeleton active />}>
      {tab === 'native' ? <NativeConfigurations key={toolId} /> : toolId === 'claude-code' ? <ClaudeConfigurations />
        : <ToolConfigSetPanel key={toolId} toolId={toolId} toolLabel={AGENT_LABELS[toolId]} />}
    </Suspense>
  </div>
}
