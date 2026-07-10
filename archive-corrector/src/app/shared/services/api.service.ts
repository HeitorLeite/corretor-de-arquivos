import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class ApiService {
  readonly baseUrl = environment.apiUrl;

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
