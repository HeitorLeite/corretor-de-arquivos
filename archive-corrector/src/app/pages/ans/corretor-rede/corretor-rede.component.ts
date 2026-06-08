import { Component, signal } from '@angular/core';
import { NgIf, NgFor } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FileUploadComponent } from '../../../shared/components/file-upload/file-upload.component';
import { ApiService } from '../../../shared/services/api.service';
import { HttpEventType } from '@angular/common/http';

type Estado = 'idle' | 'pronto' | 'processando' | 'sucesso' | 'erro';
type Modo = 'xlsx' | 'csv';
interface LogEntry { msg: string; tipo: 'info' | 'ok' | 'error' | 'warn'; }

@Component({
  selector: 'app-corretor-rede',
  standalone: true,
  imports: [NgIf, NgFor, FormsModule, FileUploadComponent],
  templateUrl: './corretor-rede.component.html',
  styleUrls: ['./corretor-rede.component.scss'],
})
export class CorretorRedeComponent {
  estado = signal<Estado>('idle');
  modo: Modo = 'xlsx';

  arquivoTxt: File | null = null;
  arquivoXlsx: File | null = null;
  csvEcnes: File | null = null;
  csvCnes: File | null = null;
  csvMunicipio: File | null = null;
  csvPrestador: File | null = null;
  csvAviso: File | null = null;

  log = signal<LogEntry[]>([]);
  progresso = signal(0);
  downloadBlob: Blob | null = null;
  downloadNome = '';

  constructor(private api: ApiService) {}

  get pronto(): boolean {
    if (!this.arquivoTxt) return false;
    if (this.modo === 'xlsx') return !!this.arquivoXlsx;
    return !!(this.csvEcnes || this.csvCnes || this.csvMunicipio || this.csvPrestador || this.csvAviso);
  }

  onTxt(f: File | null) { this.arquivoTxt = f; this.reset(); }
  onXlsx(f: File | null) { this.arquivoXlsx = f; this.reset(); }
  onCsvEcnes(f: File | null) { this.csvEcnes = f; this.reset(); }
  onCsvCnes(f: File | null) { this.csvCnes = f; this.reset(); }
  onCsvMunicipio(f: File | null) { this.csvMunicipio = f; this.reset(); }
  onCsvPrestador(f: File | null) { this.csvPrestador = f; this.reset(); }
  onCsvAviso(f: File | null) { this.csvAviso = f; this.reset(); }

  reset() {
    this.log.set([]);
    this.downloadBlob = null;
    this.estado.set('idle');
  }

  setModo(m: Modo) {
    this.modo = m;
    this.arquivoXlsx = null;
    this.csvEcnes = this.csvCnes = this.csvMunicipio = this.csvPrestador = this.csvAviso = null;
    this.reset();
  }

  addLog(msg: string, tipo: LogEntry['tipo'] = 'info') {
    this.log.update(l => [...l, { msg, tipo }]);
  }

  executar() {
    if (!this.pronto) return;
    this.estado.set('processando');
    this.progresso.set(0);
    this.log.set([]);
    this.addLog(`Arquivo TXT: ${this.arquivoTxt!.name}`, 'info');

    const form = new FormData();
    form.append('txt', this.arquivoTxt!);
    form.append('modo', this.modo);

    if (this.modo === 'xlsx') {
      form.append('xlsx', this.arquivoXlsx!);
      this.addLog(`Arquivo XLSX: ${this.arquivoXlsx!.name}`, 'info');
    } else {
      const csvs: [string, File | null][] = [
        ['ecnes', this.csvEcnes], ['cnes', this.csvCnes],
        ['municipio', this.csvMunicipio], ['prestador', this.csvPrestador],
        ['aviso', this.csvAviso],
      ];
      csvs.forEach(([key, f]) => {
        if (f) { form.append(key, f); this.addLog(`CSV ${key}: ${f.name}`, 'info'); }
      });
    }

    this.api.upload('ans/corretor-rede', form).subscribe({
      next: (event: any) => {
        if (event.type === HttpEventType.UploadProgress && event.total) {
          this.progresso.set(Math.round(100 * event.loaded / event.total));
        }
        if (event.type === HttpEventType.Response) {
          this.downloadBlob = event.body as Blob;
          this.downloadNome = this.arquivoTxt!.name.replace('.txt', '') + '_filtrado.txt';
          this.addLog('Filtro concluído com sucesso!', 'ok');
          this.addLog(`Arquivo pronto para download: ${this.downloadNome}`, 'ok');
          this.estado.set('sucesso');
        }
      },
      error: () => {
        this.addLog('Erro: backend não conectado (localhost:8080).', 'error');
        this.addLog('Inicie o servidor Spring Boot e tente novamente.', 'warn');
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
