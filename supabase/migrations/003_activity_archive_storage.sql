-- ============================================================
-- 功能一：Supabase Storage RLS Policies
-- ============================================================

-- 活动照片 bucket policies
CREATE POLICY "认证用户可上传活动照片" ON storage.objects
    FOR INSERT WITH CHECK (bucket_id = 'activity-photos' AND auth.role() = 'authenticated');

CREATE POLICY "认证用户可查看活动照片" ON storage.objects
    FOR SELECT USING (bucket_id = 'activity-photos');

-- 活动文档 bucket policies
CREATE POLICY "认证用户可上传活动文档" ON storage.objects
    FOR INSERT WITH CHECK (bucket_id = 'activity-documents' AND auth.role() = 'authenticated');

CREATE POLICY "认证用户可查看活动文档" ON storage.objects
    FOR SELECT USING (bucket_id = 'activity-documents');

-- ============================================================
-- 功能二：修改 activity_reports 表结构
-- ============================================================

ALTER TABLE activity_reports 
ADD COLUMN IF NOT EXISTS photos text[],
ADD COLUMN IF NOT EXISTS attachments text[];