import { Component, EventEmitter, Input, Output } from '@angular/core';

@Component({
  selector: 'app-relatorios-inicio',
  standalone: true,
  templateUrl: './relatorios-inicio.component.html',
  styleUrls: ['./relatorios-inicio.component.scss'],
})
export class RelatoriosInicioComponent {
  @Input() quantidadeRelatorios = 0;
  @Input() quantidadeGrupos = 0;

  @Output() escolherManual = new EventEmitter<void>();
  @Output() escolherAutomatico = new EventEmitter<void>();
}
