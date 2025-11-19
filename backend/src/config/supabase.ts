import { createClient, SupabaseClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import logger from '../utils/logger';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    logger.warn('[Supabase] Configuration missing. Storage features will be disabled.');
}

/**
 * Supabase 클라이언트 인스턴스
 * - Storage API를 통한 파일 관리
 */
export const supabase: SupabaseClient | null =
    supabaseUrl && supabaseKey
        ? createClient(supabaseUrl, supabaseKey)
        : null;

/**
 * Supabase Storage 버킷 이름
 */
export const BUCKET_NAME = process.env.SUPABASE_BUCKET_NAME || 'room-images';
