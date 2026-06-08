import { Component, signal } from '@angular/core';
import { NgIf, NgFor } from '@angular/common';
import { FileUploadComponent } from '../../../shared/components/file-upload/file-upload.component';
import { XmlService, CorretorXmlResult } from '../../../shared/services/xml.service';

type Estado = 'idle' | 'pronto' | 'analisando' | 'resultado' | 'baixando';

@Component({
  selector: 'app-corretor-xml',
  standalone: true,
  imports: [NgIf, NgFor, FileUploadComponent],
  templateUrl: './corretor-xml.component.html',
  styleUrls: ['./corretor-xml.component.scss'],
})
export class CorretorXmlComponent {
  estado = signal<Estado>('idle');
  arquivo: File | null = null;
  resultado: CorretorXmlResult | null = null;

  constructor(private xmlSvc: XmlService) {}

  onArquivo(f: File | null) {
    this.arquivo = f;
    this.resultado = null;
    this.estado.set(f ? 'pronto' : 'idle');
  }

  async analisar() {
    if (!this.arquivo) return;
    this.estado.set('analisando');
    try {
      const content = await this.xmlSvc.readFile(this.arquivo);
      this.resultado = this.xmlSvc.analisarCorretor(content);
      this.estado.set('resultado');
    } catch {
      this.estado.set('pronto');
    }
  }

  corrigirEBaixar() {
    if (!this.resultado || !this.arquivo) return;
    this.estado.set('baixando');
    const nome = this.arquivo.name.replace('.xml', '') + '_corrigido.xml';
    this.xmlSvc.downloadXml(this.resultado.correctedContent, nome);
    setTimeout(() => this.estado.set('resultado'), 800);
  }

  get semErros(): boolean { return this.resultado?.errors.length === 0; }
}
