# Documentação do Intelligent Grid

[English](../README.md) · **Português (Brasil)**

O Intelligent Grid é uma grade de dados no estilo Excel para o navegador, escrita em TypeScript e apoiada no
[SorlaDB](https://sorladb.dev.br). As linhas ficam em uma coleção do SorlaDB, os filtros são compilados
para a linguagem de consulta do Sorla e um motor de fórmulas adiciona os cálculos do Excel por cima.

## Guias

| Página | O que aborda |
|---|---|
| [Primeiros passos](getting-started.md) | Instalação, ES module / CommonJS / bundle para navegador, configuração do SorlaDB, a primeira grade |
| [Opções da grade](options.md) | Todas as opções do construtor |
| [Colunas](columns.md) | Esquema de colunas, tipos, formatos, renderização, colunas ocultas |
| [Ordenação e filtros](sorting-filtering.md) | Ordenação por várias colunas, menu AutoFiltro, modelo de filtros, busca |
| [Filtro avançado](query-builder.md) | Construtor de consultas visual: AND / OR / NOT aninhados, JSON do find() do SorlaDB |
| [Edição e validação](editing.md) | Editores, parsing, validação, hooks de alteração, teclado, área de transferência, editores personalizados |
| [Seleção](selection.md) | Seleção de uma ou várias linhas, checkboxes, ações em massa |
| [Recursos de planilha](spreadsheet.md) | Intervalos de células, alça de preenchimento, desfazer / refazer, localizar / substituir / ir para, comentários, remoção de duplicatas, atalhos |
| [Agrupamento e subtotais](grouping.md) | Agrupar linhas por campos, recolher, subtotais por coluna |
| [Importação](import.md) | Arquivos CSV, TSV e XLSX para dentro da grade |
| [Virtualização](virtualization.md) | Grandes volumes de dados, colunas fixas (congeladas), quebra de texto, altura das linhas |
| [Barra de navegação (navbar) e barra de status](navbar.md) | Botões embutidos, chips de filtro, itens personalizados |
| [Modo append (scroll infinito)](append-mode.md) | Carregando páginas de uma API via fetch ou WebSocket, consultas no servidor vs. locais |
| [Dados do servidor](server-data.md) | Carregamento em blocos via Server-Sent Events, linhas enviadas pelo servidor |
| [Exportação](export.md) | CSV e XLSX, opções, fórmulas no Excel |
| [Rastreamento de alterações](change-tracking.md) | Linhas inseridas/atualizadas/excluídas, histórico, JSON para formulários, aceitar/rejeitar |
| [Fórmulas](formulas.md) | Linguagem de fórmulas, colunas calculadas, fórmulas de célula, rodapés, formatação condicional (barras de dados, escalas de cor, conjuntos de ícones), sparklines, funções personalizadas |
| [Referência de funções](functions.md) | Todas as 137 funções com suas assinaturas |
| [Formatos de número](number-formats.md) | Códigos de formato do Excel para exibição, `TEXT()` e XLSX |
| [Eventos](events.md) | Todos os eventos, seus detalhes e quais podem ser cancelados |
| [Referência da API](api.md) | Todos os métodos públicos |
| [Temas](theming.md) | Variáveis CSS, modo escuro, classes de estado |
| [Internacionalização](i18n.md) | Localidades, parsing de entrada, rótulos |
| [TypeScript](typescript.md) | Tipos exportados e uso tipado |

## Projeto

| Página | O que aborda |
|---|---|
| [Arquitetura](architecture.md) | Organização dos módulos e como a grade usa o SorlaDB |
| [Status do SorlaDB](sorla-db.md) | Problemas do SorlaDB corrigidos para a grade (1.1–1.5) e os itens em aberto |
| [Desenvolvimento](development.md) | Scripts, saída do build, lint, hooks do husky, testes, publicação de versões |
| [Benchmarks](benchmarks.md) | Tempos de 10 000 a 1 000 000 de linhas, tamanho do bundle |

Exemplos executáveis estão em [`examples/`](../../examples/index.html) (`npm run demo`).
