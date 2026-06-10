import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./layout/main-layout/main-layout.component').then(m => m.MainLayoutComponent),
    children: [
      { path: '', loadComponent: () => import('./pages/home/home.component').then(m => m.HomeComponent) },
      { path: 'xml/ferramentas', loadComponent: () => import('./pages/xml/xml-tools/xml-tools.component').then(m => m.XmlToolsComponent) },
      { path: 'fechamento/corretor', loadComponent: () => import('./pages/fechamento/corretor-fechamento/corretor-fechamento.component').then(m => m.CorretorFechamentoComponent) },
      { path: 'ans/corretor-rede', loadComponent: () => import('./pages/ans/corretor-rede/corretor-rede.component').then(m => m.CorretorRedeComponent) },
      { path: 'bi/especialidade-medica', loadComponent: () => import('./pages/bi/especialidade-medica/especialidade-medica.component').then(m => m.EspecialidadeMedicaComponent) },
      { path: 'xml/corretor', redirectTo: 'xml/ferramentas' },
      { path: 'xml/removedor', redirectTo: 'xml/ferramentas' },
    ],
  },
  { path: '**', redirectTo: '' },
];
