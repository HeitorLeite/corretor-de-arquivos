import { Component, signal } from '@angular/core';
import { NgIf, NgFor } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { XmlService, ArquivoResultado } from '../../../shared/services/xml.service';

type Estado = 'idle' | 'pronto' | 'analisando' | 'resultado' | 'baixando';
type Operacao = 'corretor' | 'removedor' | 'ambos';
type TipoNomeDownload = 'numerico' | 'corrigido' | 'personalizado';

@Component({
  selector: 'app-xml-tools',
  standalone: true,
  imports: [NgIf, NgFor, FormsModule],
  templateUrl: './xml-tools.component.html',
  styleUrls: ['./xml-tools.component.scss'],
})
export class XmlToolsComponent {
  estado = signal<Estado>('idle');
  arquivos: File[] = [];
  operacao: Operacao = 'ambos';
  resultados: ArquivoResultado[] = [];
  arquivoExpandido: string | null = null;
  dragOver = false;

  modalDownloadAberto = false;
  tipoNomeDownload: TipoNomeDownload | null = null;
  resultadosDownload: ArquivoResultado[] = [];
  nomesPersonalizados: string[] = [];
  erroDownload: string | null = null;

  constructor(private xmlSvc: XmlService) {}

  // ── Upload ──────────────────────────────────────────────────────────────────
  onDragOver(e: DragEvent) {
    e.preventDefault();
    this.dragOver = true;
  }

  onDragLeave() {
    this.dragOver = false;
  }

  onDrop(e: DragEvent) {
    e.preventDefault();
    this.dragOver = false;
    const dropped = Array.from(e.dataTransfer?.files ?? [])
      .filter(f => f.name.toLowerCase().endsWith('.xml'));
    this.adicionarArquivos(dropped);
  }

  onFileInput(e: Event) {
    const files = Array.from((e.target as HTMLInputElement).files ?? []);
    this.adicionarArquivos(files);
    (e.target as HTMLInputElement).value = '';
  }

  adicionarArquivos(novos: File[]) {
    this.resetarModalDownload();
    const existentes = new Set(this.arquivos.map(f => f.name));
    this.arquivos = [
      ...this.arquivos,
      ...novos.filter(f => !existentes.has(f.name)),
    ];
    this.resultados = [];
    this.estado.set(this.arquivos.length > 0 ? 'pronto' : 'idle');
  }

  removerArquivo(nome: string) {
    this.resetarModalDownload();
    this.arquivos = this.arquivos.filter(f => f.name !== nome);
    this.resultados = [];
    this.estado.set(this.arquivos.length > 0 ? 'pronto' : 'idle');
  }

  limpar() {
    this.resetarModalDownload();
    this.arquivos = [];
    this.resultados = [];
    this.estado.set('idle');
  }

  // ── Análise + Correção ──────────────────────────────────────────────────────
  async analisar() {
    if (!this.arquivos.length) return;
    this.resetarModalDownload();
    this.estado.set('analisando');

    try {
      this.resultados = await this.xmlSvc.processarLote(
        this.arquivos,
        this.operacao !== 'removedor',
        this.operacao !== 'corretor'
      );
      this.estado.set('resultado');

      if (this.resultados.length === 1) {
        this.arquivoExpandido = this.resultados[0].nome;
      }
    } catch {
      this.estado.set('pronto');
    }
  }

  // ── Download e nomeação ─────────────────────────────────────────────────────
  abrirDownloadTodos() {
    this.abrirModalDownload(this.resultados);
  }

  abrirDownloadArquivo(resultado: ArquivoResultado) {
    this.abrirModalDownload([resultado]);
  }

  private abrirModalDownload(resultados: ArquivoResultado[]) {
    if (!resultados.length) return;

    this.resultadosDownload = [...resultados];
    this.nomesPersonalizados = resultados.map(() => '');
    this.tipoNomeDownload = null;
    this.erroDownload = null;
    this.modalDownloadAberto = true;
  }

  fecharModalDownload(forcar = false) {
    if (this.estado() === 'baixando' && !forcar) return;
    this.resetarModalDownload();
  }

  private resetarModalDownload() {
    this.modalDownloadAberto = false;
    this.tipoNomeDownload = null;
    this.resultadosDownload = [];
    this.nomesPersonalizados = [];
    this.erroDownload = null;
  }

  async confirmarDownload() {
    if (!this.podeConfirmarDownload) return;

    const nomes = this.nomesGerados;
    this.erroDownload = null;
    this.estado.set('baixando');

    // Permite que o navegador atualize o texto do botão antes de montar o ZIP.
    await new Promise<void>(resolve => setTimeout(resolve, 0));

    try {
      if (this.resultadosDownload.length === 1) {
        const resultado = this.resultadosDownload[0];
        this.xmlSvc.downloadXml(resultado.correctedContent, nomes[0]);
      } else {
        const arquivosZip = this.resultadosDownload.map((resultado, index) => ({
          nome: nomes[index],
          conteudo: resultado.correctedContent,
        }));

        this.xmlSvc.downloadZip(arquivosZip, 'arquivos_xml_corrigidos.zip');
      }

      this.fecharModalDownload(true);
    } catch {
      this.erroDownload = 'Não foi possível preparar o download. Tente novamente.';
    } finally {
      this.estado.set('resultado');
    }
  }

  get nomesGerados(): string[] {
    if (this.tipoNomeDownload === 'numerico') {
      return this.resultadosDownload.map((_resultado, index) => `${index + 1}.xml`);
    }

    if (this.tipoNomeDownload === 'corrigido') {
      return this.resultadosDownload.map(resultado =>
        `${this.removerExtensaoXml(resultado.nome)}_corrigido.xml`
      );
    }

    if (this.tipoNomeDownload === 'personalizado') {
      return this.nomesPersonalizados.map(nome => this.normalizarNomeXml(nome));
    }

    return [];
  }

  nomeGeradoPreview(index: number): string {
    return this.nomesGerados[index] ?? '';
  }

  get erroNomesDownload(): string | null {
    if (!this.tipoNomeDownload) return null;

    const nomes = this.nomesGerados;
    if (nomes.length !== this.resultadosDownload.length || nomes.some(nome => !nome)) {
      return this.tipoNomeDownload === 'personalizado'
        ? 'Preencha um nome para todos os arquivos.'
        : 'Não foi possível gerar o nome de todos os arquivos.';
    }

    const nomesNormalizados = nomes.map(nome => nome.toLocaleLowerCase('pt-BR'));
    if (new Set(nomesNormalizados).size !== nomesNormalizados.length) {
      return this.tipoNomeDownload === 'personalizado'
        ? 'Os nomes personalizados não podem se repetir.'
        : 'Há nomes repetidos. Escolha a ordem numérica ou use nomes personalizados.';
    }

    return null;
  }

  get podeConfirmarDownload(): boolean {
    return this.tipoNomeDownload !== null
      && this.resultadosDownload.length > 0
      && this.nomesGerados.length === this.resultadosDownload.length
      && !this.erroNomesDownload
      && this.estado() !== 'baixando';
  }

  get textoBotaoDownload(): string {
    if (this.estado() === 'baixando') return 'Preparando download…';
    return this.resultadosDownload.length > 1
      ? 'Baixar tudo em ZIP'
      : 'Baixar arquivo';
  }

  private removerExtensaoXml(nome: string): string {
    return nome.replace(/\.xml$/i, '');
  }

  private normalizarNomeXml(nome: string): string {
    const base = this.removerExtensaoXml(nome.trim())
      .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_')
      .replace(/[. ]+$/g, '')
      .trim();

    return base ? `${base}.xml` : '';
  }

  toggleExpand(nome: string) {
    this.arquivoExpandido = this.arquivoExpandido === nome ? null : nome;
  }

  formatSize(b: number) {
    if (b < 1024) return b + ' B';
    if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
    return (b / 1048576).toFixed(1) + ' MB';
  }

  // ── Getters ─────────────────────────────────────────────────────────────────
  get totalPrefixos() {
    return this.resultados.reduce((s, r) => s + r.prefixos.length, 0);
  }

  get totalBlocos() {
    return this.resultados.reduce((s, r) => s + r.blocos.length, 0);
  }

  get totalOutrasDespesasVazias() {
    return this.resultados.reduce(
      (s, r) => s + r.outrasDespesasVazias.length,
      0
    );
  }

  get totalGuias() {
    return this.resultados.reduce(
      (s, r) => s + r.guiasRenomeadas.length,
      0
    );
  }

  get tudoOk() {
    return this.totalPrefixos === 0
      && this.totalBlocos === 0
      && this.totalOutrasDespesasVazias === 0
      && this.totalGuias === 0;
  }

  get temProblema() {
    return this.estado() === 'resultado' && !this.tudoOk;
  }

  get temResultado() {
    return this.estado() === 'resultado';
  }
}