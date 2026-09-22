# Verificação MVP — Windows

## Evidência executada neste checkpoint

- `corepack pnpm --dir apps/agent test -- retry-policy.test.ts`: passou com fixtures locais sanitizados.
- `corepack pnpm --dir apps/web test -- batch-report.test.tsx`: componente passou quando executado com o ambiente de teste configurado; o workspace também contém testes que exigem credenciais Supabase ausentes.
- Migrations `202609160001`–`202609160009` aplicadas no Supabase hospedado `wfkvddqecvkxffdeikyw`; verificação retornou 16 tabelas públicas, bucket `fiscal-documents`, 16 tabelas com RLS e as funções `confirm_batch`/`cleanup_expired_technical_logs`.
- `corepack pnpm --dir apps/web test -- src/lib/device-auth.test.ts`: 81 testes passaram após alinhar o mock ao cliente server-role usado pelo Bearer.
- `corepack pnpm lint`, `corepack pnpm typecheck` e `corepack pnpm build`: passaram.
- `git diff --check`: executado antes do commit.

## Limitações explícitas

Esta máquina de execução é Windows e o schema hospedado foi aplicado. Ainda não possui certificado de teste nem navegador/certificado do portal PGDAS; a suíte completa também pode sofrer timeout de hooks do Chromium neste ambiente. Portanto não foram alegados: login PGDAS real, descoberta de certificado, transmissão fiscal ou instalação empacotada Windows.

## Aceitação pendente para homologação acompanhada

Em uma máquina Windows preparada, executar `corepack pnpm test`, `corepack pnpm lint`, `corepack pnpm typecheck`, `corepack pnpm build` e `corepack pnpm --dir apps/web exec playwright test`, depois repetir o fluxo com certificado de teste autorizado, espelho local descartável e projeto Supabase de homologação. Registrar apenas resultados sanitizados.
