#!/usr/bin/env node

/**
 * Destructively removes application data and auth users except one administrator.
 *
 * Required command:
 *   node scripts/cleanup-data.mjs --yes --project-ref=<ref>
 *
 * Required .env.local values:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   CLEANUP_ALLOWED_PROJECT_REFS=ref1,ref2
 *   CLEANUP_KEEP_ADMIN_EMAIL=admin@example.com
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnv() {
  const content = readFileSync(resolve(__dirname, '..', '.env.local'), 'utf8');
  return Object.fromEntries(
    content
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#') && line.includes('='))
      .map((line) => {
        const separator = line.indexOf('=');
        const key = line.slice(0, separator).trim();
        const rawValue = line.slice(separator + 1).trim();
        const quoted =
          (rawValue.startsWith('"') && rawValue.endsWith('"')) ||
          (rawValue.startsWith("'") && rawValue.endsWith("'"));
        return [key, quoted ? rawValue.slice(1, -1) : rawValue];
      }),
  );
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

const env = loadEnv();
const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
const keepAdminEmail = env.CLEANUP_KEEP_ADMIN_EMAIL?.trim().toLowerCase();
const allowedRefs = new Set(
  (env.CLEANUP_ALLOWED_PROJECT_REFS || '')
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
if (!supabaseUrl || !serviceRoleKey || !keepAdminEmail) {
  console.error('缺少 URL、service role key 或 CLEANUP_KEEP_ADMIN_EMAIL。');
  process.exit(1);
}
if (!actualProjectRef || confirmedProjectRef !== actualProjectRef) {
  console.error('拒绝执行：--project-ref 与目标 URL 不匹配。');
  process.exit(1);
}
if (!allowedRefs.has(actualProjectRef)) {
  console.error('拒绝执行：目标项目不在 CLEANUP_ALLOWED_PROJECT_REFS 中。');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  const users = await listAllUsers(supabase);
  const adminUser = users.find((user) => user.email?.toLowerCase() === keepAdminEmail);
  if (!adminUser) throw new Error('未找到要保留的管理员账号，未删除任何数据。');

  console.log(`目标项目: ${actualProjectRef}`);
  console.log(`保留账号: ${keepAdminEmail}`);
  console.log(`待检查 auth 用户: ${users.length}`);

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
    const { error } = await supabase
      .from(table)
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000');
    if (error) throw new Error(`${table} 清理失败: ${error.message}`);
    console.log(`${table}: 已清空`);
  }

  const { error: profileError } = await supabase
    .from('profiles')
    .delete()
    .neq('id', adminUser.id);
  if (profileError) throw new Error(`profiles 清理失败: ${profileError.message}`);

  for (const user of users) {
    if (user.id === adminUser.id) continue;
    const { error } = await supabase.auth.admin.deleteUser(user.id);
    if (error) throw new Error(`auth 用户 ${user.id} 删除失败: ${error.message}`);
  }

  console.log(`清理完成，保留账号: ${keepAdminEmail}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
