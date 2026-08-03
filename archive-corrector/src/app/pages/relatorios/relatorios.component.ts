import { HttpErrorResponse } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import {
  ChangeDetectorRef,
  Component,
  OnDestroy,
  OnInit,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { finalize, firstValueFrom, timeout } from 'rxjs';

import {
  FormatoExportacao,
  RelatorioCatalogo,
  RelatorioTemplate,
  SguApiDefinicao,
  SguFiltro,
  SguResultado,
} from '../../shared/models/relatorio.model';
import { RelatorioService } from '../../shared/services/relatorio.service';
import { RelatoriosAutomaticosComponent } from './relatorios-automaticos/relatorios-automaticos.component';
import { RelatoriosInicioComponent } from './relatorios-inicio/relatorios-inicio.component';

type ModoCadastro = 'existente' | 'lista' | 'nova' | 'arquivos';
type ModoPaginaRelatorios = 'selecao' | 'manual' | 'automatico';

type StatusArquivoSql = 'pendente' | 'criando' | 'sucesso' | 'erro';

interface FiltroFixoSqlDetectado {
  id: string;
  assinatura: string;
  predicadoOriginal: string;
  marcador: string;
  filtro: SguFiltro;
}

interface ArquivoSqlImportado {
  id: string;
  arquivoNome: string;
  tamanhoBytes: number;
  apiNome: string;
  nomeExibicao: string;
  descricao: string;
  consultaSQL: string;
  ordenacao: string;
  filtros: SguFiltro[];
  filtrosFixosDetectados: FiltroFixoSqlDetectado[];
  filtrosFixosIgnorados: string[];
  ajustesAplicados: string[];
  detalhesAbertos: boolean;
  status: StatusArquivoSql;
  erro: string;
}

interface TokenSqlNivelZero {
  palavra: string;
  inicio: number;
  fim: number;
}

interface EstruturaConsultaPrincipal {
  select: TokenSqlNivelZero;
  where?: TokenSqlNivelZero;
  limiteCondicoes: number;
  fimRamo: number;
  operadorConjunto?: TokenSqlNivelZero;
}

@Component({
  selector: 'app-relatorios',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RelatoriosInicioComponent,
    RelatoriosAutomaticosComponent,
  ],
  templateUrl: './relatorios.component.html',
  styleUrls: ['./relatorios.component.scss'],
})
export class RelatoriosComponent implements OnInit, OnDestroy {
  modoPagina: ModoPaginaRelatorios = 'selecao';
  quantidadeGruposAutomaticos = 0;

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

  arquivosSqlImportados: ArquivoSqlImportado[] = [];
  carregandoArquivosSql = false;
  criandoApisEmLote = false;
  arrastandoArquivosSql = false;
  progressoCriacaoLote = 0;
  totalCriacaoLote = 0;

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
  private readonly nomeFiltroTecnicoSemFiltros = 'filtrotecnico';
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
    this.atualizarQuantidadeGruposAutomaticos();
    this.templates = this.normalizarTemplates(
      this.relatorioService.listarTemplates()
    );
    this.persistirTemplates();
    this.aplicarPesquisa();

    if (this.relatorios.length) {
      this.selecionar(this.relatorios[0]);
    }
  }

  selecionarModoPagina(modo: Exclude<ModoPaginaRelatorios, 'selecao'>): void {
    this.modoPagina = modo;
    this.erro = '';
    this.sucesso = '';
  }

  voltarSelecaoModo(): void {
    this.modoPagina = 'selecao';
    this.atualizarQuantidadeGruposAutomaticos();
    this.erro = '';
    this.sucesso = '';
  }

  private atualizarQuantidadeGruposAutomaticos(): void {
    this.quantidadeGruposAutomaticos =
      this.relatorioService.listarGruposAutomaticos().length;
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
    this.arquivosSqlImportados = [];
    this.carregandoArquivosSql = false;
    this.criandoApisEmLote = false;
    this.arrastandoArquivosSql = false;
    this.progressoCriacaoLote = 0;
    this.totalCriacaoLote = 0;
    this.pesquisaApis = '';
    this.apisSelecionadas = {};
    this.erro = '';
  }

  fecharNovo(): void {
    if (
      !this.buscandoApi &&
      !this.salvandoApi &&
      !this.carregandoListaApis &&
      !this.carregandoArquivosSql &&
      !this.criandoApisEmLote
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
          this.apiEncontrada = this.removerFiltroTecnicoDaDefinicao(api);
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
    const definicaoNegocio: SguApiDefinicao = {
      nome: this.novoApiNome.trim(),
      consultaSQL: this.novaConsultaSql.trim(),
      ordenacao: this.novaOrdenacao.trim(),
      filtros: this.normalizarFiltros(this.novosFiltros),
    };

    const validacao = this.validarNovaApi(definicaoNegocio);

    if (validacao) {
      this.erro = validacao;
      return;
    }

    const definicaoSgu = this.prepararDefinicaoParaSgu(definicaoNegocio);

    this.salvandoApi = true;
    this.erro = '';

    this.relatorioService
      .criarApi(definicaoSgu)
      .pipe(
        timeout(this.timeoutGeracaoMs),
        finalize(() => (this.salvandoApi = false))
      )
      .subscribe({
        next: () => {
          this.adicionarAoCatalogo(definicaoNegocio);
          this.modalNovoAberto = false;
          this.listaApisCarregada = false;
          this.sucesso = `A API ${definicaoNegocio.nome} foi cadastrada e adicionada aos relatórios.`;
        },
        error: err => {
          this.erro = this.mensagemErro(
            err,
            'Não foi possível cadastrar a API no SGU.'
          );
        },
      });
  }


  async selecionarArquivosSql(evento: Event): Promise<void> {
    const input = evento.target as HTMLInputElement;
    const arquivos = Array.from(input.files ?? []);
    input.value = '';
    await this.processarArquivosSql(arquivos);
  }

  aoArrastarArquivosSql(evento: DragEvent): void {
    evento.preventDefault();
    evento.stopPropagation();

    if (!this.criandoApisEmLote) {
      this.arrastandoArquivosSql = true;
    }
  }

  aoSairDaAreaArquivosSql(evento: DragEvent): void {
    evento.preventDefault();
    evento.stopPropagation();
    this.arrastandoArquivosSql = false;
  }

  async soltarArquivosSql(evento: DragEvent): Promise<void> {
    evento.preventDefault();
    evento.stopPropagation();
    this.arrastandoArquivosSql = false;

    if (this.criandoApisEmLote) return;

    const arquivos = Array.from(evento.dataTransfer?.files ?? []);
    await this.processarArquivosSql(arquivos);
  }

  removerArquivoSql(id: string): void {
    if (this.criandoApisEmLote) return;

    this.arquivosSqlImportados = this.arquivosSqlImportados.filter(
      arquivo => arquivo.id !== id
    );
    this.erro = '';
  }

  alternarDetalhesArquivoSql(arquivo: ArquivoSqlImportado): void {
    arquivo.detalhesAbertos = !arquivo.detalhesAbertos;
  }

  adicionarFiltroArquivoSql(arquivo: ArquivoSqlImportado): void {
    arquivo.filtros.push(this.filtroVazio());
    this.ajustarArquivoSql(arquivo);
  }

  removerFiltroArquivoSql(
    arquivo: ArquivoSqlImportado,
    indice: number
  ): void {
    const filtroRemovido = arquivo.filtros[indice];
    const deteccaoFixa = arquivo.filtrosFixosDetectados.find(
      item => item.filtro === filtroRemovido
    );

    if (deteccaoFixa) {
      const trechoAutomatico = `1 = 1 ${deteccaoFixa.marcador}`;

      arquivo.consultaSQL = arquivo.consultaSQL.includes(trechoAutomatico)
        ? arquivo.consultaSQL.replace(
            trechoAutomatico,
            deteccaoFixa.predicadoOriginal
          )
        : arquivo.consultaSQL.replace(
            deteccaoFixa.marcador,
            deteccaoFixa.predicadoOriginal
          );

      arquivo.filtrosFixosIgnorados = Array.from(
        new Set([
          ...arquivo.filtrosFixosIgnorados,
          deteccaoFixa.assinatura,
        ])
      );
      arquivo.filtrosFixosDetectados =
        arquivo.filtrosFixosDetectados.filter(
          item => item.id !== deteccaoFixa.id
        );
      arquivo.ajustesAplicados = [
        ...arquivo.ajustesAplicados,
        `O filtro ${filtroRemovido.nomeFiltro} foi removido; a condição original permaneceu fixa no SQL.`,
      ];
    }

    arquivo.filtros.splice(indice, 1);
    this.ajustarArquivoSql(arquivo);
  }

  descricaoFiltroAutomatico(
    arquivo: ArquivoSqlImportado,
    filtro: SguFiltro
  ): string {
    const deteccao = arquivo.filtrosFixosDetectados.find(
      item => item.filtro === filtro
    );

    return deteccao
      ? `Detectado de: ${deteccao.predicadoOriginal}. Se remover, esse valor continuará fixo no SQL.`
      : '';
  }

  ajustarArquivoSql(arquivo: ArquivoSqlImportado): void {
    if (this.criandoApisEmLote) return;

    const parametrosConvertidos = this.converterParametrosFixosSql(
      arquivo.consultaSQL
    );
    const bindsNormalizados = this.normalizarVariaveisBindSql(
      parametrosConvertidos.sql
    );

    const nomesExistentes = new Set(
      arquivo.filtros.map(filtro => filtro.nomeFiltro.trim().toLowerCase())
    );

    for (const nome of bindsNormalizados.variaveis) {
      if (!nomesExistentes.has(nome)) {
        arquivo.filtros.push(this.filtroDetectadoDoSql(nome));
        nomesExistentes.add(nome);
      }
    }

    const filtrosSimples = this.detectarFiltrosFixosSimples(
      bindsNormalizados.sql,
      nomesExistentes,
      new Set(arquivo.filtrosFixosIgnorados)
    );

    for (const deteccao of filtrosSimples.deteccoes) {
      arquivo.filtros.push(deteccao.filtro);
      arquivo.filtrosFixosDetectados.push(deteccao);
      nomesExistentes.add(
        deteccao.filtro.nomeFiltro.trim().toLowerCase()
      );
    }

    /*
     * O SGU exige que o elemento filtros seja enviado mesmo quando a
     * consulta não possui filtros de negócio. Por isso sempre deixamos o
     * marcador preparado; no payload será incluído um filtro técnico
     * opcional e invisível para o usuário quando necessário.
     */
    const resultado = this.ajustarEstruturaSqlImportado(
      filtrosSimples.sql,
      true
    );

    arquivo.consultaSQL = resultado.sql;
    arquivo.ajustesAplicados = Array.from(
      new Set([
        ...arquivo.ajustesAplicados,
        ...parametrosConvertidos.ajustes,
        ...filtrosSimples.ajustes,
        ...resultado.ajustes,
      ])
    );
    arquivo.status = 'pendente';
    arquivo.erro = '';
  }

  erroArquivoSql(arquivo: ArquivoSqlImportado): string {
    const nomeApi = arquivo.apiNome.trim();

    if (nomeApi && !/^0090-[a-z0-9-]+$/.test(nomeApi)) {
      return 'O nome da API deve começar com 0090- e usar apenas letras minúsculas, números e hífen.';
    }

    const repetidoNoLote = this.arquivosSqlImportados.filter(
      item =>
        item.apiNome.trim().toLowerCase() ===
        arquivo.apiNome.trim().toLowerCase()
    ).length > 1;

    if (repetidoNoLote && arquivo.apiNome.trim()) {
      return `O nome da API “${arquivo.apiNome.trim()}” está repetido no lote.`;
    }

    if (
      this.relatorios.some(
        relatorio =>
          relatorio.apiNome.toLowerCase() ===
          arquivo.apiNome.trim().toLowerCase()
      )
    ) {
      return `A API “${arquivo.apiNome.trim()}” já está no catálogo. Use a opção Editar API.`;
    }

    return this.validarDefinicaoApi(
      this.definicaoDoArquivoSql(arquivo),
      arquivo.nomeExibicao
    );
  }

  get quantidadeArquivosProntos(): number {
    return this.arquivosSqlImportados.filter(
      arquivo => !this.erroArquivoSql(arquivo)
    ).length;
  }

  async criarApisDosArquivos(): Promise<void> {
    if (
      !this.arquivosSqlImportados.length ||
      this.criandoApisEmLote
    ) {
      return;
    }

    this.erro = '';
    this.sucesso = '';

    let possuiErroLocal = false;

    for (const arquivo of this.arquivosSqlImportados) {
      this.ajustarArquivoSql(arquivo);
      arquivo.status = 'pendente';
      arquivo.erro = this.erroArquivoSql(arquivo);

      if (arquivo.erro) {
        arquivo.status = 'erro';
        arquivo.detalhesAbertos = true;
        possuiErroLocal = true;
      }
    }

    if (possuiErroLocal) {
      this.erro =
        'Corrija os arquivos destacados antes de iniciar o cadastro em lote.';
      return;
    }

    this.criandoApisEmLote = true;
    this.progressoCriacaoLote = 0;
    this.totalCriacaoLote = this.arquivosSqlImportados.length;

    const criadas: Array<{
      arquivo: ArquivoSqlImportado;
      definicao: SguApiDefinicao;
    }> = [];

    try {
      const apisExistentes = await firstValueFrom(
        this.relatorioService
          .listarApis()
          .pipe(timeout(this.timeoutGeracaoMs))
      );

      const nomesExistentes = new Set(
        (apisExistentes ?? []).map(api => api.nome.trim().toLowerCase())
      );

      for (const arquivo of this.arquivosSqlImportados) {
        if (nomesExistentes.has(arquivo.apiNome.trim().toLowerCase())) {
          arquivo.status = 'erro';
          arquivo.erro =
            `A API “${arquivo.apiNome.trim()}” já existe no SGU. Use a funcionalidade Editar API para substituí-la.`;
          arquivo.detalhesAbertos = true;
        }
      }

      const pendentes = this.arquivosSqlImportados.filter(
        arquivo => arquivo.status !== 'erro'
      );

      this.totalCriacaoLote = pendentes.length;

      for (const arquivo of pendentes) {
        arquivo.status = 'criando';
        arquivo.erro = '';
        this.cdr.detectChanges();

        const definicao = this.definicaoDoArquivoSql(arquivo);

        try {
          await firstValueFrom(
            this.relatorioService
              .criarApi(definicao)
              .pipe(timeout(this.timeoutGeracaoMs))
          );

          arquivo.status = 'sucesso';
          criadas.push({ arquivo, definicao });
          nomesExistentes.add(definicao.nome.toLowerCase());
        } catch (erroCriacao) {
          arquivo.status = 'erro';
          arquivo.erro = this.mensagemErro(
            erroCriacao,
            `Não foi possível cadastrar a API ${definicao.nome}.`
          );
          arquivo.detalhesAbertos = true;
        } finally {
          this.progressoCriacaoLote += 1;
          this.cdr.detectChanges();
        }
      }
    } catch (erroLista) {
      this.erro = this.mensagemErro(
        erroLista,
        'Não foi possível verificar as APIs já cadastradas no SGU.'
      );
      return;
    } finally {
      this.criandoApisEmLote = false;
      this.cdr.detectChanges();
    }

    if (criadas.length) {
      const agora = new Date().toISOString();
      const novosRelatorios: RelatorioCatalogo[] = criadas.map(
        ({ arquivo, definicao }) => ({
          id: this.gerarId(),
          nomeExibicao: arquivo.nomeExibicao.trim(),
          descricao: arquivo.descricao.trim(),
          apiNome: definicao.nome,
          filtros: this.filtrosDeNegocio(definicao.filtros),
          criadoEm: agora,
        })
      );

      this.relatorios = [...this.relatorios, ...novosRelatorios];
      this.persistir();
      this.aplicarPesquisa();
      this.listaApisCarregada = false;
      this.selecionar(novosRelatorios[0]);
    }

    const falhas = this.arquivosSqlImportados.filter(
      arquivo => arquivo.status === 'erro'
    );

    if (!falhas.length) {
      const quantidade = criadas.length;
      this.modalNovoAberto = false;
      this.arquivosSqlImportados = [];
      this.sucesso =
        quantidade === 1
          ? 'A API do arquivo SQL foi cadastrada e adicionada aos relatórios.'
          : `${quantidade} APIs foram cadastradas e adicionadas aos relatórios.`;
      return;
    }

    this.arquivosSqlImportados = falhas;
    this.erro =
      `${falhas.length} arquivo(s) não foram cadastrado(s). ` +
      'Corrija os erros exibidos e tente novamente.';

    if (criadas.length) {
      this.sucesso = `${criadas.length} API(s) foram cadastradas com sucesso.`;
    }
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
    this.filtrosEdicao = relatorio.filtros.map(filtro => ({ ...filtro }));

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
          this.filtrosEdicao = this.filtrosDeNegocio(api.filtros);
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
    this.filtrosEdicao.splice(indice, 1);
  }

  salvarEdicaoApi(): void {
    if (
      !this.relatorioEmEdicao ||
      !this.apiOriginalEdicao ||
      this.salvandoEdicao
    ) {
      return;
    }

    const novaDefinicaoNegocio: SguApiDefinicao = {
      nome: this.editarApiNome.trim(),
      consultaSQL: this.editarConsultaSql.trim(),
      ordenacao: this.editarOrdenacao.trim(),
      filtros: this.normalizarFiltros(this.filtrosEdicao),
    };

    const validacao = this.validarDefinicaoApi(
      novaDefinicaoNegocio,
      this.editarNomeExibicao
    );

    if (validacao) {
      this.erro = validacao;
      return;
    }

    const novaDefinicaoSgu = this.prepararDefinicaoParaSgu(
      novaDefinicaoNegocio
    );
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
        novaDefinicaoSgu
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
            apiNome: novaDefinicaoNegocio.nome,
            filtros: this.filtrosDeNegocio(
              novaDefinicaoNegocio.filtros
            ),
          };

          this.atualizarRelatorioEditado(atualizado);
          this.listaApisCarregada = false;
          this.modalEditarAberto = false;
          this.relatorioEmEdicao = null;
          this.apiOriginalEdicao = null;

          this.sucesso =
            nomeAnterior === novaDefinicaoNegocio.nome
              ? `A API ${novaDefinicaoNegocio.nome} foi substituída com sucesso.`
              : `A API ${nomeAnterior} foi substituída por ${novaDefinicaoNegocio.nome}.`;

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

  trackByArquivoSqlId(
    _indice: number,
    arquivo: ArquivoSqlImportado
  ): string {
    return arquivo.id;
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

  private async processarArquivosSql(
    arquivos: File[]
  ): Promise<void> {
    if (!arquivos.length || this.criandoApisEmLote) return;

    const extensoesAceitas = new Set(['sql', 'txt']);
    const validos = arquivos.filter(arquivo => {
      const extensao = arquivo.name.split('.').pop()?.toLowerCase() ?? '';
      return extensoesAceitas.has(extensao);
    });

    const ignorados = arquivos.length - validos.length;

    if (!validos.length) {
      this.erro = 'Selecione arquivos com extensão .sql ou .txt.';
      return;
    }

    this.carregandoArquivosSql = true;
    this.erro = '';

    try {
      const importados = await Promise.all(
        validos.map(async arquivo => {
          const textoOriginal = await arquivo.text();
          const textoSemBom = textoOriginal.replace(/^\uFEFF/, '').trim();
          const consultaSemPontoVirgula = textoSemBom.replace(/;\s*$/, '');
          const nomeBase = arquivo.name.replace(/\.(sql|txt)$/i, '');

          const importado: ArquivoSqlImportado = {
            id: this.gerarId(),
            arquivoNome: arquivo.name,
            tamanhoBytes: arquivo.size,
            apiNome: this.nomeApiAPartirDoArquivo(nomeBase),
            nomeExibicao: this.tituloAPartirDoNome(nomeBase),
            descricao: `Importado do arquivo ${arquivo.name}`,
            consultaSQL: consultaSemPontoVirgula,
            ordenacao: '',
            filtros: [],
            filtrosFixosDetectados: [],
            filtrosFixosIgnorados: [],
            ajustesAplicados: [],
            detalhesAbertos: false,
            status: 'pendente',
            erro: textoSemBom ? '' : 'O arquivo SQL está vazio.',
          };

          if (textoSemBom) {
            this.ajustarArquivoSql(importado);
          }

          return importado;
        })
      );

      this.arquivosSqlImportados = [
        ...this.arquivosSqlImportados,
        ...importados,
      ];

      if (ignorados) {
        this.erro = `${ignorados} arquivo(s) foram ignorados porque não possuem extensão .sql ou .txt.`;
      }
    } catch (erroLeitura) {
      this.erro =
        erroLeitura instanceof Error
          ? `Não foi possível ler os arquivos: ${erroLeitura.message}`
          : 'Não foi possível ler os arquivos selecionados.';
    } finally {
      this.carregandoArquivosSql = false;
      this.cdr.detectChanges();
    }
  }

  private definicaoDoArquivoSql(
    arquivo: ArquivoSqlImportado
  ): SguApiDefinicao {
    return this.prepararDefinicaoParaSgu({
      nome: arquivo.apiNome.trim(),
      consultaSQL: arquivo.consultaSQL,
      ordenacao: arquivo.ordenacao.trim(),
      filtros: this.normalizarFiltros(arquivo.filtros),
    });
  }

  private nomeApiAPartirDoArquivo(nomeArquivo: string): string {
    const base = nomeArquivo
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    if (/^\d{4}-/.test(base)) return base;
    return `0090-${base || 'nova-api'}`;
  }

  private filtroDetectadoDoSql(nome: string): SguFiltro {
    const tipo = this.inferirTipoFiltroSql(nome);

    if (nome === 'competencia' || nome === 'compet') {
      return {
        nomeFiltro: nome,
        conteudoFiltro:
          `and TO_NUMBER(:${nome}) BETWEEN 190001 AND 299912`,
        tipoDadoFiltro: 'NUMBER',
        mascaraFiltro: '',
        obrigatorioFiltro: 'S',
      };
    }

    return {
      nomeFiltro: nome,
      conteudoFiltro: `and :${nome} is not null`,
      tipoDadoFiltro: tipo,
      mascaraFiltro: tipo === 'DATE' ? 'DD/MM/YYYY' : '',
      obrigatorioFiltro: 'S',
    };
  }

  private inferirTipoFiltroSql(nome: string): string {
    const normalizado = nome.toLowerCase();

    if (
      /(^|_)(data|dt)(_|$)/.test(normalizado) ||
      normalizado.includes('nascimento') ||
      normalizado.includes('vencimento')
    ) {
      return 'DATE';
    }

    if (
      /(empresas|itens|codigos|nomes|lista|ids)$/.test(normalizado)
    ) {
      return 'VARCHAR(4000)';
    }

    if (
      /(competencia|ano|mes|codigo|cod|id|numero|nro|grupo|unimed|empresa)$/.test(
        normalizado
      )
    ) {
      return 'NUMBER';
    }

    return 'VARCHAR(4000)';
  }

  private detectarFiltrosFixosSimples(
    sqlOriginal: string,
    nomesExistentes: Set<string>,
    assinaturasIgnoradas: Set<string>
  ): {
    sql: string;
    deteccoes: FiltroFixoSqlDetectado[];
    ajustes: string[];
  } {
    let sql = sqlOriginal;
    const deteccoes: FiltroFixoSqlDetectado[] = [];
    const ajustes: string[] = [];
    const sqlMascarado = this.mascaraSqlSemTextosEComentarios(sqlOriginal);
    const estruturaPrincipal = this.localizarConsultaPrincipal(sqlOriginal);
    const inicioWherePrincipal = estruturaPrincipal?.where?.fim ?? -1;
    const fimWherePrincipal =
      estruturaPrincipal?.limiteCondicoes ?? -1;
    const candidatos: Array<{
      inicio: number;
      fim: number;
      coluna: string;
      operador: 'IN' | '=';
      valores: string[];
      predicadoOriginal: string;
    }> = [];

    const regexIn = /\b((?:[A-Za-z_][A-Za-z0-9_$#]*\.)?[A-Za-z_][A-Za-z0-9_$#]*)\s+IN\s*\(\s*(-?\d+(?:\.\d+)?(?:\s*,\s*-?\d+(?:\.\d+)?)*)\s*\)/gi;
    let correspondencia: RegExpExecArray | null;

    while ((correspondencia = regexIn.exec(sqlMascarado)) !== null) {
      candidatos.push({
        inicio: correspondencia.index,
        fim: correspondencia.index + correspondencia[0].length,
        coluna: correspondencia[1],
        operador: 'IN',
        valores: correspondencia[2]
          .split(',')
          .map(valor => valor.trim()),
        predicadoOriginal: sqlOriginal.slice(
          correspondencia.index,
          correspondencia.index + correspondencia[0].length
        ),
      });
    }

    const regexIgual = /\b((?:[A-Za-z_][A-Za-z0-9_$#]*\.)?[A-Za-z_][A-Za-z0-9_$#]*)\s*=\s*(-?\d+(?:\.\d+)?)/gi;

    while ((correspondencia = regexIgual.exec(sqlMascarado)) !== null) {
      const inicio = correspondencia.index;
      const fim = correspondencia.index + correspondencia[0].length;

      if (
        candidatos.some(
          candidato => inicio >= candidato.inicio && fim <= candidato.fim
        )
      ) {
        continue;
      }

      candidatos.push({
        inicio,
        fim,
        coluna: correspondencia[1],
        operador: '=',
        valores: [correspondencia[2].trim()],
        predicadoOriginal: sqlOriginal.slice(inicio, fim),
      });
    }

    const candidatosValidos = candidatos
      .map(candidato => ({
        ...candidato,
        nomeFiltro: this.nomeFiltroPorColunaSql(candidato.coluna),
      }))
      .filter(
        candidato =>
          Boolean(candidato.nomeFiltro) &&
          inicioWherePrincipal >= 0 &&
          candidato.inicio >= inicioWherePrincipal &&
          candidato.fim <= fimWherePrincipal &&
          !nomesExistentes.has(candidato.nomeFiltro!)
      )
      .sort((a, b) => b.inicio - a.inicio);

    for (const candidato of candidatosValidos) {
      const nomeFiltro = candidato.nomeFiltro!;

      if (nomesExistentes.has(nomeFiltro)) continue;

      const assinatura = this.assinaturaFiltroFixo(
        candidato.coluna,
        candidato.operador,
        candidato.valores
      );

      if (assinaturasIgnoradas.has(assinatura)) continue;

      const id = this.gerarId();
      const marcador = `/*AUTO_FILTRO_FIXO:${id}*/`;
      const filtro = this.criarFiltroDeCondicaoFixa(
        nomeFiltro,
        candidato.coluna,
        candidato.valores
      );

      sql =
        sql.slice(0, candidato.inicio) +
        `1 = 1 ${marcador}` +
        sql.slice(candidato.fim);

      const deteccao: FiltroFixoSqlDetectado = {
        id,
        assinatura,
        predicadoOriginal: candidato.predicadoOriginal.trim(),
        marcador,
        filtro,
      };

      deteccoes.unshift(deteccao);
      nomesExistentes.add(nomeFiltro);
      ajustes.push(
        `A condição fixa “${deteccao.predicadoOriginal}” foi transformada no filtro :${nomeFiltro}.`
      );
    }

    return { sql, deteccoes, ajustes };
  }

  private nomeFiltroPorColunaSql(colunaCompleta: string): string | null {
    const coluna = colunaCompleta
      .split('.')
      .pop()!
      .toUpperCase();

    if (coluna.includes('COMPET')) return 'competencia';

    if (
      coluna === 'GRUPO_COD' ||
      coluna === 'COD_GRUPO' ||
      coluna === 'GRPRE_COD' ||
      coluna.endsWith('_COD_GRUPO')
    ) {
      return 'grupo';
    }

    if (
      coluna === 'EMPCN_COD_PESSOA' ||
      coluna === 'COD_EMPRESA' ||
      coluna === 'EMPRESA_COD' ||
      coluna === 'COD_PESSOA_EMPRESA'
    ) {
      return 'empresas';
    }

    if (
      coluna === 'GUIA_COD_UNIMED_EXECUT' ||
      coluna === 'COD_UNIMED_EXECUT' ||
      coluna === 'UNIMED_EXECUTORA'
    ) {
      return 'unimedexecutora';
    }

    if (
      coluna === 'ITEM_COD' ||
      coluna === 'COD_TUSS' ||
      coluna === 'COD_AMB' ||
      coluna === 'COD_PROCEDIMENTO'
    ) {
      return 'itens';
    }

    return null;
  }

  private criarFiltroDeCondicaoFixa(
    nomeFiltro: string,
    coluna: string,
    valores: string[]
  ): SguFiltro {
    const multiplosValores = valores.length > 1;
    const filtroLista =
      nomeFiltro === 'empresas' ||
      nomeFiltro === 'itens' ||
      multiplosValores;

    if (filtroLista) {
      return {
        nomeFiltro,
        conteudoFiltro:
          `and instr(',' || replace(:${nomeFiltro}, ' ', '') || ',', ',' || to_char(${coluna}) || ',') > 0`,
        tipoDadoFiltro:
          nomeFiltro === 'itens' ? 'VARCHAR(4000)' : 'VARCHAR(1000)',
        mascaraFiltro: '',
        obrigatorioFiltro: 'S',
      };
    }

    return {
      nomeFiltro,
      conteudoFiltro: `and ${coluna} = :${nomeFiltro}`,
      tipoDadoFiltro: 'NUMBER',
      mascaraFiltro: '',
      obrigatorioFiltro: 'S',
    };
  }

  private assinaturaFiltroFixo(
    coluna: string,
    operador: string,
    valores: string[]
  ): string {
    return `${coluna.toUpperCase()}|${operador.toUpperCase()}|${valores.join(',')}`;
  }

  private mascaraSqlSemTextosEComentarios(sql: string): string {
    let resultado = '';
    let indice = 0;
    let estado:
      | 'normal'
      | 'texto'
      | 'identificador'
      | 'linha'
      | 'bloco' = 'normal';

    while (indice < sql.length) {
      const atual = sql[indice];
      const proximo = sql[indice + 1] ?? '';

      if (estado === 'texto') {
        if (atual === "'" && proximo === "'") {
          resultado += '  ';
          indice += 2;
          continue;
        }

        resultado += atual === '\n' ? '\n' : ' ';
        if (atual === "'") estado = 'normal';
        indice += 1;
        continue;
      }

      if (estado === 'identificador') {
        resultado += atual === '\n' ? '\n' : ' ';
        if (atual === '"') estado = 'normal';
        indice += 1;
        continue;
      }

      if (estado === 'linha') {
        resultado += atual === '\n' ? '\n' : ' ';
        if (atual === '\n') estado = 'normal';
        indice += 1;
        continue;
      }

      if (estado === 'bloco') {
        if (atual === '*' && proximo === '/') {
          resultado += '  ';
          indice += 2;
          estado = 'normal';
          continue;
        }

        resultado += atual === '\n' ? '\n' : ' ';
        indice += 1;
        continue;
      }

      if (atual === "'") {
        resultado += ' ';
        estado = 'texto';
        indice += 1;
        continue;
      }

      if (atual === '"') {
        resultado += ' ';
        estado = 'identificador';
        indice += 1;
        continue;
      }

      if (atual === '-' && proximo === '-') {
        resultado += '  ';
        indice += 2;
        estado = 'linha';
        continue;
      }

      if (atual === '/' && proximo === '*') {
        resultado += '  ';
        indice += 2;
        estado = 'bloco';
        continue;
      }

      resultado += atual;
      indice += 1;
    }

    return resultado;
  }

  private converterParametrosFixosSql(sqlOriginal: string): {
    sql: string;
    ajustes: string[];
  } {
    let sql = sqlOriginal;
    const ajustes: string[] = [];
    const regexCte = /\b(PARAM|PARAMETROS)\s+AS\s*\(/gi;
    let correspondencia: RegExpExecArray | null;

    while ((correspondencia = regexCte.exec(sql)) !== null) {
      const inicioAbertura =
        correspondencia.index + correspondencia[0].lastIndexOf('(');
      const fimAbertura = this.encontrarFechamentoParentesesSql(
        sql,
        inicioAbertura
      );

      if (fimAbertura < 0) continue;

      const blocoOriginal = sql.slice(inicioAbertura + 1, fimAbertura);

      if (/:competencia\b/i.test(blocoOriginal)) {
        continue;
      }

      const indicaCompetencia =
        /\bAS\s+COMPET(?:ENCIA)?\b/i.test(blocoOriginal) ||
        /filtros?\s*:?\s*compet[eê]ncia/i.test(blocoOriginal);

      if (!indicaCompetencia) continue;

      const valoresEncontrados = new Set<string>();
      let blocoAjustado = blocoOriginal;

      blocoAjustado = blocoAjustado.replace(
        /TO_DATE\s*\(\s*'(\d{6})'\s*,\s*'YYYYMM'\s*\)/gi,
        (_trecho, valor: string) => {
          valoresEncontrados.add(valor);
          return "TO_DATE(TO_CHAR(:competencia), 'YYYYMM')";
        }
      );

      blocoAjustado = blocoAjustado.replace(
        /'(\d{6})'\s+AS\s+(COMPET(?:ENCIA)?)\b/gi,
        (_trecho, valor: string, alias: string) => {
          valoresEncontrados.add(valor);
          return `TO_CHAR(:competencia) AS ${alias}`;
        }
      );

      blocoAjustado = blocoAjustado.replace(
        /\b(\d{6})\s+AS\s+(COMPET(?:ENCIA)?)\b/gi,
        (_trecho, valor: string, alias: string) => {
          valoresEncontrados.add(valor);
          return `TO_NUMBER(:competencia) AS ${alias}`;
        }
      );

      if (blocoAjustado === blocoOriginal) continue;

      sql =
        sql.slice(0, inicioAbertura + 1) +
        blocoAjustado +
        sql.slice(fimAbertura);

      const valores = Array.from(valoresEncontrados);
      const cteNome = correspondencia[1].toUpperCase();

      ajustes.push(
        valores.length
          ? `A competência fixa ${valores.join(
              ', '
            )} da CTE ${cteNome} foi transformada no filtro :competencia.`
          : `A competência fixa da CTE ${cteNome} foi transformada no filtro :competencia.`
      );

      break;
    }

    return { sql, ajustes };
  }

  private encontrarFechamentoParentesesSql(
    sql: string,
    indiceAbertura: number
  ): number {
    let profundidade = 0;
    let indice = indiceAbertura;
    let estado:
      | 'normal'
      | 'texto'
      | 'identificador'
      | 'linha'
      | 'bloco' = 'normal';

    while (indice < sql.length) {
      const atual = sql[indice];
      const proximo = sql[indice + 1] ?? '';

      if (estado === 'texto') {
        if (atual === "'" && proximo === "'") {
          indice += 2;
          continue;
        }

        if (atual === "'") estado = 'normal';
        indice += 1;
        continue;
      }

      if (estado === 'identificador') {
        if (atual === '"' && proximo === '"') {
          indice += 2;
          continue;
        }

        if (atual === '"') estado = 'normal';
        indice += 1;
        continue;
      }

      if (estado === 'linha') {
        if (atual === '\n') estado = 'normal';
        indice += 1;
        continue;
      }

      if (estado === 'bloco') {
        if (atual === '*' && proximo === '/') {
          indice += 2;
          estado = 'normal';
          continue;
        }

        indice += 1;
        continue;
      }

      if (atual === "'") {
        estado = 'texto';
        indice += 1;
        continue;
      }

      if (atual === '"') {
        estado = 'identificador';
        indice += 1;
        continue;
      }

      if (atual === '-' && proximo === '-') {
        estado = 'linha';
        indice += 2;
        continue;
      }

      if (atual === '/' && proximo === '*') {
        estado = 'bloco';
        indice += 2;
        continue;
      }

      if (atual === '(') {
        profundidade += 1;
      } else if (atual === ')') {
        profundidade -= 1;

        if (profundidade === 0) {
          return indice;
        }
      }

      indice += 1;
    }

    return -1;
  }

  private normalizarVariaveisBindSql(sql: string): {
    sql: string;
    variaveis: string[];
  } {
    let resultado = '';
    let indice = 0;
    let estado: 'normal' | 'texto' | 'linha' | 'bloco' = 'normal';
    const variaveis: string[] = [];

    while (indice < sql.length) {
      const atual = sql[indice];
      const proximo = sql[indice + 1] ?? '';

      if (estado === 'texto') {
        resultado += atual;

        if (atual === "'" && proximo === "'") {
          resultado += proximo;
          indice += 2;
          continue;
        }

        if (atual === "'") estado = 'normal';
        indice += 1;
        continue;
      }

      if (estado === 'linha') {
        resultado += atual;
        if (atual === '\n') estado = 'normal';
        indice += 1;
        continue;
      }

      if (estado === 'bloco') {
        resultado += atual;
        if (atual === '*' && proximo === '/') {
          resultado += proximo;
          indice += 2;
          estado = 'normal';
          continue;
        }
        indice += 1;
        continue;
      }

      if (atual === "'") {
        resultado += atual;
        estado = 'texto';
        indice += 1;
        continue;
      }

      if (atual === '-' && proximo === '-') {
        resultado += atual + proximo;
        indice += 2;
        estado = 'linha';
        continue;
      }

      if (atual === '/' && proximo === '*') {
        resultado += atual + proximo;
        indice += 2;
        estado = 'bloco';
        continue;
      }

      if (atual === ':' && /[A-Za-z_]/.test(proximo)) {
        let fim = indice + 2;
        while (fim < sql.length && /[A-Za-z0-9_]/.test(sql[fim])) {
          fim += 1;
        }

        const nome = sql.slice(indice + 1, fim).toLowerCase();
        resultado += `:${nome}`;

        if (!variaveis.includes(nome)) {
          variaveis.push(nome);
        }

        indice = fim;
        continue;
      }

      resultado += atual;
      indice += 1;
    }

    return { sql: resultado, variaveis };
  }

  private ajustarEstruturaSqlImportado(
    sqlOriginal: string,
    possuiFiltros: boolean
  ): { sql: string; ajustes: string[] } {
    let sql = sqlOriginal
      .replace(/^\uFEFF/, '')
      .trim()
      .replace(/;\s*$/, '');
    const ajustes: string[] = [];

    if (!sql) return { sql, ajustes };

    let estrutura = this.localizarConsultaPrincipal(sql);
    if (!estrutura) return { sql, ajustes };

    if (possuiFiltros) {
      const marcador = '/*FILTROS*/';
      const posicaoMarcador = sql.indexOf(marcador);

      if (
        posicaoMarcador >= estrutura.select.inicio &&
        posicaoMarcador < estrutura.fimRamo
      ) {
        sql =
          sql.slice(0, posicaoMarcador) +
          sql.slice(posicaoMarcador + marcador.length);
        ajustes.push(
          'O marcador /*FILTROS*/ foi reposicionado no final do WHERE principal.'
        );
        estrutura = this.localizarConsultaPrincipal(sql);

        if (!estrutura) return { sql, ajustes };
      }
    }

    if (estrutura.where) {
      const trechoCondicoes = sql.slice(
        estrutura.where.fim,
        estrutura.limiteCondicoes
      );
      const trechoAnalisavel = this.removerComentariosSql(
        trechoCondicoes.replace(/\/\*FILTROS\*\//g, '')
      );

      if (!/\b1\s*=\s*1\b/i.test(trechoAnalisavel)) {
        const possuiCondicao = trechoAnalisavel.trim().length > 0;
        const complemento = possuiCondicao
          ? ' 1 = 1\n  AND'
          : ' 1 = 1';

        sql =
          sql.slice(0, estrutura.where.fim) +
          complemento +
          sql.slice(estrutura.where.fim);
        ajustes.push('Foi adicionado 1 = 1 ao WHERE principal.');
        estrutura = this.localizarConsultaPrincipal(sql);

        if (!estrutura) return { sql, ajustes };
      }
    } else {
      sql = this.inserirClausulaSql(
        sql,
        estrutura.limiteCondicoes,
        'WHERE 1 = 1'
      );
      ajustes.push('Foi adicionada a cláusula WHERE 1 = 1.');
      estrutura = this.localizarConsultaPrincipal(sql);

      if (!estrutura) return { sql, ajustes };
    }

    if (possuiFiltros && !sql.includes('/*FILTROS*/')) {
      sql = this.inserirClausulaSql(
        sql,
        estrutura.limiteCondicoes,
        '  /*FILTROS*/'
      );
      ajustes.push('Foi adicionado o marcador /*FILTROS*/.');
    }

    if (estrutura.operadorConjunto) {
      ajustes.push(
        'A consulta usa UNION, MINUS ou INTERSECT; revise se o marcador ficou no bloco correto.'
      );
    }

    return {
      sql: sql.trim().replace(/;\s*$/, ''),
      ajustes: Array.from(new Set(ajustes)),
    };
  }

  private localizarConsultaPrincipal(
    sql: string
  ): EstruturaConsultaPrincipal | null {
    const tokens = this.tokensSqlNivelZero(sql);
    const indiceSelect = tokens.findIndex(
      token => token.palavra === 'SELECT'
    );

    if (indiceSelect < 0) return null;

    const select = tokens[indiceSelect];
    const tokensDepoisSelect = tokens.slice(indiceSelect + 1);
    const operadorConjunto = tokensDepoisSelect.find(token =>
      ['UNION', 'MINUS', 'INTERSECT'].includes(token.palavra)
    );
    const fimRamo = operadorConjunto?.inicio ?? sql.length;

    const tokensDoRamo = tokensDepoisSelect.filter(
      token => token.inicio < fimRamo
    );
    const where = tokensDoRamo.find(
      token => token.palavra === 'WHERE'
    );

    const inicioBuscaLimite = where?.fim ?? select.fim;
    const palavrasLimite = new Set([
      'GROUP',
      'HAVING',
      'ORDER',
      'CONNECT',
      'START',
      'MODEL',
      'QUALIFY',
      'FETCH',
      'OFFSET',
      'FOR',
    ]);

    const proximaClausula = tokensDoRamo.find(
      token =>
        token.inicio >= inicioBuscaLimite &&
        palavrasLimite.has(token.palavra)
    );

    return {
      select,
      where,
      limiteCondicoes: proximaClausula?.inicio ?? fimRamo,
      fimRamo,
      operadorConjunto,
    };
  }

  private tokensSqlNivelZero(sql: string): TokenSqlNivelZero[] {
    const tokens: TokenSqlNivelZero[] = [];
    let indice = 0;
    let profundidade = 0;
    let estado:
      | 'normal'
      | 'texto'
      | 'identificador'
      | 'linha'
      | 'bloco' = 'normal';

    while (indice < sql.length) {
      const atual = sql[indice];
      const proximo = sql[indice + 1] ?? '';

      if (estado === 'texto') {
        if (atual === "'" && proximo === "'") {
          indice += 2;
          continue;
        }

        if (atual === "'") estado = 'normal';
        indice += 1;
        continue;
      }

      if (estado === 'identificador') {
        if (atual === '"' && proximo === '"') {
          indice += 2;
          continue;
        }

        if (atual === '"') estado = 'normal';
        indice += 1;
        continue;
      }

      if (estado === 'linha') {
        if (atual === '\n') estado = 'normal';
        indice += 1;
        continue;
      }

      if (estado === 'bloco') {
        if (atual === '*' && proximo === '/') {
          indice += 2;
          estado = 'normal';
          continue;
        }

        indice += 1;
        continue;
      }

      if (atual === "'") {
        estado = 'texto';
        indice += 1;
        continue;
      }

      if (atual === '"') {
        estado = 'identificador';
        indice += 1;
        continue;
      }

      if (atual === '-' && proximo === '-') {
        estado = 'linha';
        indice += 2;
        continue;
      }

      if (atual === '/' && proximo === '*') {
        estado = 'bloco';
        indice += 2;
        continue;
      }

      if (atual === '(') {
        profundidade += 1;
        indice += 1;
        continue;
      }

      if (atual === ')') {
        profundidade = Math.max(0, profundidade - 1);
        indice += 1;
        continue;
      }

      if (
        profundidade === 0 &&
        /[A-Za-z_]/.test(atual)
      ) {
        let fim = indice + 1;

        while (
          fim < sql.length &&
          /[A-Za-z0-9_$#]/.test(sql[fim])
        ) {
          fim += 1;
        }

        tokens.push({
          palavra: sql.slice(indice, fim).toUpperCase(),
          inicio: indice,
          fim,
        });
        indice = fim;
        continue;
      }

      indice += 1;
    }

    return tokens;
  }

  private removerComentariosSql(sql: string): string {
    return sql
      .replace(/--[^\r\n]*/g, ' ')
      .replace(/\/\*[\s\S]*?\*\//g, ' ');
  }

  private inserirClausulaSql(
    sql: string,
    posicao: number,
    clausula: string
  ): string {
    const antes = sql.slice(0, posicao).replace(/[ \t]+$/g, '');
    const depois = sql.slice(posicao).replace(/^[ \t]+/g, '');
    const quebraAntes = antes.endsWith('\n') ? '' : '\n';
    const quebraDepois = depois
      ? depois.startsWith('\n')
        ? ''
        : '\n'
      : '';

    return `${antes}${quebraAntes}${clausula}${quebraDepois}${depois}`;
  }

  formatarTamanhoArquivo(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  private normalizarFiltros(filtros: SguFiltro[]): SguFiltro[] {
    return (filtros ?? [])
      .map((filtro): SguFiltro => ({
        nomeFiltro: filtro.nomeFiltro.trim(),
        conteudoFiltro: filtro.conteudoFiltro.trim(),
        tipoDadoFiltro: filtro.tipoDadoFiltro.trim().toUpperCase(),
        mascaraFiltro: filtro.mascaraFiltro.trim(),
        obrigatorioFiltro:
          filtro.obrigatorioFiltro === 'S' ? 'S' : 'N',
      }))
      .filter(
        filtro =>
          Boolean(filtro.nomeFiltro) ||
          Boolean(
            filtro.conteudoFiltro &&
            filtro.conteudoFiltro.toLowerCase() !== 'and'
          )
      );
  }

  private filtroTecnicoSemFiltros(): SguFiltro {
    return {
      nomeFiltro: this.nomeFiltroTecnicoSemFiltros,
      conteudoFiltro:
        `and :${this.nomeFiltroTecnicoSemFiltros} is null`,
      tipoDadoFiltro: 'VARCHAR(1)',
      mascaraFiltro: '',
      obrigatorioFiltro: 'N',
    };
  }

  private ehFiltroTecnicoSemFiltros(filtro: SguFiltro): boolean {
    return (
      filtro?.nomeFiltro?.trim().toLowerCase() ===
        this.nomeFiltroTecnicoSemFiltros &&
      filtro?.conteudoFiltro?.trim().toLowerCase() ===
        `and :${this.nomeFiltroTecnicoSemFiltros} is null` &&
      filtro?.obrigatorioFiltro !== 'S'
    );
  }

  private filtrosDeNegocio(
    filtros: SguFiltro[] | null | undefined
  ): SguFiltro[] {
    return this.normalizarFiltros(filtros ?? [])
      .filter(filtro => !this.ehFiltroTecnicoSemFiltros(filtro))
      .map(filtro => ({ ...filtro }));
  }

  private removerFiltroTecnicoDaDefinicao(
    api: SguApiDefinicao
  ): SguApiDefinicao {
    return {
      ...api,
      filtros: this.filtrosDeNegocio(api.filtros),
    };
  }

  private prepararDefinicaoParaSgu(
    api: SguApiDefinicao
  ): SguApiDefinicao {
    const filtrosNegocio = this.filtrosDeNegocio(api.filtros);
    const filtrosSgu = filtrosNegocio.length
      ? filtrosNegocio
      : [this.filtroTecnicoSemFiltros()];

    const sqlAjustado = this.ajustarEstruturaSqlImportado(
      api.consultaSQL,
      true
    );

    return {
      nome: api.nome.trim(),
      consultaSQL: sqlAjustado.sql,
      ordenacao: api.ordenacao?.trim() ?? '',
      filtros: filtrosSgu,
    };
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
      filtros: this.filtrosDeNegocio(api.filtros),
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
      if (!/\bwhere\s+1\s*=\s*1\b/i.test(api.consultaSQL)) {
        return 'Consultas sem filtros devem conter WHERE 1 = 1.';
      }

      return '';
    }

    if (!api.consultaSQL.includes('/*FILTROS*/')) {
      return 'A consulta SQL deve conter o marcador /*FILTROS*/ quando possuir filtros.';
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
        filtros: this.filtrosDeNegocio(api.filtros),
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
