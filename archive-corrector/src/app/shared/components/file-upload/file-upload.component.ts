import { Component, Input, Output, EventEmitter, ViewChild, ElementRef } from '@angular/core';
import { NgIf } from '@angular/common';

@Component({
  selector: 'app-file-upload',
  standalone: true,
  imports: [NgIf],
  templateUrl: './file-upload.component.html',
  styleUrls: ['./file-upload.component.scss'],
})
export class FileUploadComponent {
  @Input() accept = '*';
  @Input() label = 'Selecionar arquivo';
  @Input() hint = '';
  @Input() disabled = false;
  @Output() fileSelected = new EventEmitter<File | null>();
  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;

  file: File | null = null;
  dragOver = false;

  onDragOver(e: DragEvent) {
    e.preventDefault();
    if (!this.disabled) this.dragOver = true;
  }

  onDragLeave() { this.dragOver = false; }

  onDrop(e: DragEvent) {
    e.preventDefault();
    this.dragOver = false;
    if (this.disabled) return;
    const f = e.dataTransfer?.files[0];
    if (f) this.setFile(f);
  }

  onClick() {
    if (!this.disabled) this.fileInput.nativeElement.click();
  }

  onFileChange(e: Event) {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (f) this.setFile(f);
    (e.target as HTMLInputElement).value = '';
  }

  setFile(f: File) {
    this.file = f;
    this.fileSelected.emit(f);
  }

  clear(e: MouseEvent) {
    e.stopPropagation();
    this.file = null;
    this.fileSelected.emit(null);
  }

  formatSize(bytes: number): string {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }
}
