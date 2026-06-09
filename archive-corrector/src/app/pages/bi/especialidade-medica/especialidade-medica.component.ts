import { Component, signal, ViewChild, ElementRef } from '@angular/core';
import { NgIf, NgFor, NgClass } from '@angular/common';
import { ApiService } from '../../../shared/services/api.service';
import { HttpEventType } from '@angular/common/http';

type Estado = 'idle' | 'pronto' | 'processando' | 'sucesso' | 'erro';
interface LogEntry { msg: string; tipo: 'info' | 'ok' | 'error' | 'warn' | 'section'; }
interface Stats { total: number; preenchidas: number; jaOk: number; semInfo: number; aba: string; }

@Component({
  selector: 'app-especialidade-medica',
  standalone: true,
  imports: [NgIf, NgFor, NgClass],
  templateUrl: './especialidade-medica.component.html',
  styleUrls: ['./especialidade-medica.component.scss'],
})
export class EspecialidadeMedicaComponent {
  @ViewChild('logBox') logBoxRef!: ElementRef<HTMLDivElement>;

  estado = signal<Estado>('idle');
  arquivoDespesas: File | null = null;
  arquivoMedicos:  File | null = null;
  dragOverDespesas = false;
  dragOverMedicos  = false;
  logs = signal<LogEntry[]>([]);
  stats = signal<Stats | null>(null);
  downloadBlob: Blob | null = null;
  downloadNome = '';

  constructor(private api: ApiService) {}

  // ── Estado ──────────────────────────────────────────────────────────────────
  get pronto(): boolean { return !!this.arquivoDespesas && !!this.arquivoMedicos; }

  reset() {
    this.logs.set([]); this.stats.set(null);
    this.downloadBlob = null; this.downloadNome = '';
    this.estado.set(this.pronto ? 'pronto' : 'idle');
  }

  addLog(msg: string, tipo: LogEntry['tipo'] = 'info') {
    this.logs.update(l => [...l, { msg, tipo }]);
    setTimeout(() => {
      const el = this.logBoxRef?.nativeElement;
      if (el) el.scrollTop = el.scrollHeight;
    }, 30);
  }

  // ── Upload Despesas ──────────────────────────────────────────────────────────
  onDragOverD(e: DragEvent) { e.preventDefault(); this.dragOverDespesas = true; }
  onDragLeaveD() { this.dragOverDespesas = false; }
  onDropD(e: DragEvent) {
    e.preventDefault(); this.dragOverDespesas = false;
    const f = e.dataTransfer?.files[0];
    if (f && this.validarArquivo(f)) { this.arquivoDespesas = f; this.reset(); }
  }
  onFileDespesas(e: Event) {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (f && this.validarArquivo(f)) { this.arquivoDespesas = f; this.reset(); }
    (e.target as HTMLInputElement).value = '';
  }

  // ── Upload Médicos ───────────────────────────────────────────────────────────
  onDragOverM(e: DragEvent) { e.preventDefault(); this.dragOverMedicos = true; }
  onDragLeaveM() { this.dragOverMedicos = false; }
  onDropM(e: DragEvent) {
    e.preventDefault(); this.dragOverMedicos = false;
    const f = e.dataTransfer?.files[0];
    if (f && this.validarArquivo(f, true)) { this.arquivoMedicos = f; this.reset(); }
  }
  onFileMedicos(e: Event) {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (f && this.validarArquivo(f, true)) { this.arquivoMedicos = f; this.reset(); }
    (e.target as HTMLInputElement).value = '';
  }

  validarArquivo(f: File, soXlsx = false): boolean {
    const ok = soXlsx
      ? f.name.endsWith('.xlsx')
      : f.name.endsWith('.xlsx') || f.name.endsWith('.csv');
    return ok;
  }

  removerDespesas() { this.arquivoDespesas = null; this.reset(); }
  removerMedicos()  { this.arquivoMedicos = null;  this.reset(); }

  formatSize(b: number) {
    if (b < 1024) return b + ' B';
    if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
    return (b / 1048576).toFixed(1) + ' MB';
  }

  // ── Processamento ────────────────────────────────────────────────────────────
  processar() {
    if (!this.pronto) return;
    this.estado.set('processando');
    this.logs.set([]); this.stats.set(null); this.downloadBlob = null;

    this.addLog('══ Iniciando processamento ══', 'section');
    this.addLog(`Despesas: ${this.arquivoDespesas!.name}`, 'info');
    this.addLog(`Médicos: ${this.arquivoMedicos!.name}`, 'info');

    const form = new FormData();
    form.append('despesas', this.arquivoDespesas!);
    form.append('medicos',  this.arquivoMedicos!);

    this.api.upload('bi/especialidade', form).subscribe({
      next: (event: any) => {
        if (event.type === HttpEventType.UploadProgress) {
          const pct = Math.round(100 * event.loaded / event.total);
          if (pct === 100) this.addLog('Upload concluído. Processando no servidor…', 'info');
        }
        if (event.type === HttpEventType.Response) {
          // Lê o cabeçalho de estatísticas
          const statsHeader = event.headers?.get('X-Stats');
          if (statsHeader) {
            try { this.stats.set(JSON.parse(statsHeader)); } catch {}
          }
          this.downloadBlob = event.body as Blob;
          const ext = this.arquivoDespesas!.name.endsWith('.csv') ? '.csv' : '.xlsx';
          this.downloadNome = this.arquivoDespesas!.name.replace(/\.(xlsx|csv)$/, `_PREENCHIDO${ext}`);

          const s = this.stats();
          if (s) {
            this.addLog('══ Resultado ══', 'section');
            this.addLog(`Aba processada: "${s.aba}"`, 'ok');
            this.addLog(`Total de linhas: ${s.total}`, 'info');
            this.addLog(`Especialidades preenchidas agora: ${s.preenchidas}`, 'ok');
            this.addLog(`Já preenchidas: ${s.jaOk}`, 'info');
            this.addLog(`Sem informação suficiente: ${s.semInfo}`, s.semInfo > 0 ? 'warn' : 'info');
          }
          this.addLog('Arquivo pronto para download!', 'ok');
          this.estado.set('sucesso');
        }
      },
      error: (err) => {
        const msg = err?.error?.message ?? 'Erro ao processar. Verifique o backend (localhost:8080).';
        this.addLog(msg, 'error');
        this.estado.set('erro');
      }
    });
  }

  baixar() {
    if (!this.downloadBlob) return;
    const url = URL.createObjectURL(this.downloadBlob);
    const a = document.createElement('a');
    a.href = url; a.download = this.downloadNome;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
  }
}
