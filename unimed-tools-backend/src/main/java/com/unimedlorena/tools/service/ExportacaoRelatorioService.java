package com.unimedlorena.tools.service;

import com.unimedlorena.tools.dto.RelatorioExportacaoRequest;
import org.apache.commons.csv.CSVFormat;
import org.apache.commons.csv.CSVPrinter;
import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.CellStyle;
import org.apache.poi.ss.usermodel.Font;
import org.apache.poi.ss.usermodel.IndexedColors;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.FillPatternType;
import org.apache.poi.xssf.streaming.SXSSFWorkbook;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.io.OutputStreamWriter;
import java.io.Writer;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;

@Service
public class ExportacaoRelatorioService {

    public record Arquivo(byte[] conteudo, String contentType, String extensao) {}

    private final SguRelatorioService sgu;
    private final int tamanhoLote;
    private final int maximoPaginas;

    public ExportacaoRelatorioService(
            SguRelatorioService sgu,
            @Value("${sgu.api.export.page-size:1000}") int tamanhoLote,
            @Value("${sgu.api.export.max-pages:1000}") int maximoPaginas) {
        this.sgu = sgu;
        this.tamanhoLote = Math.max(1, tamanhoLote);
        this.maximoPaginas = Math.max(1, maximoPaginas);
    }

    public Arquivo exportar(
            String apiNome,
            String formato,
            RelatorioExportacaoRequest request) throws IOException {
        List<LinkedHashMap<String, Object>> registros = carregarRegistros(
            apiNome,
            request == null ? null : request.filtros()
        );
        return gerarArquivo(formato, registros);
    }

    /**
     * Carrega todas as páginas de uma API do SGU. O método é público para que
     * a exportação em lote possa reunir vários valores do mesmo filtro em um
     * único arquivo final.
     */
    public List<LinkedHashMap<String, Object>> carregarRegistros(
            String apiNome,
            Map<String, Object> filtros) {
        List<LinkedHashMap<String, Object>> todos = new ArrayList<>();
        String assinaturaAnterior = null;

        for (int pagina = 1; pagina <= maximoPaginas; pagina++) {
            Map<String, Object> parametros = new LinkedHashMap<>();
            if (filtros != null) parametros.putAll(filtros);
            parametros.put("page", pagina);
            parametros.put("size", tamanhoLote);

            Map<String, Object> resposta = sgu.executar(apiNome, parametros);
            List<LinkedHashMap<String, Object>> lote = extrairRegistros(
                resposta.get("content")
            );

            if (lote.isEmpty()) break;

            String assinatura = assinatura(lote);
            if (pagina > 1 && assinatura.equals(assinaturaAnterior)) {
                throw new IllegalStateException(
                    "A API repetiu a mesma página durante a exportação. " +
                    "Verifique a paginação do endpoint."
                );
            }

            assinaturaAnterior = assinatura;
            todos.addAll(lote);

            if (Boolean.TRUE.equals(resposta.get("last")) ||
                    lote.size() < tamanhoLote) {
                break;
            }
        }

        if (todos.size() >= (long) tamanhoLote * maximoPaginas) {
            throw new IllegalStateException(
                "O relatório atingiu o limite de páginas configurado no backend."
            );
        }

        return todos;
    }

    /**
     * Converte uma lista já carregada no formato solicitado.
     */
    public Arquivo gerarArquivo(
            String formato,
            List<LinkedHashMap<String, Object>> registros) throws IOException {
        String tipo = formato == null
            ? "xlsx"
            : formato.toLowerCase(Locale.ROOT);

        List<LinkedHashMap<String, Object>> dados = registros == null
            ? List.of()
            : registros;

        return switch (tipo) {
            case "csv" -> new Arquivo(
                gerarCsv(dados, ';'),
                "text/csv; charset=UTF-8",
                "csv"
            );
            case "txt" -> new Arquivo(
                gerarTxt(dados),
                "text/plain; charset=UTF-8",
                "txt"
            );
            case "xlsx" -> new Arquivo(
                gerarXlsx(dados),
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                "xlsx"
            );
            default -> throw new IllegalArgumentException(
                "Formato inválido. Use csv, txt ou xlsx."
            );
        };
    }

    private List<LinkedHashMap<String, Object>> extrairRegistros(Object content) {
        if (!(content instanceof List<?> lista)) return List.of();

        List<LinkedHashMap<String, Object>> registros = new ArrayList<>();
        for (Object item : lista) {
            if (item instanceof Map<?, ?> mapa) {
                LinkedHashMap<String, Object> registro = new LinkedHashMap<>();
                mapa.forEach(
                    (chave, valor) -> registro.put(String.valueOf(chave), valor)
                );
                registros.add(registro);
            }
        }
        return registros;
    }

    private String assinatura(List<LinkedHashMap<String, Object>> lote) {
        return lote.size() + "|" + lote.get(0) + "|" + lote.get(lote.size() - 1);
    }

    private byte[] gerarCsv(
            List<LinkedHashMap<String, Object>> registros,
            char delimitador) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        escreverBom(out);

        try (
            Writer writer = new OutputStreamWriter(out, StandardCharsets.UTF_8);
            CSVPrinter printer = new CSVPrinter(
                writer,
                CSVFormat.DEFAULT.builder()
                    .setDelimiter(delimitador)
                    .setRecordSeparator("\r\n")
                    .build()
            )
        ) {
            List<String> colunas = colunas(registros);
            if (!colunas.isEmpty()) printer.printRecord(colunas);

            for (Map<String, Object> registro : registros) {
                printer.printRecord(
                    colunas.stream()
                        .map(coluna -> texto(registro.get(coluna)))
                        .toList()
                );
            }
        }

        return out.toByteArray();
    }

    private byte[] gerarTxt(
            List<LinkedHashMap<String, Object>> registros) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        escreverBom(out);

        try (Writer writer = new OutputStreamWriter(out, StandardCharsets.UTF_8)) {
            List<String> colunas = colunas(registros);
            writer.write(String.join("\t", colunas));
            writer.write("\r\n");

            for (Map<String, Object> registro : registros) {
                for (int i = 0; i < colunas.size(); i++) {
                    if (i > 0) writer.write('\t');
                    writer.write(
                        texto(registro.get(colunas.get(i)))
                            .replace('\t', ' ')
                            .replace('\n', ' ')
                            .replace('\r', ' ')
                    );
                }
                writer.write("\r\n");
            }
        }

        return out.toByteArray();
    }

    private byte[] gerarXlsx(
            List<LinkedHashMap<String, Object>> registros) throws IOException {
        try (SXSSFWorkbook workbook = new SXSSFWorkbook(100)) {
            workbook.setCompressTempFiles(true);
            Sheet sheet = workbook.createSheet("Relatório");
            sheet.createFreezePane(0, 1);

            List<String> colunas = colunas(registros);
            CellStyle cabecalho = workbook.createCellStyle();
            Font fonte = workbook.createFont();
            fonte.setBold(true);
            cabecalho.setFont(fonte);
            cabecalho.setFillForegroundColor(
                IndexedColors.GREY_25_PERCENT.getIndex()
            );
            cabecalho.setFillPattern(FillPatternType.SOLID_FOREGROUND);

            Row header = sheet.createRow(0);
            for (int i = 0; i < colunas.size(); i++) {
                Cell cell = header.createCell(i);
                cell.setCellValue(colunas.get(i));
                cell.setCellStyle(cabecalho);
                sheet.setColumnWidth(
                    i,
                    Math.min(60, Math.max(12, colunas.get(i).length() + 3)) * 256
                );
            }

            int indiceLinha = 1;
            for (Map<String, Object> registro : registros) {
                Row row = sheet.createRow(indiceLinha++);
                for (int i = 0; i < colunas.size(); i++) {
                    preencherCelula(
                        row.createCell(i),
                        registro.get(colunas.get(i))
                    );
                }
            }

            if (!colunas.isEmpty()) {
                sheet.setAutoFilter(
                    new org.apache.poi.ss.util.CellRangeAddress(
                        0,
                        Math.max(0, indiceLinha - 1),
                        0,
                        colunas.size() - 1
                    )
                );
            }

            ByteArrayOutputStream out = new ByteArrayOutputStream();
            workbook.write(out);
            workbook.dispose();
            return out.toByteArray();
        }
    }

    private void preencherCelula(Cell cell, Object valor) {
        if (valor == null) return;

        if (valor instanceof Number numero) {
            cell.setCellValue(numero.doubleValue());
        } else if (valor instanceof Boolean booleano) {
            cell.setCellValue(booleano);
        } else {
            cell.setCellValue(texto(valor));
        }
    }

    private List<String> colunas(
            List<LinkedHashMap<String, Object>> registros) {
        if (registros.isEmpty()) return List.of();

        LinkedHashSet<String> colunas = new LinkedHashSet<>();
        registros.forEach(registro -> colunas.addAll(registro.keySet()));
        return new ArrayList<>(colunas);
    }

    private String texto(Object valor) {
        return valor == null ? "" : String.valueOf(valor);
    }

    private void escreverBom(OutputStream out) throws IOException {
        out.write(0xEF);
        out.write(0xBB);
        out.write(0xBF);
    }
}
