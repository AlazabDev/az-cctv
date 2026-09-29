Edge function `az-agent` — proxies chat to Foundry agent az-agent-sol (v3).
Secrets (Supabase Edge Secrets only): AZURE_API_KEY
Optional overrides: AZURE_AGENT_ENDPOINT, AZURE_AGENT_NAME, AZURE_AGENT_VERSION
Call: POST /functions/v1/az-agent  { message, thread_id?, project_id? }  (user JWT required)
