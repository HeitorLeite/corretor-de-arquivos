export interface SguFiltro {
  nomeFiltro: string;
  conteudoFiltro: string;
  tipoDadoFiltro: string;
  mascaraFiltro: string;
  obrigatorioFiltro: 'S' | 'N';
}

export interface SguApiDefinicao {
  nome: string;
  consultaSQL: string;
  ordenacao: string;
  filtros: SguFiltro[];
}

export interface SguListaResponse {
  content: SguApiDefinicao[];
  numberOfElements?: number | string;
}

export interface RelatorioCatalogo {
  id: string;
  nomeExibicao: string;
  descricao: string;
  apiNome: string;
  filtros: SguFiltro[];
  criadoEm: string;
}

export interface SguResultado {
  content: Record<string, unknown>[];
  totalElements?: number;
  numberOfElements?: number | string;
  totalPages?: number;
  number?: number;
  last?: boolean;
  [key: string]: unknown;
}

export type FormatoExportacao = 'csv' | 'txt' | 'xlsx';
