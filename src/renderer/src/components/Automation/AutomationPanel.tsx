/**
 * 自动化规则面板组件
 * 提供规则管理和执行功能
 */

import React, { useState, useEffect } from 'react';
import { Card, Button, Input, Switch, Modal, message, Empty, Spin, Tag, Typography } from 'antd';
import { PlusOutlined, PlayCircleOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import { useRuleStore } from '../../store/rule-store';
import RuleEditor from './RuleEditor';
import './AutomationPanel.css'
import { useTranslation } from '../../locales/useTranslation'

const { Search } = Input;
const { Text } = Typography


/**
 * 自动化规则面板组件
 */
const AutomationPanel: React.FC = () => {
  const {
    rules,
    selectedRule,
    isLoading,
    error,
    stats,
    setSelectedRule,
    refreshRules,
    deleteRule,
    toggleRule,
    executeRule,
    loadExecutionLogs,
    loadStats
  } = useRuleStore()

  const { t } = useTranslation()

  const [searchText, setSearchText] = useState('')
  const [editorVisible, setEditorVisible] = useState(false)

  const weekdayMap: Record<number, string> = {
    0: t('automation.weekday.sun'),
    1: t('automation.weekday.mon'),
    2: t('automation.weekday.tue'),
    3: t('automation.weekday.wed'),
    4: t('automation.weekday.thu'),
    5: t('automation.weekday.fri'),
    6: t('automation.weekday.sat')
  }

  useEffect(() => {
    refreshRules()
    loadExecutionLogs()
    loadStats()
  }, [refreshRules, loadExecutionLogs, loadStats])

  // 处理搜索
  const handleSearch = (value: string) => {
    setSearchText(value)
  }

  // 处理规则选择
  const handleRuleSelect = (rule: any) => {
    setSelectedRule(rule)
  }

  // 处理规则切换
  const handleToggleRule = async (ruleId: string, enabled: boolean) => {
    try {
      await toggleRule(ruleId, enabled)
      message.success(enabled ? t('automation.messages.enabled') : t('automation.messages.disabled'))
    } catch (error) {
      message.error(t('automation.messages.toggleFailed'))
    }
  }

  // 处理规则执行
  const handleExecuteRule = async (ruleId: string) => {
    try {
      const result = await executeRule(ruleId)
      const stdout = result?.result?.stdout
      const stderr = result?.result?.stderr
      const hasOutput = (stdout && String(stdout).trim().length > 0) || (stderr && String(stderr).trim().length > 0)

      if (hasOutput) {
        Modal.info({
          title: t('automation.executeResult'),
          width: 640,
          content: (
            <pre style={{ maxHeight: 320, overflow: 'auto', whiteSpace: 'pre-wrap' }}>
              {[stdout, stderr].filter(Boolean).join('\n')}
            </pre>
          )
        })
      } else {
        message.success(t('automation.executeCompleted'))
      }
    } catch (error) {
      message.error(t('automation.executeFailed'))
    }
  }

  // 处理规则删除
  const handleDeleteRule = async (ruleId: string) => {
    try {
      await deleteRule(ruleId)
      message.success(t('automation.messages.deleteSuccess'))
    } catch (error) {
      message.error(t('automation.messages.deleteFailed'))
    }
  }

  // 打开编辑器
  const openEditor = (rule: any | null) => {
    setSelectedRule(rule);
    setEditorVisible(true);
  }

  // 过滤规则
  const filteredRules = rules.filter(rule =>
    rule.name.toLowerCase().includes(searchText.toLowerCase())
  )

  if (error) {
    return (
      <div style={{ padding: '24px', textAlign: 'center' }}>
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={
            <div>
              <div>{error}</div>
              <Button type="primary" onClick={refreshRules} style={{ marginTop: 16 }}>
                {t('automation.actions.reload')}
              </Button>
            </div>
          }
        />
      </div>
    )
  }

  return (
    <div className="automation-panel">
      {/* 头部 */}
      <div className="automation-header">
        <div>
          <h2 style={{ margin: 0, marginBottom: 8 }}>{t('automation.title')}</h2>
          <Text type="secondary">{t('automation.subtitle')}</Text>
        </div>
        <div className="automation-header-actions">
          <Search
            placeholder={t('automation.searchPlaceholder')}
            allowClear
            style={{ width: 300 }}
            onSearch={handleSearch}
            onChange={(e) => !e.target.value && setSearchText('')}
          />
          <Button type="primary" icon={<PlusOutlined />} onClick={() => openEditor(null)}>
            {t('automation.createRule')}
          </Button>
        </div>
      </div>

      {/* 统计信息 */}
      <div className="automation-stats">
        <div className="automation-stats-grid">
          <Card size="small">
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '24px', fontWeight: 600, color: '#1890ff', marginBottom: '4px' }}>
                {stats.totalRules || rules.length}
              </div>
              <div style={{ color: '#666', fontSize: '12px' }}>{t('automation.stats.totalRules')}</div>
            </div>
          </Card>
          <Card size="small">
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '24px', fontWeight: 600, color: '#52c41a', marginBottom: '4px' }}>
                {stats.activeRules || rules.filter(r => r.enabled).length}
              </div>
              <div style={{ color: '#666', fontSize: '12px' }}>{t('automation.stats.activeRules')}</div>
            </div>
          </Card>
          <Card size="small">
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '24px', fontWeight: 600, color: '#faad14', marginBottom: '4px' }}>
                {stats.totalExecutions || 0}
              </div>
              <div style={{ color: '#666', fontSize: '12px' }}>{t('automation.stats.totalExecutions')}</div>
            </div>
          </Card>
          <Card size="small">
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '24px', fontWeight: 600, color: '#f5222d', marginBottom: '4px' }}>
                {stats.failedExecutions || 0}
              </div>
              <div style={{ color: '#666', fontSize: '12px' }}>{t('automation.stats.failedExecutions')}</div>
            </div>
          </Card>
        </div>
      </div>

      {/* 规则列表 */}
      <div className="automation-content">
        <Card className="automation-list-card">
          {isLoading ? (
            <div style={{ textAlign: 'center', padding: '40px' }}>
              <Spin size="large" />
            </div>
          ) : filteredRules.length === 0 ? (
            <Empty description={t('automation.empty')} />
          ) : (
            <div>
              {filteredRules.map(rule => (
                <Card
                  key={rule.id}
                  size="small"
                  className={selectedRule?.id === rule.id ? 'automation-rule-card is-selected' : 'automation-rule-card'}
                  onClick={() => handleRuleSelect(rule)}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontWeight: 500, marginBottom: '4px' }}>{rule.name}</div>
                      <div style={{ color: '#666', fontSize: '12px', marginBottom: '8px' }}>
                        {rule.trigger.time} - {rule.trigger.days.map(d => weekdayMap[d] ?? String(d)).join(', ')}
                      </div>
                      <div>
                        <Tag color={rule.action.type === 'custom-command' ? 'purple' : 'blue'}>
                          {rule.action.type === 'custom-command'
                            ? t('automation.action.command')
                            : t('automation.action.switchConfig')}
                        </Tag>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Switch
                        checked={rule.enabled}
                        onChange={(checked) => handleToggleRule(rule.id, checked)}
                        onClick={(_checked, e) => e.stopPropagation()}
                      />
                      <Button
                        type="text"
                        size="small"
                        icon={<PlayCircleOutlined />}
                        onClick={(e) => {
                          e.stopPropagation()
                          handleExecuteRule(rule.id)
                        }}
                      />
                      <Button
                        type="text"
                        size="small"
                        icon={<EditOutlined />}
                        onClick={(e) => {
                          e.stopPropagation()
                          openEditor(rule)
                        }}
                      />
                      <Button
                        type="text"
                        size="small"
                        icon={<DeleteOutlined />}
                        danger
                        onClick={(e) => {
                          e.stopPropagation()
                          handleDeleteRule(rule.id)
                        }}
                      />
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </Card>

        <Card className="automation-detail-card">
          {selectedRule ? (
            <div>
              <h3 style={{ marginBottom: 8 }}>{selectedRule.name}</h3>
              {selectedRule.action.type === 'switch-config' ? (
                <p>
                  <strong>{t('automation.detail.action')}:</strong> {t('automation.detail.switchTo')} {selectedRule.action.targetConfigPath.split('\\').pop()}
                </p>
              ) : (
                <>
                  <p><strong>{t('automation.detail.action')}:</strong> {t('automation.action.command')}</p>
                  <p><strong>{t('automation.detail.command')}:</strong> <Text code>{selectedRule.action.command}</Text></p>
                  {selectedRule.action.workingDirectory && (
                    <p><strong>{t('automation.detail.cwd')}:</strong> <Text code>{selectedRule.action.workingDirectory}</Text></p>
                  )}
                </>
              )}
              <div style={{ marginTop: '16px' }}>
                <p><strong>{t('automation.detail.trigger')}:</strong> {selectedRule.trigger.time} {t('automation.detail.at')} {selectedRule.trigger.days.map(d => weekdayMap[d] ?? String(d)).join(', ')}</p>
                <p><strong>{t('automation.detail.status')}:</strong> {selectedRule.enabled ? t('automation.status.enabled') : t('automation.status.disabled')}</p>
              </div>
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '40px', color: '#999' }}>
              {t('automation.selectRule')}
            </div>
          )}
        </Card>
      </div>

      {/* 规则编辑器模态框 */}
      {editorVisible && (
        <RuleEditor
          visible={editorVisible}
          onClose={() => setEditorVisible(false)}
          rule={selectedRule}
        />
      )}
    </div>
  )
}


export default AutomationPanel