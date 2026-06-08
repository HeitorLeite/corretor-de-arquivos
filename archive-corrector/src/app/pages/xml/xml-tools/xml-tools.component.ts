import { Component, signal } from '@angular/core';
import { NgIf, NgFor } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FileUploadComponent } from '../../../shared/components/file-upload/file-upload.component';
import { XmlService, CorretorXmlResult, RemovedorResult } from '../../../shared/services/xml.service';

type Estado = 'idle' | 'pronto' | 'analisando' | 'resultado' | 'baixando';
type Operacao = 'corretor' | 'removedor' | 'ambos';

@Component({
  selector: 'app-xml-tools',
  standalone: true,
  imports: [NgIf, NgFor, FormsModule, FileUploadComponent],
  templateUrl: './xml-tools.component.html',
  styleUrls: ['./xml-tools.component.scss'],
})
export class XmlToolsComponent {
  estado = signal<Estado>('idle');
  arquivo: File | null = null;
  operacao: Operacao = 'ambos';

  resultCorretor: CorretorXmlResult | null = null;
  resultRemovedor: RemovedorResult | null = null;

  constructor(private xmlSvc: XmlService) {}

  onArquivo(f: File | null) {
    this.arquivo = f;
    this.resultCorretor = null;
    this.resultRemovedor = null;
    this.estado.set(f ? 'pronto' : 'idle');
  }

  async analisar() {
    if (!this.arquivo) return;
    this.estado.set('analisando');
    try {
      const content = await this.xmlSvc.readFile(this.arquivo);
      if (this.operacao === 'corretor' || this.operacao === 'ambos')
        this.resultCorretor = this.xmlSvc.analisarCorretor(content);
      if (this.operacao === 'removedor' || this.operacao === 'ambos')
        this.resultRemovedor = this.xmlSvc.analisarRemovedor(content);
      this.estado.set('resultado');
    } catch {
      this.estado.set('pronto');
    }
  }

  async corrigirEBaixar() {
    if (!this.arquivo) return;
    this.estado.set('baixando');
    const base = this.arquivo.name.replace('.xml', '');
    const content = await this.xmlSvc.readFile(this.arquivo);

    let final = content;
    if (this.operacao === 'corretor' || this.operacao === 'ambos')
      final = this.xmlSvc.analisarCorretor(final).correctedContent;
    if (this.operacao === 'removedor' || this.operacao === 'ambos')
      final = this.xmlSvc.analisarRemovedor(final).correctedContent;

    this.xmlSvc.downloadXml(final, `${base}_corrigido.xml`);
    setTimeout(() => this.estado.set('resultado'), 800);
  }

  get totalErros(): number { return this.resultCorretor?.errors.length ?? 0; }
  get totalBlocos(): number { return this.resultRemovedor?.blocks.length ?? 0; }
  get temResultado(): boolean { return this.estado() === 'resultado'; }
  get tudoOk(): boolean { return this.totalErros === 0 && this.totalBlocos === 0; }
}
