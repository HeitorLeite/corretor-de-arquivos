import { Component, signal } from '@angular/core';
import { NgIf, NgFor } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { XmlService, ArquivoResultado } from '../../../shared/services/xml.service';

type Estado = 'idle' | 'pronto' | 'analisando' | 'resultado' | 'baixando';
type Operacao = 'corretor' | 'removedor' | 'ambos';

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

  constructor(private xmlSvc: XmlService) {}

  // ── Upload ──────────────────────────────────────────────────────────────────
  onDragOver(e: DragEvent) { e.preventDefault(); this.dragOver = true; }
  onDragLeave() { this.dragOver = false; }

  onDrop(e: DragEvent) {
    e.preventDefault(); this.dragOver = false;
    const dropped = Array.from(e.dataTransfer?.files ?? []).filter(f => f.name.endsWith('.xml'));
    this.adicionarArquivos(dropped);
  }

  onFileInput(e: Event) {
    const files = Array.from((e.target as HTMLInputElement).files ?? []);
    this.adicionarArquivos(files);
    (e.target as HTMLInputElement).value = '';
  }

  adicionarArquivos(novos: File[]) {
    const existentes = new Set(this.arquivos.map(f => f.name));
    this.arquivos = [...this.arquivos, ...novos.filter(f => !existentes.has(f.name))];
    this.resultados = [];
    this.estado.set(this.arquivos.length > 0 ? 'pronto' : 'idle');
  }

  removerArquivo(nome: string) {
    this.arquivos = this.arquivos.filter(f => f.name !== nome);
    this.resultados = [];
    this.estado.set(this.arquivos.length > 0 ? 'pronto' : 'idle');
  }

  limpar() { this.arquivos = []; this.resultados = []; this.estado.set('idle'); }

  // ── Análise + Correção ──────────────────────────────────────────────────────
  async analisar() {
    if (!this.arquivos.length) return;
    this.estado.set('analisando');
    try {
      this.resultados = await this.xmlSvc.processarLote(
        this.arquivos,
        this.operacao !== 'removedor',
        this.operacao !== 'corretor'
      );
      this.estado.set('resultado');
      if (this.resultados.length === 1) this.arquivoExpandido = this.resultados[0].nome;
    } catch { this.estado.set('pronto'); }
  }

  baixarTodos() {
    this.estado.set('baixando');
    for (const r of this.resultados) {
      const nome = r.nome.replace('.xml', '_corrigido.xml');
      this.xmlSvc.downloadXml(r.correctedContent, nome);
    }
    setTimeout(() => this.estado.set('resultado'), 800);
  }

  baixarArquivo(r: ArquivoResultado) {
    this.xmlSvc.downloadXml(r.correctedContent, r.nome.replace('.xml', '_corrigido.xml'));
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
  get totalPrefixos() { return this.resultados.reduce((s, r) => s + r.prefixos.length, 0); }
  get totalBlocos()   { return this.resultados.reduce((s, r) => s + r.blocos.length, 0); }
  get totalGuias()    { return this.resultados.reduce((s, r) => s + r.guiasRenomeadas.length, 0); }
  get tudoOk()        { return this.totalPrefixos === 0 && this.totalBlocos === 0 && this.totalGuias === 0; }
  get temProblema()   { return this.estado() === 'resultado' && !this.tudoOk; }
  get temResultado()  { return this.estado() === 'resultado'; }
}
