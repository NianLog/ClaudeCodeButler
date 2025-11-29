/**
 * @file RuleEditor.tsx
 * @description 自动化规则的创建/编辑表单 (UI/UX优化版)
 */

import React, { useEffect, useState } from 'react';
import { Modal, Form, Input, Switch, TimePicker, Checkbox, Select, Button, App as AntdApp, Space, Divider, Typography } from 'antd';
import { useRuleStore } from '../../store/rule-store';
import { useConfigListStore } from '../../store/config-list-store';
import { AutomationRule, TimeTrigger } from '@shared/types/rules';
import dayjs from 'dayjs';

const { Option } = Select;
const { Text } = Typography;

interface RuleEditorProps {
  visible: boolean;
  onClose: () => void;
  rule: AutomationRule | null;
}

const weekDaysOptions = [
  { label: '周一', value: 1 },
  { label: '周二', value: 2 },
  { label: '周三', value: 3 },
  { label: '周四', value: 4 },
  { label: '周五', value: 5 },
  { label: '周六', value: 6 },
  { label: '周日', value: 0 },
];

const RuleEditor: React.FC<RuleEditorProps> = ({ visible, onClose, rule }) => {
  const [form] = Form.useForm();
  const { message } = AntdApp.useApp();
  const { createRule, updateRule } = useRuleStore();
  const { configs } = useConfigListStore();
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (visible && rule) {
      const trigger = rule.trigger as TimeTrigger;
      form.setFieldsValue({
        name: rule.name,
        enabled: rule.enabled,
        time: dayjs(trigger.time, 'HH:mm'),
        days: trigger.days,
        targetConfigPath: rule.action.targetConfigPath,
      });
    } else if (visible) {
      form.resetFields();
      form.setFieldsValue({ enabled: true, days: [1, 2, 3, 4, 5], time: dayjs('09:00', 'HH:mm') });
    }
  }, [visible, rule, form]);

  const handleFinish = async (values: any) => {
    setIsSubmitting(true);
    try {
      const ruleData = {
        name: values.name,
        enabled: values.enabled,
        trigger: {
          type: 'time' as const,
          time: values.time.format('HH:mm'),
          days: values.days,
        },
        action: {
          type: 'switch-config' as const,
          targetConfigPath: values.targetConfigPath,
        },
      };

      if (rule) {
        await updateRule(rule.id, ruleData);
        message.success('规则更新成功');
      } else {
        await createRule(ruleData as any);
        message.success('规则创建成功');
      }
      onClose();
    } catch (error) {
      message.error(error instanceof Error ? error.message : '操作失败');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      title={rule ? '编辑规则' : '创建新规则'}
      open={visible}
      onCancel={onClose}
      footer={null}
      width={640}
      destroyOnHidden
    >
      <Form form={form} layout="vertical" onFinish={handleFinish} style={{ marginTop: 24 }}>
        <Form.Item name="name" label="规则名称" rules={[{ required: true, message: '请输入规则名称' }]}>
          <Input placeholder="例如：工作日上班自动切换为高性能配置" />
        </Form.Item>

        <Divider>触发条件</Divider>

        <Form.Item label="当满足以下时间条件时：">
          <Space align="baseline">
            <Text>在每周的</Text>
            <Form.Item name="days" noStyle rules={[{ required: true, message: '请选择周期' }]}>
              <Checkbox.Group options={weekDaysOptions} />
            </Form.Item>
            <Text>的</Text>
            <Form.Item name="time" noStyle rules={[{ required: true, message: '请选择时间' }]}>
              <TimePicker format="HH:mm" minuteStep={5} />
            </Form.Item>
          </Space>
        </Form.Item>

        <Divider>执行动作</Divider>

        <Form.Item name="targetConfigPath" label="自动切换到以下配置文件：" rules={[{ required: true, message: '请选择目标配置文件' }]}>
          <Select placeholder="选择一个 claude-code 类型的配置文件">
            {configs
              .filter(c => !c.isSystemConfig && c.type === 'claude-code') // 仅显示 claude-code 类型的用户配置
              .map(c => (
                <Option key={c.path} value={c.path}>
                  {c.name}
                </Option>
              ))}
          </Select>
        </Form.Item>

        <Form.Item name="enabled" label="启用此规则" valuePropName="checked" style={{ marginTop: 32 }}>
          <Switch />
        </Form.Item>

        <Form.Item style={{ textAlign: 'right', marginTop: 24, marginBottom: 0 }}>
          <Space>
            <Button onClick={onClose}>
              取消
            </Button>
            <Button type="primary" htmlType="submit" loading={isSubmitting}>
              {rule ? '保存更改' : '创建规则'}
            </Button>
          </Space>
        </Form.Item>
      </Form>
    </Modal>
  );
};

export default RuleEditor;
