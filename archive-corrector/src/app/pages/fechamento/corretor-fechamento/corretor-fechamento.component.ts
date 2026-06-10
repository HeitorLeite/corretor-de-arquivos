import { Component, signal } from '@angular/core';
import { NgIf } from '@angular/common';
import { FileUploadComponent } from '../../../shared/components/file-upload/file-upload.component';
import { ApiService } from '../../../shared/services/api.service';
import { HttpEventType } from '@angular/common/http';

type Estado = 'idle' | 'pronto' | 'processando' | 'sucesso' | 'erro';

interface LogEntry { msg: string; tipo: 'info' | 'ok' | 'error' | 'warn'; }

@Component({
  selector: 'app-corretor-fechamento',
  standalone: true,
  imports: [NgIf, FileUploadComponent],
  templateUrl: './corretor-fechamento.component.html',
  styleUrls: ['./corretor-fechamento.component.scss'],
})
export class CorretorFechamentoComponent {
  estado = signal<Estado>('idle');
  arquivo: File | null = null;
  progresso = signal(0);
  log = signal<LogEntry[]>([]);
  downloadBlob: Blob | null = null;
  downloadNome = '';

  constructor(private api: ApiService) {}

  onArquivo(f: File | null) {
    this.arquivo = f;
    this.log.set([]);
    this.downloadBlob = null;
    this.estado.set(f ? 'pronto' : 'idle');
  }

  addLog(msg: string, tipo: LogEntry['tipo'] = 'info') {
    this.log.update(l => [...l, { msg, tipo }]);
  }

  converter() {
    if (!this.arquivo) return;
    this.estado.set('processando');
    this.progresso.set(0);
    this.log.set([]);
    this.addLog(`Enviando arquivo: ${this.arquivo.name}`, 'info');

    const form = new FormData();
    form.append('file', this.arquivo);

    this.api.upload('fechamento/converter', form).subscribe({
      next: (event: any) => {
        if (event.type === HttpEventType.UploadProgress && event.total) {
          this.progresso.set(Math.round(100 * event.loaded / event.total));
        }
        if (event.type === HttpEventType.Response) {
          this.downloadBlob = event.body as Blob;
          this.downloadNome = this.arquivo!.name.replace('.xlsx', '_convertido.csv');
          this.addLog('Conversão concluída com sucesso!', 'ok');
          this.addLog(`Arquivo pronto para download: ${this.downloadNome}`, 'ok');
          this.estado.set('sucesso');
        }
      },
      error: () => {
        this.addLog('Erro: não foi possível conectar ao backend.', 'error');
        this.addLog('Verifique se o servidor Spring Boot está rodando em localhost:8080.', 'warn');
        this.estado.set('erro');
      }
    });
  }

  baixar() {
    if (!this.downloadBlob) return;
    const url = URL.createObjectURL(this.downloadBlob);
    const a = document.createElement('a');
    a.href = url; a.download = this.downloadNome;
    a.click(); URL.revokeObjectURL(url);
  }
}
