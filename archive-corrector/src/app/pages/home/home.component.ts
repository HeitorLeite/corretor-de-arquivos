import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { NgFor } from '@angular/common';

interface Category {
  id: string;
  label: string;
  tag: string;
  desc: string;
  route: string;
  badgeClass: string;
  accepts: string;
  icon: string;
  ready: boolean;
}

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [NgFor],
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.scss'],
})
export class HomeComponent {
  constructor(private router: Router) {}

  categories: Category[] = [
    {
      id: 'xml',
      label: 'XML',
      tag: 'TISS',
      desc: 'Corrige prefixos incorretos e remove blocos com valorTotal zerado em arquivos XML TISS. Suporta processamento em lote com detecção de guias duplicadas.',
      route: '/xml/ferramentas',
      badgeClass: 'badge-xml',
      accepts: '.xml',
      ready: true,
      icon: `<svg width="28" height="28" viewBox="0 0 28 28" fill="none">
        <path d="M10 8L5 14l5 6M18 8l5 6-5 6M15 5l-3 18" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>`,
    },
    {
      id: 'bi',
      label: 'BI',
      tag: 'Business Intelligence',
      desc: 'Preenche automaticamente a coluna de especialidade médica em planilhas de despesas usando planilha de médicos como referência e mapa TUSS.',
      route: '/bi/especialidade-medica',
      badgeClass: 'badge-bi',
      accepts: '.xlsx / .csv',
      ready: true,
      icon: `<svg width="28" height="28" viewBox="0 0 28 28" fill="none">
        <rect x="3" y="3" width="22" height="22" rx="4" stroke="currentColor" stroke-width="1.5"/>
        <path d="M8 18v-4M13 18v-8M18 18v-6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
      </svg>`,
    },
    {
      id: 'fechamento',
      label: 'Fechamento',
      tag: 'Produção',
      desc: 'Converte a planilha de Eventos para Fechamento da Produção dos Prestadores para o formato CSV esperado pelo sistema.',
      route: '/fechamento/corretor',
      badgeClass: 'badge-fech',
      accepts: '.xlsx → .csv',
      ready: false,
      icon: `<svg width="28" height="28" viewBox="0 0 28 28" fill="none">
        <path d="M5 5h12l6 6v12a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        <path d="M17 5v6h6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        <path d="M8 16h12M8 20h8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
      </svg>`,
    },
    {
      id: 'ans',
      label: 'ANS',
      tag: 'Agência Nac. Saúde',
      desc: 'Filtra arquivos TXT posicionais com base em erros de CNES, CNPJ, Município, Prestador ou Aviso a partir de planilha de referência.',
      route: '/ans/corretor-rede',
      badgeClass: 'badge-ans',
      accepts: '.txt + .xlsx',
      ready: true,
      icon: `<svg width="28" height="28" viewBox="0 0 28 28" fill="none">
        <rect x="3" y="3" width="22" height="22" rx="4" stroke="currentColor" stroke-width="1.5"/>
        <path d="M7 10h14M7 14h9M7 18h6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
      </svg>`,
    },
  ];

  navigate(cat: Category) {
    if (cat.ready) this.router.navigate([cat.route]);
  }
}
