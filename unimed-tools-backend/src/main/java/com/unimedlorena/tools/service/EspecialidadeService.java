package com.unimedlorena.tools.service;

import com.unimedlorena.tools.dto.EspecialidadeStats;
import org.apache.poi.ss.usermodel.*;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.*;
import java.util.*;

@Service
public class EspecialidadeService {

    // ── Tabela TUSS fixa (mesma do Python) ─────────────────────────────────────
    private static final Map<String, String> TUSS_MAP = Map.of(
        "10101039", "CLÍNICA MÉDICA",
        "50000349", "FISIOTERAPIA",
        "50000470", "PSICOLOGIA",
        "50000560", "NUTRICIONISTA"
    );

    // ── Nomes aceitos para cada coluna ─────────────────────────────────────────
    private static final Set<String> NOMES_ESP  = Set.of("NOME ESPECIALIDADE", "NOME_ESPECIALIDADE");
    private static final Set<String> NOMES_SOL  = Set.of("NOME_PRESTADOR_SOLIC", "NOME SOLICITANTE", "NOME_SOLICITANTE", "NOME_PRESTADOR");
    private static final Set<String> NOMES_TUSS = Set.of("COD_TUSS", "CODIGO_TUSS");

    public record Resultado(byte[] arquivo, EspecialidadeStats stats) {}

    public Resultado processar(MultipartFile fileDespesas, MultipartFile fileMedicos) throws Exception {

        // 1. Carrega mapa de médicos ─────────────────────────────────────────────
        Map<String, String> mapaMedicos = carregarMedicos(fileMedicos);

        // 2. Abre despesas ────────────────────────────────────────────────────────
        Workbook wb = new XSSFWorkbook(fileDespesas.getInputStream());

        // Detecta aba "despesa"
        Sheet ws = null;
        String nomeAba = null;
        for (int i = 0; i < wb.getNumberOfSheets(); i++) {
            String n = wb.getSheetName(i);
            if (n.toLowerCase().contains("despesa")) { ws = wb.getSheetAt(i); nomeAba = n; break; }
        }
        if (ws == null) { ws = wb.getSheetAt(0); nomeAba = wb.getSheetName(0); }

        // 3. Mapeia colunas pelo cabeçalho ────────────────────────────────────────
        Row header = ws.getRow(0);
        int colEsp = -1, colSol = -1, colTuss = -1;

        for (Cell c : header) {
            String v = norm(cellStr(c));
            if (NOMES_ESP.contains(v))  colEsp  = c.getColumnIndex();
            if (NOMES_SOL.contains(v))  colSol  = c.getColumnIndex();
            if (NOMES_TUSS.contains(v)) colTuss = c.getColumnIndex();
        }

        if (colEsp < 0)  throw new IllegalArgumentException("Coluna 'Nome Especialidade' não encontrada.");
        if (colSol < 0)  throw new IllegalArgumentException("Coluna 'Nome Solicitante' não encontrada.");

        // 4. Processa linhas ──────────────────────────────────────────────────────
        int total = 0, preenchidas = 0, jaOk = 0, semInfo = 0;

        for (int r = 1; r <= ws.getLastRowNum(); r++) {
            Row row = ws.getRow(r);
            if (row == null) continue;
            total++;

            String espAtual = cellStr(row.getCell(colEsp));
            if (!vazio(espAtual)) { jaOk++; continue; }

            String solicitante = cellStr(row.getCell(colSol));
            String tuss        = colTuss >= 0 ? cellStr(row.getCell(colTuss)) : "";

            // Ambos vazios
            if (vazio(solicitante) && vazio(tuss)) { semInfo++; continue; }

            // Fallback TUSS
            if (vazio(solicitante) && !vazio(tuss)) {
                String esp = TUSS_MAP.get(tuss.trim());
                if (esp != null) { setCelula(row, colEsp, esp, wb); preenchidas++; }
                else semInfo++;
                continue;
            }

            // Busca na referência
            String esp = mapaMedicos.get(solicitante.trim().toUpperCase());
            if (esp != null) { setCelula(row, colEsp, esp, wb); preenchidas++; }
            else semInfo++;
        }

        // 5. Serializa ────────────────────────────────────────────────────────────
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        wb.write(out);
        wb.close();

        return new Resultado(out.toByteArray(),
            new EspecialidadeStats(total, preenchidas, jaOk, semInfo, nomeAba));
    }

    // ── Carrega planilha de médicos ─────────────────────────────────────────────
    private Map<String, String> carregarMedicos(MultipartFile file) throws Exception {
        Map<String, String> mapa = new HashMap<>();
        Workbook wb = new XSSFWorkbook(file.getInputStream());
        Sheet ws = wb.getSheetAt(0);
        Row hdr = ws.getRow(0);

        int colNome = -1, colEsp = -1;
        for (Cell c : hdr) {
            String v = norm(cellStr(c));
            if (v.equals("PES_NOM_COMP")) colNome = c.getColumnIndex();
            if (v.equals("ESPMD_DES"))    colEsp  = c.getColumnIndex();
        }
        if (colNome < 0 || colEsp < 0)
            throw new IllegalArgumentException("Planilha de médicos deve ter colunas PES_NOM_COMP e ESPMD_DES.");

        for (int r = 1; r <= ws.getLastRowNum(); r++) {
            Row row = ws.getRow(r);
            if (row == null) continue;
            String nome = cellStr(row.getCell(colNome));
            String esp  = cellStr(row.getCell(colEsp));
            if (!vazio(nome) && !vazio(esp))
                mapa.put(nome.trim().toUpperCase(), esp.trim());
        }
        wb.close();
        return mapa;
    }

    // ── Utilitários ─────────────────────────────────────────────────────────────
    private String cellStr(Cell c) {
        if (c == null) return "";
        return switch (c.getCellType()) {
            case STRING  -> c.getStringCellValue();
            case NUMERIC -> String.valueOf((long) c.getNumericCellValue());
            case BOOLEAN -> String.valueOf(c.getBooleanCellValue());
            default      -> "";
        };
    }

    private void setCelula(Row row, int col, String valor, Workbook wb) {
        Cell c = row.getCell(col);
        if (c == null) c = row.createCell(col);
        c.setCellValue(valor);
    }

    private boolean vazio(String v) {
        return v == null || v.isBlank() || v.equals("#N/DISP");
    }

    private String norm(String v) {
        return v == null ? "" : v.strip().toUpperCase();
    }
}
