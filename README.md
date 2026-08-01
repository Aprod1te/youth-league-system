# 团委管理系统

基于 Next.js 16、React 19 和 Supabase 的团委协作系统，覆盖部门与成员管理、入部申请、任务审批、活动审批、报名、二维码签到、活动总结及私有附件归档。

当前代码已接入严格 RLS、原子化业务 RPC、私有 Storage、类型检查、ESLint、Vitest 和 CI。正式上线前仍必须在隔离的 Supabase 环境执行完整迁移重建与角色权限矩阵测试。

当前部署定位是 **10 至 30 名受邀用户的零成本受控试运行**。系统不开放公共注册，也不应在尚未完成校内审批、恢复演练和权限集成测试时作为学校唯一的正式记录来源。

## 技术栈

- Next.js 16 App Router（使用 `src/proxy.ts`）
- React 19、TypeScript、Tailwind CSS 4
- Supabase Auth、Postgres、RLS、Storage
- Vitest、ESLint、GitHub Actions

## 环境要求

- Node.js 20.9 或更高版本，推荐 Node.js 22 LTS
- npm
- Docker Desktop（运行本地 Supabase 和 `db reset` 时需要）
- Supabase CLI（项目通过 `npx supabase` 调用）

## 本地启动

1. 安装依赖并创建本地环境文件：

   ```bash
   npm ci
   cp .env.example .env.local
   ```

2. 启动本地 Supabase：

   ```bash
   npx supabase start
   ```

3. 将 `npx supabase status` 输出的 API URL、anon key 和 service role key 填入 `.env.local`。service role key 只供维护脚本使用，绝不能暴露给浏览器。

4. 从零执行全部迁移和幂等部门种子：

   ```bash
   npx supabase db reset
   ```

5. 启动应用：

   ```bash
   npm run dev
   ```

应用默认地址为 [http://localhost:3000](http://localhost:3000)，Supabase Studio 默认地址为 [http://127.0.0.1:54323](http://127.0.0.1:54323)。

## 环境变量

| 变量 | 运行位置 | 用途 |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | 浏览器和服务端 | Supabase API URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 浏览器和服务端 | 受 RLS 约束的公开 key |
| `SUPABASE_SERVICE_ROLE_KEY` | 仅本地维护脚本 | 绕过 RLS 的管理 key，不应配置到前端部署 |
| `CLEANUP_ALLOWED_PROJECT_REFS` | 仅清理脚本 | 允许执行清理的项目编号白名单 |
| `CLEANUP_KEEP_ADMIN_EMAIL` | 仅清理脚本 | 清理时唯一保留的管理员邮箱 |
| `DEMO_SEED_ALLOWED_PROJECT_REFS` | 仅 Demo 脚本 | 允许写入 Demo 数据的项目编号，默认仅 `local` |
| `DEMO_SEED_ADMIN_EMAIL` | 仅 Demo 脚本 | 必须已存在的管理员邮箱 |

`.env.local` 已被 Git 忽略。任何 service role key、数据库密码或真实用户凭据都不得提交到仓库。

## 质量检查

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

`npm run check` 会依次运行类型检查、lint 和单元测试。GitHub Actions 对每次 push 和 pull request 执行 `npm ci`、`npm run check` 与生产构建。

## 数据库迁移

迁移位于 `supabase/migrations/`：

- `000_baseline_schema.sql`：可幂等重建十张业务表、索引、触发器和认证 profile trigger。
- `001` 至 `010`：项目历史迁移和签到兼容迁移。
- `011_production_security_and_workflows.sql`：严格 RLS、私有 buckets、权限收敛及原子业务 RPC。

### 本地数据库

`db reset` 会删除本地数据，然后按文件名顺序执行全部迁移和 `supabase/seed_departments.sql`：

```bash
npx supabase db reset
```

该命令只应指向本地 Supabase。它需要 Docker Desktop。

### 新建远端项目

```bash
npx supabase login
npx supabase link --project-ref <project-ref>
npx supabase db push --linked --include-all --dry-run
npx supabase db push --linked --include-all
```

先核对 dry-run 中仅包含本仓库迁移，再执行真实 push。不要向正式环境写入 Demo seed。

### 已有远端项目

当前历史远端若只有 `001` 至 `009`，首次升级必须使用 `--include-all`，使 CLI 同时登记幂等的 `000`，并应用 `010`、`011`：

```bash
mkdir -p backups
npx supabase db dump --linked --file backups/schema-before-011.sql
npx supabase db dump --linked --data-only --use-copy --file backups/data-before-011.sql
npx supabase migration list --linked
npx supabase db push --linked --include-all --dry-run
```

上述 dump 是逻辑快照，不替代 Supabase 平台备份或 PITR。正式执行 `db push` 前应同时确认平台备份可恢复、维护窗口和回归清单。数据库写入命令必须由项目负责人单独批准后执行。

### 管理员初始化

试运行前准备两个使用不同邮箱的管理员账号：一个用于日常管理，一个仅用于应急恢复。通过 Supabase Dashboard 创建或邀请账号后，在 SQL Editor 中由项目所有者执行以下语句，并确认恰好更新两行：

```sql
update public.profiles
set role = 'admin', updated_at = now()
where id in (
  select id
  from auth.users
  where lower(email) in (
    lower('daily-admin@example.com'),
    lower('emergency-admin@example.com')
  )
);
```

两个账号不得共用邮箱或密码。应急管理员应实际登录一次确认可用，将独立密码保存在可信密码管理器中，平时不用于日常操作。不要从浏览器开放“自助提升管理员”功能，也不要为方便而增加更多管理员。

## Storage

迁移 `011` 创建两个私有 bucket：

- `activity-photos`：JPEG、PNG、WebP、GIF，单文件最多 8 MB。
- `activity-documents`：PDF、DOC、DOCX，单文件最多 15 MB。

数据库只保存对象路径。页面按当前用户权限签发短时 URL；不要将 bucket 改为 public，也不要把签名 URL 长期写回数据库。

## 邀请制认证

仓库中的 `supabase/config.toml` 只约束本地环境，不会自动修改远端项目。远端 Supabase 必须在 Dashboard 手工完成以下设置：

1. 在 **Authentication > URL Configuration** 将 `Site URL` 设为实际 HTTPS 域名，并加入回调地址（将域名替换为实际值）：

```text
https://example.com/auth/callback**
```

2. 在 **Authentication > Providers > Email** 关闭用户自行注册。保持公开 signup 关闭，由管理员从 **Authentication > Users > Invite user** 逐个邀请。
3. 在密码安全设置中把最小长度设为 10 位。新邀请和重置密码都执行 10 位限制；登录页仍允许提交历史 6 位密码，避免阻断已有账号。
4. 配置可向学生邮箱投递的 SMTP 和发件人。Supabase 默认发信服务有严格的收件人与频率限制，不适合批量邀请学生；可以使用学校 SMTP 或符合学校要求且有免费额度的邮件服务，但必须先测试送达率和垃圾邮件拦截。
5. 在 **Authentication > Email Templates > Invite user** 使用包含一次性 token hash 的链接：

```html
<a href="{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=invite&next=/accept-invite">接受邀请</a>
```

末尾的 `**` 只用于接收 SDK 动态追加的 PKCE 参数；应用回调仍会拒绝站外跳转，不要放宽为整个域名通配。邀请链接通过 `token_hash` 完成一次性验证；忘记密码和重置密码仍通过 PKCE `code` 回调。

管理员邀请用户后，用户依次完成 `/auth/callback`、`/accept-invite`、姓名与学号填写、密码设置，再回到登录页。新用户固定以 `applicant` 身份进入系统，但可以立即浏览已公开活动、报名并扫码签到；只有成为部门成员、创建活动或使用部门管理功能时，才需要提交入部申请并经有权角色批准。邀请本身不能直接授予成员或管理权限。

试运行前至少验证：正常邀请、过期链接、重复使用链接、重复学号、忘记密码、重置密码和关闭 signup 后的 `/register` 行为。Free 方案没有泄露密码检测，10 位长度只是最低补偿，不代表密码一定安全。

前端长度校验不等于服务端策略。远端 Supabase 必须同步配置至少 10 位；若所用套餐支持泄露密码检测，应同时开启。修改后要分别验证邀请设置密码、密码重置和历史账号登录行为。

## 维护脚本

两个脚本都会读取 `.env.local`，并在写入前校验 `--yes`、命令行项目编号、URL 中的实际项目编号和环境变量白名单。

清空业务数据并保留一个管理员：

```bash
node scripts/cleanup-data.mjs --yes --project-ref=local
```

写入部门及 Demo 账号：

```bash
node scripts/seed-demo-data.mjs --yes --project-ref=local
```

Demo 账号使用统一已知密码，只适合本地或专用演示项目。禁止对生产项目执行任一脚本；不要为了绕过保护而临时把生产项目加入白名单。

## 零成本受控试运行

建议组合为 Supabase Free + Vercel Hobby，目标是先验证真实工作流，而不是提供生产级可用性承诺。在不购买域名、SMTP 或额外监控服务时，平台费用可以为 0 元；实际免费额度和条款随平台调整，部署前应再次核对官方页面。

试运行边界：

- 仅邀请 10 至 30 名知情用户，不开放公共注册，不接入校园统一认证或学校数据库。
- 姓名、学号、邮箱之外不录入身份证、家庭信息、健康信息等高敏感数据；先取得校内负责人对云端存储和隐私告知的确认。
- 所有受邀用户（包括申请人）可以查看已公开活动、报名并扫码签到，也可以查看活动总结和照片；申请人只能看到自己的参与状态和聚合人数，不能查看报名、签到或部门成员名单。上传活动照片前应确认校内使用授权，避免出现不应向全体受邀用户公开的内容。
- 部门正式成员可以创建活动草稿并提交审批。活动审批通过后面向全体受邀用户开放报名；活动组织者可以生成限时二维码供已报名用户签到。“面向大家”不表示允许未登录的互联网访客访问。
- 入部审批、角色变更、重要活动和关键任务同时保留 Excel 台账。Excel 应放在学校认可且限制访问的位置，不能公开分享。
- 每周导出一次数据库逻辑备份并离线加密保存；重大活动或批量角色变更前额外备份一次。
- 正式邀请前，分别使用校园 Wi-Fi 和移动网络测试登录、邮件链接、附件上传、二维码签到及页面加载。

免费方案的主要缺点：

- Supabase Free 项目长期无活动时可能在约一周后暂停，恢复需要时间，首次访问可能不可用；没有 SLA，不适合关键签到或必须随时可用的正式系统。
- Free 额度通常只有约 500 MB 数据库和 1 GB Storage。照片和总结附件会比结构化数据更早耗尽空间，需要压缩图片、定期清理并监控用量。
- Free 不提供可依赖的自动数据库备份或 PITR。每周手工导出意味着两次备份之间的数据仍可能丢失，而且未做恢复演练的备份不能视为可恢复。
- Free 不提供泄露密码检测，日志保留、性能和支持也有限；共享计算资源在高峰期可能变慢。
- Supabase 默认邮件服务不适合学生邀请，自定义 SMTP 可能带来域名费用、发信信誉、垃圾邮件拦截和额外运维。
- Vercel Hobby 主要面向个人、非商业用途。学校正式或机构化使用前必须核对届时条款；不满足时需要更换托管方式或付费计划。
- Vercel、Supabase 及所选区域在中国大陆校园网中的访问速度和稳定性没有保证。境外区域存放学生信息还可能触发学校的数据出境和采购合规要求。
- 免费平台可能调整额度、暂停政策或终止服务，因此 Excel 双轨和可恢复备份不能省略。

这些限制可接受时，免费方案适合一轮有明确起止时间的试运行；它不能直接等同于学校正式生产环境。

### 试运行部署步骤

1. 优先创建隔离的 Supabase Free 项目；若复用旧项目，先完成 schema/data dump 和 `db push --dry-run`。真实数据库写入仍需项目负责人单独批准。
2. 应用全部迁移后，按“邀请制认证”章节手工关闭 signup、设置 10 位密码、配置 URL、SMTP 和邀请模板。
3. 在 Vercel 仅配置 `NEXT_PUBLIC_SUPABASE_URL` 与 `NEXT_PUBLIC_SUPABASE_ANON_KEY`，不要配置 service role key。
4. 先配置日常、应急两个管理员，再邀请专用测试账号，覆盖书记、部长、成员和申请人角色；逐项验证允许操作成功、越权操作失败。
5. 再邀请 10 至 30 名试运行用户，保留 Excel 台账，并记录错误、网络失败和人工补救情况。
6. 每周检查 Supabase 数据库、Storage 和日志用量，执行逻辑备份；试运行结束后再决定是否正式投入、迁移到校内环境或购买托管。

## 正式生产部署

1. 在 Supabase 配置正式站点 URL、上述认证回调 URL、邮件 SMTP、验证码/限流和备份策略。
2. 在维护窗口备份并部署数据库迁移，完成管理员、部长、书记、成员、申请人五类角色的权限冒烟测试。
3. 在 Vercel 或等价平台只配置 `NEXT_PUBLIC_SUPABASE_URL` 与 `NEXT_PUBLIC_SUPABASE_ANON_KEY`。
4. 使用 `npm ci` 和 `npm run build` 构建，再部署应用。
5. 验证邀请、接受邀请、登录、忘记/重置密码、入部审批、任务审批、活动审批、报名、扫码签到、总结上传和私有文件访问。
6. 开启运行时错误监控、日志告警、可用性监控和数据库备份告警。

迁移是前向执行的。发生故障时，应用代码可以回滚到上一构建，但这不会自动撤销数据库变化。数据库恢复应使用经过验证的平台备份/PITR，或另建恢复项目后切换应用连接；不要在生产库临时手写反向 SQL。

## 上线门槛

- `npm run check` 和 `npm run build` 全部通过。
- 在全新本地数据库完成 `npx supabase db reset`。
- RLS/RPC 角色矩阵集成测试通过，确认越权请求失败。
- 生产备份已创建并实际验证恢复流程。
- Auth 邮件、域名、HTTPS、限流和监控已配置。
- 不存在 Demo 用户、固定密码、公开活动附件或客户端 service role key。
