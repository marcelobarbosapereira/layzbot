# Verificação MVP — Windows

## Evidência executada neste checkpoint

- `corepack pnpm --dir apps/agent test -- retry-policy.test.ts`: passou com fixtures locais sanitizados.
- `corepack pnpm --dir apps/web test -- batch-report.test.tsx`: componente passou quando executado com o ambiente de teste configurado; o workspace também contém testes que exigem credenciais Supabase ausentes.
- `git diff --check`: executado antes do commit.

## Limitações explícitas

Esta máquina de execução é Windows, mas não possui uma instalação operacional do Supabase CLI/Docker, credenciais descartáveis do projeto, certificado de teste nem navegador/certificado do portal PGDAS. Portanto não foram alegados: reset do banco, execução pgTAP hospedada, login real, descoberta de certificado, Storage remoto, transmissão fiscal ou instalação empacotada Windows.

## Aceitação pendente para homologação acompanhada

Em uma máquina Windows preparada, executar `corepack pnpm test`, `corepack pnpm lint`, `corepack pnpm typecheck`, `corepack pnpm build` e `corepack pnpm --dir apps/web exec playwright test`, depois repetir o fluxo com certificado de teste autorizado, espelho local descartável e projeto Supabase de homologação. Registrar apenas resultados sanitizados.
