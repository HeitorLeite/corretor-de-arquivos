import { Injectable } from '@angular/core';

export interface CorretorXmlError {
  position: number;
  original: string;
  corrected: string;
}

export interface CorretorXmlResult {
  errors: CorretorXmlError[];
  correctedContent: string;
}

export interface RemovedorBlock {
  dataExecucao: string;
  tabelaProcedimento: string;
  descricao: string;
  valorTotal: string;
}

export interface RemovedorResult {
  blocks: RemovedorBlock[];
  correctedContent: string;
}

@Injectable({ providedIn: 'root' })
export class XmlService {

  readFile(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = e => resolve(e.target!.result as string);
      reader.onerror = () => reject(new Error('Erro ao ler arquivo'));
      reader.readAsText(file, 'utf-8');
    });
  }

  /* ── Corretor XML ── */
  analisarCorretor(content: string): CorretorXmlResult {
    const pattern = /(<ans:codigoTabela>00<\/ans:codigoTabela>\s*<ans:codigoProcedimento>)(18|19|20)(\d+)(<\/ans:codigoProcedimento>)/g;
    const errors: CorretorXmlError[] = [];
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(content)) !== null) {
      errors.push({
        position: match.index,
        original: match[2] + match[3],
        corrected: match[3],
      });
    }

    const correctedContent = content.replace(
      /(<ans:codigoTabela>00<\/ans:codigoTabela>\s*<ans:codigoProcedimento>)(18|19|20)(\d+)(<\/ans:codigoProcedimento>)/g,
      (_full, g1, _prefix, code, g4) => g1 + code + g4
    );

    return { errors, correctedContent };
  }

  /* ── Removedor de Blocos ── */
  analisarRemovedor(content: string): RemovedorResult {
    const blockPattern = /<ans:despesa>[\s\S]*?<\/ans:despesa>/g;
    const valorPattern = /<ans:valorTotal>(0+\.?0*)<\/ans:valorTotal>/;
    const blocks: RemovedorBlock[] = [];
    let match: RegExpExecArray | null;

    while ((match = blockPattern.exec(content)) !== null) {
      const bloco = match[0];
      const vm = valorPattern.exec(bloco);
      if (vm && parseFloat(vm[1]) === 0) {
        const tabela = this.tag(bloco, 'ans:codigoTabela');
        const proc   = this.tag(bloco, 'ans:codigoProcedimento');
        blocks.push({
          dataExecucao:  this.tag(bloco, 'ans:dataExecucao'),
          tabelaProcedimento: `${tabela} / ${proc}`,
          descricao:     this.tag(bloco, 'ans:descricaoProcedimento'),
          valorTotal:    vm[1],
        });
      }
    }

    const correctedContent = content
      .replace(/<ans:despesa>[\s\S]*?<\/ans:despesa>/g, (bloco) => {
        const vm = valorPattern.exec(bloco);
        return (vm && parseFloat(vm[1]) === 0) ? '' : bloco;
      })
      .replace(/\n\s*\n/g, '\n');

    return { blocks, correctedContent };
  }

  private tag(text: string, tagName: string): string {
    const m = new RegExp(`<${tagName}>(.*?)<\\/${tagName}>`, 's').exec(text);
    return m ? m[1].trim() : '—';
  }

  downloadXml(content: string, filename: string): void {
    const blob = new Blob([content], { type: 'application/xml;charset=utf-8' });
    this.triggerDownload(blob, filename);
  }

  downloadCsv(content: string, filename: string): void {
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
    this.triggerDownload(blob, filename);
  }

  private triggerDownload(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}
