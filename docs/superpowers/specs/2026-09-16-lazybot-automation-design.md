# Automação mensal de encargos e declarações

## Objetivo

Construir uma aplicação web para cadastrar contribuintes, preparar apurações mensais e executar a emissão de guias e declarações por meio de agentes instalados em Windows e Arch Linux.

O primeiro ciclo automatiza o Simples Nacional no PGDAS-D. Os demais encargos presentes na planilha original serão adicionados posteriormente como integrações independentes.

## Resultado esperado

O usuário deve conseguir:

1. Acessar a mesma aplicação pelo Windows ou Arch Linux.
2. Importar o cadastro existente em Excel.
3. Adicionar e editar responsáveis e contribuintes em tabelas semelhantes à planilha.
4. Selecionar uma competência e informar a receita mensal de cada empresa.
5. Revisar as empresas selecionadas e confirmar o lote uma única vez.
6. Escolher um dispositivo executor que esteja online.
7. Acompanhar o andamento do lote em tempo real.
8. Retomar somente itens incompletos após uma interrupção.
9. Baixar o DAS e o recibo do PGDAS-D organizados por responsável, obrigação e competência.

## Escopo do MVP

O MVP inclui:

- Aplicação Next.js com App Router.
- Autenticação da aplicação.
- Supabase Postgres, Realtime e Storage privado.
- Interface tabular inspirada no arquivo Excel atual.
- Importação do arquivo Excel atual.
- Cadastro de responsáveis, contribuintes e obrigações.
- Configuração de uma única atividade tributária por empresa: comércio ou serviços.
- Apurações mensais do Simples Nacional.
- Confirmação única por lote.
- Seleção explícita do dispositivo executor, usando o último dispositivo como padrão.
- Agente Node.js compatível com Windows e Arch Linux.
- Certificados A1 armazenados somente nos dispositivos autorizados.
- Automação do PGDAS-D com navegador visível.
- Download, validação, armazenamento e organização de DAS e recibos.
- Histórico de lotes, tentativas, eventos e documentos.
- Retomada segura de execuções interrompidas.

O MVP não inclui:

- Automação de INSS, FGTS, GPS, eSocial ou DCTFWeb.
- Execução agendada.
- Aplicativo móvel nativo.
- Executor permanente em máquina virtual na nuvem.
- Perfis complexos de acesso para equipes.

## Arquitetura

A solução terá um plano de controle web e executores locais.

```text
Next.js
  Interface, autenticação e operações do usuário
                     |
                     v
Supabase
  Postgres, fila, Realtime e Storage privado
                     |
          +----------+----------+
          |                     |
          v                     v
Agente Windows             Agente Arch Linux
Node.js + Playwright       Node.js + Playwright
Certificados locais        Certificados locais
```

### Aplicação Next.js

A aplicação apresenta os cadastros, competências, lotes, progresso e documentos. Leituras iniciais serão realizadas no servidor. Alterações internas da interface usarão Server Actions. Endpoints consumidos pelos agentes usarão Route Handlers autenticados.

A aplicação não executará o navegador do PGDAS-D nem terá acesso aos arquivos ou senhas dos certificados.

### Supabase

O Supabase será a fonte central de dados e coordenação:

- Postgres guarda cadastros, apurações, lotes e eventos.
- Realtime atualiza o progresso exibido pela interface.
- Storage privado guarda DAS, recibos, capturas de erro autorizadas e relatórios.
- Row Level Security restringe dados e documentos ao usuário autenticado.

Operações privilegiadas não usarão a chave `service_role` no navegador nem no agente. O agente terá uma identidade de dispositivo e chamará endpoints restritos da aplicação.

### Agente local

O agente será um processo Node.js empacotado separadamente para Windows e Arch Linux. Ele deverá:

- Registrar o dispositivo e enviar sinais periódicos de disponibilidade.
- Manter os certificados A1 e suas senhas em armazenamento local seguro.
- Validar a disponibilidade e a validade dos certificados antes de aceitar um lote.
- Reivindicar atomicamente apenas os trabalhos destinados ao dispositivo.
- Abrir o navegador visivelmente com Playwright.
- Executar os adaptadores de cada portal.
- Baixar, validar e enviar documentos.
- Atualizar eventos e progresso sem expor segredos.
- Retomar trabalhos interrompidos sem repetir transmissões concluídas.

No Windows, as senhas serão protegidas pelo Windows Credential Manager ou DPAPI. No Arch Linux, serão protegidas por Secret Service ou KWallet. O arquivo PFX não será armazenado no Supabase.

## Interface

A tela principal seguirá a organização familiar da planilha:

```text
[Competência] [Importar Excel] [Novo cadastro] [Executar lote]

[INSS] [FGTS] [GPS] [eSocial] [Simples] [DCTFWeb] [Execuções]
```

No MVP, somente a aba Simples terá execução automatizada. As outras abas poderão ser importadas e visualizadas, mas não iniciarão automações até seus respectivos ciclos.

### Tabela do Simples Nacional

Campos principais:

- Executar.
- Empresa.
- CNPJ.
- Receita do período.
- Atividade: comércio ou serviços.
- Opção tributária usada no portal.
- Responsável.
- Status.
- Última execução.
- Documentos.

O rótulo `Receita do período` substitui o rótulo ambíguo `Valor` da planilha. O campo representa o faturamento mensal informado no PGDAS-D, não o valor calculado do DAS.

A grade permitirá adicionar linhas, editar células, ordenar, filtrar e colar blocos copiados do Excel. Documentos e campos obrigatórios serão validados antes da inclusão no lote.

## Modelo de dados

### `users`

Identidade do usuário da aplicação, vinculada ao Supabase Auth.

### `responsibles`

- Identificador.
- Nome amigável do escritório ou responsável.
- CPF ou CNPJ.
- Situação ativa.

### `devices`

- Identificador.
- Usuário proprietário.
- Nome do dispositivo.
- Sistema operacional.
- Identidade pública do agente.
- Último sinal recebido.
- Situação online calculada.
- Versão do agente.

### `device_certificates`

Metadados sem material secreto:

- Dispositivo.
- Responsável.
- Número de série ou impressão digital.
- Titular.
- Validade.
- Situação local informada pelo agente.

### `taxpayers`

- Identificador.
- Nome ou razão social.
- CPF ou CNPJ.
- Responsável padrão.
- Situação ativa.

### `taxpayer_obligations`

- Contribuinte.
- Tipo de obrigação.
- Situação ativa.
- Configuração específica da obrigação.

### `simple_profiles`

- Contribuinte.
- Atividade: comércio ou serviços.
- Opção tributária exata usada no PGDAS-D.
- Município e demais parâmetros necessários ao portal, quando aplicáveis.

Cada empresa terá somente uma atividade no MVP.

### `monthly_assessments`

- Contribuinte.
- Obrigação.
- Competência.
- Receita do período.
- Indicação de execução.
- Estado atual.
- Versão para controle de concorrência.

A combinação contribuinte, obrigação e competência será única.

### `batches`

- Competência.
- Dispositivo executor.
- Usuário que confirmou.
- Data e hora da confirmação.
- Estado.
- Totais consolidados.

Ao confirmar, o sistema cria uma fotografia imutável dos dados do lote. Alterações posteriores entram apenas em um novo lote.

### `batch_items`

- Lote.
- Apuração mensal.
- Cópia dos valores confirmados.
- Estado detalhado.
- Identificador de idempotência.
- Tentativa atual.
- Valor apurado pelo portal.
- Mensagem de intervenção, quando houver.

### `execution_events`

Registro temporal das etapas, transições e erros. Eventos não conterão senhas, conteúdo do PFX, cookies ou tokens dos portais.

### `artifacts`

- Item do lote.
- Tipo: DAS, recibo, captura de erro ou relatório.
- Caminho no Storage.
- Nome original.
- Hash criptográfico.
- Tamanho.
- Data de criação.

## Importação do Excel

A importação mapeará as abas atuais:

- `INSS`: nome, CPF e responsável.
- `FGTS`: nome, CPF e responsável.
- `GPS`: nome, NIT, código e valor.
- `Esocial`: nome, CPF e indicador de folha.
- `Simples`: nome, CNPJ, receita do período, responsável e opção tributária.
- `DCTF Vazia`: nome, documento e responsável.

A importação mostrará uma prévia e exigirá confirmação antes de gravar. Registros duplicados serão associados ao mesmo contribuinte e receberão obrigações diferentes. Linhas inválidas permanecerão na prévia com a causa do erro.

## Confirmação e criação do lote

A confirmação mostrará:

- Competência.
- Quantidade de empresas.
- Soma das receitas selecionadas.
- Responsáveis envolvidos.
- Dispositivo executor.
- Disponibilidade dos certificados necessários nesse dispositivo.
- Linhas bloqueadas por validação.

Uma única confirmação cria o lote inteiro. O lote guarda uma cópia imutável dos dados aprovados. A interface permitirá desmarcar empresas antes da confirmação, mas não alterar o lote enquanto ele estiver em execução.

## Coordenação dos agentes

Cada agente mantém um heartbeat. Um dispositivo será considerado disponível somente se o sinal for recente e a versão for compatível.

O lote será atribuído explicitamente a um dispositivo. A reivindicação do item usará uma operação atômica no banco, garantindo que Windows e Arch Linux não executem a mesma empresa simultaneamente.

Se o heartbeat cessar durante a execução:

1. O item ativo passa para estado interrompido após um período de tolerância.
2. O restante do lote permanece pendente.
3. Nenhum outro dispositivo assume automaticamente o trabalho.
4. O usuário escolhe retomar no mesmo dispositivo ou transferir os itens incompletos.

## Fluxo do PGDAS-D

Para cada empresa, o adaptador do Simples Nacional executará:

1. Validar o certificado associado ao responsável.
2. Abrir um contexto isolado do navegador com o certificado A1.
3. Autenticar e confirmar a identidade apresentada pelo portal.
4. Trocar o perfil para representante da empresa.
5. Abrir o PGDAS-D.
6. Selecionar a competência.
7. Consultar o estado existente da declaração.
8. Se ainda não transmitida, preencher a receita na opção tributária cadastrada.
9. Calcular e registrar o valor apresentado pelo portal.
10. Transmitir a declaração.
11. Baixar o recibo e o DAS.
12. Validar os documentos.
13. Enviar os arquivos ao Storage e criar cópias locais, quando configuradas.
14. Marcar o item como concluído.

A primeira homologação interromperá o fluxo imediatamente antes da transmissão. A transmissão automática somente será habilitada depois de uma execução real acompanhada e aprovada.

## Estados e idempotência

Estados principais do item:

```text
pending
authenticating
profile_selected
assessment_filled
calculated
submitted
das_downloaded
completed
needs_attention
failed
interrupted
```

Antes de transmitir, o agente consultará o portal para verificar se a declaração já existe. Se estiver transmitida, não repetirá a transmissão e tentará apenas recuperar documentos ausentes.

O identificador de idempotência combinará obrigação, contribuinte, competência e versão do lote. Uma nova tentativa nunca será tratada como autorização para criar uma segunda declaração.

## Documentos e caminhos

O Storage será a fonte compartilhada dos documentos. O caminho lógico será:

```text
responsavel/
  simples-nacional/
    AAAA/
      MM-AAAA/
        empresa/
          AAAA-MM_DAS_Empresa_CNPJ.pdf
          AAAA-MM_Recibo-PGDAS_Empresa_CNPJ.pdf
```

Nomes serão normalizados para remover caracteres inválidos e limitar o comprimento. CPF e CNPJ poderão ser parcialmente mascarados na interface, mas o documento completo poderá ser usado no nome do arquivo quando essa configuração estiver habilitada.

O agente poderá espelhar o mesmo caminho em uma pasta local configurada separadamente em cada dispositivo. O hash do arquivo impedirá duplicatas silenciosas. Um conteúdo diferente para o mesmo nome criará uma versão identificada e um alerta.

## Tratamento de erros

Uma falha em uma empresa não interrompe o lote. O agente registra a etapa, o erro sanitizado e, quando seguro, uma captura de tela. Depois segue para o próximo item.

Exigem intervenção, entre outros:

- CAPTCHA ou desafio de autenticação não automatizável.
- Procuração ausente ou expirada.
- Certificado vencido ou indisponível.
- Identidade autenticada diferente do responsável esperado.
- Empresa ou competência indisponível.
- Divergência entre atividade cadastrada e opções apresentadas pelo portal.
- Declaração existente em estado incompatível.
- Mensagem inesperada do portal.

Falhas transitórias de rede terão tentativas limitadas com espera progressiva. Transmissões e comandos com efeito fiscal não serão repetidos sem consulta prévia do estado remoto.

## Segurança

- Certificados e senhas permanecem somente nos dispositivos cadastrados.
- As senhas usam o cofre nativo do sistema operacional.
- O agente não recebe uma chave `service_role`.
- Dispositivos usam credenciais revogáveis e escopo mínimo.
- Tabelas e objetos do Storage usam Row Level Security.
- Documentos ficam em bucket privado e são entregues por acesso autenticado ou URL temporária.
- Logs não armazenam segredos, cookies, tokens ou conteúdo integral de documentos fiscais.
- Capturas de erro evitam ou ocultam dados sensíveis sempre que possível.
- Toda confirmação de lote registra usuário, horário, dispositivo e valores aprovados.

## Estratégia de testes

### Testes unitários

- Validação de CPF, CNPJ e NIT.
- Normalização de nomes e caminhos.
- Regras de competência.
- Transições válidas de estado.
- Idempotência.
- Mapeamento da importação do Excel.

### Testes de integração

- Políticas de acesso do Supabase.
- Reivindicação atômica de itens.
- Heartbeat e detecção de agente offline.
- Upload, hash e recuperação de documentos.
- Atualizações em tempo real.
- Retomada após interrupção.

### Testes do adaptador

- Páginas simuladas do portal para caminhos normais e mensagens de erro.
- Seletores resilientes e validação de conteúdo, sem depender apenas de posição visual.
- Detecção de declaração já transmitida.
- Downloads ausentes, inválidos ou duplicados.

### Testes completos

- Importar o Excel, criar competência, confirmar lote e acompanhar o resultado.
- Executar com agente Windows.
- Executar com agente Arch Linux.
- Interromper navegador, rede e agente em diferentes etapas.
- Retomar somente itens incompletos.
- Confirmar que dois agentes não assumem o mesmo item.

### Homologação no portal real

1. Navegação acompanhada até a etapa anterior à transmissão.
2. Uma transmissão real acompanhada.
3. Conferência manual do recibo, DAS, empresa, competência e valores.
4. Habilitação do lote completo somente após aprovação.

## Observabilidade

A interface exibirá:

- Dispositivos online e suas versões.
- Etapa atual de cada empresa.
- Tempo de início e término.
- Quantidade de itens concluídos, interrompidos, com intervenção e com falha.
- Mensagem objetiva e ação recomendada para cada problema.
- Links para DAS, recibo e evidências autorizadas.

Logs técnicos detalhados permanecerão separados da mensagem operacional e terão retenção configurável.

## Critérios de aceite do MVP

O MVP estará concluído quando:

1. A planilha atual puder ser importada com prévia e validação.
2. Responsáveis e empresas puderem ser incluídos e editados pela interface tabular.
3. Uma competência puder ser criada sem sobrescrever o histórico anterior.
4. A receita mensal e a atividade de cada empresa puderem ser revisadas.
5. Um lote puder ser confirmado uma única vez e atribuído a um dispositivo online.
6. O mesmo sistema puder ser operado pelo Windows e Arch Linux.
7. Ambos os agentes puderem usar certificados A1 configurados localmente.
8. O PGDAS-D puder ser executado com navegador visível e identidade validada.
9. Uma declaração já transmitida não for transmitida novamente durante uma retomada.
10. DAS e recibo forem validados e armazenados no caminho correto.
11. Uma falha isolada não impedir o processamento das demais empresas.
12. O relatório final permitir identificar itens concluídos e ações pendentes.

## Sequência de entrega

1. Base Next.js e Supabase com autenticação e políticas.
2. Modelo de dados, migrações e importação do Excel.
3. Interface tabular e competências mensais.
4. Lotes, confirmação única e acompanhamento em tempo real.
5. Protocolo do agente, heartbeat e reivindicação atômica.
6. Empacotamento inicial para Windows e Arch Linux.
7. Prova de viabilidade do certificado A1 nos domínios reais.
8. Adaptador do PGDAS-D com páginas simuladas.
9. Homologação acompanhada no portal real.
10. Downloads, Storage, pastas locais, retomada e relatório final.

## Desenvolvimento em janelas do Codex

O plano de implementação deve considerar uma janela máxima de cinco horas por ciclo de trabalho do Codex. O projeto será desenvolvido de forma prolongada por meio de ciclos independentes, verificáveis e retomáveis, sem depender da continuidade de uma única sessão.

### Tamanho dos ciclos

- Cada ciclo terá um objetivo técnico principal e critérios de entrada e saída explícitos.
- O trabalho planejado deve ocupar no máximo cerca de quatro horas da janela. O tempo restante será reservado para testes, revisão, documentação e checkpoint.
- Um ciclo não combinará duas mudanças de alto risco, como alterar o esquema do banco e automatizar uma transmissão fiscal real.
- Quando uma etapa for maior que uma janela, ela será dividida por contrato ou fronteira de componente, nunca interrompida em um estado parcialmente funcional.
- Provas de viabilidade serão separadas da implementação definitiva e terão resultados documentados.

### Checkpoint obrigatório

Todo ciclo deverá terminar com:

1. Árvore de trabalho inspecionada e alterações intencionais identificadas.
2. Testes proporcionais ao risco executados.
3. Build ou verificação estática executada quando aplicável.
4. Migrações e contratos em estado consistente.
5. Documentação de decisões ou limitações atualizada.
6. Commit pequeno e descritivo.
7. Registro do que foi concluído, como verificar e qual é o próximo passo.

Nenhum checkpoint poderá deixar:

- Migração aplicada sem código compatível.
- Contrato do agente alterado em apenas um dos lados.
- Transmissão fiscal iniciada sem estado persistido.
- Segredo em arquivo temporário, log ou repositório.
- Teste desabilitado sem justificativa registrada.
- Código dependente de uma ação manual não documentada.

### Retomada entre janelas

Cada ciclo começará pela leitura do plano, do último checkpoint, do estado do Git e dos testes relevantes. A retomada não dependerá da memória da conversa anterior.

A frase **“pode continuar a implementação”** autoriza a retomada do primeiro passo incompleto da tarefa ativa. Na retomada, o agente deve inspecionar `AGENTS.md`, a especificação, o plano ativo, `docs/progress.md`, o estado do Git e os últimos commits antes de executar qualquer alteração.

Quando o consumo estimado da janela atingir aproximadamente 75%, nenhuma nova tarefa será iniciada. Se atingir 90% ou mais, o agente concluirá o próximo passo atômico seguro, executará as verificações possíveis, registrará o ponto exato de retomada e avisará o usuário. A prioridade continua sendo terminar e verificar a tarefa ativa antes da pausa.

O plano de implementação detalhado deverá especificar para cada tarefa:

- Objetivo e motivo.
- Arquivos que serão criados ou alterados.
- Dependências e pré-condições.
- Teste que falhará antes da implementação, quando aplicável.
- Comandos de verificação.
- Estado final esperado.
- Commit sugerido.
- Próxima tarefa desbloqueada.

### Fatias previstas

As seguintes fatias serão planejadas para caber individualmente em uma janela:

1. Fundação do monorepo e ferramentas de qualidade.
2. Projeto Supabase local, esquema inicial e autenticação.
3. RLS e Storage privado com testes de políticas.
4. Importação e validação do Excel.
5. Interface tabular de cadastros.
6. Competências e apurações mensais.
7. Confirmação imutável de lotes.
8. Fila, reivindicação atômica e progresso em tempo real.
9. Protocolo e simulador do agente.
10. Agente executável no Windows.
11. Agente executável no Arch Linux.
12. Prova de viabilidade do certificado A1 no Windows.
13. Prova de viabilidade do certificado A1 no Arch Linux.
14. Adaptador simulado do PGDAS-D.
15. Navegação real até a etapa anterior à transmissão.
16. Transmissão real acompanhada de uma empresa.
17. Download, validação e armazenamento de documentos.
18. Retomada, tolerância a falhas e relatório final.
19. Verificação completa do MVP nos dois sistemas.

As fatias poderão ser subdivididas durante o plano detalhado se a estimativa, o risco ou a verificação não couberem com margem na janela.

## Riscos e mitigação

- **Mudanças no portal:** adaptador isolado, seletores semânticos, capturas sanitizadas e testes de contrato.
- **Diferenças do certificado entre sistemas:** prova de viabilidade antecipada em Windows e Arch Linux.
- **Desafios humanos de autenticação:** estado `needs_attention` e retomada controlada.
- **Ações fiscais duplicadas:** consulta remota, idempotência e bloqueio atômico.
- **Exposição de dados:** certificados locais, RLS, bucket privado e logs sanitizados.
- **Queda do executor:** heartbeat, checkpoints e retomada explícita.
- **Dados mensais incorretos:** fotografia imutável do lote, validação e confirmação única com resumo.
