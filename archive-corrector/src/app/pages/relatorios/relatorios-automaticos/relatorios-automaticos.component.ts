import { CommonModule } from '@angular/common';
import { HttpErrorResponse, HttpResponse } from '@angular/common/http';
import {
  Component,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  OnInit,
  Output,
  SimpleChanges,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { finalize, timeout } from 'rxjs';

import {
  FormatoExportacao,
  RelatorioCatalogo,
  RelatorioGrupoAutomatico,
  RelatorioGrupoItem,
  RelatorioLoteItemRequest,
  RelatorioLoteRequest,
  SguFiltro,
} from '../../../shared/models/relatorio.model';
import { RelatorioService } from '../../../shared/services/relatorio.service';

interface UsoFiltroGrupo {
  relatorioId: string;
  nomeFiltro: string;
  tipoDadoFiltro: string;
  obrigatorioFiltro: 'S' | 'N';
}

interface ValorFiltroGrupo {
  id: string;
  valor: string;
}

interface FiltroGrupoExecucao {
  chave: string;
  rotulo: string;
  usos: UsoFiltroGrupo[];
  obrigatorio: boolean;
  valores: ValorFiltroGrupo[];
}

interface EmpresaGrupoExecucao {
  id: string;
  codigos: string;
  nome: string;
}

interface ContextoEmpresa {
  nome: string;
  codigos: string;
}

@Component({
  selector: 'app-relatorios-automaticos',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './relatorios-automaticos.component.html',
  styleUrls: ['./relatorios-automaticos.component.scss'],
})
export class RelatoriosAutomaticosComponent
  implements OnInit, OnChanges, OnDestroy
{
  @Input() relatorios: RelatorioCatalogo[] = [];
  @Output() voltar = new EventEmitter<void>();

  grupos: RelatorioGrupoAutomatico[] = [];
  grupoSelecionado: RelatorioGrupoAutomatico | null = null;

  filtrosExecucao: FiltroGrupoExecucao[] = [];
  empresasExecucao: EmpresaGrupoExecucao[] = [];
  formatoExecucao: FormatoExportacao = 'xlsx';
  nomeArquivoZip = '';

  modalGrupoAberto = false;
  grupoEmEdicaoId: string | null = null;
  grupoNome = '';
  grupoDescricao = '';
  grupoFormato: FormatoExportacao = 'xlsx';
  relatoriosGrupoSelecionados: Record<string, boolean> = {};
  nomesArquivoRelatorio: Record<string, string> = {};

  executando = false;
  segundosExecucao = 0;
  erro = '';
  sucesso = '';

  private intervaloExecucao?: ReturnType<typeof setInterval>;
  private readonly timeoutLoteMs = 3_600_000;

  constructor(private readonly relatorioService: RelatorioService) {}

  ngOnInit(): void {
    this.grupos = this.relatorioService.listarGruposAutomaticos();
    this.reconciliarGrupos();

    if (this.grupos.length) {
      this.selecionarGrupo(this.grupos[0]);
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['relatorios'] && !changes['relatorios'].firstChange) {
      this.reconciliarGrupos();
    }
  }

  ngOnDestroy(): void {
    this.pararCronometro();
  }

  abrirNovoGrupo(): void {
    if (!this.relatorios.length) {
      this.erro =
        'Adicione relatórios ao catálogo manual antes de criar um grupo automático.';
      return;
    }

    this.grupoEmEdicaoId = null;
    this.grupoNome = '';
    this.grupoDescricao = '';
    this.grupoFormato = 'xlsx';
    this.relatoriosGrupoSelecionados = {};
    this.nomesArquivoRelatorio = {};
    this.modalGrupoAberto = true;
    this.erro = '';
  }

  abrirEdicaoGrupo(
    grupo: RelatorioGrupoAutomatico,
    evento?: Event
  ): void {
    evento?.stopPropagation();

    this.grupoEmEdicaoId = grupo.id;
    this.grupoNome = grupo.nome;
    this.grupoDescricao = grupo.descricao;
    this.grupoFormato = grupo.formato;
    this.relatoriosGrupoSelecionados = {};
    this.nomesArquivoRelatorio = {};

    grupo.itens.forEach(item => {
      this.relatoriosGrupoSelecionados[item.relatorioId] = true;
      this.nomesArquivoRelatorio[item.relatorioId] = item.nomeArquivo;
    });

    this.modalGrupoAberto = true;
    this.erro = '';
  }

  fecharModalGrupo(): void {
    if (!this.executando) {
      this.modalGrupoAberto = false;
    }
  }

  alternarRelatorioGrupo(
    relatorio: RelatorioCatalogo,
    selecionado: boolean
  ): void {
    this.relatoriosGrupoSelecionados[relatorio.id] = selecionado;

    if (selecionado) {
      this.nomesArquivoRelatorio[relatorio.id] ||=
        this.nomeCurtoRelatorio(relatorio);
    }
  }

  get quantidadeRelatoriosGrupoSelecionados(): number {
    return this.relatorios.filter(
      relatorio => this.relatoriosGrupoSelecionados[relatorio.id]
    ).length;
  }

  salvarGrupo(): void {
    const nome = this.grupoNome.trim();
    const descricao = this.grupoDescricao.trim();

    if (!nome) {
      this.erro = 'Informe um nome para o grupo automático.';
      return;
    }

    const itens: RelatorioGrupoItem[] = this.relatorios
      .filter(relatorio => this.relatoriosGrupoSelecionados[relatorio.id])
      .map(relatorio => ({
        relatorioId: relatorio.id,
        nomeArquivo: this.sanitizarNomeArquivo(
          this.nomesArquivoRelatorio[relatorio.id] ||
            this.nomeCurtoRelatorio(relatorio)
        ),
      }));

    if (!itens.length) {
      this.erro = 'Selecione pelo menos um relatório para o grupo.';
      return;
    }

    const nomeArquivoVazio = itens.find(item => !item.nomeArquivo);
    if (nomeArquivoVazio) {
      this.erro =
        'Informe o nome que será usado no arquivo de cada relatório selecionado.';
      return;
    }

    const agora = new Date().toISOString();
    const existente = this.grupos.find(
      grupo => grupo.id === this.grupoEmEdicaoId
    );

    const grupo: RelatorioGrupoAutomatico = {
      id: existente?.id ?? this.gerarId(),
      nome,
      descricao,
      formato: this.grupoFormato,
      itens,
      criadoEm: existente?.criadoEm ?? agora,
      atualizadoEm: agora,
    };

    this.grupos = existente
      ? this.grupos.map(item => (item.id === grupo.id ? grupo : item))
      : [...this.grupos, grupo];

    this.persistirGrupos();
    this.modalGrupoAberto = false;
    this.selecionarGrupo(grupo);
    this.sucesso = existente
      ? `O grupo “${grupo.nome}” foi atualizado.`
      : `O grupo “${grupo.nome}” foi criado.`;
    this.erro = '';
  }

  selecionarGrupo(grupo: RelatorioGrupoAutomatico): void {
    this.grupoSelecionado = grupo;
    this.formatoExecucao = grupo.formato;
    this.nomeArquivoZip = `${this.sanitizarNomeArquivo(grupo.nome)}_${this.dataAtualCompacta()}`;
    this.montarFiltrosExecucao(grupo);
    this.erro = '';
    this.sucesso = '';
  }

  excluirGrupo(
    grupo: RelatorioGrupoAutomatico,
    evento?: Event
  ): void {
    evento?.stopPropagation();

    const confirmou =
      typeof window === 'undefined' ||
      window.confirm(`Excluir o grupo automático “${grupo.nome}”?`);

    if (!confirmou) return;

    this.grupos = this.grupos.filter(item => item.id !== grupo.id);
    this.persistirGrupos();

    if (this.grupoSelecionado?.id === grupo.id) {
      this.grupoSelecionado = null;
      this.filtrosExecucao = [];
      this.empresasExecucao = [];

      if (this.grupos.length) {
        this.selecionarGrupo(this.grupos[0]);
      }
    }

    this.sucesso = `O grupo “${grupo.nome}” foi excluído.`;
  }

  relatoriosDoGrupo(
    grupo: RelatorioGrupoAutomatico | null = this.grupoSelecionado
  ): RelatorioCatalogo[] {
    if (!grupo) return [];

    return grupo.itens
      .map(item =>
        this.relatorios.find(relatorio => relatorio.id === item.relatorioId)
      )
      .filter(
        (relatorio): relatorio is RelatorioCatalogo => Boolean(relatorio)
      );
  }

  resumoGrupo(grupo: RelatorioGrupoAutomatico): string {
    const nomes = this.relatoriosDoGrupo(grupo).map(
      relatorio => relatorio.nomeExibicao
    );

    if (!nomes.length) return 'Nenhum relatório disponível';
    if (nomes.length <= 2) return nomes.join(' · ');
    return `${nomes.slice(0, 2).join(' · ')} +${nomes.length - 2}`;
  }

  get filtroEmpresa(): FiltroGrupoExecucao | undefined {
    return this.filtrosExecucao.find(filtro => filtro.chave === 'empresa');
  }

  get filtrosGerais(): FiltroGrupoExecucao[] {
    return this.filtrosExecucao.filter(filtro => filtro.chave !== 'empresa');
  }

  adicionarEmpresa(): void {
    this.empresasExecucao.push(this.novaEmpresa());
  }

  removerEmpresa(indice: number): void {
    if (this.empresasExecucao.length > 1) {
      this.empresasExecucao.splice(indice, 1);
    }
  }

  adicionarValorFiltro(filtro: FiltroGrupoExecucao): void {
    filtro.valores.push(this.novoValorFiltro());
  }

  removerValorFiltro(
    filtro: FiltroGrupoExecucao,
    indice: number
  ): void {
    if (filtro.valores.length > 1) {
      filtro.valores.splice(indice, 1);
    }
  }

  tipoInputFiltro(filtro: FiltroGrupoExecucao): string {
    const todosNumericos = filtro.usos.every(
      uso => uso.tipoDadoFiltro.toUpperCase() === 'NUMBER'
    );
    return todosNumericos ? 'number' : 'text';
  }

  placeholderFiltro(filtro: FiltroGrupoExecucao): string {
    if (filtro.chave === 'competencia') return 'Ex.: 202601';
    return filtro.rotulo;
  }

  get quantidadeArquivosPrevista(): number {
    if (!this.grupoSelecionado) return 0;

    const empresasValidas = this.empresasExecucao.filter(
      empresa => empresa.codigos.trim() && empresa.nome.trim()
    ).length;

    return this.grupoSelecionado.itens.reduce((total, item) => {
      const relatorio = this.relatorios.find(
        atual => atual.id === item.relatorioId
      );
      if (!relatorio) return total;

      const usaEmpresa = relatorio.filtros.some(
        filtro => this.chaveLogicaFiltro(filtro.nomeFiltro) === 'empresa'
      );

      return total + (usaEmpresa ? empresasValidas : 1);
    }, 0);
  }

  gerarGrupoAutomaticamente(): void {
    if (!this.grupoSelecionado || this.executando) return;

    let request: RelatorioLoteRequest;

    try {
      request = this.montarRequestLote();
    } catch (erro) {
      this.erro =
        erro instanceof Error
          ? erro.message
          : 'Não foi possível preparar o grupo de relatórios.';
      return;
    }

    this.executando = true;
    this.segundosExecucao = 0;
    this.erro = '';
    this.sucesso = '';
    this.iniciarCronometro();

    this.relatorioService
      .exportarLote(request)
      .pipe(
        timeout(this.timeoutLoteMs),
        finalize(() => {
          this.executando = false;
          this.pararCronometro();
        })
      )
      .subscribe({
        next: (resposta: HttpResponse<Blob>) => {
          const blob = resposta.body;
          if (!blob) {
            this.erro = 'O backend não devolveu o arquivo ZIP.';
            return;
          }

          const nomeZip = this.sanitizarNomeArquivo(request.nomeArquivo);
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = `${nomeZip}.zip`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          setTimeout(() => URL.revokeObjectURL(url), 0);

          const gerados = resposta.headers.get('X-Relatorios-Gerados');
          const falhas = resposta.headers.get('X-Relatorios-Erros');

          if (gerados === '0' && falhas && falhas !== '0') {
            this.erro =
              `Nenhum relatório foi gerado. O ZIP contém o resumo de ${falhas} falha(s).`;
          } else {
            this.sucesso = gerados
              ? `${gerados} arquivo(s) gerado(s).${
                  falhas && falhas !== '0'
                    ? ` ${falhas} falha(s) foram registradas dentro do ZIP.`
                    : ''
                }`
              : `Lote concluído: ${nomeZip}.zip`;
          }
        },
        error: async (erro: unknown) => {
          this.erro = await this.mensagemErroBlob(
            erro,
            'Não foi possível gerar o grupo automático.'
          );
        },
      });
  }

  trackByGrupoId(
    _indice: number,
    grupo: RelatorioGrupoAutomatico
  ): string {
    return grupo.id;
  }

  trackByRelatorioId(
    _indice: number,
    relatorio: RelatorioCatalogo
  ): string {
    return relatorio.id;
  }

  trackByEmpresaId(
    _indice: number,
    empresa: EmpresaGrupoExecucao
  ): string {
    return empresa.id;
  }

  trackByFiltroChave(
    _indice: number,
    filtro: FiltroGrupoExecucao
  ): string {
    return filtro.chave;
  }

  trackByValorId(_indice: number, valor: ValorFiltroGrupo): string {
    return valor.id;
  }

  private montarFiltrosExecucao(grupo: RelatorioGrupoAutomatico): void {
    const mapa = new Map<string, FiltroGrupoExecucao>();

    grupo.itens.forEach(item => {
      const relatorio = this.relatorios.find(
        atual => atual.id === item.relatorioId
      );
      if (!relatorio) return;

      this.filtrosNegocio(relatorio.filtros).forEach(filtro => {
        const chave = this.chaveLogicaFiltro(filtro.nomeFiltro);
        const existente = mapa.get(chave);
        const uso: UsoFiltroGrupo = {
          relatorioId: relatorio.id,
          nomeFiltro: filtro.nomeFiltro,
          tipoDadoFiltro: filtro.tipoDadoFiltro,
          obrigatorioFiltro: filtro.obrigatorioFiltro,
        };

        if (existente) {
          existente.usos.push(uso);
          existente.obrigatorio ||= filtro.obrigatorioFiltro === 'S';
        } else {
          mapa.set(chave, {
            chave,
            rotulo: this.rotuloChaveFiltro(chave, filtro.nomeFiltro),
            usos: [uso],
            obrigatorio: filtro.obrigatorioFiltro === 'S',
            valores: [this.novoValorFiltro()],
          });
        }
      });
    });

    this.filtrosExecucao = [...mapa.values()].sort((a, b) => {
      if (a.chave === 'empresa') return -1;
      if (b.chave === 'empresa') return 1;
      if (a.chave === 'competencia') return -1;
      if (b.chave === 'competencia') return 1;
      return a.rotulo.localeCompare(b.rotulo, 'pt-BR');
    });

    this.empresasExecucao = this.filtroEmpresa
      ? [this.novaEmpresa()]
      : [];
  }

  private montarRequestLote(): RelatorioLoteRequest {
    const grupo = this.grupoSelecionado;
    if (!grupo) throw new Error('Selecione um grupo automático.');

    const nomeZip = this.sanitizarNomeArquivo(this.nomeArquivoZip);
    if (!nomeZip) throw new Error('Informe o nome do arquivo ZIP.');

    const empresas = this.empresasExecucao
      .map(empresa => ({
        nome: this.sanitizarNomeArquivo(empresa.nome),
        codigos: empresa.codigos.trim(),
      }))
      .filter(empresa => empresa.nome || empresa.codigos);

    if (this.filtroEmpresa) {
      if (!empresas.length) {
        throw new Error('Adicione pelo menos uma empresa para gerar o grupo.');
      }

      const incompleta = empresas.find(
        empresa => !empresa.nome || !empresa.codigos
      );
      if (incompleta) {
        throw new Error(
          'Cada empresa precisa ter os códigos e o nome usado nos arquivos.'
        );
      }

      const nomes = empresas.map(empresa => empresa.nome.toLowerCase());
      if (new Set(nomes).size !== nomes.length) {
        throw new Error('Os nomes das empresas não podem ser repetidos.');
      }
    }

    this.filtrosGerais.forEach(filtro => {
      const valores = this.valoresPreenchidos(filtro);
      if (filtro.obrigatorio && !valores.length) {
        throw new Error(`Preencha o filtro obrigatório “${filtro.rotulo}”.`);
      }
    });

    const itens: RelatorioLoteItemRequest[] = [];
    const nomesUsados = new Map<string, number>();

    grupo.itens.forEach(itemGrupo => {
      const relatorio = this.relatorios.find(
        atual => atual.id === itemGrupo.relatorioId
      );
      if (!relatorio) return;

      const filtrosRelatorio = this.filtrosNegocio(relatorio.filtros);
      const usaEmpresa = filtrosRelatorio.some(
        filtro => this.chaveLogicaFiltro(filtro.nomeFiltro) === 'empresa'
      );

      const contextos: ContextoEmpresa[] = usaEmpresa
        ? empresas
        : [
            {
              nome: this.sanitizarNomeArquivo(grupo.nome) || 'grupo',
              codigos: '',
            },
          ];

      contextos.forEach(contexto => {
        const combinacoes = this.criarCombinacoesFiltros(
          relatorio,
          filtrosRelatorio,
          contexto
        );

        const nomeBase = this.nomeArquivoDoItem(
          grupo,
          itemGrupo,
          relatorio,
          contexto,
          usaEmpresa
        );
        const nomeArquivo = this.nomeArquivoUnico(nomeBase, nomesUsados);

        itens.push({
          apiNome: relatorio.apiNome,
          nomeArquivo,
          combinacoesFiltros: combinacoes,
        });
      });
    });

    if (!itens.length) {
      throw new Error(
        'Nenhum arquivo pôde ser preparado. Verifique os relatórios do grupo.'
      );
    }

    return {
      nomeArquivo: nomeZip,
      formato: this.formatoExecucao,
      itens,
    };
  }

  private criarCombinacoesFiltros(
    relatorio: RelatorioCatalogo,
    filtrosRelatorio: SguFiltro[],
    contexto: ContextoEmpresa
  ): Record<string, unknown>[] {
    let combinacoes: Record<string, unknown>[] = [{}];

    const chaves = [...new Set(
      filtrosRelatorio.map(filtro => this.chaveLogicaFiltro(filtro.nomeFiltro))
    )];

    chaves.forEach(chave => {
      const filtrosDaChave = filtrosRelatorio.filter(
        filtro => this.chaveLogicaFiltro(filtro.nomeFiltro) === chave
      );

      if (chave === 'empresa') {
        combinacoes = combinacoes.map(combinacao => {
          const atualizada = { ...combinacao };
          filtrosDaChave.forEach(filtro => {
            atualizada[filtro.nomeFiltro] = this.converterValorFiltro(
              contexto.codigos,
              filtro,
              relatorio
            );
          });
          return atualizada;
        });
        return;
      }

      const unificado = this.filtrosExecucao.find(
        filtro => filtro.chave === chave
      );
      const valores = unificado ? this.valoresPreenchidos(unificado) : [];
      const obrigatorioNesteRelatorio = filtrosDaChave.some(
        filtro => filtro.obrigatorioFiltro === 'S'
      );

      if (!valores.length) {
        if (obrigatorioNesteRelatorio) {
          throw new Error(
            `O relatório “${relatorio.nomeExibicao}” exige o filtro “${
              unificado?.rotulo ?? chave
            }”.`
          );
        }
        return;
      }

      const expandidas: Record<string, unknown>[] = [];
      combinacoes.forEach(combinacao => {
        valores.forEach(valor => {
          const atualizada = { ...combinacao };
          filtrosDaChave.forEach(filtro => {
            atualizada[filtro.nomeFiltro] = this.converterValorFiltro(
              valor,
              filtro,
              relatorio
            );
          });
          expandidas.push(atualizada);
        });
      });
      combinacoes = expandidas;
    });

    const unicas = new Map<string, Record<string, unknown>>();
    combinacoes.forEach(combinacao => {
      unicas.set(JSON.stringify(combinacao), combinacao);
    });

    return [...unicas.values()];
  }

  private converterValorFiltro(
    valor: string,
    filtro: SguFiltro,
    relatorio: RelatorioCatalogo
  ): unknown {
    const tipo = filtro.tipoDadoFiltro.toUpperCase();
    const limpo = valor.trim();

    if (tipo === 'NUMBER') {
      if (limpo.includes(',')) {
        throw new Error(
          `O filtro “${filtro.nomeFiltro}” do relatório “${relatorio.nomeExibicao}” ` +
            'é NUMBER e aceita apenas um número por campo. Separe os valores usando o botão Adicionar.'
        );
      }

      const numero = Number(limpo.replace(',', '.'));
      if (!Number.isFinite(numero)) {
        throw new Error(
          `O valor “${valor}” não é válido para o filtro numérico “${filtro.nomeFiltro}”.`
        );
      }
      return numero;
    }

    return limpo;
  }

  private nomeArquivoDoItem(
    grupo: RelatorioGrupoAutomatico,
    itemGrupo: RelatorioGrupoItem,
    relatorio: RelatorioCatalogo,
    contexto: ContextoEmpresa,
    usaEmpresa: boolean
  ): string {
    const partes = [
      usaEmpresa
        ? contexto.nome
        : this.sanitizarNomeArquivo(grupo.nome) || 'grupo',
      this.sanitizarNomeArquivo(itemGrupo.nomeArquivo) ||
        this.nomeCurtoRelatorio(relatorio),
    ];

    const chavesRelatorio = new Set(
      this.filtrosNegocio(relatorio.filtros).map(filtro =>
        this.chaveLogicaFiltro(filtro.nomeFiltro)
      )
    );

    this.filtrosGerais.forEach(filtro => {
      if (!chavesRelatorio.has(filtro.chave)) return;
      const valores = this.valoresPreenchidos(filtro);
      if (!valores.length) return;

      if (filtro.chave === 'competencia') {
        partes.push(this.sufixoCompetencias(valores));
      } else if (valores.length > 1) {
        partes.push(
          valores
            .map(valor => this.sanitizarNomeArquivo(valor))
            .filter(Boolean)
            .join('_')
        );
      }
    });

    return partes.filter(Boolean).join('_');
  }

  private sufixoCompetencias(valores: string[]): string {
    const limpos = valores.map(valor => valor.trim());
    const todosAnoMes = limpos.every(valor => /^\d{6}$/.test(valor));

    if (!todosAnoMes) {
      return limpos.map(valor => this.sanitizarNomeArquivo(valor)).join('_');
    }

    const anos = new Set(limpos.map(valor => valor.slice(0, 4)));
    return anos.size === 1
      ? limpos.map(valor => valor.slice(4, 6)).join('_')
      : limpos.join('_');
  }

  private nomeArquivoUnico(
    nomeBase: string,
    nomesUsados: Map<string, number>
  ): string {
    const base = this.sanitizarNomeArquivo(nomeBase) || 'relatorio';
    const quantidade = nomesUsados.get(base) ?? 0;
    nomesUsados.set(base, quantidade + 1);
    return quantidade === 0 ? base : `${base}_${quantidade + 1}`;
  }

  private valoresPreenchidos(filtro: FiltroGrupoExecucao): string[] {
    const vistos = new Set<string>();
    return filtro.valores
      .map(item => item.valor.trim())
      .filter(valor => {
        if (!valor || vistos.has(valor)) return false;
        vistos.add(valor);
        return true;
      });
  }

  private chaveLogicaFiltro(nome: string): string {
    const normalizado = nome
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');

    if (normalizado.includes('empresa')) return 'empresa';
    if (normalizado.startsWith('compet')) return 'competencia';
    return normalizado || 'filtro';
  }

  private rotuloChaveFiltro(chave: string, nomeOriginal: string): string {
    if (chave === 'empresa') return 'Empresas';
    if (chave === 'competencia') return 'Competências';

    return nomeOriginal
      .replace(/[_-]+/g, ' ')
      .replace(/\b\w/g, letra => letra.toUpperCase());
  }

  private filtrosNegocio(filtros: SguFiltro[]): SguFiltro[] {
    return (filtros ?? []).filter(
      filtro => filtro.nomeFiltro?.trim().toLowerCase() !== 'filtrotecnico'
    );
  }

  private reconciliarGrupos(): void {
    const idsDisponiveis = new Set(this.relatorios.map(relatorio => relatorio.id));

    this.grupos = (this.grupos ?? [])
      .map(grupo => ({
        ...grupo,
        formato: grupo.formato || 'xlsx',
        itens: (grupo.itens ?? []).filter(item =>
          idsDisponiveis.has(item.relatorioId)
        ),
      }))
      .filter(grupo => grupo.id && grupo.nome?.trim() && grupo.itens.length);

    this.persistirGrupos();

    if (this.grupoSelecionado) {
      const atualizado = this.grupos.find(
        grupo => grupo.id === this.grupoSelecionado?.id
      );
      if (atualizado) {
        this.selecionarGrupo(atualizado);
      } else {
        this.grupoSelecionado = null;
      }
    }
  }

  private persistirGrupos(): void {
    this.relatorioService.salvarGruposAutomaticos(this.grupos);
  }

  private nomeCurtoRelatorio(relatorio: RelatorioCatalogo): string {
    const nome = relatorio.nomeExibicao
      .replace(/\brelat[oó]rio\b/gi, '')
      .replace(/^\s*(de|da|do|dos|das)\s+/i, '')
      .trim();
    return this.sanitizarNomeArquivo(nome || relatorio.apiNome);
  }

  private sanitizarNomeArquivo(valor: string): string {
    return String(valor ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^[_-]+|[_-]+$/g, '');
  }

  private novaEmpresa(): EmpresaGrupoExecucao {
    return {
      id: this.gerarId(),
      codigos: '',
      nome: '',
    };
  }

  private novoValorFiltro(): ValorFiltroGrupo {
    return {
      id: this.gerarId(),
      valor: '',
    };
  }

  private dataAtualCompacta(): string {
    const agora = new Date();
    const ano = agora.getFullYear();
    const mes = String(agora.getMonth() + 1).padStart(2, '0');
    const dia = String(agora.getDate()).padStart(2, '0');
    return `${ano}${mes}${dia}`;
  }

  private iniciarCronometro(): void {
    this.pararCronometro();
    this.intervaloExecucao = setInterval(() => {
      this.segundosExecucao += 1;
    }, 1000);
  }

  private pararCronometro(): void {
    if (this.intervaloExecucao) {
      clearInterval(this.intervaloExecucao);
      this.intervaloExecucao = undefined;
    }
  }

  private async mensagemErroBlob(
    erro: unknown,
    mensagemPadrao: string
  ): Promise<string> {
    if (erro instanceof HttpErrorResponse) {
      let detalhe = '';

      if (erro.error instanceof Blob) {
        try {
          const texto = await erro.error.text();
          try {
            const json = JSON.parse(texto);
            detalhe = json?.message ?? json?.error ?? texto;
          } catch {
            detalhe = texto;
          }
        } catch {
          detalhe = '';
        }
      } else if (typeof erro.error === 'string') {
        detalhe = erro.error;
      } else {
        detalhe = erro.error?.message ?? erro.error?.error ?? '';
      }

      if (erro.status === 0) {
        return 'Não foi possível conectar ao backend.';
      }

      return `Erro ${erro.status}: ${detalhe || erro.statusText || mensagemPadrao}`;
    }

    if (erro instanceof Error && erro.name === 'TimeoutError') {
      return 'A geração ultrapassou o limite de uma hora.';
    }

    return erro instanceof Error ? erro.message : mensagemPadrao;
  }

  private gerarId(): string {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
      return crypto.randomUUID();
    }
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
}
