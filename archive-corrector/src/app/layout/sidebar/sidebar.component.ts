import { Component, Input, Output, EventEmitter } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { NgFor, NgClass, NgIf } from '@angular/common';

interface NavItem {
  label: string;
  route: string;
  desc: string;
}

interface NavCategory {
  id: string;
  label: string;
  tag: string;
  colorClass: string;
  items: NavItem[];
  expanded: boolean;
}

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, NgFor, NgClass, NgIf],
  templateUrl: './sidebar.component.html',
  styleUrls: ['./sidebar.component.scss'],
})
export class SidebarComponent {
  @Input() open = true;
  @Output() toggleSidebar = new EventEmitter<void>();

  categories: NavCategory[] = [
    {
      id: 'ans',
      label: 'ANS',
      tag: 'Agência Nac. Saúde',
      colorClass: 'cat-ans',
      expanded: true,
      items: [
        { label: 'Corretor de Rede', route: '/ans/corretor-rede', desc: '.txt + .xlsx' },
      ],
    },
    {
      id: 'bi',
      label: 'BI',
      tag: 'Business Intelligence',
      colorClass: 'cat-bi',
      expanded: true,
      items: [
        { label: 'Especialidade Médica', route: '/bi/especialidade-medica', desc: '.xlsx' },
      ],
    },
    {
      id: 'fechamento',
      label: 'Fechamento',
      tag: 'Produção',
      colorClass: 'cat-fechamento',
      expanded: true,
      items: [
        { label: 'Corretor de Fechamento', route: '/fechamento/corretor', desc: '.xlsx → .csv' },
      ],
    },
    {
      id: 'xml',
      label: 'XML',
      tag: 'TISS',
      colorClass: 'cat-xml',
      expanded: true,
      items: [
        { label: 'Corretor XML', route: '/xml/corretor', desc: '.xml' },
        { label: 'Removedor de Blocos', route: '/xml/removedor', desc: '.xml' },
      ],
    },
  ];

  toggleCategory(cat: NavCategory) {
    cat.expanded = !cat.expanded;
  }
}
