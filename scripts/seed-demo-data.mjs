#!/usr/bin/env node

/**
 * Demo 数据种子脚本
 * 
 * 前提：目标项目已完成迁移，并存在指定的管理员账号
 * 
 * 功能：
 * 1. 幂等写入 19 个部门
 * 2. 创建模拟用户（部长/秘书/干事/申请人）
 * 3. 创建对应的 profile 记录
 * 
 * 使用方式:
 *   node scripts/seed-demo-data.mjs --yes --project-ref=local
 *
 * Required .env.local values:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   DEMO_SEED_ADMIN_EMAIL
 *
 * Optional .env.local value (defaults to local only):
 *   DEMO_SEED_ALLOWED_PROJECT_REFS=local
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnv() {
  const envPath = resolve(__dirname, '..', '.env.local');
  const content = readFileSync(envPath, 'utf-8');
  const env = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let value = trimmed.slice(eqIdx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

function getOption(name) {
  const prefix = `${name}=`;
  const inline = process.argv.find((argument) => argument.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function projectRefFromUrl(url) {
  const hostname = new URL(url).hostname;
  if (hostname === 'localhost' || hostname === '127.0.0.1') return 'local';
  return hostname.endsWith('.supabase.co') ? hostname.split('.')[0] : null;
}

async function listAllUsers(supabase) {
  const users = [];
  const perPage = 1000;
  for (let page = 1; ; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(`查询用户列表失败: ${error.message}`);
    users.push(...data.users);
    if (data.users.length < perPage) return users;
  }
}

const env = { ...loadEnv(), ...process.env };
const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
const adminEmail = env.DEMO_SEED_ADMIN_EMAIL?.trim().toLowerCase();
const allowedRefs = new Set(
  (env.DEMO_SEED_ALLOWED_PROJECT_REFS || 'local')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean),
);
const actualProjectRef = supabaseUrl ? projectRefFromUrl(supabaseUrl) : null;
const confirmedProjectRef = getOption('--project-ref');

if (!process.argv.includes('--yes')) {
  console.error('拒绝执行：必须显式传入 --yes。');
  process.exit(1);
}
if (!supabaseUrl || !serviceRoleKey || !adminEmail) {
  console.error('缺少 URL、service role key 或 DEMO_SEED_ADMIN_EMAIL。');
  process.exit(1);
}
if (!actualProjectRef || confirmedProjectRef !== actualProjectRef) {
  console.error('拒绝执行：--project-ref 与目标 URL 不匹配。');
  process.exit(1);
}
if (!allowedRefs.has(actualProjectRef)) {
  console.error('拒绝执行：目标项目不在 DEMO_SEED_ALLOWED_PROJECT_REFS 中。');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ============================================================
// 部门种子数据（19 个标准团委部门）
// ============================================================
const DEPARTMENTS = [
  { name: '组织部', description: '负责团的基层组织建设、团员发展与管理、团干部队伍建设、团费收缴、团籍管理和评优表彰等工作。是团委的核心职能部门，统筹全团组织工作。', max_members: 30 },
  { name: '宣传部', description: '负责团的宣传思想工作，组织开展思想政治教育，策划执行重大节日和活动的宣传方案，管理宣传阵地和舆论引导工作。', max_members: 25 },
  { name: '办公室', description: '负责团委日常事务协调、公文流转、会务组织、档案管理、物资采购与财务报销等工作，是团委的综合办事机构。', max_members: 20 },
  { name: '实践部', description: '负责组织大学生社会实践、社会调研、实习实训和"三下乡"等活动，搭建学生接触社会、服务社会的实践平台。', max_members: 25 },
  { name: '志愿者工作部', description: '统筹全校志愿服务工作，管理志愿者招募、培训、认证和时长记录，组织开展校内外公益志愿服务项目和大型赛会志愿服务。', max_members: 30 },
  { name: '社团管理部', description: '负责学生社团的注册、审批、年审、考核和管理工作，指导社团开展健康向上的文化活动，促进学生社团规范化发展。', max_members: 20 },
  { name: '科创部', description: '负责学生科技创新活动的组织与管理，统筹"挑战杯"等学术科技竞赛，搭建学生科研创新平台，营造校园科创氛围。', max_members: 20 },
  { name: '文体部', description: '负责策划和组织校园文艺演出、体育赛事、文化节等文体活动，丰富校园文化生活，提升学生艺术修养和身体素质。', max_members: 30 },
  { name: '学生服务部', description: '以服务学生为宗旨，协调解决学生在学习、生活中的实际困难，搭建学生与学校之间的沟通桥梁，维护良好的校园环境。', max_members: 20 },
  { name: '权益部', description: '负责学生权益维护工作，收集和反映学生合理诉求，参与校园民主管理，监督后勤服务，推动学生权益保障机制建设。', max_members: 15 },
  { name: '理论调研部', description: '负责党的创新理论和团的理论研究，开展青年思想动态调研，撰写调研报告，为团委决策提供理论支撑和数据参考。', max_members: 15 },
  { name: '新媒体中心', description: '负责团委官方网站、微信公众号、微博、抖音等新媒体平台的运营与维护，制作短视频、图文推送等新媒体产品，提升团属媒体的传播力和影响力。', max_members: 30 },
  { name: '对外联络部', description: '负责团委对外交流与联络工作，对接兄弟院校团组织和校外合作单位，争取社会资源，拓展团工作的外部支持与合作空间。', max_members: 20 },
  { name: '第二课堂管理部', description: '负责"第二课堂成绩单"制度建设与运行管理，统筹第二课堂活动项目的发布、认定和学分记录工作，促进学生全面发展。', max_members: 15 },
  { name: '学术科技部', description: '聚焦学风建设和学术氛围营造，组织开展学术讲座、读书会、学科竞赛和学术交流活动，提升学生学术素养和创新能力。', max_members: 20 },
  { name: '心理工作部', description: '负责学生心理健康教育和咨询服务，组织开展心理健康宣传月、团体辅导、心理讲座等活动，协助学校心理中心开展危机干预工作。', max_members: 15 },
  { name: '就业创业部', description: '负责学生就业创业指导与服务，组织开展职业规划大赛、简历指导、模拟面试和创业培训等活动，搭建校企就业对接平台。', max_members: 20 },
  { name: '国防教育部', description: '负责国防教育和征兵宣传，组织开展国防知识讲座、军事体验营和拥军优属活动，增强学生国防意识和家国情怀。', max_members: 15 },
  { name: '社团团工委', description: '负责社团团组织的建设和管理，指导社团团支部开展团日活动和政治学习，推动团的组织覆盖到每一个学生社团。', max_members: 15 },
];

// ============================================================
// 模拟用户定义
// ============================================================
const DEMO_USERS = [
  // --- 部长 (minister) - 核心部门 ---
  { email: 'minister_zuzhi@youth.com', password: 'Demo123456', fullName: '张明宇', role: 'minister', deptIdx: 0, studentId: '2024001' },
  { email: 'minister_xuanchuan@youth.com', password: 'Demo123456', fullName: '李思涵', role: 'minister', deptIdx: 1, studentId: '2024002' },
  { email: 'minister_bangong@youth.com', password: 'Demo123456', fullName: '王浩然', role: 'minister', deptIdx: 2, studentId: '2024003' },
  { email: 'minister_shijian@youth.com', password: 'Demo123456', fullName: '赵雨桐', role: 'minister', deptIdx: 3, studentId: '2024004' },
  { email: 'minister_wenti@youth.com', password: 'Demo123456', fullName: '陈晓萱', role: 'minister', deptIdx: 7, studentId: '2024005' },

  // --- 组织部副部长 (minister) ---
  // NOTE: 需要 secretary 角色时先跑 migration 007_add_secretary_role.sql
  { email: 'secretary_liu@youth.com', password: 'Demo123456', fullName: '刘子轩', role: 'minister', deptIdx: 0, studentId: '2024006' },

  // --- 干事 (member) - 各部门 ---
  { email: 'member_wang@youth.com', password: 'Demo123456', fullName: '周小雅', role: 'member', deptIdx: 0, studentId: '2024010' },
  { email: 'member_chen@youth.com', password: 'Demo123456', fullName: '吴昊天', role: 'member', deptIdx: 0, studentId: '2024011' },
  { email: 'member_lin@youth.com', password: 'Demo123456', fullName: '林雨欣', role: 'member', deptIdx: 1, studentId: '2024012' },
  { email: 'member_zheng@youth.com', password: 'Demo123456', fullName: '郑凯文', role: 'member', deptIdx: 1, studentId: '2024013' },
  { email: 'member_huang@youth.com', password: 'Demo123456', fullName: '黄思琪', role: 'member', deptIdx: 2, studentId: '2024014' },
  { email: 'member_ye@youth.com', password: 'Demo123456', fullName: '叶俊杰', role: 'member', deptIdx: 3, studentId: '2024015' },
  { email: 'member_xu@youth.com', password: 'Demo123456', fullName: '许梦瑶', role: 'member', deptIdx: 4, studentId: '2024016' },
  { email: 'member_sun@youth.com', password: 'Demo123456', fullName: '孙宇航', role: 'member', deptIdx: 7, studentId: '2024017' },

  // --- 申请人 (applicant) - 无部门 ---
  { email: 'applicant_zhang@youth.com', password: 'Demo123456', fullName: '张子涵', role: 'applicant', deptIdx: -1, studentId: '2024020' },
  { email: 'applicant_li@youth.com', password: 'Demo123456', fullName: '李子琪', role: 'applicant', deptIdx: -1, studentId: '2024021' },
  { email: 'applicant_wang@youth.com', password: 'Demo123456', fullName: '王思远', role: 'applicant', deptIdx: -1, studentId: '2024022' },
];

async function main() {
  const existingUsers = await listAllUsers(supabase);
  const adminUser = existingUsers.find(
    (user) => user.email?.trim().toLowerCase() === adminEmail,
  );
  if (!adminUser) {
    throw new Error('未找到指定管理员账号，未写入任何 Demo 数据。');
  }

  console.log(`目标项目: ${actualProjectRef}`);
  console.log(`管理员账号: ${adminEmail}`);
  console.log('🚀 开始生成 Demo 数据\n');

  // ============================================================
  // 第一步：幂等写入 departments
  // ============================================================
  console.log('📦 第一步：更新 departments...');

  // 保留已有部门及其外键关系，仅按名称插入或更新标准部门。
  const { data: deptData, error: insertDeptError } = await supabase
    .from('departments')
    .upsert(DEPARTMENTS, { onConflict: 'name' })
    .select();
  if (insertDeptError) {
    throw new Error(`写入部门失败: ${insertDeptError.message}`);
  }
  console.log(`   ✅ 已写入 ${deptData.length} 个部门`);

  // 建立部门名称 -> ID 映射
  const deptMap = {};
  for (const d of deptData) {
    deptMap[d.name] = d.id;
  }
  console.log(`   📋 部门列表: ${deptData.map(d => d.name).join(', ')}`);

  // ============================================================
  // 第二步：更新管理员 profile 关联到组织部
  // ============================================================
  console.log('\n👤 第二步：更新管理员 profile...');
  const orgDeptId = deptMap['组织部'];
  const { data: updatedAdmin, error: updateAdminError } = await supabase
    .from('profiles')
    .update({
      department_id: orgDeptId,
      role: 'admin',
      updated_at: new Date().toISOString(),
    })
    .eq('id', adminUser.id)
    .select('id')
    .maybeSingle();
  if (updateAdminError || !updatedAdmin) {
    throw new Error(`更新管理员 profile 失败: ${updateAdminError?.message || 'profile 不存在'}`);
  }
  console.log('   ✅ 管理员 profile 已更新（部门: 组织部, 角色: admin）');

  // ============================================================
  // 第三步：创建模拟用户
  // ============================================================
  console.log('\n👥 第三步：创建模拟用户...');

  let created = 0;
  let updated = 0;
  let failed = 0;
  const usersByEmail = new Map(
    existingUsers
      .filter((user) => user.email)
      .map((user) => [user.email.toLowerCase(), user]),
  );

  for (const user of DEMO_USERS) {
    const existingUser = usersByEmail.get(user.email.toLowerCase());
    const authResult = existingUser
      ? await supabase.auth.admin.updateUserById(existingUser.id, {
          password: user.password,
          user_metadata: {
            ...existingUser.user_metadata,
            full_name: user.fullName,
            role: user.role,
            demo_seed: true,
          },
        })
      : await supabase.auth.admin.createUser({
          email: user.email,
          password: user.password,
          email_confirm: true,
          user_metadata: {
            full_name: user.fullName,
            role: user.role,
            demo_seed: true,
          },
        });

    const { data: authData, error: authError } = authResult;

    if (authError) {
      console.error(`   ❌ ${user.email}: 创建 auth 用户失败 - ${authError.message}`);
      failed++;
      continue;
    }

    const userId = authData.user.id;
    console.log(
      `   ✅ ${user.email} (${user.fullName}) -> auth ${existingUser ? '更新' : '创建'}成功`,
    );

    // 创建 profile
    const profileData = {
      id: userId,
      full_name: user.fullName,
      student_id: user.studentId,
      department_id: user.deptIdx >= 0 ? deptData[user.deptIdx]?.id || null : null,
      role: user.role,
      phone: null,
      avatar_url: null,
    };

    const { error: profileError } = await supabase
      .from('profiles')
      .upsert(profileData);

    if (profileError) {
      console.error(`   ❌ ${user.email}: 创建 profile 失败 - ${profileError.message}`);
      // 回滚 auth user
      if (!existingUser) {
        const { error: rollbackError } = await supabase.auth.admin.deleteUser(userId);
        if (rollbackError) {
          console.error(`   ❌ ${user.email}: auth 回滚失败 - ${rollbackError.message}`);
        }
      }
      failed++;
    } else {
      if (existingUser) updated++;
      else created++;
      console.log(`   ✅ ${user.email} -> profile 创建成功 (${user.role})`);
    }
  }

  console.log(`\n📊 处理完成: ${created} 创建, ${updated} 更新, ${failed} 失败`);
  if (failed > 0) {
    throw new Error(`${failed} 个 Demo 用户处理失败，请检查上方错误。`);
  }

  // ============================================================
  // 第四步：最终验证
  // ============================================================
  console.log('\n🔍 第四步：最终数据验证...');

  const tables = [
    'departments',
    'profiles',
  ];

  for (const table of tables) {
    const { count, error } = await supabase
      .from(table)
      .select('*', { count: 'exact', head: true });
    if (!error) {
      console.log(`   ${table}: ${count} 条`);
    } else {
      console.error(`   ❌ ${table}: 查询失败 - ${error.message}`);
    }
  }

  // 按角色统计
  const { data: roleStats } = await supabase
    .from('profiles')
    .select('role');
  if (roleStats) {
    const stats = {};
    for (const p of roleStats) {
      stats[p.role] = (stats[p.role] || 0) + 1;
    }
    console.log('\n   角色分布:');
    for (const [role, count] of Object.entries(stats)) {
      console.log(`     ${role}: ${count}`);
    }
  }

  console.log('\n🎉 Demo 数据准备完成！');
  console.log(`   管理员: ${adminEmail} / 原有密码`);
  console.log(`   模拟用户密码统一: Demo123456`);
}

main().catch((err) => {
  console.error('❌ 脚本执行失败:', err);
  process.exit(1);
});
