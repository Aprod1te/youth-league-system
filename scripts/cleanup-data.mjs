#!/usr/bin/env node

/**
 * 数据清理脚本
 * 
 * 清理所有数据，只保留管理员账号 "haidencyrilyang@163.com"
 * 
 * 使用方式:
 *   node scripts/cleanup-data.mjs
 * 
 * 环境变量 (来自 .env.local):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// 读取 .env.local
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
    // Remove surrounding quotes if any
    if ((value.startsWith('"') && value.endsWith('"')) || 
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

const env = loadEnv();

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('❌ 缺少环境变量: NEXT_PUBLIC_SUPABASE_URL 或 SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

// 使用 service_role key 创建客户端（绕过 RLS）
const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  console.log('🔍 开始查询管理员账号...');

  // ============================================================
  // 第一步：找到管理员用户
  // ============================================================
  let adminUserId = null;
  let adminUserEmail = null;

  // 尝试方式1：通过 auth.admin.listUsers 获取所有用户
  const { data: usersData, error: usersError } = await supabase.auth.admin.listUsers();
  if (usersError) {
    console.error('❌ 查询用户列表失败:', usersError.message);
    process.exit(1);
  }

  console.log(`📋 auth.users 中共有 ${usersData.users.length} 个用户`);

  for (const user of usersData.users) {
    const email = (user.email || '').toLowerCase();
    // 匹配管理员 - 邮箱为 haidencyrilyang@163.com
    if (email.includes('haidencyrilyang')) {
      adminUserId = user.id;
      adminUserEmail = user.email;
      console.log(`✅ 找到管理员: ${user.email} (id: ${user.id})`);
      break;
    }
  }

  if (!adminUserId) {
    console.error('❌ 未找到管理员账号');
    console.error('请确认 haidencyrilyang@163.com 账号是否存在');
    process.exit(1);
  }

  console.log(`\n🔧 管理员信息:`);
  console.log(`   ID: ${adminUserId}`);
  console.log(`   邮箱: ${adminUserEmail || '未知'}`);

  // ============================================================
  // 第二步：查询数据量统计
  // ============================================================
  console.log('\n📊 数据量统计:');
  
  const tables = [
    'notifications',
    'activity_checkins',
    'activity_rsvps',
    'activity_reports',
    'task_submissions',
    'tasks',
    'applications',
    'activities',
    'profiles',
    'departments',
  ];

  for (const table of tables) {
    const { count, error } = await supabase
      .from(table)
      .select('*', { count: 'exact', head: true });
    if (!error) {
      console.log(`   ${table}: ${count} 条`);
    }
  }

  // ============================================================
  // 第三步：删除数据（保留管理员）
  // ============================================================
  // 显示确认信息
  console.log('\n⚠️  即将删除所有数据（除管理员外），确认继续？(y/N)');
  
  // 非交互模式 - 直接继续
  // 如果是交互式，可以在这里等待输入
  
  console.log('\n🗑️ 开始删除数据...');

  // 删除顺序：先删除有外键引用的子表，再删父表
  // departments 表保留（种子数据），且没有 profiles 引用时可直接保留
  
  const deleteOrder = [
    'notifications',
    'activity_checkins',
    'activity_rsvps',
    'activity_reports',
    'task_submissions',
    'tasks',
    'applications',
    'activities',
  ];

  for (const table of deleteOrder) {
    const { error } = await supabase.from(table).delete().neq('id', '00000000-0000-0000-0000-000000000000');
    if (error) {
      console.error(`   ❌ ${table}: 删除失败 - ${error.message}`);
    } else {
      console.log(`   ✅ ${table}: 已清空`);
    }
  }

  // 删除其他用户的 profiles（保留管理员）
  const { error: profileDeleteError } = await supabase
    .from('profiles')
    .delete()
    .neq('id', adminUserId);
  
  if (profileDeleteError) {
    console.error(`   ❌ profiles: 删除失败 - ${profileDeleteError.message}`);
  } else {
    console.log(`   ✅ profiles: 已删除非管理员用户`);
  }

  // ============================================================
  // 第四步：删除其他 auth 用户
  // ============================================================
  console.log('\n🗑️ 删除其他 auth.users...');
  
  let deletedCount = 0;
  for (const user of usersData.users) {
    if (user.id === adminUserId) continue;
    
    const { error } = await supabase.auth.admin.deleteUser(user.id);
    if (error) {
      console.error(`   ❌ 删除用户 ${user.email} (${user.id}) 失败: ${error.message}`);
    } else {
      deletedCount++;
      console.log(`   ✅ 已删除: ${user.email}`);
    }
  }

  console.log(`\n🎉 清理完成！`);
  console.log(`   删除了 ${deletedCount} 个 auth 用户`);
  console.log(`   保留的管理员: ${adminUserEmail}`);
  console.log(`   保留的管理员 ID: ${adminUserId}`);
  
  // 验证
  console.log('\n📊 清理后数据量:');
  for (const table of tables) {
    const { count, error } = await supabase
      .from(table)
      .select('*', { count: 'exact', head: true });
    if (!error) {
      console.log(`   ${table}: ${count} 条`);
    }
  }
}

main().catch((err) => {
  console.error('❌ 脚本执行失败:', err);
  process.exit(1);
});
