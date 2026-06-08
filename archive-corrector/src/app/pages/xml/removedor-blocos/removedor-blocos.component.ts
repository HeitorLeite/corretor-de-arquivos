import { Component, signal } from '@angular/core';
import { NgIf, NgFor } from '@angular/common';
import { FileUploadComponent } from '../../../shared/components/file-upload/file-upload.component';
import { XmlService, RemovedorResult } from '../../../shared/services/xml.service';

type Estado = 'idle' | 'pronto' | 'analisando' | 'resultado' | 'baixando';

@Component({
  selector: 'app-removedor-blocos',
  standalone: true,
  imports: [NgIf, NgFor, FileUploadComponent],
  templateUrl: './removedor-blocos.component.html',
  styleUrls: ['./removedor-blocos.component.scss'],
})
export class RemovedorBlocosComponent {
  estado = signal<Estado>('idle');
  arquivo: File | null = null;
  resultado: RemovedorResult | null = null;

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
      this.resultado = this.xmlSvc.analisarRemovedor(content);
      this.estado.set('resultado');
    } catch {
      this.estado.set('pronto');
    }
  }

  removerEBaixar() {
    if (!this.resultado || !this.arquivo) return;
    this.estado.set('baixando');
    const nome = this.arquivo.name.replace('.xml', '') + '_corrigido.xml';
    this.xmlSvc.downloadXml(this.resultado.correctedContent, nome);
    setTimeout(() => this.estado.set('resultado'), 800);
  }

  get semBlocos(): boolean { return this.resultado?.blocks.length === 0; }
}
