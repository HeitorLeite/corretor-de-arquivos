import { HttpErrorResponse } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import {
  ChangeDetectorRef,
  Component,
  OnDestroy,
  OnInit,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { finalize, timeout } from 'rxjs';

import {
  FormatoExportacao,
  RelatorioCatalogo,
  RelatorioTemplate,
  SguApiDefinicao,
  SguFiltro,
  SguResultado,
} from '../../shared/models/relatorio.model';
import { RelatorioService } from '../../shared/services/relatorio.service';

type ModoCadastro = 'existente' | 'lista' | 'nova';

@Component({
  selector: 'app-relatorios',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './relatorios.component.html',
  styleUrls: ['./relatorios.component.scss'],
})
export class RelatoriosComponent implements OnInit, OnDestroy {
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
  segundosGeracao = 0;
  mensagemGeracao = '';
  duracaoUltimaConsultaMs: number | null = null;

  exportando: FormatoExportacao | null = null;
  formatoSelecionado: FormatoExportacao = 'xlsx';
  nomeArquivoDownload = '';
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

  modalEditarAberto = false;
  carregandoEdicao = false;
  salvandoEdicao = false;
  relatorioEmEdicao: RelatorioCatalogo | null = null;
  apiOriginalEdicao: SguApiDefinicao | null = null;
  editarApiNome = '';
  editarNomeExibicao = '';
  editarDescricao = '';
  editarConsultaSql = '';
  editarOrdenacao = '';
  filtrosEdicao: SguFiltro[] = [this.filtroVazio()];

  carregandoListaApis = false;
  listaApisCarregada = false;
  apisDisponiveis: SguApiDefinicao[] = [];
  apisDisponiveisFiltradas: SguApiDefinicao[] = [];
  apisSelecionadas: Record<string, boolean> = {};
  pesquisaApis = '';

  templates: RelatorioTemplate[] = [];
  templateAtivo: RelatorioTemplate | null = null;
  relatoriosAbertos: RelatorioCatalogo[] = [];
  modalTemplateAberto = false;
  novoTemplateNome = '';
  novoTemplateDescricao = '';
  relatoriosTemplateSelecionados: Record<string, boolean> = {};

  modalExcluirAberto = false;
  relatorioParaExcluir: RelatorioCatalogo | null = null;
  apagarTambemNoSgu = false;
  excluindo = false;

  private intervaloGeracao?: ReturnType<typeof setInterval>;
  private inicioGeracao = 0;
  private readonly timeoutGeracaoMs = 120_000;
  private readonly timeoutExportacaoMs = 600_000;
  private readonly valoresFiltroPorRelatorio: Record<
    string,
    Record<string, string | number>
  > = {};

  constructor(
    private readonly relatorioService: RelatorioService,
    private readonly cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.relatorios = this.relatorioService.listarCatalogo();
    this.templates = this.normalizarTemplates(
      this.relatorioService.listarTemplates()
    );
    this.persistirTemplates();
    this.aplicarPesquisa();

    if (this.relatorios.length) {
      this.selecionar(this.relatorios[0]);
    }
  }

  ngOnDestroy(): void {
    this.salvarFiltrosSelecionadoAtual();
    this.pararCronometroGeracao();
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

  selecionar(
    relatorio: RelatorioCatalogo,
    manterTemplateAtivo = false
  ): void {
    this.salvarFiltrosSelecionadoAtual();

    if (!manterTemplateAtivo) {
      this.templateAtivo = null;
      this.relatoriosAbertos = [];
    }

    this.selecionado = relatorio;
    const valoresSalvos = this.valoresFiltroPorRelatorio[relatorio.id];

    this.valoresFiltro = valoresSalvos
      ? { ...valoresSalvos }
      : this.criarValoresFiltroVazios(relatorio);

    this.nomeArquivoDownload = this.nomeArquivo(relatorio.nomeExibicao);
    this.limparResultado();
  }

  selecionarRelatorioTemplate(relatorio: RelatorioCatalogo): void {
    this.selecionar(relatorio, true);
  }

  limparResultado(): void {
    this.registros = [];
    this.colunas = [];
    this.pagina = 1;
    this.ultimaPagina = false;
    this.totalRegistros = null;
    this.duracaoUltimaConsultaMs = null;
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
    this.pesquisaApis = '';
    this.apisSelecionadas = {};
    this.erro = '';
  }

  fecharNovo(): void {
    if (
      !this.buscandoApi &&
      !this.salvandoApi &&
      !this.carregandoListaApis
    ) {
      this.modalNovoAberto = false;
    }
  }

  mudarModo(modo: ModoCadastro): void {
    this.modoCadastro = modo;
    this.apiEncontrada = null;
    this.erro = '';

    if (modo === 'lista') {
      this.carregarApisCadastradas();
    }
  }

  buscarApiExistente(): void {
    const nome = this.novoApiNome.trim();

    if (!nome) {
      this.erro = 'Informe o nome da API cadastrada no SGU.';
      return;
    }

    this.buscandoApi = true;
    this.erro = '';
    this.apiEncontrada = null;

    this.relatorioService
      .buscarApi(nome)
      .pipe(
        timeout(this.timeoutGeracaoMs),
        finalize(() => (this.buscandoApi = false))
      )
      .subscribe({
        next: api => {
          this.apiEncontrada = api;
          this.novoNomeExibicao ||= this.tituloAPartirDoNome(api.nome);
        },
        error: err => {
          this.erro = this.mensagemErro(
            err,
            'Não foi possível localizar essa API no SGU.'
          );
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

  carregarApisCadastradas(recarregar = false): void {
    if (this.carregandoListaApis) return;

    if (this.listaApisCarregada && !recarregar) {
      this.aplicarPesquisaApis();
      return;
    }

    this.carregandoListaApis = true;
    this.erro = '';

    this.relatorioService
      .listarApis()
      .pipe(
        timeout(this.timeoutGeracaoMs),
        finalize(() => (this.carregandoListaApis = false))
      )
      .subscribe({
        next: apis => {
          this.apisDisponiveis = this.normalizarListaApis(apis);
          this.listaApisCarregada = true;
          this.apisSelecionadas = {};
          this.aplicarPesquisaApis();
        },
        error: err => {
          this.erro = this.mensagemErro(
            err,
            'Não foi possível listar as APIs cadastradas no SGU.'
          );
        },
      });
  }

  aplicarPesquisaApis(): void {
    const termo = this.pesquisaApis.trim().toLowerCase();

    this.apisDisponiveisFiltradas = !termo
      ? [...this.apisDisponiveis]
      : this.apisDisponiveis.filter(api =>
          `${api.nome} ${api.ordenacao ?? ''}`
            .toLowerCase()
            .includes(termo)
        );
  }

  apiJaAdicionada(nome: string): boolean {
    return this.relatorios.some(relatorio => relatorio.apiNome === nome);
  }

  get quantidadeApisSelecionadas(): number {
    return this.apisDisponiveis.filter(
      api =>
        this.apisSelecionadas[api.nome] &&
        !this.apiJaAdicionada(api.nome)
    ).length;
  }

  adicionarApisSelecionadas(): void {
    const selecionadas = this.apisDisponiveis.filter(
      api =>
        this.apisSelecionadas[api.nome] &&
        !this.apiJaAdicionada(api.nome)
    );

    if (!selecionadas.length) {
      this.erro = 'Selecione pelo menos uma API que ainda não foi adicionada.';
      return;
    }

    const agora = new Date().toISOString();
    const novosRelatorios: RelatorioCatalogo[] = selecionadas.map(api => ({
      id: this.gerarId(),
      nomeExibicao: this.tituloAPartirDoNome(api.nome),
      descricao: '',
      apiNome: api.nome,
      filtros: Array.isArray(api.filtros) ? api.filtros : [],
      criadoEm: agora,
    }));

    this.relatorios = [...this.relatorios, ...novosRelatorios];
    this.persistir();
    this.aplicarPesquisa();
    this.selecionar(novosRelatorios[0]);

    this.modalNovoAberto = false;
    this.apisSelecionadas = {};
    this.sucesso =
      novosRelatorios.length === 1
        ? `O relatório ${novosRelatorios[0].nomeExibicao} foi adicionado.`
        : `${novosRelatorios.length} relatórios foram adicionados ao catálogo.`;
  }

  adicionarFiltro(): void {
    this.novosFiltros.push(this.filtroVazio());
  }

  removerFiltro(indice: number): void {
    if (this.novosFiltros.length > 1) {
      this.novosFiltros.splice(indice, 1);
    }
  }

  erroVariavelFiltro(filtro: SguFiltro): string {
    const nome = filtro.nomeFiltro.trim();
    const conteudo = filtro.conteudoFiltro.trim();

    if (!nome || !conteudo || conteudo === 'and') return '';

    return this.validarCorrespondenciaBind(filtro);
  }

  criarNovaApi(): void {
    const definicao: SguApiDefinicao = {
      nome: this.novoApiNome.trim(),
      consultaSQL: this.novaConsultaSql.trim(),
      ordenacao: this.novaOrdenacao.trim(),
      filtros: this.normalizarFiltros(this.novosFiltros),
    };

    const validacao = this.validarNovaApi(definicao);

    if (validacao) {
      this.erro = validacao;
      return;
    }

    this.salvandoApi = true;
    this.erro = '';

    this.relatorioService
      .criarApi(definicao)
      .pipe(
        timeout(this.timeoutGeracaoMs),
        finalize(() => (this.salvandoApi = false))
      )
      .subscribe({
        next: () => {
          this.adicionarAoCatalogo(definicao);
          this.modalNovoAberto = false;
          this.listaApisCarregada = false;
          this.sucesso = `A API ${definicao.nome} foi cadastrada e adicionada aos relatórios.`;
        },
        error: err => {
          this.erro = this.mensagemErro(
            err,
            'Não foi possível cadastrar a API no SGU.'
          );
        },
      });
  }

  abrirEdicao(
    relatorio: RelatorioCatalogo,
    evento?: Event
  ): void {
    evento?.stopPropagation();

    if (this.carregandoEdicao || this.salvandoEdicao) return;

    this.relatorioEmEdicao = relatorio;
    this.apiOriginalEdicao = null;
    this.editarApiNome = relatorio.apiNome;
    this.editarNomeExibicao = relatorio.nomeExibicao;
    this.editarDescricao = relatorio.descricao;
    this.editarConsultaSql = '';
    this.editarOrdenacao = '';
    this.filtrosEdicao = relatorio.filtros.length
      ? relatorio.filtros.map(filtro => ({ ...filtro }))
      : [this.filtroVazio()];

    this.modalEditarAberto = true;
    this.carregandoEdicao = true;
    this.erro = '';
    this.sucesso = '';

    this.relatorioService
      .buscarApi(relatorio.apiNome)
      .pipe(
        timeout(this.timeoutGeracaoMs),
        finalize(() => (this.carregandoEdicao = false))
      )
      .subscribe({
        next: api => {
          this.apiOriginalEdicao = this.clonarDefinicaoApi(api);
          this.editarApiNome = api.nome;
          this.editarConsultaSql = api.consultaSQL ?? '';
          this.editarOrdenacao = api.ordenacao ?? '';
          this.filtrosEdicao = Array.isArray(api.filtros) && api.filtros.length
            ? api.filtros.map(filtro => ({ ...filtro }))
            : [this.filtroVazio()];
        },
        error: err => {
          this.erro = this.mensagemErro(
            err,
            `Não foi possível carregar a definição da API ${relatorio.apiNome}.`
          );
        },
      });
  }

  fecharEdicao(): void {
    if (this.carregandoEdicao || this.salvandoEdicao) return;

    this.modalEditarAberto = false;
    this.relatorioEmEdicao = null;
    this.apiOriginalEdicao = null;
  }

  adicionarFiltroEdicao(): void {
    this.filtrosEdicao.push(this.filtroVazio());
  }

  removerFiltroEdicao(indice: number): void {
    if (this.filtrosEdicao.length > 1) {
      this.filtrosEdicao.splice(indice, 1);
    }
  }

  salvarEdicaoApi(): void {
    if (
      !this.relatorioEmEdicao ||
      !this.apiOriginalEdicao ||
      this.salvandoEdicao
    ) {
      return;
    }

    const novaDefinicao: SguApiDefinicao = {
      nome: this.editarApiNome.trim(),
      consultaSQL: this.editarConsultaSql.trim(),
      ordenacao: this.editarOrdenacao.trim(),
      filtros: this.normalizarFiltros(this.filtrosEdicao),
    };

    const validacao = this.validarDefinicaoApi(
      novaDefinicao,
      this.editarNomeExibicao
    );

    if (validacao) {
      this.erro = validacao;
      return;
    }

    const nomeAnterior = this.relatorioEmEdicao.apiNome;
    const idRelatorio = this.relatorioEmEdicao.id;
    const definicaoAnterior = this.clonarDefinicaoApi(
      this.apiOriginalEdicao
    );

    this.salvandoEdicao = true;
    this.erro = '';
    this.sucesso = '';

    this.relatorioService
      .substituirApi(
        nomeAnterior,
        definicaoAnterior,
        novaDefinicao
      )
      .pipe(
        timeout(this.timeoutGeracaoMs),
        finalize(() => (this.salvandoEdicao = false))
      )
      .subscribe({
        next: () => {
          const atualizado: RelatorioCatalogo = {
            ...this.relatorioEmEdicao!,
            nomeExibicao: this.editarNomeExibicao.trim(),
            descricao: this.editarDescricao.trim(),
            apiNome: novaDefinicao.nome,
            filtros: novaDefinicao.filtros.map(filtro => ({ ...filtro })),
          };

          this.atualizarRelatorioEditado(atualizado);
          this.listaApisCarregada = false;
          this.modalEditarAberto = false;
          this.relatorioEmEdicao = null;
          this.apiOriginalEdicao = null;

          this.sucesso =
            nomeAnterior === novaDefinicao.nome
              ? `A API ${novaDefinicao.nome} foi substituída com sucesso.`
              : `A API ${nomeAnterior} foi substituída por ${novaDefinicao.nome}.`;

          const selecionadoAtualizado = this.relatorios.find(
            relatorio => relatorio.id === idRelatorio
          );

          if (selecionadoAtualizado) {
            this.selecionar(
              selecionadoAtualizado,
              Boolean(this.templateAtivo)
            );
          }
        },
        error: err => {
          this.erro = this.mensagemErro(
            err,
            'Não foi possível substituir a API.'
          );
        },
      });
  }


  gerar(pagina = 1): void {
    if (!this.selecionado || this.carregando) return;

    const erroFiltros = this.validarFiltrosExecucao();

    if (erroFiltros) {
      this.erro = erroFiltros;
      return;
    }

    this.salvarFiltrosSelecionadoAtual();

    const paginaSolicitada = Math.max(1, pagina);
    const parametros = this.montarParametros(true);
    parametros['page'] = paginaSolicitada;
    parametros['size'] = this.tamanhoPagina;

    this.iniciarGeracao();
    this.cdr.detectChanges();

    // Aguarda um ciclo do navegador para que a barra de carregamento apareça
    // imediatamente, antes da chamada HTTP.
    setTimeout(() => {
      if (!this.carregando || !this.selecionado) return;

      const apiNome = this.selecionado.apiNome;

      this.relatorioService
        .executar(apiNome, parametros)
        .pipe(
          timeout(this.timeoutGeracaoMs),
          finalize(() => this.finalizarGeracao())
        )
        .subscribe({
          next: resposta => {
            try {
              const duracao = performance.now() - this.inicioGeracao;
              this.aplicarResultado(
                resposta,
                paginaSolicitada,
                duracao
              );
            } catch (erroProcessamento) {
              console.error(
                'Erro ao montar a tabela do relatório:',
                erroProcessamento
              );
              this.registros = [];
              this.colunas = [];
              this.erro =
                'A API respondeu, mas ocorreu um erro ao montar a tabela do relatório.';
            }
          },
          error: err => {
            console.error('Erro ao gerar relatório:', err);
            this.erro = this.mensagemErro(
              err,
              'Não foi possível gerar o relatório.'
            );
          },
        });
    }, 0);
  }

  paginaAnterior(): void {
    if (this.pagina > 1 && !this.carregando) {
      this.gerar(this.pagina - 1);
    }
  }

  proximaPagina(): void {
    if (!this.ultimaPagina && !this.carregando) {
      this.gerar(this.pagina + 1);
    }
  }

  selecionarFormato(formato: FormatoExportacao): void {
    if (!this.exportando) {
      this.formatoSelecionado = formato;
    }
  }

  baixar(): void {
    if (!this.selecionado || this.exportando) return;

    const erroFiltros = this.validarFiltrosExecucao();

    if (erroFiltros) {
      this.erro = erroFiltros;
      return;
    }

    this.salvarFiltrosSelecionadoAtual();

    const formato = this.formatoSelecionado;
    const nomeArquivo = this.nomeArquivoEscolhido();

    this.exportando = formato;
    this.erro = '';
    this.sucesso = '';

    this.relatorioService
      .exportar(
        this.selecionado.apiNome,
        formato,
        this.montarParametros(false),
        nomeArquivo
      )
      .pipe(
        timeout(this.timeoutExportacaoMs),
        finalize(() => (this.exportando = null))
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
          setTimeout(() => URL.revokeObjectURL(url), 0);

          this.sucesso = `Download preparado: ${nomeArquivo}.${formato}`;
        },
        error: async err => {
          this.erro = await this.mensagemErroBlob(
            err,
            'Não foi possível exportar o relatório.'
          );
        },
      });
  }

  abrirNovoTemplate(): void {
    if (!this.relatorios.length) {
      this.erro =
        'Adicione pelo menos um relatório antes de criar um template.';
      return;
    }

    this.novoTemplateNome = '';
    this.novoTemplateDescricao = '';
    this.relatoriosTemplateSelecionados = {};
    this.modalTemplateAberto = true;
    this.erro = '';
  }

  fecharNovoTemplate(): void {
    this.modalTemplateAberto = false;
  }

  get quantidadeRelatoriosTemplateSelecionados(): number {
    return this.relatorios.filter(
      relatorio => this.relatoriosTemplateSelecionados[relatorio.id]
    ).length;
  }

  salvarTemplate(): void {
    const nome = this.novoTemplateNome.trim();
    const descricao = this.novoTemplateDescricao.trim();
    const relatorioIds = this.relatorios
      .filter(relatorio =>
        Boolean(this.relatoriosTemplateSelecionados[relatorio.id])
      )
      .map(relatorio => relatorio.id);

    if (!nome) {
      this.erro = 'Informe um nome para o template.';
      return;
    }

    if (!relatorioIds.length) {
      this.erro = 'Selecione pelo menos um relatório para o template.';
      return;
    }

    const template: RelatorioTemplate = {
      id: this.gerarId(),
      nome,
      descricao,
      relatorioIds,
      criadoEm: new Date().toISOString(),
    };

    this.templates = [...this.templates, template];
    this.persistirTemplates();
    this.modalTemplateAberto = false;
    this.usarTemplate(template);
    this.sucesso = `O template “${template.nome}” foi criado.`;
  }

  usarTemplate(
    template: RelatorioTemplate,
    evento?: Event
  ): void {
    evento?.stopPropagation();

    const relatorios = template.relatorioIds
      .map(id => this.relatorios.find(relatorio => relatorio.id === id))
      .filter(
        (relatorio): relatorio is RelatorioCatalogo => Boolean(relatorio)
      );

    if (!relatorios.length) {
      this.erro =
        'Nenhum dos relatórios deste template está disponível no catálogo.';
      return;
    }

    this.templateAtivo = template;
    this.relatoriosAbertos = relatorios;
    this.selecionar(relatorios[0], true);
  }

  fecharTemplateAtivo(): void {
    this.templateAtivo = null;
    this.relatoriosAbertos = [];
  }

  excluirTemplate(
    template: RelatorioTemplate,
    evento?: Event
  ): void {
    evento?.stopPropagation();

    const confirmar =
      typeof window === 'undefined' ||
      window.confirm(`Excluir o template “${template.nome}”?`);

    if (!confirmar) return;

    this.templates = this.templates.filter(item => item.id !== template.id);
    this.persistirTemplates();

    if (this.templateAtivo?.id === template.id) {
      this.fecharTemplateAtivo();
    }

    this.sucesso = `O template “${template.nome}” foi excluído.`;
  }

  resumoTemplate(template: RelatorioTemplate): string {
    const nomes = template.relatorioIds
      .map(id => this.relatorios.find(relatorio => relatorio.id === id))
      .filter(
        (relatorio): relatorio is RelatorioCatalogo => Boolean(relatorio)
      )
      .map(relatorio => relatorio.nomeExibicao);

    if (!nomes.length) return 'Nenhum relatório disponível';
    if (nomes.length <= 2) return nomes.join(' · ');

    return `${nomes.slice(0, 2).join(' · ')} +${nomes.length - 2}`;
  }

  abrirExclusao(
    relatorio: RelatorioCatalogo,
    evento?: Event
  ): void {
    evento?.stopPropagation();
    this.relatorioParaExcluir = relatorio;
    this.apagarTambemNoSgu = false;
    this.modalExcluirAberto = true;
    this.erro = '';
  }

  fecharExclusao(): void {
    if (!this.excluindo) {
      this.modalExcluirAberto = false;
    }
  }

  confirmarExclusao(): void {
    if (!this.relatorioParaExcluir) return;

    if (!this.apagarTambemNoSgu) {
      this.removerDoCatalogo(this.relatorioParaExcluir);
      this.modalExcluirAberto = false;
      return;
    }

    this.excluindo = true;

    this.relatorioService
      .apagarApi(this.relatorioParaExcluir.apiNome)
      .pipe(
        timeout(this.timeoutGeracaoMs),
        finalize(() => (this.excluindo = false))
      )
      .subscribe({
        next: () => {
          this.removerDoCatalogo(this.relatorioParaExcluir!);
          this.modalExcluirAberto = false;
          this.listaApisCarregada = false;
        },
        error: err => {
          this.erro = this.mensagemErro(
            err,
            'Não foi possível apagar a API no SGU.'
          );
        },
      });
  }

  tipoInput(filtro: SguFiltro): string {
    return filtro.tipoDadoFiltro.toUpperCase() === 'NUMBER'
      ? 'number'
      : 'text';
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

  formatarDuracao(ms: number | null): string {
    if (ms === null || !Number.isFinite(ms)) return '';

    if (ms < 1000) return `${Math.round(ms)} ms`;
    return `${(ms / 1000).toFixed(1).replace('.', ',')} s`;
  }

  trackByRelatorioId(
    _indice: number,
    relatorio: RelatorioCatalogo
  ): string {
    return relatorio.id;
  }

  trackByTemplateId(
    _indice: number,
    template: RelatorioTemplate
  ): string {
    return template.id;
  }

  trackByApiNome(
    _indice: number,
    api: SguApiDefinicao
  ): string {
    return api.nome;
  }

  trackByFiltroNome(_indice: number, filtro: SguFiltro): string {
    return filtro.nomeFiltro;
  }

  trackByColuna(_indice: number, coluna: string): string {
    return coluna;
  }

  trackByRegistro(indice: number): number {
    return indice;
  }

  private aplicarResultado(
    resposta: SguResultado,
    pagina: number,
    duracaoMs: number
  ): void {
    const respostaGenerica = resposta as any;

    const conteudo = Array.isArray(respostaGenerica)
      ? respostaGenerica
      : Array.isArray(respostaGenerica?.content)
        ? respostaGenerica.content
        : Array.isArray(respostaGenerica?.data?.content)
          ? respostaGenerica.data.content
          : [];

    this.registros = conteudo.filter(
      (item: unknown) =>
        item !== null &&
        typeof item === 'object' &&
        !Array.isArray(item)
    ) as Record<string, unknown>[];

    const colunas = new Set<string>();
    this.registros.forEach(registro => {
      Object.keys(registro).forEach(coluna => colunas.add(coluna));
    });

    this.colunas = Array.from(colunas);
    this.pagina = pagina;
    this.ultimaPagina =
      respostaGenerica?.last === true ||
      this.registros.length < this.tamanhoPagina;

    const totalBruto =
      respostaGenerica?.totalElements ??
      respostaGenerica?.numberOfElements ??
      null;
    const total = Number(totalBruto);

    this.totalRegistros =
      totalBruto !== null && Number.isFinite(total) ? total : null;
    this.duracaoUltimaConsultaMs = duracaoMs;

    this.sucesso = this.registros.length
      ? `${this.registros.length} registro(s) carregado(s) em ${this.formatarDuracao(
          duracaoMs
        )}.`
      : `Nenhum registro encontrado. Consulta concluída em ${this.formatarDuracao(
          duracaoMs
        )}.`;
  }

  private validarFiltrosExecucao(): string {
    if (!this.selecionado) return 'Selecione um relatório.';

    const obrigatorioVazio = this.selecionado.filtros.find(
      filtro =>
        filtro.obrigatorioFiltro === 'S' &&
        String(this.valoresFiltro[filtro.nomeFiltro] ?? '').trim() === ''
    );

    if (obrigatorioVazio) {
      return `Preencha o filtro obrigatório “${this.rotuloFiltro(
        obrigatorioVazio
      )}”.`;
    }

    const numeroInvalido = this.selecionado.filtros.find(filtro => {
      const valor = String(
        this.valoresFiltro[filtro.nomeFiltro] ?? ''
      ).trim();

      return (
        valor !== '' &&
        filtro.tipoDadoFiltro.toUpperCase() === 'NUMBER' &&
        !Number.isFinite(Number(valor))
      );
    });

    if (numeroInvalido) {
      return `O filtro “${this.rotuloFiltro(
        numeroInvalido
      )}” deve conter um número válido.`;
    }

    return '';
  }

  private montarParametros(
    omitirVazios: boolean
  ): Record<string, unknown> {
    const parametros: Record<string, unknown> = {};

    if (!this.selecionado) return parametros;

    this.selecionado.filtros.forEach(filtro => {
      const valor = this.valoresFiltro[filtro.nomeFiltro];
      const texto = String(valor ?? '').trim();

      if (omitirVazios && texto === '') return;
      if (texto === '') return;

      parametros[filtro.nomeFiltro] =
        filtro.tipoDadoFiltro.toUpperCase() === 'NUMBER'
          ? Number(texto)
          : texto;
    });

    return parametros;
  }

  private normalizarFiltros(filtros: SguFiltro[]): SguFiltro[] {
    return filtros.map(filtro => ({
      ...filtro,
      nomeFiltro: filtro.nomeFiltro.trim(),
      conteudoFiltro: filtro.conteudoFiltro.trim(),
      tipoDadoFiltro: filtro.tipoDadoFiltro.trim().toUpperCase(),
      mascaraFiltro: filtro.mascaraFiltro.trim(),
      obrigatorioFiltro:
        filtro.obrigatorioFiltro === 'S' ? 'S' : 'N',
    }));
  }

  private clonarDefinicaoApi(
    api: SguApiDefinicao
  ): SguApiDefinicao {
    return {
      nome: api.nome,
      consultaSQL: api.consultaSQL ?? '',
      ordenacao: api.ordenacao ?? '',
      filtros: Array.isArray(api.filtros)
        ? api.filtros.map(filtro => ({ ...filtro }))
        : [],
    };
  }

  private atualizarRelatorioEditado(
    atualizado: RelatorioCatalogo
  ): void {
    this.relatorios = this.relatorios.map(relatorio =>
      relatorio.id === atualizado.id ? atualizado : relatorio
    );

    /*
     * Os templates armazenam o ID do relatório, não o nome da API.
     * Como o ID é preservado na edição, todos os templates continuam
     * apontando automaticamente para a nova definição.
     */
    this.relatoriosAbertos = this.relatoriosAbertos.map(relatorio =>
      relatorio.id === atualizado.id ? atualizado : relatorio
    );

    delete this.valoresFiltroPorRelatorio[atualizado.id];

    this.persistir();
    this.persistirTemplates();
    this.aplicarPesquisa();

    if (this.selecionado?.id === atualizado.id) {
      this.selecionado = atualizado;
    }
  }

  private adicionarAoCatalogo(api: SguApiDefinicao): void {
    const existente = this.relatorios.find(
      relatorio => relatorio.apiNome === api.nome
    );

    const relatorio: RelatorioCatalogo = {
      id: existente?.id ?? this.gerarId(),
      nomeExibicao:
        this.novoNomeExibicao.trim() ||
        this.tituloAPartirDoNome(api.nome),
      descricao: this.novaDescricao.trim(),
      apiNome: api.nome,
      filtros: Array.isArray(api.filtros) ? api.filtros : [],
      criadoEm: existente?.criadoEm ?? new Date().toISOString(),
    };

    this.relatorios = existente
      ? this.relatorios.map(item =>
          item.id === existente.id ? relatorio : item
        )
      : [...this.relatorios, relatorio];

    this.persistir();
    this.aplicarPesquisa();
    this.selecionar(relatorio);
  }

  private removerDoCatalogo(relatorio: RelatorioCatalogo): void {
    this.relatorios = this.relatorios.filter(
      item => item.id !== relatorio.id
    );

    delete this.valoresFiltroPorRelatorio[relatorio.id];

    this.templates = this.templates
      .map(template => ({
        ...template,
        relatorioIds: template.relatorioIds.filter(
          id => id !== relatorio.id
        ),
      }))
      .filter(template => template.relatorioIds.length > 0);

    this.persistir();
    this.persistirTemplates();
    this.aplicarPesquisa();

    if (this.templateAtivo) {
      const templateAtualizado = this.templates.find(
        template => template.id === this.templateAtivo?.id
      );

      if (templateAtualizado) {
        this.templateAtivo = templateAtualizado;
        this.relatoriosAbertos = templateAtualizado.relatorioIds
          .map(id => this.relatorios.find(item => item.id === id))
          .filter(
            (item): item is RelatorioCatalogo => Boolean(item)
          );
      } else {
        this.fecharTemplateAtivo();
      }
    }

    if (this.selecionado?.id === relatorio.id) {
      this.selecionado = null;
      this.limparResultado();

      const proximo = this.relatoriosAbertos[0] ?? this.relatorios[0];
      if (proximo) {
        this.selecionar(proximo, Boolean(this.templateAtivo));
      }
    }
  }

  private persistir(): void {
    this.relatorioService.salvarCatalogo(this.relatorios);
  }

  private persistirTemplates(): void {
    this.relatorioService.salvarTemplates(this.templates);
  }

  private validarNovaApi(api: SguApiDefinicao): string {
    return this.validarDefinicaoApi(api, this.novoNomeExibicao);
  }

  private validarDefinicaoApi(
    api: SguApiDefinicao,
    nomeExibicao: string
  ): string {
    if (!api.nome) return 'Informe o nome da API.';
    if (!api.consultaSQL) return 'Informe a consulta SQL.';

    if (!nomeExibicao.trim()) {
      return 'Informe o nome de exibição do relatório.';
    }

    if (!api.filtros.length) {
      return 'Adicione pelo menos um filtro.';
    }

    if (!api.consultaSQL.includes('/*FILTROS*/')) {
      return 'A consulta SQL deve conter o marcador /*FILTROS*/.';
    }

    for (const [indice, filtro] of api.filtros.entries()) {
      if (
        !filtro.nomeFiltro ||
        !/^[a-z0-9_]+$/.test(filtro.nomeFiltro)
      ) {
        return `Filtro ${indice + 1}: o nome deve estar em minúsculo, sem espaços e usar apenas letras, números ou underscore.`;
      }

      if (!filtro.conteudoFiltro.startsWith('and ')) {
        return `O conteúdo do filtro “${filtro.nomeFiltro}” deve começar com “and ” em minúsculo.`;
      }

      const erroBind = this.validarCorrespondenciaBind(filtro);
      if (erroBind) return erroBind;

      if (
        !/^(NUMBER|DATE|VARCHAR\(\d+\))$/i.test(
          filtro.tipoDadoFiltro
        )
      ) {
        return `Tipo inválido no filtro “${filtro.nomeFiltro}”. Use NUMBER, DATE ou VARCHAR(tamanho).`;
      }
    }

    return '';
  }

  private validarCorrespondenciaBind(filtro: SguFiltro): string {
    const nome = filtro.nomeFiltro.trim();
    const variaveis = Array.from(
      filtro.conteudoFiltro.matchAll(/:([A-Za-z_][A-Za-z0-9_]*)/g),
      resultado => resultado[1]
    );
    const variaveisUnicas = Array.from(new Set(variaveis));

    if (!variaveisUnicas.length) {
      return `O filtro “${nome}” não possui uma variável de bind. Use :${nome} no conteúdo SQL.`;
    }

    const divergentes = variaveisUnicas.filter(
      variavel => variavel !== nome
    );

    if (divergentes.length || !variaveisUnicas.includes(nome)) {
      return `O nome do filtro “${nome}” deve ser exatamente igual à variável do conteúdo SQL. Variável encontrada: ${variaveisUnicas
        .map(variavel => `:${variavel}`)
        .join(', ')}. Corrija para :${nome}.`;
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

  private normalizarListaApis(
    apis: SguApiDefinicao[]
  ): SguApiDefinicao[] {
    const unicas = new Map<string, SguApiDefinicao>();

    for (const api of apis ?? []) {
      const nome = String(api?.nome ?? '').trim();
      if (!nome) continue;

      unicas.set(nome, {
        ...api,
        nome,
        consultaSQL: api.consultaSQL ?? '',
        ordenacao: api.ordenacao ?? '',
        filtros: Array.isArray(api.filtros) ? api.filtros : [],
      });
    }

    return Array.from(unicas.values()).sort((a, b) =>
      a.nome.localeCompare(b.nome, 'pt-BR', {
        numeric: true,
        sensitivity: 'base',
      })
    );
  }

  private normalizarTemplates(
    templates: RelatorioTemplate[]
  ): RelatorioTemplate[] {
    const idsRelatorios = new Set(this.relatorios.map(item => item.id));

    return (templates ?? [])
      .map(template => ({
        ...template,
        relatorioIds: Array.from(
          new Set(
            (template.relatorioIds ?? []).filter(id =>
              idsRelatorios.has(id)
            )
          )
        ),
      }))
      .filter(
        template =>
          Boolean(template.id) &&
          Boolean(template.nome?.trim()) &&
          template.relatorioIds.length > 0
      );
  }

  private criarValoresFiltroVazios(
    relatorio: RelatorioCatalogo
  ): Record<string, string | number> {
    const valores: Record<string, string | number> = {};

    relatorio.filtros.forEach(filtro => {
      valores[filtro.nomeFiltro] = '';
    });

    return valores;
  }

  private salvarFiltrosSelecionadoAtual(): void {
    if (!this.selecionado) return;
    this.valoresFiltroPorRelatorio[this.selecionado.id] = {
      ...this.valoresFiltro,
    };
  }

  private iniciarGeracao(): void {
    this.pararCronometroGeracao();
    this.carregando = true;
    this.segundosGeracao = 0;
    this.mensagemGeracao = 'Enviando a consulta para o SGU…';
    this.inicioGeracao = performance.now();
    this.erro = '';
    this.sucesso = '';

    this.intervaloGeracao = setInterval(() => {
      this.segundosGeracao += 1;

      if (this.segundosGeracao >= 20) {
        this.mensagemGeracao =
          'A consulta continua em execução. Aguarde a resposta do SGU…';
      } else if (this.segundosGeracao >= 8) {
        this.mensagemGeracao =
          'Processando os dados e preparando a tabela…';
      } else if (this.segundosGeracao >= 2) {
        this.mensagemGeracao = 'Consultando os dados no SGU…';
      }

      this.cdr.detectChanges();
    }, 1000);
  }

  private finalizarGeracao(): void {
    this.pararCronometroGeracao();
    this.carregando = false;
    this.mensagemGeracao = '';
    this.cdr.detectChanges();
  }

  private pararCronometroGeracao(): void {
    if (this.intervaloGeracao) {
      clearInterval(this.intervaloGeracao);
      this.intervaloGeracao = undefined;
    }
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

  private nomeArquivoEscolhido(): string {
    const padrao = this.nomeArquivo(
      this.selecionado?.nomeExibicao ?? 'relatorio'
    );

    const semExtensao = this.nomeArquivoDownload
      .trim()
      .replace(/\.(csv|txt|xlsx)$/i, '');

    const limpo = semExtensao
      .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_')
      .replace(/[. ]+$/g, '')
      .trim();

    const resultado = limpo || padrao;
    this.nomeArquivoDownload = resultado;

    return resultado;
  }

  private gerarId(): string {
    return typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  private mensagemErro(erro: any, fallback: string): string {
    if (erro?.name === 'TimeoutError') {
      return 'A operação ultrapassou o tempo limite e foi encerrada. Verifique os filtros e tente novamente.';
    }

    const httpErro = erro as HttpErrorResponse;
    const status = Number(
      httpErro?.status ?? httpErro?.error?.status ?? 0
    );
    const detalhe = this.extrairDetalheErro(erro) || fallback;

    if (status === 0) {
      return `Não foi possível conectar ao backend. ${detalhe}`;
    }

    if (status > 0) {
      return `Erro ${status}: ${detalhe}`;
    }

    return detalhe;
  }

  private extrairDetalheErro(erro: any): string {
    const corpo = erro?.error;

    if (typeof corpo === 'string') {
      try {
        const json = JSON.parse(corpo);
        return json?.message ?? json?.error ?? corpo;
      } catch {
        return corpo;
      }
    }

    return (
      corpo?.message ??
      corpo?.error ??
      erro?.message ??
      ''
    );
  }

  private async mensagemErroBlob(
    erro: any,
    fallback: string
  ): Promise<string> {
    try {
      if (erro?.error instanceof Blob) {
        const texto = await erro.error.text();

        try {
          const json = JSON.parse(texto);
          const mensagem = json?.message ?? json?.error ?? texto;
          const status = Number(erro?.status ?? json?.status ?? 0);
          return status > 0
            ? `Erro ${status}: ${mensagem}`
            : mensagem || fallback;
        } catch {
          const status = Number(erro?.status ?? 0);
          return status > 0
            ? `Erro ${status}: ${texto || fallback}`
            : texto || fallback;
        }
      }
    } catch {
      return fallback;
    }

    return this.mensagemErro(erro, fallback);
  }
}
