import { Injectable } from '@angular/core';
import { HttpClient, HttpEventType } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class ApiService {
  readonly baseUrl = 'http://localhost:8080/api';

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
