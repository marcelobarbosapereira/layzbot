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

## Evidência

Registrar apenas origem, locators sem dados pessoais, códigos de resultado e horários. Screenshots sem confirmação
de sanitização devem ser descartados; documentos, números completos, nomes e receitas não devem aparecer em logs.
