# PGDAS-D homologação acompanhada

## Limite desta implementação

As validações automatizadas usam somente páginas HTML locais sanitizadas. Não foram usados certificado real,
credenciais reais, portal de produção ou transmissão fiscal. O preflight de origem real está indisponível neste
host e permanece pendente de execução acompanhada pelo responsável.

## Checklist manual, sem transmissão

1. Confirmar uma conta de teste autorizada e um certificado A1 de homologação, nunca um segredo em log ou arquivo.
2. Abrir um navegador visível em uma origem previamente autorizada e registrar origem e redirecionamentos.
3. Confirmar que o assunto, fingerprint e responsável exibidos correspondem ao snapshot esperado.
4. Confirmar a seleção sem ambiguidade do representante pelo rótulo/texto acessível e pelo documento mascarado.
5. Verificar que CAPTCHA, manutenção, autorização ausente e certificado inesperado interrompem o fluxo.
6. Parar antes de abrir uma declaração editável. Não clicar em transmitir e não baixar documentos fiscais.
7. Somente persistir screenshots após confirmação dos quatro masks: documento, nome, receita e código de barras.

## Reconciliação antes de transmitir

Antes de cada tentativa acompanhada, consultar a declaração remota para a competência e o contribuinte
selecionados. Uma declaração transmitida só pode ser considerada a mesma operação quando o `confirmationId`
imutável e o `summaryFingerprint` calculado localmente coincidirem exatamente. Nesse caso, marcar o item como
`alreadySubmitted` sem clicar novamente.

Estado inexistente permite uma única passagem pela confirmação final. O resumo visível deve ser relido imediatamente
antes do clique e um evento `submission_started` com `attemptId` único deve ser persistido primeiro. Se o navegador
perder a conexão, retornar uma resposta ambígua, ou o estado remoto ficar ilegível, parar com `needs_attention`,
consultar o portal manualmente e nunca repetir o clique automaticamente. Estado remoto conflitante também exige
intervenção; não se deve tentar resolver divergências por heurística.

Este limite de reconciliação é comprovado apenas pelos fixtures locais sanitizados. A transmissão real continua sendo
uma etapa acompanhada, com autorização explícita e reconciliação manual do recibo.

## Evidência

Registrar apenas origem, locators sem dados pessoais, códigos de resultado e horários. Screenshots sem confirmação
de sanitização devem ser descartados; documentos, números completos, nomes e receitas não devem aparecer em logs.
