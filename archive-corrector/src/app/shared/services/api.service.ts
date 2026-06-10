import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class ApiService {

  // Sempre relativo — o proxy do Angular encaminha /api/* para localhost:8080
  readonly baseUrl = '/api';

  constructor(private http: HttpClient) {}

  upload(endpoint: string, formData: FormData): Observable<any> {
    return this.http.post(`${this.baseUrl}/${endpoint}`, formData, {
      responseType: 'blob',
      reportProgress: true,
      observe: 'events',
    });
  }

  isBackendOnline(): Observable<any> {
    return this.http.get(`${this.baseUrl}/health`);
  }
}
