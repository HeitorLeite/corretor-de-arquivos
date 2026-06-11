package com.unimedlorena.tools.service;

import com.unimedlorena.tools.dto.AnsResultado;
import org.apache.poi.ss.usermodel.*;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.*;
import java.nio.charset.Charset;
import java.util.*;
import java.util.regex.*;

@Service
public class AnsService {

    // ── Posições fixas no TXT ──────────────────────────────────────────────────
    private static final int POS_CNPJ_INI  = 0,  POS_CNPJ_FIM  = 14;
    private static final int POS_CNES1_INI = 94, POS_CNES1_FIM = 101;
    private static final int POS_CNES2_INI = 109, POS_CNES2_FIM = 116;

    // ── Padrões regex (mesmos do Python) ──────────────────────────────────────
    private static final Pattern P_ECNES     = Pattern.compile("CNPJ/CPF:\\s*(\\d+)", Pattern.CASE_INSENSITIVE);
    private static final Pattern P_CNES      = Pattern.compile("CNES.*?:\\s*(\\d+)\\s*-\\s*(?:CNPJ[^:]*:\\s*)?(\\d+)", Pattern.CASE_INSENSITIVE);
    private static final Pattern P_MUNICIPIO = Pattern.compile("CNES:\\s*(\\d+).*?CNPJ/RAZ[^:]*:\\s*(\\d+)", Pattern.CASE_INSENSITIVE);
    private static final Pattern P_PRESTADOR = Pattern.compile("CNPJ/RAZ[^:]*:\\s*(\\d+).*?CNES:\\s*(\\d*)", Pattern.CASE_INSENSITIVE);
    private static final Pattern P_AVISO     = Pattern.compile("CNES:\\s*(\\d+)", Pattern.CASE_INSENSITIVE);
    private static final Pattern P_MISTO     = Pattern.compile("CNPJ[/\\w]*[^:]*:\\s*(\\d{9,14})", Pattern.CASE_INSENSITIVE);

    // ── Filtros ────────────────────────────────────────────────────────────────
    static class Filtros {
        Set<String>           ecnes      = new HashSet<>(); // cnpj
        Set<String>           errosMisto = new HashSet<>(); // cnpj
        Set<String>           aviso      = new HashSet<>(); // cnes
        Set<String>           cnes       = new HashSet<>(); // "cnpj|cnes"
        Set<String>           municipio  = new HashSet<>(); // "cnpj|cnes"
        Set<String>           prestadorExato   = new HashSet<>(); // "cnpj|cnes"
        Set<String>           prestadorCuringa = new HashSet<>(); // cnpj (cnes vazio)

        Map<String, Integer> contagens = new LinkedHashMap<>();

        void addContagem(String tipo, int n) {
            contagens.merge(tipo, n, Integer::sum);
        }

        int total() {
            return ecnes.size() + errosMisto.size() + aviso.size()
                 + cnes.size() + municipio.size()
                 + prestadorExato.size() + prestadorCuringa.size();
        }
    }

    public record Resultado(byte[] arquivo, AnsResultado stats) {}

    // ── Entrada: XLSX ─────────────────────────────────────────────────────────
    public Resultado processarXlsx(MultipartFile xlsx, MultipartFile txt) throws Exception {
        Filtros f = new Filtros();
        Workbook wb = new XSSFWorkbook(xlsx.getInputStream());

        for (int i = 0; i < wb.getNumberOfSheets(); i++) {
            String nome = wb.getSheetName(i);
            String tipo = classificarAba(nome);
            if (tipo == null) continue;

            StringBuilder sb = new StringBuilder();
            Sheet ws = wb.getSheetAt(i);
            for (Row row : ws)
                for (Cell cell : row) {
                    String v = cellStr(cell);
                    if (!v.isBlank()) sb.append(v).append('\n');
                }
            carregarTipo(f, tipo, sb.toString());
        }
        wb.close();
        return filtrar(txt, f);
    }

    // ── Entrada: CSVs individuais ─────────────────────────────────────────────
    public Resultado processarCsvs(
            MultipartFile csvEcnes, MultipartFile csvCnes, MultipartFile csvMun,
            MultipartFile csvPrest, MultipartFile csvAviso,
            MultipartFile txt) throws Exception {

        Filtros f = new Filtros();
        if (csvEcnes  != null) carregarTipo(f, "ECnes",     ler(csvEcnes));
        if (csvCnes   != null) carregarTipo(f, "CNES",      ler(csvCnes));
        if (csvMun    != null) carregarTipo(f, "Municipio",  ler(csvMun));
        if (csvPrest  != null) carregarTipo(f, "Prestador",  ler(csvPrest));
        if (csvAviso  != null) carregarTipo(f, "Aviso",      ler(csvAviso));
        return filtrar(txt, f);
    }

    // ── Carrega cada tipo ─────────────────────────────────────────────────────
    private void carregarTipo(Filtros f, String tipo, String texto) {
        switch (tipo) {
            case "ECnes" -> {
                int antes = f.ecnes.size();
                for (String l : texto.split("\n")) {
                    Matcher m = P_ECNES.matcher(l);
                    if (m.find()) f.ecnes.add(zfill(m.group(1), 14));
                }
                f.addContagem("ECnes", f.ecnes.size() - antes);
            }
            case "CNES" -> {
                int antes = f.cnes.size();
                for (String l : texto.split("\n")) {
                    Matcher m = P_CNES.matcher(l);
                    if (m.find()) f.cnes.add(zfill(m.group(2), 14) + "|" + zfill(m.group(1), 7));
                }
                f.addContagem("CNES", f.cnes.size() - antes);
            }
            case "Municipio" -> {
                int antes = f.municipio.size();
                for (String l : texto.split("\n")) {
                    Matcher m = P_MUNICIPIO.matcher(l);
                    if (m.find()) f.municipio.add(zfill(m.group(2), 14) + "|" + zfill(m.group(1), 7));
                }
                f.addContagem("Município", f.municipio.size() - antes);
            }
            case "Prestador" -> {
                int antes = f.prestadorExato.size() + f.prestadorCuringa.size();
                for (String l : texto.split("\n")) {
                    Matcher m = P_PRESTADOR.matcher(l);
                    if (m.find()) {
                        String cnpj = zfill(m.group(1), 14);
                        String cnesStr = m.group(2).strip();
                        if (cnesStr.isEmpty()) f.prestadorCuringa.add(cnpj);
                        else f.prestadorExato.add(cnpj + "|" + zfill(cnesStr, 7));
                    }
                }
                f.addContagem("Prestador", f.prestadorExato.size() + f.prestadorCuringa.size() - antes);
            }
            case "Aviso" -> {
                int antes = f.aviso.size();
                for (String l : texto.split("\n")) {
                    Matcher m = P_AVISO.matcher(l);
                    if (m.find()) f.aviso.add(zfill(m.group(1), 7));
                }
                f.addContagem("Aviso", f.aviso.size() - antes);
            }
            case "ErrosMisto" -> {
                int antes = f.errosMisto.size();
                for (String l : texto.split("\n")) {
                    Matcher m = P_MISTO.matcher(l);
                    if (m.find()) f.errosMisto.add(zfill(m.group(1), 14));
                }
                f.addContagem("Erros (misto)", f.errosMisto.size() - antes);
            }
        }
    }

    // ── Filtragem do TXT ──────────────────────────────────────────────────────
    private Resultado filtrar(MultipartFile txtFile, Filtros f) throws Exception {
        Charset latin1 = Charset.forName("ISO-8859-1");
        String[] linhas = new String(txtFile.getBytes(), latin1).split("\n", -1);

        ByteArrayOutputStream out = new ByteArrayOutputStream();
        BufferedWriter w = new BufferedWriter(new OutputStreamWriter(out, latin1));

        int lidas = 0, removidas = 0, mantidas = 0;
        for (String linha : linhas) {
            if (linha.isEmpty() && lidas == linhas.length - 1) break; // última linha vazia
            lidas++;
            if (deveRemover(linha, f)) removidas++;
            else { w.write(linha); w.write('\n'); mantidas++; }
        }
        w.flush();

        return new Resultado(out.toByteArray(),
            new AnsResultado(lidas, removidas, mantidas, f.contagens));
    }

    private boolean deveRemover(String linha, Filtros f) {
        String c = linha.stripTrailing();
        int tam = c.length();

        String cnpj = tam >= POS_CNPJ_FIM ? zfill(c.substring(POS_CNPJ_INI, POS_CNPJ_FIM).strip(), 14) : null;

        if (cnpj != null) {
            if (f.ecnes.contains(cnpj)) return true;
            if (f.errosMisto.contains(cnpj)) return true;
            if (f.prestadorCuringa.contains(cnpj)) return true;
        }

        if (tam < POS_CNES2_FIM) return false;

        String cnes1 = c.substring(POS_CNES1_INI, POS_CNES1_FIM).strip();
        String cnes2 = c.substring(POS_CNES2_INI, POS_CNES2_FIM).strip();
        String c1 = cnes1.isEmpty() ? null : zfill(cnes1, 7);
        String c2 = cnes2.isEmpty() ? null : zfill(cnes2, 7);

        for (String cnes : new String[]{c1, c2}) {
            if (cnes == null || cnpj == null) continue;
            String par = cnpj + "|" + cnes;
            if (f.cnes.contains(par))      return true;
            if (f.municipio.contains(par)) return true;
            if (f.prestadorExato.contains(par)) return true;
        }

        for (String cnes : new String[]{c1, c2})
            if (cnes != null && f.aviso.contains(cnes)) return true;

        return false;
    }

    // ── Classificação de aba ──────────────────────────────────────────────────
    private String classificarAba(String nome) {
        String n = nome.toLowerCase().strip();
        return switch (n) {
            case "ecnes"     -> "ECnes";
            case "cnes"      -> "CNES";
            case "municpio", "municipio" -> "Municipio";
            case "prestador" -> "Prestador";
            case "aviso"     -> "Aviso";
            default -> n.startsWith("erros") ? "ErrosMisto" : null;
        };
    }

    // ── Utilitários ───────────────────────────────────────────────────────────
    private String ler(MultipartFile f) throws Exception {
        return new String(f.getBytes(), Charset.forName("ISO-8859-1"));
    }

    private String cellStr(Cell c) {
        if (c == null) return "";
        return switch (c.getCellType()) {
            case STRING  -> c.getStringCellValue();
            case NUMERIC -> String.valueOf((long) c.getNumericCellValue());
            default -> "";
        };
    }

    private String zfill(String s, int n) {
        if (s == null || s.isBlank()) return "0".repeat(n);
        s = s.strip();
        return s.length() >= n ? s : "0".repeat(n - s.length()) + s;
    }
}
