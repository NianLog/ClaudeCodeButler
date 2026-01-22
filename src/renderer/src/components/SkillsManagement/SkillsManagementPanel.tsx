/**
 * Skills管理面板组件
 *
 * 功能:
 * - 显示所有Skill目录列表
 * - 查看Skill详情（元数据和SKILL.md内容）
 * - 添加/编辑Skill
 * - 批量导入Skill目录
 * - 删除Skill
 */

import React, { useEffect, useState } from 'react'
import {
  Card,
  Table,
  Button,
  Space,
  Drawer,
  Modal,
  Form,
  Input,
  message,
  Upload,
  Row,
  Col,
  Statistic,
  Divider,
  Typography,
  Popconfirm,
  Tooltip,
  Descriptions
} from 'antd'
import {
  PlusOutlined,
  ReloadOutlined,
  UploadOutlined,
  EyeOutlined,
  EditOutlined,
  DeleteOutlined,
  AppstoreOutlined,
  FolderOutlined,
  FileTextOutlined,
  InboxOutlined,
  FileOutlined
} from '@ant-design/icons'
import { useSkillsManagementStore } from '@/store/skills-management-store'
import { getUploadFilePath, getUploadRelativePath, readUploadFileBase64 } from '@/utils/upload'
import MarkdownRenderer from '@/components/Common/MarkdownRenderer'
import { useTranslation } from '@/locales/useTranslation'
import type { SkillDirectory, SkillFormData } from '@shared/types/skills'
import './SkillsManagementPanel.css'

const { Title, Text } = Typography
const { TextArea } = Input

/**
 * Skill管理面板组件
 */
const SkillsManagementPanel: React.FC = () => {
  const messageApi = message
  const { t } = useTranslation()
  const {
    skills,
    isLoading,
    selectedSkill,
    isDetailDrawerOpen,
    isFormModalOpen,
    isImportModalOpen,
    formMode,
    editingSkill,
    loadSkills,
    addSkill,
    updateSkill,
    deleteSkill,
    importSkill,
    importSkillFiles,
    batchImportSkills,
    batchImportSkillsFiles,
    openDetailDrawer,
    closeDetailDrawer,
    openAddModal,
    openEditModal,
    closeFormModal,
    openImportModal,
    closeImportModal
  } = useSkillsManagementStore()

  const [form] = Form.useForm()
  const [fileList, setFileList] = useState<any[]>([])
  const [isSingleImporting, setIsSingleImporting] = useState(false)

  // 初始化加载
  useEffect(() => {
    loadSkills()
  }, [loadSkills])

  // 监听editingSkill变化，更新表单值
  useEffect(() => {
    if (editingSkill && isFormModalOpen && formMode === 'edit') {
      // 提取Skill内容（移除YAML frontmatter）
      const frontmatterRegex = /^---\s*\n[\s\S]*?\n---\s*\n([\s\S]*)$/
      const match = editingSkill.skillMdContent.match(frontmatterRegex)
      const content = match ? match[1].trim() : editingSkill.skillMdContent

      form.setFieldsValue({
        name: editingSkill.metadata.name,
        description: editingSkill.metadata.description,
        content: content
      })
    }
  }, [editingSkill, isFormModalOpen, formMode, form])

  // 计算统计数据
  const totalSkills = skills.length
  const totalFiles = skills.reduce((sum, skill) => sum + (skill.structure.additionalFiles.length + 1), 0)
  const avgFiles = totalSkills > 0 ? (totalFiles / totalSkills).toFixed(1) : '0'
  const recentUpdates = skills.filter(
    skill => Date.now() - new Date(skill.updatedAt).getTime() < 7 * 24 * 60 * 60 * 1000
  ).length

  // 处理添加Skill
  const handleAdd = async () => {
    try {
      const values = await form.validateFields()
      await addSkill(values as SkillFormData)
      messageApi.success(t('skills.message.added'))
      form.resetFields()
    } catch (error: any) {
      if (error?.errorFields) {
        return
      }
      messageApi.error(t('skills.message.addFailed', { error: error.message || t('common.unknownError') }))
    }
  }

  // 处理编辑Skill
  const handleEdit = async () => {
    try {
      const values = await form.validateFields()
      if (editingSkill) {
        await updateSkill(editingSkill.id, values as SkillFormData)
        messageApi.success(t('skills.message.updated'))
      }
    } catch (error: any) {
      if (error?.errorFields) {
        return
      }
      messageApi.error(t('skills.message.updateFailed', { error: error.message || t('common.unknownError') }))
    }
  }

  // 处理删除Skill
  const handleDelete = async (skillId: string) => {
    try {
      await deleteSkill(skillId)
      messageApi.success(t('skills.message.deleted'))
    } catch (error: any) {
      messageApi.error(t('skills.message.deleteFailed', { error: error?.message || t('common.unknownError') }))
    }
  }

  // 处理单个目录导入
  const buildSkillImportGroups = async (files: any[]) => {
    const groups = new Map<string, { rootDirName: string; files: Array<{ relativePath: string; contentBase64: string }> }>()

    for (const file of files) {
      const relativePath = getUploadRelativePath(file) || file?.name
      if (!relativePath) {
        continue
      }
      const parts = relativePath.split('/').filter(Boolean)
      const rootDirName = parts[0]
      const innerPath = parts.length > 1 ? parts.slice(1).join('/') : file?.name
      if (!rootDirName || !innerPath) {
        continue
      }

      const contentBase64 = await readUploadFileBase64(file)
      if (!groups.has(rootDirName)) {
        groups.set(rootDirName, { rootDirName, files: [] })
      }
      groups.get(rootDirName)!.files.push({ relativePath: innerPath, contentBase64 })
    }

    return Array.from(groups.values())
  }

  const handleSingleImportFiles = async (files: any[]) => {
    if (isSingleImporting) return
    setIsSingleImporting(true)
    try {
      const dirPath = files.length === 1 && !getUploadRelativePath(files[0])
        ? getUploadFilePath(files[0])
        : null
      const result = dirPath
        ? await importSkill(dirPath, { overwrite: false })
        : null

      if (dirPath && result) {
        if (result.success) {
          messageApi.success(t('skills.message.importSuccess', { name: result.skillId ?? t('common.unknown') }))
        } else {
          messageApi.error(t('skills.message.importFailed', { error: result.error || t('common.unknownError') }))
        }
        return
      }

      const groups = await buildSkillImportGroups(files)
      if (groups.length !== 1) {
        messageApi.error(t('skills.message.importSingleDir'))
        return
      }

      const contentResult = await importSkillFiles(groups[0], { overwrite: false })
      if (!contentResult) {
        messageApi.error(t('skills.message.importFailed', { error: t('common.unknownError') }))
        return
      }
      if (contentResult.success) {
        messageApi.success(t('skills.message.importSuccess', { name: contentResult.skillId ?? t('common.unknown') }))
      } else {
        messageApi.error(t('skills.message.importFailed', { error: contentResult.error || t('common.unknownError') }))
      }
    } catch (error: any) {
      messageApi.error(t('skills.message.importFailed', { error: error.message || t('common.unknownError') }))
    } finally {
      setIsSingleImporting(false)
    }
  }

  // 处理批量导入
  const handleBatchImport = async () => {
    if (fileList.length === 0) {
      messageApi.warning(t('skills.message.batchImportSelect'))
      return
    }

    try {
      const dirPaths = fileList
        .filter(file => !getUploadRelativePath(file))
        .map(file => getUploadFilePath(file))
        .filter((path): path is string => Boolean(path))

      const contentGroups = await buildSkillImportGroups(
        fileList.filter(file => !getUploadFilePath(file))
      )

      if (dirPaths.length === 0 && contentGroups.length === 0) {
        messageApi.error(t('skills.message.batchImportNoContent'))
        return
      }

      const results = [] as Array<{
        success: boolean
        imported?: string[]
        errors?: Array<{ path: string; error: string }>
      }>

      if (dirPaths.length > 0) {
        results.push(await batchImportSkills(dirPaths, { overwrite: false }))
      }
      if (contentGroups.length > 0) {
        results.push(await batchImportSkillsFiles(contentGroups, { overwrite: false }))
      }

      const merged = results.reduce<{
        success: boolean
        imported: string[]
        errors: Array<{ path: string; error: string }>
      }>(
        (acc, cur) => {
          acc.imported = acc.imported.concat(cur.imported || [])
          acc.errors = acc.errors.concat(cur.errors || [])
          acc.success = acc.success && cur.success
          return acc
        },
        { success: true, imported: [] as string[], errors: [] as Array<{ path: string; error: string }> }
      )

      const result = merged
      if (!result) {
        messageApi.error(t('skills.message.batchImportFailed', { error: t('common.unknownError') }))
        return
      }
      if (result.success) {
        messageApi.success(t('skills.message.batchImportSuccess', { count: result.imported?.length || 0 }))
        if (result.errors && result.errors.length > 0) {
          messageApi.warning(t('skills.message.batchImportFailedCount', { count: result.errors.length }))
        }
        setFileList([])
        closeImportModal()
      } else {
        messageApi.error(t('skills.message.batchImportFailed', { error: '' }))
      }
    } catch (error: any) {
      messageApi.error(t('skills.message.batchImportFailed', { error: error.message || t('common.unknownError') }))
    }
  }

  // 表格列定义
  const columns = [
    {
      title: t('skills.table.name'),
      dataIndex: ['metadata', 'name'],
      key: 'name',
      render: (name: string, record: SkillDirectory) => (
        <Space>
          <FolderOutlined style={{ color: '#7C3AED' }} />
          <div style={{ maxWidth: 200 }}>
            <Tooltip title={name}>
              <Text strong ellipsis style={{ display: 'block' }}>
                {name}
              </Text>
            </Tooltip>
            <Tooltip title={record.metadata.description}>
              <Text type="secondary" style={{ fontSize: 12, display: 'block', maxWidth: 180 }} ellipsis>
                {record.metadata.description}
              </Text>
            </Tooltip>
          </div>
        </Space>
      )
    },
    {
      title: t('skills.table.structure'),
      key: 'structure',
      render: (_: any, record: SkillDirectory) => {
        return (
          <Space>
            <FileTextOutlined />
            <Text>SKILL.md</Text>
            {record.structure.additionalFiles.length > 0 && (
              <Text type="secondary" style={{ fontSize: 12 }}>
                {t('skills.table.extraFiles', { count: record.structure.additionalFiles.length })}
              </Text>
            )}
          </Space>
        )
      }
    },
    {
      title: t('skills.table.updatedAt'),
      dataIndex: 'updatedAt',
      key: 'updatedAt',
      render: (date: string) => (
        <Text type="secondary" style={{ fontSize: 12 }}>
          {new Date(date).toLocaleString()}
        </Text>
      )
    },
    {
      title: t('skills.table.actions'),
      key: 'actions',
      width: 200,
      render: (_: any, record: SkillDirectory) => (
        <Space size="small">
          <Tooltip title={t('skills.table.viewDetail')}>
            <Button
              type="primary"
              size="small"
              icon={<EyeOutlined />}
              onClick={() => openDetailDrawer(record)}
            >
              {t('skills.table.view')}
            </Button>
          </Tooltip>
          <Tooltip title={t('skills.table.edit')}>
            <Button
              size="small"
              icon={<EditOutlined />}
              onClick={() => openEditModal(record)}
            >
              {t('skills.table.edit')}
            </Button>
          </Tooltip>
          <Popconfirm
            title={t('skills.confirm.deleteTitle')}
            description={t('skills.confirm.deleteDescription')}
            onConfirm={() => handleDelete(record.id)}
            okText={t('common.confirm')}
            cancelText={t('common.cancel')}
          >
            <Button size="small" danger icon={<DeleteOutlined />}>
              {t('skills.table.delete')}
            </Button>
          </Popconfirm>
        </Space>
      )
    }
  ]

  return (
    <div className="skills-management-panel">
      {/* 标题栏 */}
      <div className="page-header">
        <Title level={3}>{t('skills.title')}</Title>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={loadSkills} loading={isLoading}>
            {t('common.refresh')}
          </Button>
          <Upload
            directory
            multiple
            showUploadList={false}
            beforeUpload={() => false}
            onChange={({ fileList }) => {
              if (fileList.length > 0) {
                handleSingleImportFiles(fileList)
              }
            }}
          >
            <Button icon={<UploadOutlined />}>{t('skills.importDirectory')}</Button>
          </Upload>
          <Button
            type="primary"
            icon={<InboxOutlined />}
            onClick={openImportModal}
          >
            {t('skills.batchImport')}
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={openAddModal}>
            {t('skills.create')}
          </Button>
        </Space>
      </div>

      {/* 统计卡片行 */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={6}>
          <Card variant="borderless" className="stat-card">
            <Statistic
              title={t('skills.stats.totalSkills')}
              value={totalSkills}
              prefix={<AppstoreOutlined />}
              valueStyle={{ color: '#7C3AED' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card variant="borderless" className="stat-card">
            <Statistic
              title={t('skills.stats.totalFiles')}
              value={totalFiles}
              prefix={<FileOutlined />}
              valueStyle={{ color: '#52C41A' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card variant="borderless" className="stat-card">
            <Statistic
              title={t('skills.stats.avgFiles')}
              value={avgFiles}
              suffix={t('skills.stats.avgFilesSuffix')}
              prefix={<FileTextOutlined />}
              valueStyle={{ color: '#1890FF' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card variant="borderless" className="stat-card">
            <Statistic
              title={t('skills.stats.recentUpdates')}
              value={recentUpdates}
              suffix={t('skills.stats.recentUpdatesSuffix')}
              prefix={<ReloadOutlined />}
              valueStyle={{ color: '#FAAD14' }}
            />
          </Card>
        </Col>
      </Row>

      {/* Skill列表表格 */}
      <Card variant="borderless" className="skill-list-card">
        <Table
          dataSource={skills}
          columns={columns}
          rowKey="id"
          loading={isLoading}
          pagination={{
            pageSize: 10,
            showSizeChanger: true,
            showTotal: (total) => t('skills.table.total', { total })
          }}
          locale={{
            emptyText: (
              <div style={{ padding: '40px 0' }}>
                <AppstoreOutlined style={{ fontSize: 48, color: '#ccc' }} />
                <div style={{ marginTop: 16 }}>
                  <Text type="secondary">{t('skills.empty.title')}</Text>
                  <br />
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {t('skills.empty.subtitle')}
                  </Text>
                </div>
              </div>
            )
          }}
        />
      </Card>

      {/* 详情Drawer */}
      <Drawer
        title={
          <Space>
            <FolderOutlined style={{ color: '#7C3AED' }} />
            <Text strong>{selectedSkill?.metadata.name}</Text>
          </Space>
        }
        placement="right"
        width={720}
        open={isDetailDrawerOpen}
        onClose={closeDetailDrawer}
      >
        {selectedSkill && (
          <>
            <Divider orientation="left">元数据</Divider>
            <Descriptions column={2} bordered size="small">
              <Descriptions.Item label={t('skills.detail.name')} span={2}>
                {selectedSkill.metadata.name}
              </Descriptions.Item>
              <Descriptions.Item label={t('skills.detail.description')} span={2}>
                {selectedSkill.metadata.description}
              </Descriptions.Item>
              <Descriptions.Item label={t('skills.detail.directoryName')} span={1}>
                {selectedSkill.directoryName}
              </Descriptions.Item>
              <Descriptions.Item label={t('skills.detail.fileCount')} span={1}>
                {selectedSkill.structure.additionalFiles.length + 1}
              </Descriptions.Item>
              <Descriptions.Item label={t('skills.detail.createdAt')} span={1}>
                {new Date(selectedSkill.createdAt).toLocaleString()}
              </Descriptions.Item>
              <Descriptions.Item label={t('skills.detail.updatedAt')} span={1}>
                {new Date(selectedSkill.updatedAt).toLocaleString()}
              </Descriptions.Item>
              <Descriptions.Item label={t('skills.detail.directoryPath')} span={2}>
                <Text
                  code
                  ellipsis={{ tooltip: selectedSkill.directoryPath }}
                  style={{ fontSize: 12 }}
                >
                  {selectedSkill.directoryPath}
                </Text>
              </Descriptions.Item>
            </Descriptions>

            <Divider orientation="left">{t('skills.detail.structure')}</Divider>
            <div style={{ marginBottom: 16 }}>
              <Text strong>SKILL.md</Text>
              <br />
              <Text type="secondary" style={{ fontSize: 12 }}>
                {selectedSkill.structure.skillMdPath}
              </Text>
            </div>

            {selectedSkill.structure.additionalFiles.length > 0 && (
              <div>
                <Text strong>{t('skills.detail.otherFiles')}</Text>
                <ul style={{ marginTop: 8, paddingLeft: 20 }}>
                  {selectedSkill.structure.additionalFiles.map((filePath, index) => (
                    <li key={index} style={{ marginBottom: 4 }}>
                      <Text code style={{ fontSize: 11 }}>
                        {filePath}
                      </Text>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <Divider orientation="left">{t('skills.detail.content')}</Divider>
            <MarkdownRenderer
              className="skill-content-markdown"
              content={selectedSkill.skillMdContent}
            />
          </>
        )}
      </Drawer>

      {/* 添加/编辑Modal */}
      <Modal
        title={formMode === 'add' ? t('skills.form.createTitle') : t('skills.form.editTitle')}
        open={isFormModalOpen}
        onOk={formMode === 'add' ? handleAdd : handleEdit}
        onCancel={closeFormModal}
        width={720}
        afterClose={() => form.resetFields()}
      >
        <Form
          form={form}
          layout="vertical"
        >
          <Form.Item
            name="name"
            label={t('skills.form.name')}
            rules={[{ required: true, message: t('skills.form.nameRequired') }]}
          >
            <Input placeholder={t('skills.form.namePlaceholder')} />
          </Form.Item>

          <Form.Item
            name="description"
            label={t('skills.form.description')}
            rules={[{ required: true, message: t('skills.form.descriptionRequired') }]}
          >
            <TextArea rows={2} placeholder={t('skills.form.descriptionPlaceholder')} />
          </Form.Item>

          <Form.Item
            name="content"
            label={t('skills.form.content')}
            rules={[{ required: true, message: t('skills.form.contentRequired') }]}
          >
            <TextArea
              rows={10}
              placeholder={t('skills.form.contentPlaceholder')}
              style={{ fontFamily: 'monospace' }}
            />
          </Form.Item>
        </Form>
      </Modal>

      {/* 批量导入Modal */}
      <Modal
        title={t('skills.import.title')}
        open={isImportModalOpen}
        onOk={handleBatchImport}
        onCancel={() => {
          setFileList([])
          closeImportModal()
        }}
        width={600}
      >
        <Upload.Dragger
          directory
          multiple
          fileList={fileList}
          onChange={({ fileList }) => setFileList(fileList)}
          beforeUpload={() => false}
          customRequest={() => {}}
        >
          <p className="ant-upload-drag-icon">
            <InboxOutlined />
          </p>
          <p className="ant-upload-text">{t('skills.import.tip')}</p>
          <p className="ant-upload-hint">
            {t('skills.import.hint')}
          </p>
        </Upload.Dragger>
      </Modal>
    </div>
  )
}

export default SkillsManagementPanel
