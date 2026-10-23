"use client";
import {createBrowserClient} from "@supabase/ssr";
export const hasSupabaseConfig=Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL&&process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
export const supabase=hasSupabaseConfig?createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!):null;
