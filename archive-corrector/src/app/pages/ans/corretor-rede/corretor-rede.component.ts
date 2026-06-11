import { Component, signal, ViewChild, ElementRef } from '@angular/core';
import { NgIf, NgFor, NgClass } from '@angular/common';
import { ApiService } from '../../../shared/services/api.service';
import { HttpEventType } from '@angular/common/http';

type Estado = 'idle' | 'pronto' | 'processando' | 'sucesso' | 'erro';
type Modo = 'xlsx' | 'csv';
interface LogEntry { msg: string; tipo: 'info' | 'ok' | 'error' | 'warn' | 'section'; }
interface Stats { lidas: number; removidas: number; mantidas: number; chavesPorTipo: Record<string, number>; }
interface CsvSlot { key: string; label: string; hint: string; file: File | null; }

@Component({
  selector: 'app-corretor-rede',
  standalone: true,
  imports: [NgIf, NgFor, NgClass],
  templateUrl: './corretor-rede.component.html',
  styleUrls: ['./corretor-rede.component.scss'],
})
export class CorretorRedeComponent {
  @ViewChild('logBox') logBoxRef!: ElementRef<HTMLDivElement>;

  estado = signal<Estado>('idle');
  modo: Modo = 'xlsx';

  // XLSX
  arquivoXlsx: File | null = null;
  dragOverXlsx = false;

  // CSVs
  csvSlots: CsvSlot[] = [
    { key: 'ecnes',     label: 'ECnes',              hint: 'Estabelecimento — filtra por CNPJ/CPF', file: null },
    { key: 'cnes',      label: 'CNES',               hint: 'Filtra por par CNES + CNPJ/CPF',        file: null },
    { key: 'municipio', label: 'Município',           hint: 'Filtra por par CNES + CNPJ/RAZÃO',      file: null },
    { key: 'prestador', label: 'Prestador (Err 8521)',hint: 'Filtra por CNPJ + CNES (curinga aceito)',file: null },
    { key: 'aviso',     label: 'Aviso',               hint: 'Filtra somente pelo CNES',              file: null },
  ];

  // TXT
  arquivoTxt: File | null = null;
  dragOverTxt = false;

  logs = signal<LogEntry[]>([]);
  stats = signal<Stats | null>(null);
  downloadBlob: Blob | null = null;
  downloadNome = '';

  constructor(private api: ApiService) {}

  // ── Estado ──────────────────────────────────────────────────────────────────
  get pronto(): boolean {
    const temErro = this.modo === 'xlsx' ? !!this.arquivoXlsx : this.csvSlots.some(s => s.file);
    return temErro && !!this.arquivoTxt;
  }

  setModo(m: Modo) { this.modo = m; this.resetResultado(); }

  resetResultado() {
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

  formatSize(b: number) {
    if (b < 1024) return b + ' B';
    if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
    return (b / 1048576).toFixed(1) + ' MB';
  }

  // ── Upload XLSX ──────────────────────────────────────────────────────────────
  onDragOverX(e: DragEvent) { e.preventDefault(); this.dragOverXlsx = true; }
  onDragLeaveX() { this.dragOverXlsx = false; }
  onDropX(e: DragEvent) {
    e.preventDefault(); this.dragOverXlsx = false;
    const f = e.dataTransfer?.files[0];
    if (f?.name.endsWith('.xlsx')) { this.arquivoXlsx = f; this.resetResultado(); }
  }
  onFileXlsx(e: Event) {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (f?.name.endsWith('.xlsx')) { this.arquivoXlsx = f; this.resetResultado(); }
    (e.target as HTMLInputElement).value = '';
  }
  removerXlsx() { this.arquivoXlsx = null; this.resetResultado(); }

  // ── Upload CSV individual ────────────────────────────────────────────────────
  onFileCsv(e: Event, slot: CsvSlot) {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (f) { slot.file = f; this.resetResultado(); }
    (e.target as HTMLInputElement).value = '';
  }
  removerCsv(slot: CsvSlot) { slot.file = null; this.resetResultado(); }

  // ── Upload TXT ───────────────────────────────────────────────────────────────
  onDragOverT(e: DragEvent) { e.preventDefault(); this.dragOverTxt = true; }
  onDragLeaveT() { this.dragOverTxt = false; }
  onDropT(e: DragEvent) {
    e.preventDefault(); this.dragOverTxt = false;
    const f = e.dataTransfer?.files[0];
    if (f?.name.endsWith('.txt')) { this.arquivoTxt = f; this.resetResultado(); }
  }
  onFileTxt(e: Event) {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (f?.name.endsWith('.txt')) { this.arquivoTxt = f; this.resetResultado(); }
    (e.target as HTMLInputElement).value = '';
  }
  removerTxt() { this.arquivoTxt = null; this.resetResultado(); }

  // ── Processamento ────────────────────────────────────────────────────────────
  processar() {
    if (!this.pronto) return;
    this.estado.set('processando');
    this.logs.set([]); this.stats.set(null); this.downloadBlob = null;

    this.addLog('══ Iniciando filtro de rede ══', 'section');

    const form = new FormData();
    form.append('txt', this.arquivoTxt!);

    let endpoint: string;
    if (this.modo === 'xlsx') {
      form.append('xlsx', this.arquivoXlsx!);
      endpoint = 'ans/filtrar-xlsx';
      this.addLog(`XLSX: ${this.arquivoXlsx!.name}`, 'info');
    } else {
      endpoint = 'ans/filtrar-csvs';
      for (const slot of this.csvSlots)
        if (slot.file) { form.append(slot.key, slot.file); this.addLog(`${slot.label}: ${slot.file.name}`, 'info'); }
    }
    this.addLog(`TXT: ${this.arquivoTxt!.name}`, 'info');

    this.api.upload(endpoint, form).subscribe({
      next: (event: any) => {
        if (event.type === HttpEventType.UploadProgress && event.total)
          if (Math.round(100 * event.loaded / event.total) === 100)
            this.addLog('Upload concluído. Processando…', 'info');

        if (event.type === HttpEventType.Response) {
          try { this.stats.set(JSON.parse(event.headers.get('X-Stats'))); } catch {}
          this.downloadBlob = event.body as Blob;
          this.downloadNome = this.arquivoTxt!.name.replace('.txt', '_filtrado.txt');

          const s = this.stats();
          if (s) {
            this.addLog('══ Chaves carregadas ══', 'section');
            for (const [tipo, n] of Object.entries(s.chavesPorTipo))
              this.addLog(`${tipo}: ${n} registro(s)`, n > 0 ? 'ok' : 'info');
            this.addLog('══ Resultado ══', 'section');
            this.addLog(`Linhas lidas:     ${s.lidas}`, 'info');
            this.addLog(`Linhas removidas: ${s.removidas}`, s.removidas > 0 ? 'warn' : 'info');
            this.addLog(`Linhas mantidas:  ${s.mantidas}`, 'ok');
          }
          this.addLog('Arquivo pronto para download!', 'ok');
          this.estado.set('sucesso');
        }
      },
      error: async (err) => {
        let msg = 'Erro ao conectar com o backend.';
        try {
          const text = err.error instanceof Blob ? await err.error.text() : JSON.stringify(err.error);
          msg = JSON.parse(text)?.message ?? msg;
        } catch {}
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

  get chavesPorTipo() { return Object.entries(this.stats()?.chavesPorTipo ?? {}); }
}
