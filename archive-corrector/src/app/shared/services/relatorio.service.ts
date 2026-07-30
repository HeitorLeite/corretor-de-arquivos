import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, map } from 'rxjs';

import { environment } from '../../../environments/environment';
import {
  FormatoExportacao,
  RelatorioCatalogo,
  RelatorioTemplate,
  SguApiDefinicao,
  SguListaResponse,
  SguResultado,
} from '../models/relatorio.model';

@Injectable({ providedIn: 'root' })
export class RelatorioService {
  private readonly baseUrl = `${environment.apiUrl}/relatorios`;
  private readonly storageKey = 'unimed-tools.relatorios.v1';
  private readonly templateStorageKey = 'unimed-tools.relatorios.templates.v1';

  constructor(private readonly http: HttpClient) {}

  listarCatalogo(): RelatorioCatalogo[] {
    return this.lerLocalStorage<RelatorioCatalogo[]>(this.storageKey, []);
  }

  salvarCatalogo(relatorios: RelatorioCatalogo[]): void {
    this.salvarLocalStorage(this.storageKey, relatorios);
  }

  listarTemplates(): RelatorioTemplate[] {
    return this.lerLocalStorage<RelatorioTemplate[]>(
      this.templateStorageKey,
      []
    );
  }

  salvarTemplates(templates: RelatorioTemplate[]): void {
    this.salvarLocalStorage(this.templateStorageKey, templates);
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

  private lerLocalStorage<T>(chave: string, padrao: T): T {
    if (typeof localStorage === 'undefined') return padrao;

    try {
      const salvo = localStorage.getItem(chave);
      return salvo ? (JSON.parse(salvo) as T) : padrao;
    } catch {
      return padrao;
    }
  }

  private salvarLocalStorage(chave: string, valor: unknown): void {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(chave, JSON.stringify(valor));
  }
}