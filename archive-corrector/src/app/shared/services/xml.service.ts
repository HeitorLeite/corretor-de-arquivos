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

export interface ArquivoZip {
  nome: string;
  conteudo: string;
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

  downloadZip(arquivos: ArquivoZip[], filename: string): void {
    if (!arquivos.length) return;

    const blob = this.criarZip(arquivos);
    this.triggerDownload(blob, filename);
  }

  private criarZip(arquivos: ArquivoZip[]): Blob {
    if (arquivos.length > 65535) {
      throw new Error('O lote possui arquivos demais para um ZIP padrão.');
    }

    const encoder = new TextEncoder();
    const registrosLocais: Uint8Array[] = [];
    const registrosCentrais: Uint8Array[] = [];
    const agora = new Date();
    const { dataDos, horaDos } = this.dataHoraDos(agora);
    let deslocamentoLocal = 0;
    let tamanhoCentral = 0;

    for (const arquivo of arquivos) {
      const nomeBytes = encoder.encode(arquivo.nome);
      const conteudoBytes = encoder.encode(arquivo.conteudo);
      const crc = this.crc32(conteudoBytes);

      // Cabeçalho local do arquivo — método 0 (armazenado, sem compressão).
      const local = new Uint8Array(30 + nomeBytes.length + conteudoBytes.length);
      const localView = new DataView(local.buffer);
      localView.setUint32(0, 0x04034b50, true);
      localView.setUint16(4, 20, true);
      localView.setUint16(6, 0x0800, true); // Nome em UTF-8.
      localView.setUint16(8, 0, true);
      localView.setUint16(10, horaDos, true);
      localView.setUint16(12, dataDos, true);
      localView.setUint32(14, crc, true);
      localView.setUint32(18, conteudoBytes.length, true);
      localView.setUint32(22, conteudoBytes.length, true);
      localView.setUint16(26, nomeBytes.length, true);
      localView.setUint16(28, 0, true);
      local.set(nomeBytes, 30);
      local.set(conteudoBytes, 30 + nomeBytes.length);
      registrosLocais.push(local);

      // Entrada correspondente no diretório central.
      const central = new Uint8Array(46 + nomeBytes.length);
      const centralView = new DataView(central.buffer);
      centralView.setUint32(0, 0x02014b50, true);
      centralView.setUint16(4, 20, true);
      centralView.setUint16(6, 20, true);
      centralView.setUint16(8, 0x0800, true);
      centralView.setUint16(10, 0, true);
      centralView.setUint16(12, horaDos, true);
      centralView.setUint16(14, dataDos, true);
      centralView.setUint32(16, crc, true);
      centralView.setUint32(20, conteudoBytes.length, true);
      centralView.setUint32(24, conteudoBytes.length, true);
      centralView.setUint16(28, nomeBytes.length, true);
      centralView.setUint16(30, 0, true);
      centralView.setUint16(32, 0, true);
      centralView.setUint16(34, 0, true);
      centralView.setUint16(36, 0, true);
      centralView.setUint32(38, 0, true);
      centralView.setUint32(42, deslocamentoLocal, true);
      central.set(nomeBytes, 46);
      registrosCentrais.push(central);

      deslocamentoLocal += local.length;
      tamanhoCentral += central.length;
    }

    const fimDiretorio = new Uint8Array(22);
    const fimView = new DataView(fimDiretorio.buffer);
    fimView.setUint32(0, 0x06054b50, true);
    fimView.setUint16(4, 0, true);
    fimView.setUint16(6, 0, true);
    fimView.setUint16(8, arquivos.length, true);
    fimView.setUint16(10, arquivos.length, true);
    fimView.setUint32(12, tamanhoCentral, true);
    fimView.setUint32(16, deslocamentoLocal, true);
    fimView.setUint16(20, 0, true);

    const tamanhoTotal = deslocamentoLocal + tamanhoCentral + fimDiretorio.length;
    const zip = new Uint8Array(tamanhoTotal);
    let cursor = 0;

    for (const registro of registrosLocais) {
      zip.set(registro, cursor);
      cursor += registro.length;
    }

    for (const registro of registrosCentrais) {
      zip.set(registro, cursor);
      cursor += registro.length;
    }

    zip.set(fimDiretorio, cursor);
    return new Blob([zip.buffer], { type: 'application/zip' });
  }

  private dataHoraDos(data: Date): { dataDos: number; horaDos: number } {
    const ano = Math.min(Math.max(data.getFullYear(), 1980), 2107);
    const dataDos = ((ano - 1980) << 9)
      | ((data.getMonth() + 1) << 5)
      | data.getDate();
    const horaDos = (data.getHours() << 11)
      | (data.getMinutes() << 5)
      | Math.floor(data.getSeconds() / 2);

    return { dataDos, horaDos };
  }

  private crc32(bytes: Uint8Array): number {
    let crc = 0xffffffff;

    for (const byte of bytes) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit++) {
        crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
      }
    }

    return (crc ^ 0xffffffff) >>> 0;
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