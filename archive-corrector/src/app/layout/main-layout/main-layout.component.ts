import { Component, signal } from '@angular/core';
import { RouterOutlet, Router, NavigationEnd } from '@angular/router';
import { SidebarComponent } from '../sidebar/sidebar.component';
import { NgClass, NgIf } from '@angular/common';
import { filter } from 'rxjs/operators';

@Component({
  selector: 'app-main-layout',
  standalone: true,
  imports: [RouterOutlet, SidebarComponent, NgClass, NgIf],
  templateUrl: './main-layout.component.html',
  styleUrls: ['./main-layout.component.scss'],
})
export class MainLayoutComponent {
  sidebarOpen = signal(true);
  isHome = signal(true);

  constructor(private router: Router) {
    this.router.events.pipe(filter(e => e instanceof NavigationEnd)).subscribe((e: any) => {
      this.isHome.set(e.urlAfterRedirects === '/' || e.urlAfterRedirects === '');
      // Fecha a sidebar automaticamente ao voltar para home
      if (this.isHome()) this.sidebarOpen.set(false);
      else this.sidebarOpen.set(true);
    });
  }

  toggleSidebar() { this.sidebarOpen.update(v => !v); }
}
