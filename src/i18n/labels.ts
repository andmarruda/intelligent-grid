/**
 * UI texts. Pass `labels` in the grid options to override any key, or add a locale here.
 */
import type { Translator } from '../types.ts';

const en: Record<string, string> = {
    search: 'Search…',
    clearFilters: 'Clear filters',
    columns: 'Columns',
    addRow: 'Add row',
    deleteRows: 'Delete',
    exportCsv: 'CSV',
    exportXlsx: 'Excel',
    sortAsc: 'Sort ascending',
    sortDesc: 'Sort descending',
    clearSort: 'Clear sort',
    filter: 'Filter',
    apply: 'Apply',
    clear: 'Clear',
    selectAll: '(Select all)',
    blanks: '(Blanks)',
    and: 'And',
    or: 'Or',
    noRows: 'No rows to show',
    loading: 'Loading…',
    loadError: 'Could not load rows',
    status: '{shown} of {total} rows',
    selected: '{count} selected',
    confirmDelete: 'Delete {count} row(s)?',
    changesCount: '{count} change(s)',
    changesDetail: '{inserted} inserted, {updated} updated, {deleted} deleted',
    discardChanges: 'Discard changes',
    confirmDiscard: 'Discard {count} unsaved change(s)?',
    was: 'Was: {value}',
    op_contains: 'Contains', op_notContains: 'Does not contain', op_equals: 'Equals', op_notEquals: 'Does not equal',
    op_startsWith: 'Begins with', op_endsWith: 'Ends with', op_empty: 'Is blank', op_notEmpty: 'Is not blank',
    op_eq: 'Equals', op_ne: 'Does not equal', op_gt: 'Greater than', op_gte: 'Greater than or equal to',
    op_lt: 'Less than', op_lte: 'Less than or equal to', op_between: 'Between',
    required: 'This field is required',
    invalidValue: 'Invalid value',
    invalidNumber: 'Enter a valid number',
    invalidInteger: 'Enter a whole number',
    invalidDate: 'Enter a valid date',
    invalidBoolean: 'Enter yes or no',
    invalidOption: 'Choose one of the options',
    pattern: 'Invalid format',
    min: 'Minimum is {0}', max: 'Maximum is {0}',
    minLength: 'At least {0} characters', maxLength: 'At most {0} characters',
    true: 'Yes', false: 'No'
};

const ptBR: Record<string, string> = {
    search: 'Pesquisar…',
    clearFilters: 'Limpar filtros',
    columns: 'Colunas',
    addRow: 'Adicionar linha',
    deleteRows: 'Excluir',
    exportCsv: 'CSV',
    exportXlsx: 'Excel',
    sortAsc: 'Classificar crescente',
    sortDesc: 'Classificar decrescente',
    clearSort: 'Remover classificação',
    filter: 'Filtrar',
    apply: 'Aplicar',
    clear: 'Limpar',
    selectAll: '(Selecionar tudo)',
    blanks: '(Vazias)',
    and: 'E',
    or: 'Ou',
    noRows: 'Nenhuma linha para exibir',
    loading: 'Carregando…',
    loadError: 'Não foi possível carregar as linhas',
    status: '{shown} de {total} linhas',
    selected: '{count} selecionada(s)',
    confirmDelete: 'Excluir {count} linha(s)?',
    changesCount: '{count} alteração(ões)',
    changesDetail: '{inserted} inserida(s), {updated} alterada(s), {deleted} excluída(s)',
    discardChanges: 'Descartar alterações',
    confirmDiscard: 'Descartar {count} alteração(ões) não salva(s)?',
    was: 'Antes: {value}',
    op_contains: 'Contém', op_notContains: 'Não contém', op_equals: 'É igual a', op_notEquals: 'É diferente de',
    op_startsWith: 'Começa com', op_endsWith: 'Termina com', op_empty: 'Está vazio', op_notEmpty: 'Não está vazio',
    op_eq: 'É igual a', op_ne: 'É diferente de', op_gt: 'É maior que', op_gte: 'É maior ou igual a',
    op_lt: 'É menor que', op_lte: 'É menor ou igual a', op_between: 'Está entre',
    required: 'Campo obrigatório',
    invalidValue: 'Valor inválido',
    invalidNumber: 'Informe um número válido',
    invalidInteger: 'Informe um número inteiro',
    invalidDate: 'Informe uma data válida',
    invalidBoolean: 'Informe sim ou não',
    invalidOption: 'Escolha uma das opções',
    pattern: 'Formato inválido',
    min: 'O mínimo é {0}', max: 'O máximo é {0}',
    minLength: 'Mínimo de {0} caracteres', maxLength: 'Máximo de {0} caracteres',
    true: 'Sim', false: 'Não'
};

const LOCALES: Record<string, Record<string, string>> = { en, pt: ptBR, 'pt-BR': ptBR };

export function createTranslator(locale: string, overrides: Record<string, string> = {}): Translator {
    const base = LOCALES[locale] ?? LOCALES[locale.split('-')[0]!] ?? en;
    const labels = { ...en, ...base, ...overrides };
    return (key, params = {}) => {
        // validation messages arrive as "min:5"
        const [name = '', arg] = String(key).split(':');
        const template = labels[key] ?? (arg !== undefined ? labels[name] : undefined);
        if (template === undefined) return String(key);
        return template.replace(/\{(\w+)\}/g, (m: string, p: string) => p === '0' && arg !== undefined ? arg : String(params[p] ?? m));
    };
}
