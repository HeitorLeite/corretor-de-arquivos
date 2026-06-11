import { Component, Input, Output, EventEmitter } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { NgFor, NgIf } from '@angular/common';

interface NavItem {
  label: string;
  route: string;
  tag: string;
  badgeClass: string;
  ready: boolean;
}

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, NgFor, NgIf],
  templateUrl: './sidebar.component.html',
  styleUrls: ['./sidebar.component.scss'],
})
export class SidebarComponent {
  @Input() open = true;
  @Output() toggleSidebar = new EventEmitter<void>();

  items: NavItem[] = [
    { label: 'XML',        tag: 'TISS',                  badgeClass: 'cat-xml',        route: '/xml/ferramentas',       ready: true  },
    { label: 'BI',         tag: 'Business Intelligence',  badgeClass: 'cat-bi',         route: '/bi/especialidade-medica', ready: true },
    { label: 'Fechamento', tag: 'Produção',               badgeClass: 'cat-fechamento', route: '/fechamento/corretor',   ready: false },
    { label: 'ANS', tag: 'Agência Nac. Saúde', badgeClass: 'cat-ans', route: '/ans/corretor-rede', ready: true },
  ];
}
