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
import { useTranslation } from '../../locales/useTranslation'

const { Option } = Select;
const { Text } = Typography;

interface RuleEditorProps {
  visible: boolean;
  onClose: () => void;
  rule: AutomationRule | null;
}

const RuleEditor: React.FC<RuleEditorProps> = ({ visible, onClose, rule }) => {
  const { t } = useTranslation()
  const [form] = Form.useForm();
  const { message } = AntdApp.useApp();
  const { createRule, updateRule } = useRuleStore();
  const { configs } = useConfigListStore();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const actionType = Form.useWatch('actionType', form);

  const weekDaysOptions = [
    { label: t('automation.weekday.mon'), value: 1 },
    { label: t('automation.weekday.tue'), value: 2 },
    { label: t('automation.weekday.wed'), value: 3 },
    { label: t('automation.weekday.thu'), value: 4 },
    { label: t('automation.weekday.fri'), value: 5 },
    { label: t('automation.weekday.sat'), value: 6 },
    { label: t('automation.weekday.sun'), value: 0 }
  ];

  useEffect(() => {
    if (visible && rule) {
      const trigger = rule.trigger as TimeTrigger;
      const baseValues: any = {
        name: rule.name,
        enabled: rule.enabled,
        time: dayjs(trigger.time, 'HH:mm'),
        days: trigger.days,
        actionType: rule.action.type,
      };

      if (rule.action.type === 'switch-config') {
        baseValues.targetConfigPath = rule.action.targetConfigPath
      } else if (rule.action.type === 'custom-command') {
        baseValues.command = rule.action.command
        baseValues.workingDirectory = rule.action.workingDirectory
        baseValues.timeout = rule.action.timeout
      }

      form.setFieldsValue(baseValues)
    } else if (visible) {
      form.resetFields();
      form.setFieldsValue({
        enabled: true,
        days: [1, 2, 3, 4, 5],
        time: dayjs('09:00', 'HH:mm'),
        actionType: 'switch-config'
      });
    }
  }, [visible, rule, form]);

  const handleFinish = async (values: any) => {
    setIsSubmitting(true);
    try {
      const baseRule = {
        name: values.name,
        enabled: values.enabled,
        trigger: {
          type: 'time' as const,
          time: values.time.format('HH:mm'),
          days: values.days,
        }
      }

      const action = values.actionType === 'custom-command'
        ? {
            type: 'custom-command' as const,
            command: values.command,
            workingDirectory: values.workingDirectory,
            timeout: values.timeout ? Number(values.timeout) : undefined
          }
        : {
            type: 'switch-config' as const,
            targetConfigPath: values.targetConfigPath
          }

      const ruleData = {
        ...baseRule,
        action
      }

      if (rule) {
        await updateRule(rule.id, ruleData);
        message.success(t('automation.messages.updateSuccess'));
      } else {
        await createRule(ruleData as any);
        message.success(t('automation.messages.createSuccess'));
      }
      onClose();
    } catch (error) {
      message.error(error instanceof Error ? error.message : t('automation.messages.saveFailed'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      title={rule ? t('automation.editor.editTitle') : t('automation.editor.createTitle')}
      open={visible}
      onCancel={onClose}
      footer={null}
      width={640}
      destroyOnHidden
    >
      <Form form={form} layout="vertical" onFinish={handleFinish} style={{ marginTop: 24 }}>
        <Form.Item name="name" label={t('automation.editor.nameLabel')} rules={[{ required: true, message: t('automation.editor.nameRequired') }]}>
          <Input placeholder={t('automation.editor.namePlaceholder')} />
        </Form.Item>

        <Divider>{t('automation.editor.triggerTitle')}</Divider>

        <Form.Item label={t('automation.editor.triggerWhen')}>
          <Space align="baseline">
            <Text>{t('automation.editor.weekPrefix')}</Text>
            <Form.Item name="days" noStyle rules={[{ required: true, message: t('automation.editor.daysRequired') }]}>
              <Checkbox.Group options={weekDaysOptions} />
            </Form.Item>
            <Text>{t('automation.editor.timeSeparator')}</Text>
            <Form.Item name="time" noStyle rules={[{ required: true, message: t('automation.editor.timeRequired') }]}>
              <TimePicker format="HH:mm" minuteStep={5} />
            </Form.Item>
          </Space>
        </Form.Item>

        <Divider>{t('automation.editor.actionTitle')}</Divider>

        <Form.Item name="actionType" label={t('automation.editor.actionTypeLabel')} rules={[{ required: true, message: t('automation.editor.actionTypeRequired') }]}>
          <Select>
            <Option value="switch-config">{t('automation.action.switchConfig')}</Option>
            <Option value="custom-command">{t('automation.action.command')}</Option>
          </Select>
        </Form.Item>

        {actionType === 'switch-config' && (
          <Form.Item name="targetConfigPath" label={t('automation.editor.targetConfigLabel')} rules={[{ required: true, message: t('automation.editor.targetConfigRequired') }]}>
            <Select placeholder={t('automation.editor.targetConfigPlaceholder')}>
              {configs
                .filter(c => !c.isSystemConfig && c.type === 'claude-code')
                .map(c => (
                  <Option key={c.path} value={c.path}>
                    {c.name}
                  </Option>
                ))}
            </Select>
          </Form.Item>
        )}

        {actionType === 'custom-command' && (
          <>
            <Form.Item name="command" label={t('automation.editor.commandLabel')} rules={[{ required: true, message: t('automation.editor.commandRequired') }]}
            >
              <Input placeholder={t('automation.editor.commandPlaceholder')} />
            </Form.Item>
            <Form.Item name="workingDirectory" label={t('automation.editor.workingDirectoryLabel')}>
              <Input placeholder={t('automation.editor.workingDirectoryPlaceholder')} />
            </Form.Item>
            <Form.Item name="timeout" label={t('automation.editor.timeoutLabel')}>
              <Input placeholder={t('automation.editor.timeoutPlaceholder')} />
            </Form.Item>
            <Text type="secondary">{t('automation.editor.commandHint')}</Text>
          </>
        )}

        <Form.Item name="enabled" label={t('automation.editor.enabledLabel')} valuePropName="checked" style={{ marginTop: 32 }}>
          <Switch />
        </Form.Item>

        <Form.Item style={{ textAlign: 'right', marginTop: 24, marginBottom: 0 }}>
          <Space>
            <Button onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button type="primary" htmlType="submit" loading={isSubmitting}>
              {rule ? t('automation.editor.saveChanges') : t('automation.editor.createAction')}
            </Button>
          </Space>
        </Form.Item>
      </Form>
    </Modal>
  );
};

export default RuleEditor;
