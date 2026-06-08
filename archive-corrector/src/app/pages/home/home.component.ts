import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgFor } from '@angular/common';

interface Tool {
  title: string;
  desc: string;
  route: string;
  category: string;
  badgeClass: string;
  accepts: string;
  icon: string;
}

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [RouterLink, NgFor],
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.scss'],
})
export class HomeComponent {
  tools: Tool[] = [
    {
      category: 'ANS',
      badgeClass: 'badge-ans',
      title: 'Corretor de Rede',
      desc: 'Filtra arquivos TXT posicionais com base em erros de CNES, CNPJ, Município, Prestador ou Aviso a partir de planilha XLSX ou CSVs individuais.',
      route: '/ans/corretor-rede',
      accepts: '.txt + .xlsx / .csv',
      icon: `<svg width="22" height="22" viewBox="0 0 22 22" fill="none">
        <rect x="2" y="2" width="18" height="18" rx="4" stroke="currentColor" stroke-width="1.4"/>
        <path d="M6 8h10M6 11h7M6 14h5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
      </svg>`,
    },
    {
      category: 'BI',
      badgeClass: 'badge-bi',
      title: 'Especialidade Médica',
      desc: 'Preenche automaticamente a coluna de especialidade médica em planilhas de despesas, usando tabela de referência de médicos e mapa TUSS.',
      route: '/bi/especialidade-medica',
      accepts: '.xlsx (despesas + médicos)',
      icon: `<svg width="22" height="22" viewBox="0 0 22 22" fill="none">
        <path d="M11 3v16M3 11h16" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
        <rect x="2" y="2" width="18" height="18" rx="4" stroke="currentColor" stroke-width="1.4"/>
      </svg>`,
    },
    {
      category: 'Fechamento',
      badgeClass: 'badge-fech',
      title: 'Corretor de Fechamento',
      desc: 'Converte a planilha de Eventos para Fechamento da Produção dos Prestadores (Excel) para o formato CSV esperado pelo sistema.',
      route: '/fechamento/corretor',
      accepts: '.xlsx → .csv',
      icon: `<svg width="22" height="22" viewBox="0 0 22 22" fill="none">
        <path d="M4 4h9l5 5v9a2 2 0 01-2 2H4a2 2 0 01-2-2V6a2 2 0 012-2z" stroke="currentColor" stroke-width="1.4"/>
        <path d="M13 4v5h5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
        <path d="M7 13h8M7 16h5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
      </svg>`,
    },
    {
      category: 'XML',
      badgeClass: 'badge-xml',
      title: 'Ferramentas XML',
      desc: 'Corretor TISS e Removedor de Blocos',
      route: '/xml/corretor',
      accepts: '.xml',
      icon: `<svg width="22" height="22" viewBox="0 0 22 22" fill="none">
        <path d="M8 6L4 11l4 5M14 6l4 5-4 5M12 4l-2 14" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>`,
    },
  ];
}
