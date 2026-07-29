# Changelog

## [0.2.0] - 2026-07-29

### ✨ 新增功能

- **团委书记角色体系**：新增 `secretary`（团委书记）角色，全局导航栏、成员管理、权限控制全面适配
- **活动报名（RSVP）**：新增 `activity_rsvps` 表，用户可对活动进行报名/取消报名，实时展示报名人数和名单
- **活动签到（Check-in）**：新增 `activity_checkins` 表，支持二维码签到，活动详情页集成签到入口
- **任务审批流程**：任务表新增 `approval_status`、`approved_by`、`approved_at`、`approval_note` 字段，支持提交审批-审核闭环
- **任务进度追踪**：`task_submissions` 表新增 `progress` 字段（0-100%），支持进度百分比记录
- **审核汇总面板**：新增 `/dashboard/review` 审核汇总页面入口（管理员/团委书记可见）
- **任务审批导航**：新增「任务审批」导航入口（管理员/团委书记可见）
- **部门种子数据**：提供 19 个标准团委部门的初始化 SQL 脚本（`supabase/seed_departments.sql`）

### 🐛 Bug 修复

- 修复 `globals.css` 中重复的 `@import "tailwindcss"` 语句

### 📦 依赖变更

- 新增 `qrcode.react@^4.2.0`：用于活动签到页面的二维码渲染

### 🗄️ 数据库迁移

- `004_secretary_role_activity_rsvp_task_approval.sql`：创建 activity_rsvps 表，任务审批字段，任务进度字段
- `005_activity_checkin.sql`：创建 activity_checkins 表及 RLS 策略

### 📝 其他

- dashboard 布局导航角色列表补充 `secretary` 角色
- 成员管理页面角色筛选和标签增加 secretary、member

---

## [0.1.0] - 2026-07-28

### ✨ 新增功能

- 完整的青年团管理后台框架
- 工作台仪表盘、待办事项实时化
- 活动管理（创建、编辑、详情、归档）
- 部门管理（CRUD、成员管理）
- 人员管理（角色筛选、档案查看）
- 任务管理（分配、提交、跟踪）
- 通知中心（实时刷新、铃铛提醒）
- 入部审核流程
- 活动审批流程
- 活动总结上传与文件存储
- 权限控制体系（admin/minister/member/applicant）
- UI/UX Pro Max 设计系统全面美化

### 🐛 Bug 修复

- 修复部门卡片 a 标签嵌套问题
- 修复通知自动创建逻辑
- 修复 DropdownMenu hydration 错误
- 修复活动总结无法上传
- 修复入部审核更新 profile
- 修复活动审批通知

### 📦 依赖

- Next.js 16.2.11 + React 19 + Supabase + Tailwind CSS 4 + shadcn/ui
