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
  Descriptions,
  Tag
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
import type { SkillDirectory, SkillFormData } from '@shared/types/skills'
import './SkillsManagementPanel.css'

const { Title, Text, Paragraph } = Typography
const { TextArea } = Input

/**
 * Skill管理面板组件
 */
const SkillsManagementPanel: React.FC = () => {
  const messageApi = message
  const {
    skills,
    isLoading,
    error,
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
      messageApi.success('Skill已添加')
      form.resetFields()
    } catch (error: any) {
      if (error?.errorFields) {
        return
      }
      messageApi.error('添加失败: ' + (error.message || '未知错误'))
    }
  }

  // 处理编辑Skill
  const handleEdit = async () => {
    try {
      const values = await form.validateFields()
      if (editingSkill) {
        await updateSkill(editingSkill.id, values as SkillFormData)
        messageApi.success('Skill已更新')
      }
    } catch (error: any) {
      if (error?.errorFields) {
        return
      }
      messageApi.error('更新失败: ' + (error.message || '未知错误'))
    }
  }

  // 处理删除Skill
  const handleDelete = async (skillId: string) => {
    try {
      await deleteSkill(skillId)
      messageApi.success('Skill已删除')
    } catch (error: any) {
      messageApi.error('删除失败: ' + (error?.message || '未知错误'))
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
          messageApi.success(`Skill "${result.skillId}" 导入成功`)
        } else {
          messageApi.error(`导入失败: ${result.error || '未知错误'}`)
        }
        return
      }

      const groups = await buildSkillImportGroups(files)
      if (groups.length !== 1) {
        messageApi.error('导入失败: 请一次选择一个Skill目录')
        return
      }

      const contentResult = await importSkillFiles(groups[0], { overwrite: false })
      if (!contentResult) {
        messageApi.error('导入失败: 未知错误')
        return
      }
      if (contentResult.success) {
        messageApi.success(`Skill "${contentResult.skillId}" 导入成功`)
      } else {
        messageApi.error(`导入失败: ${contentResult.error || '未知错误'}`)
      }
    } catch (error: any) {
      messageApi.error('导入失败: ' + (error.message || '未知错误'))
    } finally {
      setIsSingleImporting(false)
    }
  }

  // 处理批量导入
  const handleBatchImport = async () => {
    if (fileList.length === 0) {
      messageApi.warning('请先选择要导入的目录')
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
        messageApi.error('批量导入失败: 未获取到目录内容')
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

      const merged = results.reduce(
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
        messageApi.error('批量导入失败: 未知错误')
        return
      }
      if (result.success) {
        messageApi.success(`成功导入 ${result.imported?.length || 0} 个Skill`)
        if (result.errors && result.errors.length > 0) {
          messageApi.warning(`${result.errors.length} 个目录导入失败`)
        }
        setFileList([])
        closeImportModal()
      } else {
        messageApi.error('批量导入失败')
      }
    } catch (error: any) {
      messageApi.error('批量导入失败: ' + (error.message || '未知错误'))
    }
  }

  // 表格列定义
  const columns = [
    {
      title: 'Skill名称',
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
      title: '目录结构',
      key: 'structure',
      render: (_: any, record: SkillDirectory) => {
        const fileCount = record.structure.additionalFiles.length + 1 // +1 for SKILL.md
        return (
          <Space>
            <FileTextOutlined />
            <Text>SKILL.md</Text>
            {record.structure.additionalFiles.length > 0 && (
              <Text type="secondary" style={{ fontSize: 12 }}>
                + {record.structure.additionalFiles.length} 个文件
              </Text>
            )}
          </Space>
        )
      }
    },
    {
      title: '更新时间',
      dataIndex: 'updatedAt',
      key: 'updatedAt',
      render: (date: string) => (
        <Text type="secondary" style={{ fontSize: 12 }}>
          {new Date(date).toLocaleString()}
        </Text>
      )
    },
    {
      title: '操作',
      key: 'actions',
      width: 200,
      render: (_: any, record: SkillDirectory) => (
        <Space size="small">
          <Tooltip title="查看详情">
            <Button
              type="primary"
              size="small"
              icon={<EyeOutlined />}
              onClick={() => openDetailDrawer(record)}
            >
              查看
            </Button>
          </Tooltip>
          <Tooltip title="编辑">
            <Button
              size="small"
              icon={<EditOutlined />}
              onClick={() => openEditModal(record)}
            >
              编辑
            </Button>
          </Tooltip>
          <Popconfirm
            title="确认删除"
            description="确定要删除这个Skill吗？这将删除整个目录及其所有文件。"
            onConfirm={() => handleDelete(record.id)}
            okText="确定"
            cancelText="取消"
          >
            <Button size="small" danger icon={<DeleteOutlined />}>
              删除
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
        <Title level={3}>Skills管理</Title>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={loadSkills} loading={isLoading}>
            刷新
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
            <Button icon={<UploadOutlined />}>导入目录</Button>
          </Upload>
          <Button
            type="primary"
            icon={<InboxOutlined />}
            onClick={openImportModal}
          >
            批量导入
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={openAddModal}>
            新建Skill
          </Button>
        </Space>
      </div>

      {/* 统计卡片行 */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={6}>
          <Card bordered={false} className="stat-card">
            <Statistic
              title="总Skill数"
              value={totalSkills}
              prefix={<AppstoreOutlined />}
              valueStyle={{ color: '#7C3AED' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card bordered={false} className="stat-card">
            <Statistic
              title="文件总数"
              value={totalFiles}
              prefix={<FileOutlined />}
              valueStyle={{ color: '#52C41A' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card bordered={false} className="stat-card">
            <Statistic
              title="平均文件数"
              value={avgFiles}
              suffix=" 个/Skill"
              prefix={<FileTextOutlined />}
              valueStyle={{ color: '#1890FF' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card bordered={false} className="stat-card">
            <Statistic
              title="最近更新"
              value={recentUpdates}
              suffix="个"
              prefix={<ReloadOutlined />}
              valueStyle={{ color: '#FAAD14' }}
            />
          </Card>
        </Col>
      </Row>

      {/* Skill列表表格 */}
      <Card bordered={false} className="skill-list-card">
        <Table
          dataSource={skills}
          columns={columns}
          rowKey="id"
          loading={isLoading}
          pagination={{
            pageSize: 10,
            showSizeChanger: true,
            showTotal: (total) => `共 ${total} 个Skill`
          }}
          locale={{
            emptyText: (
              <div style={{ padding: '40px 0' }}>
                <AppstoreOutlined style={{ fontSize: 48, color: '#ccc' }} />
                <div style={{ marginTop: 16 }}>
                  <Text type="secondary">暂无Skill</Text>
                  <br />
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    点击"新建Skill"或"批量导入"开始使用
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
              <Descriptions.Item label="名称" span={2}>
                {selectedSkill.metadata.name}
              </Descriptions.Item>
              <Descriptions.Item label="描述" span={2}>
                {selectedSkill.metadata.description}
              </Descriptions.Item>
              <Descriptions.Item label="目录名" span={1}>
                {selectedSkill.directoryName}
              </Descriptions.Item>
              <Descriptions.Item label="文件数" span={1}>
                {selectedSkill.structure.additionalFiles.length + 1}
              </Descriptions.Item>
              <Descriptions.Item label="创建时间" span={1}>
                {new Date(selectedSkill.createdAt).toLocaleString()}
              </Descriptions.Item>
              <Descriptions.Item label="修改时间" span={1}>
                {new Date(selectedSkill.updatedAt).toLocaleString()}
              </Descriptions.Item>
              <Descriptions.Item label="目录路径" span={2}>
                <Text
                  code
                  ellipsis={{ tooltip: selectedSkill.directoryPath }}
                  style={{ fontSize: 12 }}
                >
                  {selectedSkill.directoryPath}
                </Text>
              </Descriptions.Item>
            </Descriptions>

            <Divider orientation="left">文件结构</Divider>
            <div style={{ marginBottom: 16 }}>
              <Text strong>SKILL.md</Text>
              <br />
              <Text type="secondary" style={{ fontSize: 12 }}>
                {selectedSkill.structure.skillMdPath}
              </Text>
            </div>

            {selectedSkill.structure.additionalFiles.length > 0 && (
              <div>
                <Text strong>其他文件</Text>
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

            <Divider orientation="left">SKILL.md内容</Divider>
            <MarkdownRenderer
              className="skill-content-markdown"
              content={selectedSkill.skillMdContent}
            />
          </>
        )}
      </Drawer>

      {/* 添加/编辑Modal */}
      <Modal
        title={formMode === 'add' ? '新建Skill' : '编辑Skill'}
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
            label="Skill名称"
            rules={[{ required: true, message: '请输入Skill名称' }]}
          >
            <Input placeholder="例如: web-search" />
          </Form.Item>

          <Form.Item
            name="description"
            label="描述"
            rules={[{ required: true, message: '请输入描述' }]}
          >
            <TextArea rows={2} placeholder="简要描述这个Skill的功能" />
          </Form.Item>

          <Form.Item
            name="content"
            label="SKILL.md内容"
            rules={[{ required: true, message: '请输入Skill内容' }]}
          >
            <TextArea
              rows={10}
              placeholder="输入SKILL.md的内容，支持Markdown格式..."
              style={{ fontFamily: 'monospace' }}
            />
          </Form.Item>
        </Form>
      </Modal>

      {/* 批量导入Modal */}
      <Modal
        title="批量导入Skill"
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
          <p className="ant-upload-text">点击或拖拽Skill文件夹到此区域上传</p>
          <p className="ant-upload-hint">
            支持批量上传。每个文件夹必须包含SKILL.md文件（含name和description元数据）。
          </p>
        </Upload.Dragger>
      </Modal>
    </div>
  )
}

export default SkillsManagementPanel
