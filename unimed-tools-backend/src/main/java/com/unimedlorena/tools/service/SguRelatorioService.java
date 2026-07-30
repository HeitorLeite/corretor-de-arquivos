package com.unimedlorena.tools.service;

import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.Map;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;
import org.springframework.web.util.UriUtils;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;

@Service
public class SguRelatorioService {

    private final RestClient client;
    private final ObjectMapper mapper;
    private final String apiKey;
    private final String procedurePath;
    private final String executionPath;

    public SguRelatorioService(
            RestClient.Builder builder,
            ObjectMapper mapper,
            @Value("${sgu.api.base-url:https://api.lorena.sgusuite.com.br}") String baseUrl,
            @Value("${sgu.api.key:}") String apiKey,
            @Value("${sgu.api.procedure-path:/api/procedure/p_prcssa_dados}") String procedurePath,
            @Value("${sgu.api.execution-path:/api/procedure/p_prcssa_dados}") String executionPath) {

        this.client = builder
                .baseUrl(removerBarraFinal(baseUrl))
                .build();

        this.mapper = mapper;
        this.apiKey = apiKey;
        this.procedurePath = normalizarPath(procedurePath);
        this.executionPath = normalizarPath(executionPath);
    }

    public Map<String, Object> listar(String nome) {
        return post(procedurePath + "/lista_query_api", Map.of("nome", nome == null ? "" : nome));
    }

    public Map<String, Object> criarOuAtualizar(Map<String, Object> definicao) {
        return post(procedurePath + "/ins_atu_query_api", definicao);
    }

    public Map<String, Object> apagar(String nome) {
        return post(procedurePath + "/apaga_query_api", Map.of("nome", nome));
    }

    public Map<String, Object> executar(String nome, Map<String, Object> parametros) {
        String nomeSeguro = UriUtils.encodePathSegment(nome, StandardCharsets.UTF_8);
        return post(executionPath + "/" + nomeSeguro, parametros);
    }

    private Map<String, Object> post(String path, Object body) {
        validarChave();
        try {
            Map<String, Object> resposta = client.post()
                    .uri(path)
                    .contentType(MediaType.APPLICATION_JSON)
                    .accept(MediaType.APPLICATION_JSON)
                    .header("apikey", apiKey)
                    .body(body)
                    .retrieve()
                    .body(new ParameterizedTypeReference<LinkedHashMap<String, Object>>() {
                    });
            return resposta == null ? Map.of("success", true) : resposta;
        } catch (RestClientResponseException ex) {
            throw new IllegalArgumentException(extrairMensagem(ex), ex);
        }
    }

    private void validarChave() {
        if (apiKey == null || apiKey.isBlank()) {
            throw new IllegalStateException(
                    "A variável de ambiente SGU_API_KEY não foi configurada no backend.");
        }
    }

    private String extrairMensagem(RestClientResponseException ex) {
        String corpo = ex.getResponseBodyAsString(StandardCharsets.UTF_8);
        if (corpo == null || corpo.isBlank()) {
            return "Erro retornado pela API do SGU: HTTP " + ex.getStatusCode().value();
        }
        try {
            Map<String, Object> json = mapper.readValue(corpo, new TypeReference<>() {
            });
            Object mensagem = json.get("message");
            return mensagem == null ? corpo : String.valueOf(mensagem);
        } catch (Exception ignored) {
            return corpo;
        }
    }

    private static String normalizarPath(String path) {
        String valor = path == null ? "" : path.trim();
        if (!valor.startsWith("/"))
            valor = "/" + valor;
        return removerBarraFinal(valor);
    }

    private static String removerBarraFinal(String valor) {
        if (valor == null)
            return "";
        return valor.endsWith("/") ? valor.substring(0, valor.length() - 1) : valor;
    }
}
