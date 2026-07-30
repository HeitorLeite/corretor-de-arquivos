import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, map } from 'rxjs';

import { environment } from '../../../environments/environment';
import {
  FormatoExportacao,
  RelatorioCatalogo,
  SguApiDefinicao,
  SguListaResponse,
  SguResultado,
} from '../models/relatorio.model';

@Injectable({ providedIn: 'root' })
export class RelatorioService {
  private readonly baseUrl = `${environment.apiUrl}/relatorios`;
  private readonly storageKey = 'unimed-tools.relatorios.v1';

  constructor(private readonly http: HttpClient) {}

  listarCatalogo(): RelatorioCatalogo[] {
    if (typeof localStorage === 'undefined') return [];

    try {
      const salvo = localStorage.getItem(this.storageKey);
      return salvo ? (JSON.parse(salvo) as RelatorioCatalogo[]) : [];
    } catch {
      return [];
    }
  }

  salvarCatalogo(relatorios: RelatorioCatalogo[]): void {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(this.storageKey, JSON.stringify(relatorios));
    }
  }

  buscarApi(nome: string): Observable<SguApiDefinicao> {
    const nomeNormalizado = nome.trim();

    return this.http
      .post<SguListaResponse>(`${this.baseUrl}/sgu/listar`, {
        nome: nomeNormalizado,
      })
      .pipe(
        map(resposta => {
          const conteudo = Array.isArray(resposta?.content)
            ? resposta.content
            : [];

          const encontrada =
            conteudo.find(
              api =>
                api.nome?.toLowerCase() === nomeNormalizado.toLowerCase()
            ) ?? conteudo[0];

          if (!encontrada) {
            throw new Error(
              `A API ${nomeNormalizado} não foi encontrada no SGU.`
            );
          }

          return encontrada;
        })
      );
  }

  listarApis(): Observable<SguApiDefinicao[]> {
    return this.http
      .post<SguListaResponse>(`${this.baseUrl}/sgu/listar`, { nome: '' })
      .pipe(
        map(resposta =>
          Array.isArray(resposta?.content) ? resposta.content : []
        )
      );
  }

  criarApi(definicao: SguApiDefinicao): Observable<unknown> {
    return this.http.post(`${this.baseUrl}/sgu/criar`, definicao);
  }

  apagarApi(nome: string): Observable<unknown> {
    return this.http.delete(
      `${this.baseUrl}/sgu/${encodeURIComponent(nome)}`
    );
  }

  executar(
    nome: string,
    parametros: Record<string, unknown>
  ): Observable<SguResultado> {
    return this.http.post<SguResultado>(
      `${this.baseUrl}/sgu/executar/${encodeURIComponent(nome)}`,
      parametros
    );
  }

  exportar(
    nome: string,
    formato: FormatoExportacao,
    filtros: Record<string, unknown>,
    nomeArquivo: string
  ): Observable<Blob> {
    return this.http.post(
      `${this.baseUrl}/sgu/exportar/${encodeURIComponent(
        nome
      )}?formato=${formato}`,
      { filtros, nomeArquivo },
      { responseType: 'blob' }
    );
  }
}