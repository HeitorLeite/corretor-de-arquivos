package com.unimedlorena.tools.controller;

import com.unimedlorena.tools.dto.RelatorioExportacaoRequest;
import com.unimedlorena.tools.service.ExportacaoRelatorioService;
import com.unimedlorena.tools.service.SguRelatorioService;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.nio.charset.StandardCharsets;
import java.util.Map;

@RestController
@RequestMapping("/api/relatorios")
public class RelatorioController {

    private final SguRelatorioService sgu;
    private final ExportacaoRelatorioService exportacao;

    public RelatorioController(
            SguRelatorioService sgu,
            ExportacaoRelatorioService exportacao) {
        this.sgu = sgu;
        this.exportacao = exportacao;
    }

    @PostMapping("/sgu/listar")
    public Map<String, Object> listar(@RequestBody(required = false) Map<String, Object> body) {
        String nome = body == null ? "" : String.valueOf(body.getOrDefault("nome", ""));
        return sgu.listar(nome);
    }

    @PostMapping("/sgu/criar")
    public Map<String, Object> criarOuAtualizar(@RequestBody Map<String, Object> definicao) {
        return sgu.criarOuAtualizar(definicao);
    }

    @DeleteMapping("/sgu/{nome}")
    public Map<String, Object> apagar(@PathVariable String nome) {
        return sgu.apagar(nome);
    }

    @PostMapping("/sgu/executar/{nome}")
    public Map<String, Object> executar(
            @PathVariable String nome,
            @RequestBody(required = false) Map<String, Object> parametros) {
        return sgu.executar(nome, parametros == null ? Map.of() : parametros);
    }

    @PostMapping("/sgu/exportar/{nome}")
    public ResponseEntity<byte[]> exportar(
            @PathVariable String nome,
            @RequestParam(defaultValue = "xlsx") String formato,
            @RequestBody(required = false) RelatorioExportacaoRequest request) throws Exception {
        var arquivo = exportacao.exportar(nome, formato, request);
        String nomeBase = sanitizarNome(
            request == null || request.nomeArquivo() == null
                ? nome
                : request.nomeArquivo()
        );
        String nomeCompleto = nomeBase + "." + arquivo.extensao();

        return ResponseEntity.ok()
            .contentType(MediaType.parseMediaType(arquivo.contentType()))
            .header(
                HttpHeaders.CONTENT_DISPOSITION,
                ContentDisposition.attachment()
                    .filename(nomeCompleto, StandardCharsets.UTF_8)
                    .build()
                    .toString()
            )
            .body(arquivo.conteudo());
    }

    private String sanitizarNome(String nome) {
        String limpo = nome == null ? "relatorio" : nome
            .replaceAll("[^a-zA-Z0-9._-]", "_")
            .replaceAll("_+", "_")
            .replaceAll("^_+|_+$", "");
        return limpo.isBlank() ? "relatorio" : limpo;
    }
}
