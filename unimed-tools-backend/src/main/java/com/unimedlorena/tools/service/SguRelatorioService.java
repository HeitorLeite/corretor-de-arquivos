package com.unimedlorena.tools.service;

import java.net.URI;
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

    private final String baseUrl;
    private final String apiKey;
    private final String procedurePath;
    private final String executionPath;

    public SguRelatorioService(
            RestClient.Builder builder,
            ObjectMapper mapper,
            @Value("${sgu.api.base-url:https://api.lorena.sgusuite.com.br}")
            String baseUrl,
            @Value("${sgu.api.key:}")
            String apiKey,
            @Value("${sgu.api.procedure-path:/api/procedure/p_prcssa_dados}")
            String procedurePath,
            @Value("${sgu.api.execution-path:/api/procedure/p_prcssa_dados}")
            String executionPath
    ) {
        /*
         * Não usamos baseUrl() no RestClient.
         * Cada requisição receberá uma URI absoluta.
         */
        this.client = builder.build();

        this.mapper = mapper;
        this.baseUrl = normalizarBaseUrl(baseUrl);
        this.apiKey = apiKey == null ? "" : apiKey.trim();
        this.procedurePath = normalizarPath(procedurePath);
        this.executionPath = normalizarPath(executionPath);
    }

    public Map<String, Object> listar(String nome) {
        return post(
                procedurePath + "/lista_query_api",
                Map.of("nome", nome == null ? "" : nome)
        );
    }

    public Map<String, Object> criarOuAtualizar(
            Map<String, Object> definicao
    ) {
        return post(
                procedurePath + "/ins_atu_query_api",
                definicao
        );
    }

    public Map<String, Object> apagar(String nome) {
        return post(
                procedurePath + "/apaga_query_api",
                Map.of("nome", nome)
        );
    }

    public Map<String, Object> executar(
            String nome,
            Map<String, Object> parametros
    ) {
        if (nome == null || nome.isBlank()) {
            throw new IllegalArgumentException(
                    "O nome da API do relatório deve ser informado."
            );
        }

        String nomeSeguro = UriUtils.encodePathSegment(
                nome.trim(),
                StandardCharsets.UTF_8
        );

        return post(
                executionPath + "/" + nomeSeguro,
                parametros
        );
    }

    private Map<String, Object> post(
            String path,
            Object body
    ) {
        validarChave();

        URI uri = montarUriAbsoluta(path);

        try {
            Map<String, Object> resposta = client
                    .post()
                    .uri(uri)
                    .contentType(MediaType.APPLICATION_JSON)
                    .accept(MediaType.APPLICATION_JSON)
                    .header("apikey", apiKey)
                    .body(body)
                    .retrieve()
                    .body(
                            new ParameterizedTypeReference<
                                    LinkedHashMap<String, Object>
                            >() {}
                    );

            return resposta == null
                    ? Map.of("success", true)
                    : resposta;

        } catch (RestClientResponseException ex) {
            throw new IllegalArgumentException(
                    extrairMensagem(ex),
                    ex
            );
        }
    }

    private URI montarUriAbsoluta(String path) {
        String caminhoNormalizado = normalizarPath(path);
        String enderecoCompleto = baseUrl + caminhoNormalizado;

        URI uri;

        try {
            uri = URI.create(enderecoCompleto);
        } catch (IllegalArgumentException ex) {
            throw new IllegalStateException(
                    "A URL montada para o SGU é inválida: "
                            + enderecoCompleto,
                    ex
            );
        }

        if (!uri.isAbsolute()) {
            throw new IllegalStateException(
                    "A URL montada para o SGU não é absoluta: "
                            + enderecoCompleto
            );
        }

        return uri;
    }

    private void validarChave() {
        if (apiKey.isBlank()) {
            throw new IllegalStateException(
                    "A variável de ambiente SGU_API_KEY "
                            + "não foi configurada no backend."
            );
        }
    }

    private String extrairMensagem(
            RestClientResponseException ex
    ) {
        String corpo = ex.getResponseBodyAsString(
                StandardCharsets.UTF_8
        );

        if (corpo == null || corpo.isBlank()) {
            return "Erro retornado pela API do SGU: HTTP "
                    + ex.getStatusCode().value();
        }

        try {
            Map<String, Object> json = mapper.readValue(
                    corpo,
                    new TypeReference<>() {}
            );

            Object mensagem = json.get("message");

            return mensagem == null
                    ? corpo
                    : String.valueOf(mensagem);

        } catch (Exception ignored) {
            return corpo;
        }
    }

    private static String normalizarBaseUrl(
            String baseUrl
    ) {
        if (baseUrl == null || baseUrl.isBlank()) {
            throw new IllegalStateException(
                    "A variável SGU_API_BASE_URL está vazia."
            );
        }

        String valor = removerBarraFinal(baseUrl.trim());

        URI uri;

        try {
            uri = URI.create(valor);
        } catch (IllegalArgumentException ex) {
            throw new IllegalStateException(
                    "A variável SGU_API_BASE_URL possui "
                            + "uma URL inválida: " + valor,
                    ex
            );
        }

        if (
                !uri.isAbsolute()
                || uri.getScheme() == null
                || uri.getHost() == null
        ) {
            throw new IllegalStateException(
                    "A variável SGU_API_BASE_URL deve conter "
                            + "uma URL absoluta, por exemplo: "
                            + "https://api.lorena.sgusuite.com.br. "
                            + "Valor recebido: " + valor
            );
        }

        return valor;
    }

    private static String normalizarPath(
            String path
    ) {
        String valor = path == null
                ? ""
                : path.trim();

        if (!valor.startsWith("/")) {
            valor = "/" + valor;
        }

        return removerBarraFinal(valor);
    }

    private static String removerBarraFinal(
            String valor
    ) {
        if (valor == null) {
            return "";
        }

        while (
                valor.length() > 1
                && valor.endsWith("/")
        ) {
            valor = valor.substring(
                    0,
                    valor.length() - 1
            );
        }

        return valor;
    }
}