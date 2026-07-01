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

    // ── Posições fixas no TXT posicional ──────────────────────────────────────
    private static final int POS_CNPJ_INI  = 0,   POS_CNPJ_FIM  = 14;
    private static final int POS_CNES1_INI = 94,  POS_CNES1_FIM = 101;
    private static final int POS_CNES2_INI = 109, POS_CNES2_FIM = 116;

    // ── Regex para abas separadas (formato antigo) ─────────────────────────────
    private static final Pattern P_ECNES_ABA  = Pattern.compile("CNPJ/CPF:\\s*(\\d+)", Pattern.CASE_INSENSITIVE);
    private static final Pattern P_CNES_ABA   = Pattern.compile("CNES.*?:\\s*(\\d+)\\s*-\\s*(?:CNPJ[^:]*:\\s*)?(\\d+)", Pattern.CASE_INSENSITIVE);
    private static final Pattern P_MUN_ABA    = Pattern.compile("CNES:\\s*(\\d+).*?CNPJ/RAZ[^:]*:\\s*(\\d+)", Pattern.CASE_INSENSITIVE);
    private static final Pattern P_PREST_ABA  = Pattern.compile("CNPJ/RAZ[^:]*:\\s*(\\d+).*?CNES:\\s*(\\d*)", Pattern.CASE_INSENSITIVE);
    private static final Pattern P_AVISO_ABA  = Pattern.compile("CNES:\\s*(\\d+)", Pattern.CASE_INSENSITIVE);
    private static final Pattern P_MISTO_ABA  = Pattern.compile("CNPJ[/\\w]*[^:]*:\\s*(\\d{9,14})", Pattern.CASE_INSENSITIVE);

    // ── Regex para aba "Erros" com texto livre da ANS ─────────────────────────
    // "Estabelecimento cadastrado na base nacional e CNES não informado ... CNPJ/CPF: 00383948045"
    private static final Pattern P_TL_ECNES  = Pattern.compile(
        "CNES n[aã]o informado.*?CNPJ/CPF:\\s*(\\d+)", Pattern.CASE_INSENSITIVE);
    // "CNES e CNPJ/CPF não conferem ... CNES-CNPJ/CPF: 2738384 - 00641814216"
    private static final Pattern P_TL_CNES   = Pattern.compile(
        "CNES e CNPJ.*?CNES-CNPJ/CPF:\\s*(\\d+)\\s*-\\s*(\\d+)", Pattern.CASE_INSENSITIVE);
    // "Prestador não informado ... CNPJ/RAZÃO: 02544595604/... CNES: "
    private static final Pattern P_TL_PREST  = Pattern.compile(
        "Prestador n[aã]o informado.*?CNPJ/RAZ[ÃA]O:\\s*([\\d]+).*?CNES:\\s*(\\d*)", Pattern.CASE_INSENSITIVE | Pattern.DOTALL);
    // Município
    private static final Pattern P_TL_MUN    = Pattern.compile(
        "munic[íi]pio.*?CNES:\\s*(\\d+).*?CNPJ[^:]*:\\s*(\\d+)", Pattern.CASE_INSENSITIVE | Pattern.DOTALL);
    // Aviso
    private static final Pattern P_TL_AVISO  = Pattern.compile(
        "aviso.*?CNES:\\s*(\\d+)", Pattern.CASE_INSENSITIVE);

    // ── Classe interna de filtros ──────────────────────────────────────────────
    static class Filtros {
        Set<String> ecnes            = new HashSet<>();
        Set<String> errosMisto       = new HashSet<>();
        Set<String> aviso            = new HashSet<>();
        Set<String> cnes             = new HashSet<>();
        Set<String> municipio        = new HashSet<>();
        Set<String> prestadorExato   = new HashSet<>();
        Set<String> prestadorCuringa = new HashSet<>();
        Map<String, Integer> contagens = new LinkedHashMap<>();

        void addContagem(String tipo, int n) { contagens.merge(tipo, n, Integer::sum); }
    }

    public record Resultado(byte[] arquivo, AnsResultado stats) {}

    // ── Entrada XLSX: detecta formato automaticamente ─────────────────────────
    public Resultado processarXlsx(MultipartFile xlsx, MultipartFile txt) throws Exception {
        Filtros f = new Filtros();
        Workbook wb = new XSSFWorkbook(xlsx.getInputStream());

        for (int i = 0; i < wb.getNumberOfSheets(); i++) {
            String nomeAba = wb.getSheetName(i);
            String tipo    = classificarAba(nomeAba);

            Sheet ws = wb.getSheetAt(i);

            if (tipo != null) {
                // Formato multi-abas (ECnes, CNES, Municipio, Prestador, Aviso)
                StringBuilder sb = new StringBuilder();
                for (Row row : ws)
                    for (Cell cell : row) {
                        String v = cellStr(cell);
                        if (!v.isBlank()) sb.append(v).append('\n');
                    }
                carregarTipoAba(f, tipo, sb.toString());

            } else if (nomeAba.equalsIgnoreCase("Erros") || nomeAba.toLowerCase().startsWith("erros")) {
                // Formato texto livre da ANS — extrai da coluna de texto
                carregarTextoLivre(f, ws);
            }
        }
        wb.close();
        return filtrar(txt, f);
    }

    // ── Lê aba de texto livre (coluna "erros") ────────────────────────────────
    private void carregarTextoLivre(Filtros f, Sheet ws) {
        // Descobre coluna de texto (ignora coluna "id")
        int colTexto = 1; // padrão: segunda coluna
        Row hdr = ws.getRow(0);
        if (hdr != null) {
            for (Cell c : hdr) {
                String v = cellStr(c).toLowerCase().strip();
                if (v.contains("erro") || v.contains("descr") || v.contains("msg")) {
                    colTexto = c.getColumnIndex(); break;
                }
            }
        }

        int antesEcnes = f.ecnes.size();
        int antesCnes  = f.cnes.size();
        int antesPrest = f.prestadorExato.size() + f.prestadorCuringa.size();
        int antesMun   = f.municipio.size();
        int antesAviso = f.aviso.size();

        for (int r = 1; r <= ws.getLastRowNum(); r++) {
            Row row = ws.getRow(r);
            if (row == null) continue;
            Cell c = row.getCell(colTexto);
            if (c == null) continue;
            String texto = cellStr(c).strip();
            if (texto.isBlank()) continue;

            // ECnes: "CNES não informado ... CNPJ/CPF: XXXXX"
            Matcher m = P_TL_ECNES.matcher(texto);
            if (m.find()) { f.ecnes.add(zfill(m.group(1), 14)); continue; }

            // CNES: "CNES e CNPJ/CPF não conferem ... CNES-CNPJ/CPF: CNES - CNPJ"
            m = P_TL_CNES.matcher(texto);
            if (m.find()) {
                String cnesVal = zfill(m.group(1), 7);
                String cnpjVal = zfill(m.group(2), 14);
                f.cnes.add(cnpjVal + "|" + cnesVal);
                continue;
            }

            // Prestador
            m = P_TL_PREST.matcher(texto);
            if (m.find()) {
                String cnpj = zfill(m.group(1), 14);
                String cnesStr = m.group(2).strip();
                if (cnesStr.isEmpty()) f.prestadorCuringa.add(cnpj);
                else f.prestadorExato.add(cnpj + "|" + zfill(cnesStr, 7));
                continue;
            }

            // Município
            m = P_TL_MUN.matcher(texto);
            if (m.find()) {
                f.municipio.add(zfill(m.group(2), 14) + "|" + zfill(m.group(1), 7));
                continue;
            }

            // Aviso
            m = P_TL_AVISO.matcher(texto);
            if (m.find()) { f.aviso.add(zfill(m.group(1), 7)); }
        }

        f.addContagem("ECnes",     f.ecnes.size()     - antesEcnes);
        f.addContagem("CNES",      f.cnes.size()      - antesCnes);
        f.addContagem("Prestador", (f.prestadorExato.size() + f.prestadorCuringa.size()) - antesPrest);
        f.addContagem("Município", f.municipio.size() - antesMun);
        f.addContagem("Aviso",     f.aviso.size()     - antesAviso);
    }

    // ── Entrada: CSVs individuais ─────────────────────────────────────────────
    public Resultado processarCsvs(
            MultipartFile csvEcnes, MultipartFile csvCnes, MultipartFile csvMun,
            MultipartFile csvPrest, MultipartFile csvAviso,
            MultipartFile txt) throws Exception {

        Filtros f = new Filtros();
        if (csvEcnes  != null) carregarTipoAba(f, "ECnes",    ler(csvEcnes));
        if (csvCnes   != null) carregarTipoAba(f, "CNES",     ler(csvCnes));
        if (csvMun    != null) carregarTipoAba(f, "Municipio",ler(csvMun));
        if (csvPrest  != null) carregarTipoAba(f, "Prestador",ler(csvPrest));
        if (csvAviso  != null) carregarTipoAba(f, "Aviso",    ler(csvAviso));
        return filtrar(txt, f);
    }

    // ── Carrega tipo para abas separadas ──────────────────────────────────────
    private void carregarTipoAba(Filtros f, String tipo, String texto) {
        switch (tipo) {
            case "ECnes" -> {
                int antes = f.ecnes.size();
                for (String l : texto.split("\n")) {
                    Matcher m = P_ECNES_ABA.matcher(l);
                    if (m.find()) f.ecnes.add(zfill(m.group(1), 14));
                }
                f.addContagem("ECnes", f.ecnes.size() - antes);
            }
            case "CNES" -> {
                int antes = f.cnes.size();
                for (String l : texto.split("\n")) {
                    Matcher m = P_CNES_ABA.matcher(l);
                    if (m.find()) f.cnes.add(zfill(m.group(2), 14) + "|" + zfill(m.group(1), 7));
                }
                f.addContagem("CNES", f.cnes.size() - antes);
            }
            case "Municipio" -> {
                int antes = f.municipio.size();
                for (String l : texto.split("\n")) {
                    Matcher m = P_MUN_ABA.matcher(l);
                    if (m.find()) f.municipio.add(zfill(m.group(2), 14) + "|" + zfill(m.group(1), 7));
                }
                f.addContagem("Município", f.municipio.size() - antes);
            }
            case "Prestador" -> {
                int antes = f.prestadorExato.size() + f.prestadorCuringa.size();
                for (String l : texto.split("\n")) {
                    Matcher m = P_PREST_ABA.matcher(l);
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
                    Matcher m = P_AVISO_ABA.matcher(l);
                    if (m.find()) f.aviso.add(zfill(m.group(1), 7));
                }
                f.addContagem("Aviso", f.aviso.size() - antes);
            }
            case "ErrosMisto" -> {
                int antes = f.errosMisto.size();
                for (String l : texto.split("\n")) {
                    Matcher m = P_MISTO_ABA.matcher(l);
                    if (m.find()) f.errosMisto.add(zfill(m.group(1), 14));
                }
                f.addContagem("Erros (misto)", f.errosMisto.size() - antes);
            }
        }
    }

    // ── Filtragem do TXT posicional ───────────────────────────────────────────
    private Resultado filtrar(MultipartFile txtFile, Filtros f) throws Exception {
        Charset latin1 = Charset.forName("ISO-8859-1");
        String[] linhas = new String(txtFile.getBytes(), latin1).split("\n", -1);

        ByteArrayOutputStream out = new ByteArrayOutputStream();
        BufferedWriter w = new BufferedWriter(new OutputStreamWriter(out, latin1));

        int lidas = 0, removidas = 0, mantidas = 0;
        for (int i = 0; i < linhas.length; i++) {
            String linha = linhas[i];
            if (linha.isEmpty() && i == linhas.length - 1) break;
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

        String cnpj = tam >= POS_CNPJ_FIM
            ? zfill(c.substring(POS_CNPJ_INI, POS_CNPJ_FIM).strip(), 14) : null;

        if (cnpj != null) {
            if (f.ecnes.contains(cnpj))            return true;
            if (f.errosMisto.contains(cnpj))       return true;
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
            if (f.cnes.contains(par))               return true;
            if (f.municipio.contains(par))           return true;
            if (f.prestadorExato.contains(par))      return true;
        }

        for (String cnes : new String[]{c1, c2})
            if (cnes != null && f.aviso.contains(cnes)) return true;

        return false;
    }

    // ── Classificação de aba por nome ─────────────────────────────────────────
    private String classificarAba(String nome) {
        String n = nome.toLowerCase().strip();
        return switch (n) {
            case "ecnes"                 -> "ECnes";
            case "cnes"                  -> "CNES";
            case "municpio", "municipio" -> "Municipio";
            case "prestador"             -> "Prestador";
            case "aviso"                 -> "Aviso";
            default -> (n.startsWith("erros_") || n.startsWith("misto")) ? "ErrosMisto" : null;
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
