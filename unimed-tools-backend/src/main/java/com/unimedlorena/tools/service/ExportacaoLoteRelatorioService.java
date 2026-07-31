package com.unimedlorena.tools.service;

import com.unimedlorena.tools.dto.RelatorioLoteRequest;
import org.springframework.stereotype.Service;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

@Service
public class ExportacaoLoteRelatorioService {

    public record Resultado(
        byte[] conteudo,
        int arquivosGerados,
        int arquivosComErro
    ) {}

    private final ExportacaoRelatorioService exportacao;

    public ExportacaoLoteRelatorioService(
            ExportacaoRelatorioService exportacao) {
        this.exportacao = exportacao;
    }

    public Resultado exportar(RelatorioLoteRequest request) throws IOException {
        if (request == null || request.itens() == null || request.itens().isEmpty()) {
            throw new IllegalArgumentException(
                "Informe pelo menos um relatório para a exportação em lote."
            );
        }

        String formato = normalizarFormato(request.formato());
        ByteArrayOutputStream buffer = new ByteArrayOutputStream();
        List<String> erros = new ArrayList<>();
        List<String> gerados = new ArrayList<>();
        Set<String> nomesUsados = new HashSet<>();
        nomesUsados.add("_resumo_geracao.txt");

        try (ZipOutputStream zip = new ZipOutputStream(buffer, StandardCharsets.UTF_8)) {
            for (RelatorioLoteRequest.Item item : request.itens()) {
                if (item == null) continue;

                String apiNome = texto(item.apiNome()).trim();
                String nomeBase = sanitizarNome(item.nomeArquivo());

                if (apiNome.isBlank()) {
                    erros.add(nomeBase + ": nome da API não informado.");
                    continue;
                }

                try {
                    List<LinkedHashMap<String, Object>> registros =
                        carregarCombinacoes(apiNome, item.combinacoesFiltros());

                    ExportacaoRelatorioService.Arquivo arquivo =
                        exportacao.gerarArquivo(formato, registros);

                    String nomeEntrada = nomeUnico(
                        nomeBase + "." + arquivo.extensao(),
                        nomesUsados
                    );

                    zip.putNextEntry(new ZipEntry(nomeEntrada));
                    zip.write(arquivo.conteudo());
                    zip.closeEntry();
                    gerados.add(nomeEntrada + " — " + registros.size() + " registro(s)");
                } catch (Exception ex) {
                    erros.add(
                        nomeBase + " (" + apiNome + "): " + resumoErro(ex)
                    );
                }
            }

            adicionarManifesto(zip, gerados, erros);
        }

        return new Resultado(buffer.toByteArray(), gerados.size(), erros.size());
    }

    private List<LinkedHashMap<String, Object>> carregarCombinacoes(
            String apiNome,
            List<Map<String, Object>> combinacoes) {
        List<Map<String, Object>> filtros =
            combinacoes == null || combinacoes.isEmpty()
                ? List.of(Map.of())
                : combinacoes;

        List<LinkedHashMap<String, Object>> registros = new ArrayList<>();

        for (Map<String, Object> combinacao : filtros) {
            registros.addAll(
                exportacao.carregarRegistros(
                    apiNome,
                    combinacao == null ? Map.of() : combinacao
                )
            );
        }

        return registros;
    }

    private void adicionarManifesto(
            ZipOutputStream zip,
            List<String> gerados,
            List<String> erros) throws IOException {
        StringBuilder texto = new StringBuilder();
        texto.append("GERAÇÃO AUTOMÁTICA DE RELATÓRIOS\r\n")
            .append("=================================\r\n\r\n")
            .append("Arquivos gerados: ")
            .append(gerados.size())
            .append("\r\n")
            .append("Falhas: ")
            .append(erros.size())
            .append("\r\n\r\n");

        if (!gerados.isEmpty()) {
            texto.append("ARQUIVOS GERADOS\r\n");
            gerados.forEach(item -> texto.append("- ").append(item).append("\r\n"));
            texto.append("\r\n");
        }

        if (!erros.isEmpty()) {
            texto.append("ERROS\r\n");
            erros.forEach(item -> texto.append("- ").append(item).append("\r\n"));
        }

        zip.putNextEntry(new ZipEntry("_RESUMO_GERACAO.txt"));
        zip.write(texto.toString().getBytes(StandardCharsets.UTF_8));
        zip.closeEntry();
    }

    private String nomeUnico(String nome, Set<String> nomesUsados) {
        if (nomesUsados.add(nome.toLowerCase(Locale.ROOT))) return nome;

        int ponto = nome.lastIndexOf('.');
        String base = ponto > 0 ? nome.substring(0, ponto) : nome;
        String extensao = ponto > 0 ? nome.substring(ponto) : "";

        int indice = 2;
        String candidato;
        do {
            candidato = base + "_" + indice++ + extensao;
        } while (!nomesUsados.add(candidato.toLowerCase(Locale.ROOT)));

        return candidato;
    }

    private String normalizarFormato(String formato) {
        String normalizado = texto(formato).trim().toLowerCase(Locale.ROOT);
        if (normalizado.isBlank()) return "xlsx";

        if (!normalizado.equals("xlsx") &&
                !normalizado.equals("csv") &&
                !normalizado.equals("txt")) {
            throw new IllegalArgumentException(
                "Formato inválido. Use csv, txt ou xlsx."
            );
        }

        return normalizado;
    }

    private String sanitizarNome(String nome) {
        String limpo = texto(nome)
            .replaceAll("[^a-zA-Z0-9._-]", "_")
            .replaceAll("_+", "_")
            .replaceAll("^_+|_+$", "");
        return limpo.isBlank() ? "relatorio" : limpo;
    }

    private String resumoErro(Throwable erro) {
        Throwable atual = erro;
        while (atual.getCause() != null && atual.getCause() != atual) {
            atual = atual.getCause();
        }

        String mensagem = atual.getMessage();
        if (mensagem == null || mensagem.isBlank()) {
            mensagem = atual.getClass().getSimpleName();
        }

        return mensagem.replace('\n', ' ').replace('\r', ' ').trim();
    }

    private String texto(Object valor) {
        return valor == null ? "" : String.valueOf(valor);
    }
}
