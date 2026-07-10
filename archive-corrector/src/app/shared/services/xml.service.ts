import { Injectable } from '@angular/core';

export interface CorretorXmlError {
  position: number;
  original: string;
  corrected: string;
}

export interface RemovedorBlock {
  dataExecucao: string;
  tabelaProcedimento: string;
  descricao: string;
  valorTotal: string;
}

export interface OutrasDespesasVazia {
  position: number;
  linha: number;
  coluna: number;
  numeroGuia: string;
  original: string;
}

export interface ArquivoResultado {
  nome: string;
  prefixos: CorretorXmlError[];
  blocos: RemovedorBlock[];
  outrasDespesasVazias: OutrasDespesasVazia[];
  guiasRenomeadas: { original: string; novo: string }[];
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

  async processarLote(
    files: File[],
    fazerCorretor: boolean,
    fazerRemovedor: boolean
  ): Promise<ArquivoResultado[]> {
    // 1. Lê todos os conteúdos
    const conteudos: string[] = await Promise.all(files.map(f => this.readFile(f)));

    // 2. Mapeia frequência global de guias entre todos os arquivos
    const P_GUIA = /<ans:numeroGuiaPrestador>\s*(.*?)\s*<\/ans:numeroGuiaPrestador>/g;
    const freq: Map<string, number> = new Map();

    for (const c of conteudos) {
      const guias = new Set<string>();
      let m: RegExpExecArray | null;
      const re = new RegExp(P_GUIA.source, 'g');
      while ((m = re.exec(c)) !== null) guias.add(m[1]);
      for (const g of guias) freq.set(g, (freq.get(g) ?? 0) + 1);
    }

    const duplicadas = new Set(
      [...freq.entries()].filter(([, v]) => v > 1).map(([k]) => k)
    );
    const sufixos: Map<string, number> = new Map();

    // 3. Processa cada arquivo
    const resultados: ArquivoResultado[] = [];

    for (let i = 0; i < files.length; i++) {
      let content = conteudos[i];
      const guiasRenomeadas: { original: string; novo: string }[] = [];
      const prefixos: CorretorXmlError[] = [];
      const blocos: RemovedorBlock[] = [];
      const outrasDespesasVazias: OutrasDespesasVazia[] = [];

      // 3a. Renomear guias duplicadas
      const guiasNoArquivo = new Set<string>();
      const reG = new RegExp(P_GUIA.source, 'g');
      let mg: RegExpExecArray | null;
      while ((mg = reG.exec(content)) !== null) guiasNoArquivo.add(mg[1]);

      for (const guia of guiasNoArquivo) {
        if (duplicadas.has(guia)) {
          const idx = sufixos.get(guia) ?? 0;
          const sufixo = String.fromCharCode(97 + idx); // a, b, c...
          const novo = `${guia}${sufixo}`;
          sufixos.set(guia, idx + 1);

          // Substitui todas as ocorrências exatas da guia
          content = content.replaceAll(
            `<ans:numeroGuiaPrestador>${guia}</ans:numeroGuiaPrestador>`,
            `<ans:numeroGuiaPrestador>${novo}</ans:numeroGuiaPrestador>`
          );
          guiasRenomeadas.push({ original: guia, novo });
        }
      }

      // 3b. Corretor de prefixo
      if (fazerCorretor) {
        const P = /(<ans:codigoTabela>00<\/ans:codigoTabela>\s*<ans:codigoProcedimento>)(18|19|20)(\d+)(<\/ans:codigoProcedimento>)/g;
        let m2: RegExpExecArray | null;

        while ((m2 = P.exec(content)) !== null) {
          prefixos.push({
            position: m2.index,
            original: m2[2] + m2[3],
            corrected: m2[3],
          });
        }

        content = content.replace(
          /(<ans:codigoTabela>00<\/ans:codigoTabela>\s*<ans:codigoProcedimento>)(18|19|20)(\d+)(<\/ans:codigoProcedimento>)/g,
          (_f, g1, _p, code, g4) => g1 + code + g4
        );
      }

      // 3c. Removedor de despesas zeradas e de outrasDespesas vazias
      if (fazerRemovedor) {
        const BP = /<ans:despesa>[\s\S]*?<\/ans:despesa>/g;
        const VP = /<ans:valorTotal>(0+\.?0*)<\/ans:valorTotal>/;
        let mb: RegExpExecArray | null;

        while ((mb = BP.exec(content)) !== null) {
          const bloco = mb[0];
          const vm = VP.exec(bloco);

          if (vm && parseFloat(vm[1]) === 0) {
            blocos.push({
              dataExecucao: this.tag(bloco, 'ans:dataExecucao'),
              tabelaProcedimento: `${this.tag(bloco, 'ans:codigoTabela')} / ${this.tag(bloco, 'ans:codigoProcedimento')}`,
              descricao: this.tag(bloco, 'ans:descricaoProcedimento'),
              valorTotal: vm[1],
            });
          }
        }

        content = content.replace(
          /<ans:despesa>[\s\S]*?<\/ans:despesa>/g,
          bloco => {
            const vm = VP.exec(bloco);
            return vm && parseFloat(vm[1]) === 0 ? '' : bloco;
          }
        );

        // Depois de remover despesas zeradas, o contêiner pode ficar vazio.
        // Também identifica tags que já chegaram vazias, nas formas:
        // <ans:outrasDespesas/> e <ans:outrasDespesas></ans:outrasDespesas>.
        outrasDespesasVazias.push(...this.encontrarOutrasDespesasVazias(content));
        content = this.removerOutrasDespesasVazias(content);
        content = content.replace(/\n\s*\n/g, '\n');
      }

      resultados.push({
        nome: files[i].name,
        prefixos,
        blocos,
        outrasDespesasVazias,
        guiasRenomeadas,
        correctedContent: content,
      });
    }

    return resultados;
  }

  private outrasDespesasVaziasPattern(): RegExp {
    // As duas primeiras alternativas removem também a linha quando a tag está sozinha.
    // As duas últimas garantem o funcionamento em XML minificado em uma única linha.
    return /(^[ \t]*<ans:outrasDespesas\b[^>]*\/\s*>[ \t]*(?:\r?\n|$))|(^[ \t]*<ans:outrasDespesas\b[^>]*>\s*<\/ans:outrasDespesas\s*>[ \t]*(?:\r?\n|$))|(<ans:outrasDespesas\b[^>]*\/\s*>)|(<ans:outrasDespesas\b[^>]*>\s*<\/ans:outrasDespesas\s*>)/gm;
  }

  private encontrarOutrasDespesasVazias(content: string): OutrasDespesasVazia[] {
    const encontradas: OutrasDespesasVazia[] = [];
    const pattern = this.outrasDespesasVaziasPattern();
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(content)) !== null) {
      const tagOffset = Math.max(match[0].indexOf('<ans:outrasDespesas'), 0);
      const position = match.index + tagOffset;
      const { linha, coluna } = this.linhaEColuna(content, position);

      encontradas.push({
        position,
        linha,
        coluna,
        numeroGuia: this.numeroGuiaAnterior(content, position),
        original: match[0].trim().replace(/\s+/g, ' '),
      });
    }

    return encontradas;
  }

  private removerOutrasDespesasVazias(content: string): string {
    return content.replace(this.outrasDespesasVaziasPattern(), '');
  }

  private linhaEColuna(text: string, position: number): { linha: number; coluna: number } {
    const antes = text.slice(0, position);
    const linhas = antes.split(/\r\n|\r|\n/);
    return {
      linha: linhas.length,
      coluna: (linhas[linhas.length - 1]?.length ?? 0) + 1,
    };
  }

  private numeroGuiaAnterior(text: string, position: number): string {
    const trecho = text.slice(0, position);
    const pattern = /<ans:numeroGuiaPrestador>\s*(.*?)\s*<\/ans:numeroGuiaPrestador>/g;
    let match: RegExpExecArray | null;
    let numeroGuia = '—';

    while ((match = pattern.exec(trecho)) !== null) numeroGuia = match[1].trim();
    return numeroGuia;
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

  // Interfaces legadas mantidas para compatibilidade com outros módulos
  analisarCorretor(content: string): { errors: CorretorXmlError[]; correctedContent: string } {
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
      (_f, g1, _p, code, g4) => g1 + code + g4
    );

    return { errors, correctedContent };
  }

  analisarRemovedor(content: string): { blocks: RemovedorBlock[]; correctedContent: string } {
    const blockPattern = /<ans:despesa>[\s\S]*?<\/ans:despesa>/g;
    const valorPattern = /<ans:valorTotal>(0+\.?0*)<\/ans:valorTotal>/;
    const blocks: RemovedorBlock[] = [];
    let match: RegExpExecArray | null;

    while ((match = blockPattern.exec(content)) !== null) {
      const bloco = match[0];
      const vm = valorPattern.exec(bloco);

      if (vm && parseFloat(vm[1]) === 0) {
        blocks.push({
          dataExecucao: this.tag(bloco, 'ans:dataExecucao'),
          tabelaProcedimento: `${this.tag(bloco, 'ans:codigoTabela')} / ${this.tag(bloco, 'ans:codigoProcedimento')}`,
          descricao: this.tag(bloco, 'ans:descricaoProcedimento'),
          valorTotal: vm[1],
        });
      }
    }

    let correctedContent = content.replace(
      /<ans:despesa>[\s\S]*?<\/ans:despesa>/g,
      bloco => {
        const vm = valorPattern.exec(bloco);
        return vm && parseFloat(vm[1]) === 0 ? '' : bloco;
      }
    );

    correctedContent = this.removerOutrasDespesasVazias(correctedContent)
      .replace(/\n\s*\n/g, '\n');

    return { blocks, correctedContent };
  }
}