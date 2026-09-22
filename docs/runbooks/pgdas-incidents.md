# Runbook de incidentes PGDAS

Este runbook cobre somente o MVP com fixtures sanitizados. Nunca repita um clique de transmissão para resolver uma resposta ambígua.

## Ordem de recuperação

1. Pause o item afetado e preserve o último evento, `summaryFingerprint` e `attemptId`.
2. Classifique o incidente: rede/timeout, CAPTCHA/autorização, divergência de identidade/atividade, documento inválido ou resposta ambígua.
3. Para rede, repita apenas leituras explicitamente transitórias com a política limitada (até três tentativas, backoff e jitter). Um item falho não interrompe os demais.
4. Para CAPTCHA, autorização, identidade, atividade ou estado remoto desconhecido, marque `needs_attention`; não faça retry automático.
5. Após reiniciar o agente, consulte o estado remoto antes de qualquer nova ação. Se houver declaração transmitida com fingerprint igual, reconcilie como já enviada. Se houver conflito, pare para revisão.
6. Para uma interrupção, registre `interrupted`, libere o lease somente após confirmação do servidor e retome pela primeira transição segura.

## Evidência e dados

Guarde somente identificadores, estados, hashes, mensagens sanitizadas e links privados autorizados. Não registre certificado, token, CPF/CNPJ completo, receita ou conteúdo do PDF nos logs técnicos. DAS e recibos permanecem como evidência fiscal; logs técnicos e screenshots sanitizados seguem a retenção configurada por proprietário.

## Encerramento

Um lote só pode ser apresentado como concluído quando todos os itens estão em estado terminal. Itens em atenção, falhos ou interrompidos devem aparecer no relatório com a última transição segura e a ação recomendada.
