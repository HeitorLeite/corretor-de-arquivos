import { Component, signal } from '@angular/core';
import { NgIf } from '@angular/common';
import { FileUploadComponent } from '../../../shared/components/file-upload/file-upload.component';
import { ApiService } from '../../../shared/services/api.service';
import { HttpEventType } from '@angular/common/http';

type Estado = 'idle' | 'pronto' | 'processando' | 'sucesso' | 'erro';

interface Stat { label: string; value: number; colorClass: string; }
interface LogEntry { msg: string; tipo: 'info' | 'ok' | 'error' | 'warn'; }

@Component({
  selector: 'app-especialidade-medica',
  standalone: true,
  imports: [NgIf, FileUploadComponent],
  templateUrl: './especialidade-medica.component.html',
  styleUrls: ['./especialidade-medica.component.scss'],
})
export class EspecialidadeMedicaComponent {
  estado = signal<Estado>('idle');
  arquivoDespesas: File | null = null;
  arquivoMedicos: File | null = null;
  log = signal<LogEntry[]>([]);
  stats = signal<Stat[]>([]);
  downloadBlob: Blob | null = null;
  downloadNome = '';

  constructor(private api: ApiService) {}

  get pronto(): boolean {
    return !!this.arquivoDespesas && !!this.arquivoMedicos;
  }

  onDespesas(f: File | null) { this.arquivoDespesas = f; this.reset(); }
  onMedicos(f: File | null)  { this.arquivoMedicos = f; this.reset(); }

  reset() {
    this.log.set([]);
    this.stats.set([]);
    this.downloadBlob = null;
    this.estado.set(this.pronto ? 'pronto' : 'idle');
  }

  addLog(msg: string, tipo: LogEntry['tipo'] = 'info') {
    this.log.update(l => [...l, { msg, tipo }]);
  }

  processar() {
    if (!this.pronto) return;
    this.estado.set('processando');
    this.log.set([]);
    this.stats.set([]);
    this.addLog(`Enviando: ${this.arquivoDespesas!.name}`, 'info');
    this.addLog(`Enviando: ${this.arquivoMedicos!.name}`, 'info');

    const form = new FormData();
    form.append('despesas', this.arquivoDespesas!);
    form.append('medicos', this.arquivoMedicos!);

    this.api.upload('bi/especialidade', form).subscribe({
      next: (event: any) => {
        if (event.type === HttpEventType.Response) {
          this.downloadBlob = event.body as Blob;
          this.downloadNome = this.arquivoDespesas!.name.replace('.xlsx', '_PREENCHIDO.xlsx');
          this.addLog('Especialidades preenchidas com sucesso!', 'ok');
          this.estado.set('sucesso');
        }
      },
      error: () => {
        this.addLog('Erro: backend não conectado (localhost:8080).', 'error');
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
