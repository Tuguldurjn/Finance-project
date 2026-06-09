import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm'

const SUPABASE_URL = "https://kiswviroywlnzhjrwvvd.supabase.co"
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtpc3d2aXJveXdsbnpoanJ3dnZkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA5NzcwMzQsImV4cCI6MjA5NjU1MzAzNH0.uMAxV4KvaPbHXgpk3I_EZ1mEWDbCI2Bxl6oVEHaNkoI"

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
