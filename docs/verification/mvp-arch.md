# Verificação MVP — Arch Linux

## Resultado

Não executado neste host: o ambiente atual é Windows e não há máquina/contêiner Arch Linux disponível nesta janela. Não se declara compatibilidade Arch com base em inspeção estática.

## Comandos para a próxima execução acompanhada

Em Arch Linux com Node/pnpm, Playwright e Supabase de homologação descartável instalados, executar `corepack pnpm test`, `corepack pnpm lint`, `corepack pnpm typecheck`, `corepack pnpm build` e `corepack pnpm --dir apps/web exec playwright test`. Repetir a suíte de fixtures, interrupção/retomada, espelho local, Storage privado e relatório misto.

Não usar certificado real, contribuinte real ou transmissão fiscal durante essa verificação. Registrar falhas de dependência e limitações sem transformá-las em evidência de compatibilidade.
