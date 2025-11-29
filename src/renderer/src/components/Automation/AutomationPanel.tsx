/**
 * 自动化规则面板组件
 * 提供规则管理和执行功能
 */

import React, { useState, useEffect } from 'react';
import { Card, Button, Space, Input, Select, Switch, Modal, message, Empty, Spin } from 'antd';
import { PlusOutlined, SearchOutlined, PlayCircleOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import { useRuleStore } from '../../store/rule-store';
import RuleEditor from './RuleEditor';

const { Search } = Input;
const { Option } = Select;


/**
 * 自动化规则面板组件
 */
const AutomationPanel: React.FC = () => {
  const {
    rules,
    selectedRule,
    isLoading,
    error,
    executionLogs,
    stats,
    setSelectedRule,
    refreshRules,
    createRule,
    updateRule,
    deleteRule,
    toggleRule,
    executeRule,
    loadExecutionLogs,
    loadStats
  } = useRuleStore()

  const [searchText, setSearchText] = useState('')
  const [editorVisible, setEditorVisible] = useState(false)

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
      message.success(`规则已${enabled ? '启用' : '禁用'}`)
    } catch (error) {
      message.error('操作失败')
    }
  }

  // 处理规则执行
  const handleExecuteRule = async (ruleId: string) => {
    try {
      await executeRule(ruleId)
      message.success('规则执行成功')
    } catch (error) {
      message.error('规则执行失败')
    }
  }

  // 处理规则删除
  const handleDeleteRule = async (ruleId: string) => {
    try {
      await deleteRule(ruleId)
      message.success('规则删除成功')
    } catch (error) {
      message.error('规则删除失败')
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
          description={error}
          extra={
            <Button type="primary" onClick={refreshRules}>
              重新加载
            </Button>
          }
        />
      </div>
    )
  }

  return (
    <div style={{ padding: '24px', height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* 头部 */}
      <div style={{ marginBottom: '24px' }}>
        <h2 style={{ margin: 0, marginBottom: '16px' }}>自动化规则</h2>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Search
            placeholder="搜索规则..."
            allowClear
            style={{ width: 300 }}
            onSearch={handleSearch}
            onChange={(e) => !e.target.value && setSearchText('')}
          />
          <Button type="primary" icon={<PlusOutlined />} onClick={() => openEditor(null)}>
            新建规则
          </Button>
        </div>
      </div>

      {/* 统计信息 */}
      <div style={{ marginBottom: '24px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
          <Card size="small">
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '24px', fontWeight: 600, color: '#1890ff', marginBottom: '4px' }}>
                {stats.totalRules || rules.length}
              </div>
              <div style={{ color: '#666', fontSize: '12px' }}>总规则数</div>
            </div>
          </Card>
          <Card size="small">
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '24px', fontWeight: 600, color: '#52c41a', marginBottom: '4px' }}>
                {stats.activeRules || rules.filter(r => r.enabled).length}
              </div>
              <div style={{ color: '#666', fontSize: '12px' }}>活跃规则</div>
            </div>
          </Card>
          <Card size="small">
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '24px', fontWeight: 600, color: '#faad14', marginBottom: '4px' }}>
                {stats.totalExecutions || 0}
              </div>
              <div style={{ color: '#666', fontSize: '12px' }}>总执行次数</div>
            </div>
          </Card>
          <Card size="small">
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '24px', fontWeight: 600, color: '#f5222d', marginBottom: '4px' }}>
                {stats.failedExecutions || 0}
              </div>
              <div style={{ color: '#666', fontSize: '12px' }}>失败次数</div>
            </div>
          </Card>
        </div>
      </div>

      {/* 规则列表 */}
      <div style={{ flex: 1, display: 'flex', gap: '16px' }}>
        <div style={{ flex: 1, background: 'white', borderRadius: '8px', padding: '16px', overflowY: 'auto' }}>
          {isLoading ? (
            <div style={{ textAlign: 'center', padding: '40px' }}>
              <Spin size="large" />
            </div>
          ) : filteredRules.length === 0 ? (
            <Empty description="暂无规则" />
          ) : (
            <div>
              {filteredRules.map(rule => (
                <Card
                  key={rule.id}
                  size="small"
                  style={{
                    marginBottom: '8px',
                    cursor: 'pointer',
                    border: selectedRule?.id === rule.id ? '1px solid #1890ff' : '1px solid #e8e8e8'
                  }}
                  onClick={() => handleRuleSelect(rule)}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontWeight: 500, marginBottom: '4px' }}>{rule.name}</div>
                      <div style={{ color: '#666', fontSize: '12px', marginBottom: '8px' }}>
                        {rule.trigger.time} - {rule.trigger.days.map(d => `周${d}`).join(', ')}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Switch
                        checked={rule.enabled}
                        onChange={(checked) => handleToggleRule(rule.id, checked)}
                        onClick={(checked, e) => e.stopPropagation()}
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
        </div>

        <div style={{ flex: 1, background: 'white', borderRadius: '8px', padding: '16px' }}>
          {selectedRule ? (
            <div>
              <h3>{selectedRule.name}</h3>
              <p><strong>动作:</strong> 切换到 {selectedRule.action.targetConfigPath.split('\\').pop()}</p>
              <div style={{ marginTop: '16px' }}>
                <p><strong>触发器:</strong> {selectedRule.trigger.time} at {selectedRule.trigger.days.map(d => `周${d}`).join(', ')}</p>
                <p><strong>状态:</strong> {selectedRule.enabled ? '启用' : '禁用'}</p>
              </div>
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '40px', color: '#999' }}>
              选择一个规则查看详情
            </div>
          )}
        </div>
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