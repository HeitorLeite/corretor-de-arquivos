import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  FormatoExportacao,
  RelatorioCatalogo,
  SguApiDefinicao,
  SguFiltro,
  SguResultado,
} from '../../shared/models/relatorio.model';
import { RelatorioService } from '../../shared/services/relatorio.service';

type ModoCadastro = 'existente' | 'nova';

@Component({
  selector: 'app-relatorios',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './relatorios.component.html',
  styleUrls: ['./relatorios.component.scss'],
})
export class RelatoriosComponent implements OnInit {
  relatorios: RelatorioCatalogo[] = [];
  relatoriosFiltrados: RelatorioCatalogo[] = [];
  selecionado: RelatorioCatalogo | null = null;
  pesquisa = '';

  valoresFiltro: Record<string, string | number> = {};
  registros: Record<string, unknown>[] = [];
  colunas: string[] = [];
  pagina = 1;
  tamanhoPagina = 50;
  ultimaPagina = false;
  totalRegistros: number | null = null;

  carregando = false;
  exportando: FormatoExportacao | null = null;
  erro = '';
  sucesso = '';

  modalNovoAberto = false;
  modoCadastro: ModoCadastro = 'existente';
  buscandoApi = false;
  salvandoApi = false;
  apiEncontrada: SguApiDefinicao | null = null;
  novoApiNome = '';
  novoNomeExibicao = '';
  novaDescricao = '';
  novaConsultaSql = '';
  novaOrdenacao = '';
  novosFiltros: SguFiltro[] = [this.filtroVazio()];

  modalExcluirAberto = false;
  relatorioParaExcluir: RelatorioCatalogo | null = null;
  apagarTambemNoSgu = false;
  excluindo = false;

  constructor(private relatorioService: RelatorioService) {}

  ngOnInit(): void {
    this.relatorios = this.relatorioService.listarCatalogo();
    this.aplicarPesquisa();
    if (this.relatorios.length) this.selecionar(this.relatorios[0]);
  }

  aplicarPesquisa(): void {
    const termo = this.pesquisa.trim().toLowerCase();
    this.relatoriosFiltrados = !termo
      ? [...this.relatorios]
      : this.relatorios.filter(relatorio =>
          `${relatorio.nomeExibicao} ${relatorio.descricao} ${relatorio.apiNome}`
            .toLowerCase()
            .includes(termo)
        );
  }

  selecionar(relatorio: RelatorioCatalogo): void {
    this.selecionado = relatorio;
    this.valoresFiltro = {};
    relatorio.filtros.forEach(filtro => {
      this.valoresFiltro[filtro.nomeFiltro] = '';
    });
    this.limparResultado();
  }

  limparResultado(): void {
    this.registros = [];
    this.colunas = [];
    this.pagina = 1;
    this.ultimaPagina = false;
    this.totalRegistros = null;
    this.erro = '';
    this.sucesso = '';
  }

  abrirNovo(): void {
    this.modalNovoAberto = true;
    this.modoCadastro = 'existente';
    this.apiEncontrada = null;
    this.novoApiNome = '';
    this.novoNomeExibicao = '';
    this.novaDescricao = '';
    this.novaConsultaSql = '';
    this.novaOrdenacao = '';
    this.novosFiltros = [this.filtroVazio()];
    this.erro = '';
  }

  fecharNovo(): void {
    if (!this.buscandoApi && !this.salvandoApi) this.modalNovoAberto = false;
  }

  mudarModo(modo: ModoCadastro): void {
    this.modoCadastro = modo;
    this.apiEncontrada = null;
    this.erro = '';
  }

  buscarApiExistente(): void {
    const nome = this.novoApiNome.trim();
    if (!nome) {
      this.erro = 'Informe o nome da API cadastrada no SGU.';
      return;
    }

    this.buscandoApi = true;
    this.erro = '';
    this.relatorioService.buscarApi(nome).subscribe({
      next: api => {
        this.apiEncontrada = api;
        this.novoNomeExibicao ||= this.tituloAPartirDoNome(api.nome);
        this.buscandoApi = false;
      },
      error: err => {
        this.erro = this.mensagemErro(err, 'Não foi possível localizar essa API no SGU.');
        this.buscandoApi = false;
      },
    });
  }

  salvarApiExistente(): void {
    if (!this.apiEncontrada) return;
    if (!this.novoNomeExibicao.trim()) {
      this.erro = 'Informe o nome que será exibido na página.';
      return;
    }
    this.adicionarAoCatalogo(this.apiEncontrada);
    this.modalNovoAberto = false;
  }

  adicionarFiltro(): void {
    this.novosFiltros.push(this.filtroVazio());
  }

  removerFiltro(indice: number): void {
    if (this.novosFiltros.length > 1) this.novosFiltros.splice(indice, 1);
  }

  criarNovaApi(): void {
    const definicao: SguApiDefinicao = {
      nome: this.novoApiNome.trim(),
      consultaSQL: this.novaConsultaSql.trim(),
      ordenacao: this.novaOrdenacao.trim(),
      filtros: this.novosFiltros.map(filtro => ({
        ...filtro,
        nomeFiltro: filtro.nomeFiltro.trim(),
        conteudoFiltro: filtro.conteudoFiltro.trim(),
        tipoDadoFiltro: filtro.tipoDadoFiltro.trim().toUpperCase(),
        mascaraFiltro: filtro.mascaraFiltro.trim(),
      })),
    };

    const validacao = this.validarNovaApi(definicao);
    if (validacao) {
      this.erro = validacao;
      return;
    }

    this.salvandoApi = true;
    this.erro = '';
    this.relatorioService.criarApi(definicao).subscribe({
      next: () => {
        this.adicionarAoCatalogo(definicao);
        this.modalNovoAberto = false;
        this.salvandoApi = false;
        this.sucesso = `A API ${definicao.nome} foi cadastrada e adicionada aos relatórios.`;
      },
      error: err => {
        this.erro = this.mensagemErro(err, 'Não foi possível cadastrar a API no SGU.');
        this.salvandoApi = false;
      },
    });
  }

  gerar(pagina = 1): void {
    if (!this.selecionado || this.carregando) return;
    const obrigatorioVazio = this.selecionado.filtros.find(
      filtro =>
        filtro.obrigatorioFiltro === 'S' &&
        String(this.valoresFiltro[filtro.nomeFiltro] ?? '').trim() === ''
    );
    if (obrigatorioVazio) {
      this.erro = `Preencha o filtro obrigatório “${this.rotuloFiltro(obrigatorioVazio)}”.`;
      return;
    }

    const parametros = this.montarParametros(true);
    parametros['page'] = pagina;
    parametros['size'] = this.tamanhoPagina;

    this.carregando = true;
    this.erro = '';
    this.sucesso = '';
    this.relatorioService.executar(this.selecionado.apiNome, parametros).subscribe({
      next: resposta => {
        this.aplicarResultado(resposta, pagina);
        this.carregando = false;
      },
      error: err => {
        this.erro = this.mensagemErro(err, 'Não foi possível gerar o relatório.');
        this.carregando = false;
      },
    });
  }

  paginaAnterior(): void {
    if (this.pagina > 1) this.gerar(this.pagina - 1);
  }

  proximaPagina(): void {
    if (!this.ultimaPagina) this.gerar(this.pagina + 1);
  }

  baixar(formato: FormatoExportacao): void {
    if (!this.selecionado || this.exportando) return;
    const obrigatorioVazio = this.selecionado.filtros.find(
      filtro =>
        filtro.obrigatorioFiltro === 'S' &&
        String(this.valoresFiltro[filtro.nomeFiltro] ?? '').trim() === ''
    );
    if (obrigatorioVazio) {
      this.erro = `Preencha o filtro obrigatório “${this.rotuloFiltro(obrigatorioVazio)}”.`;
      return;
    }

    this.exportando = formato;
    this.erro = '';
    const nomeArquivo = this.nomeArquivo(this.selecionado.nomeExibicao);
    this.relatorioService
      .exportar(
        this.selecionado.apiNome,
        formato,
        this.montarParametros(false),
        nomeArquivo
      )
      .subscribe({
        next: blob => {
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = `${nomeArquivo}.${formato}`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(url);
          this.exportando = null;
        },
        error: async err => {
          this.erro = await this.mensagemErroBlob(
            err,
            'Não foi possível exportar o relatório.'
          );
          this.exportando = null;
        },
      });
  }

  abrirExclusao(relatorio: RelatorioCatalogo, evento?: Event): void {
    evento?.stopPropagation();
    this.relatorioParaExcluir = relatorio;
    this.apagarTambemNoSgu = false;
    this.modalExcluirAberto = true;
    this.erro = '';
  }

  fecharExclusao(): void {
    if (!this.excluindo) this.modalExcluirAberto = false;
  }

  confirmarExclusao(): void {
    if (!this.relatorioParaExcluir) return;
    if (!this.apagarTambemNoSgu) {
      this.removerDoCatalogo(this.relatorioParaExcluir);
      this.modalExcluirAberto = false;
      return;
    }

    this.excluindo = true;
    this.relatorioService.apagarApi(this.relatorioParaExcluir.apiNome).subscribe({
      next: () => {
        this.removerDoCatalogo(this.relatorioParaExcluir!);
        this.modalExcluirAberto = false;
        this.excluindo = false;
      },
      error: err => {
        this.erro = this.mensagemErro(err, 'Não foi possível apagar a API no SGU.');
        this.excluindo = false;
      },
    });
  }

  tipoInput(filtro: SguFiltro): string {
    return filtro.tipoDadoFiltro.toUpperCase() === 'NUMBER' ? 'number' : 'text';
  }

  placeholderFiltro(filtro: SguFiltro): string {
    if (filtro.tipoDadoFiltro.toUpperCase() === 'DATE') {
      return filtro.mascaraFiltro || 'DD/MM/YYYY';
    }
    return filtro.nomeFiltro;
  }

  rotuloFiltro(filtro: SguFiltro): string {
    return filtro.nomeFiltro
      .replace(/[_-]+/g, ' ')
      .replace(/\b\w/g, letra => letra.toUpperCase());
  }

  formatarValor(valor: unknown): string {
    if (valor === null || valor === undefined) return '';
    if (typeof valor === 'object') return JSON.stringify(valor);
    return String(valor);
  }

  private aplicarResultado(resposta: SguResultado, pagina: number): void {
    this.registros = Array.isArray(resposta.content) ? resposta.content : [];
    this.colunas = this.registros.length ? Object.keys(this.registros[0]) : [];
    this.pagina = pagina;
    this.ultimaPagina = resposta.last === true || this.registros.length < this.tamanhoPagina;

    const total = Number(resposta.totalElements ?? resposta.numberOfElements);
    this.totalRegistros = Number.isFinite(total) ? total : null;
    this.sucesso = this.registros.length
      ? `${this.registros.length} registro(s) carregado(s) nesta página.`
      : 'Nenhum registro encontrado para os filtros informados.';
  }

  private montarParametros(omitirVazios: boolean): Record<string, unknown> {
    const parametros: Record<string, unknown> = {};
    if (!this.selecionado) return parametros;

    this.selecionado.filtros.forEach(filtro => {
      const valor = this.valoresFiltro[filtro.nomeFiltro];
      if (omitirVazios && String(valor ?? '').trim() === '') return;
      if (String(valor ?? '').trim() === '') return;
      parametros[filtro.nomeFiltro] = filtro.tipoDadoFiltro.toUpperCase() === 'NUMBER'
        ? Number(valor)
        : valor;
    });
    return parametros;
  }

  private adicionarAoCatalogo(api: SguApiDefinicao): void {
    const existente = this.relatorios.find(relatorio => relatorio.apiNome === api.nome);
    const relatorio: RelatorioCatalogo = {
      id: existente?.id ?? this.gerarId(),
      nomeExibicao: this.novoNomeExibicao.trim() || this.tituloAPartirDoNome(api.nome),
      descricao: this.novaDescricao.trim(),
      apiNome: api.nome,
      filtros: api.filtros ?? [],
      criadoEm: existente?.criadoEm ?? new Date().toISOString(),
    };

    this.relatorios = existente
      ? this.relatorios.map(item => item.id === existente.id ? relatorio : item)
      : [...this.relatorios, relatorio];
    this.persistir();
    this.aplicarPesquisa();
    this.selecionar(relatorio);
  }

  private removerDoCatalogo(relatorio: RelatorioCatalogo): void {
    this.relatorios = this.relatorios.filter(item => item.id !== relatorio.id);
    this.persistir();
    this.aplicarPesquisa();
    if (this.selecionado?.id === relatorio.id) {
      this.selecionado = null;
      this.limparResultado();
      if (this.relatorios.length) this.selecionar(this.relatorios[0]);
    }
  }

  private persistir(): void {
    this.relatorioService.salvarCatalogo(this.relatorios);
  }

  private validarNovaApi(api: SguApiDefinicao): string {
    if (!api.nome) return 'Informe o nome da API.';
    if (!api.consultaSQL) return 'Informe a consulta SQL.';
    if (!this.novoNomeExibicao.trim()) return 'Informe o nome de exibição do relatório.';
    if (!api.filtros.length) return 'Adicione pelo menos um filtro.';

    for (const filtro of api.filtros) {
      if (!filtro.nomeFiltro || !/^[a-z0-9_]+$/.test(filtro.nomeFiltro)) {
        return 'O nome de cada filtro deve estar em minúsculo, sem espaços e usar apenas letras, números ou underscore.';
      }
      if (!filtro.conteudoFiltro.startsWith('and ')) {
        return `O conteúdo do filtro “${filtro.nomeFiltro}” deve começar com “and ” em minúsculo.`;
      }
      if (!filtro.conteudoFiltro.includes(`:${filtro.nomeFiltro}`)) {
        return `O filtro “${filtro.nomeFiltro}” deve usar o parâmetro :${filtro.nomeFiltro}.`;
      }
      if (!/^(NUMBER|DATE|VARCHAR\(\d+\))$/i.test(filtro.tipoDadoFiltro)) {
        return `Tipo inválido no filtro “${filtro.nomeFiltro}”. Use NUMBER, DATE ou VARCHAR(tamanho).`;
      }
    }
    return '';
  }

  private filtroVazio(): SguFiltro {
    return {
      nomeFiltro: '',
      conteudoFiltro: 'and ',
      tipoDadoFiltro: 'VARCHAR(120)',
      mascaraFiltro: '',
      obrigatorioFiltro: 'N',
    };
  }

  private tituloAPartirDoNome(nome: string): string {
    return nome
      .replace(/^\d+-/, '')
      .replace(/[-_]+/g, ' ')
      .replace(/\b\w/g, letra => letra.toUpperCase());
  }

  private nomeArquivo(nome: string): string {
    const base = nome
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .toLowerCase();
    const data = new Date().toISOString().slice(0, 10);
    return `${base || 'relatorio'}_${data}`;
  }

  private gerarId(): string {
    return typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  private mensagemErro(erro: any, fallback: string): string {
    return erro?.error?.message ?? erro?.message ?? fallback;
  }

  private async mensagemErroBlob(erro: any, fallback: string): Promise<string> {
    try {
      if (erro?.error instanceof Blob) {
        const texto = await erro.error.text();
        const json = JSON.parse(texto);
        return json.message ?? fallback;
      }
    } catch {}
    return this.mensagemErro(erro, fallback);
  }
}
