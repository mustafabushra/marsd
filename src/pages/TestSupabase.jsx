import { useState } from 'react'
import { createClient } from '@supabase/supabase-js'

export default function TestSupabase() {
  const [logs, setLogs] = useState([])
  const [testing, setTesting] = useState(false)

  const addLog = (message) => {
    console.log(message)
    setLogs(prev => [...prev, `${new Date().toLocaleTimeString()}: ${message}`])
  }

  const testConnection = async () => {
    setTesting(true)
    setLogs([])
    addLog('🔍 Testing Supabase Connection...')

    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
      const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

      addLog(`URL: ${supabaseUrl}`)
      addLog(`Key: ${supabaseKey?.substring(0, 20)}...`)

      const supabase = createClient(supabaseUrl, supabaseKey)

      // Test 1: Get current user
      addLog('📋 Test 1: Check auth user...')
      const { data: { user }, error: userError } = await supabase.auth.getUser()
      if (userError) addLog(`❌ Auth error: ${userError.message}`)
      else addLog(`✅ Auth check OK (user: ${user ? user.email : 'none'})`)

      // Test 2: Simple select from companies
      addLog('📋 Test 2: Query companies table...')
      const { data: companies, error: compError } = await supabase
        .from('companies')
        .select('*')
        .limit(1)

      if (compError) addLog(`❌ Companies query error: ${compError.message}`)
      else addLog(`✅ Companies query OK (found: ${companies?.length})`)

      // Test 3: Check plans
      addLog('📋 Test 3: Query plans table...')
      const { data: plans, error: planError } = await supabase
        .from('plans')
        .select('*')

      if (planError) addLog(`❌ Plans query error: ${planError.message}`)
      else addLog(`✅ Plans query OK (found: ${plans?.length})`)

      // Test 4: Try creating a test tenant
      addLog('📋 Test 4: Try inserting test tenant...')
      const testTenant = {
        name: 'Test Company ' + Date.now(),
        cr_number: 'test-' + Date.now(),
        email: 'test-' + Date.now() + '@test.com',
        status: 'active',
      }

      const { data: tenant, error: tenantError } = await supabase
        .from('tenants')
        .insert([testTenant])
        .select()
        .single()

      if (tenantError) {
        addLog(`❌ Tenant insert error: ${tenantError.message}`)
        addLog(`   Code: ${tenantError.code}`)
        addLog(`   Details: ${JSON.stringify(tenantError.details)}`)
      } else {
        addLog(`✅ Tenant insert OK (created: ${tenant.id})`)

        // Try deleting it
        await supabase
          .from('tenants')
          .delete()
          .eq('id', tenant.id)
      }

      addLog('✅ All tests completed!')
    } catch (err) {
      addLog(`💥 Exception: ${err.message}`)
    } finally {
      setTesting(false)
    }
  }

  return (
    <div style={{ padding: '20px', fontFamily: 'monospace', maxWidth: '800px', margin: '0 auto' }}>
      <h1>Supabase Connection Test</h1>

      <button
        onClick={testConnection}
        disabled={testing}
        style={{
          padding: '10px 20px',
          fontSize: '14px',
          cursor: testing ? 'not-allowed' : 'pointer',
          background: testing ? '#ccc' : '#4F46E5',
          color: '#fff',
          border: 'none',
          borderRadius: '6px',
          marginBottom: '20px',
        }}
      >
        {testing ? 'Testing...' : 'Start Test'}
      </button>

      <div
        style={{
          background: '#f5f5f5',
          padding: '15px',
          borderRadius: '8px',
          border: '1px solid #ddd',
          maxHeight: '500px',
          overflowY: 'auto',
          fontSize: '12px',
          lineHeight: '1.6',
        }}
      >
        {logs.length === 0 ? (
          <p style={{ color: '#999' }}>Click "Start Test" to begin...</p>
        ) : (
          logs.map((log, i) => (
            <div key={i} style={{ marginBottom: '5px', color: log.includes('✅') ? '#22c55e' : log.includes('❌') ? '#ef4444' : log.includes('🔍') ? '#3b82f6' : '#000' }}>
              {log}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
