package com.unimedlorena.tools.service;

import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;
import org.springframework.web.util.UriUtils;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;

@Service
public class SguRelatorioService {

        private static final Logger log = LoggerFactory.getLogger(SguRelatorioService.class);

        private final RestClient client;
        private final ObjectMapper mapper;

        private final String baseUrl;
        private final String apiKey;
        private final String procedurePath;
        private final String executionPath;

        public SguRelatorioService(
                        RestClient.Builder builder,
                        ObjectMapper mapper,

                        @Value("${sgu.api.base-url:"
                                        + "https://api.lorena.sgusuite.com.br}") String baseUrl,

                        @Value("${sgu.api.key:}") String apiKey,

                        @Value("${sgu.api.procedure-path:"
                                        + "/api/procedure/p_prcssa_dados}") String procedurePath,

                        @Value("${sgu.api.execution-path:"
                                        + "/api/procedure/p_prcssa_dados}") String executionPath) {
                this.mapper = mapper;

                this.baseUrl = normalizarBaseUrl(baseUrl);
                this.apiKey = normalizarApiKey(apiKey);
                this.procedurePath = normalizarPath(procedurePath);
                this.executionPath = normalizarPath(executionPath);

                /*
                 * As chamadas recebem uma URI absoluta.
                 * Portanto, não usamos baseUrl() no RestClient.
                 */
                this.client = builder
                                .defaultHeader(
                                                HttpHeaders.ACCEPT,
                                                MediaType.APPLICATION_JSON_VALUE)
                                .defaultHeader(
                                                HttpHeaders.USER_AGENT,
                                                "UnimedToolsBackend/1.0")
                                .build();

                log.info(
                                "SGU configurado: baseUrl={}, "
                                                + "procedurePath={}, executionPath={}, "
                                                + "chaveConfigurada={}, tamanhoChave={}",
                                this.baseUrl,
                                this.procedurePath,
                                this.executionPath,
                                !this.apiKey.isBlank(),
                                this.apiKey.length());
        }

        public Map<String, Object> listar(String nome) {
                String nomeNormalizado = nome == null ? "" : nome.trim();

                return post(
                                procedurePath + "/lista_query_api",
                                Map.of("nome", nomeNormalizado));
        }

        public Map<String, Object> criarOuAtualizar(
                        Map<String, Object> definicao) {
                if (definicao == null) {
                        throw new IllegalArgumentException(
                                        "A definição da API deve ser informada.");
                }

                return post(
                                procedurePath + "/ins_atu_query_api",
                                definicao);
        }

        public Map<String, Object> apagar(String nome) {
                if (nome == null || nome.isBlank()) {
                        throw new IllegalArgumentException(
                                        "Informe o nome da API que será apagada.");
                }

                return post(
                                procedurePath + "/apaga_query_api",
                                Map.of("nome", nome.trim()));
        }

        public Map<String, Object> executar(
                        String nome,
                        Map<String, Object> parametros) {
                if (nome == null || nome.isBlank()) {
                        throw new IllegalArgumentException(
                                        "Informe o nome da API do relatório.");
                }

                String nomeSeguro = UriUtils.encodePathSegment(
                                nome.trim(),
                                StandardCharsets.UTF_8);

                Map<String, Object> body = parametros == null
                                ? Map.of()
                                : parametros;

                return post(
                                executionPath + "/" + nomeSeguro,
                                body);
        }

        private Map<String, Object> post(
                        String path,
                        Object body) {
                validarChave();

                URI uri = montarUriAbsoluta(path);

                log.info(
                                "Enviando POST para o SGU: {}",
                                uri);

                try {
                        Map<String, Object> resposta = client
                                        .post()
                                        .uri(uri)
                                        .contentType(MediaType.APPLICATION_JSON)
                                        .accept(MediaType.APPLICATION_JSON)

                                        /*
                                         * O SGU/Kong espera exatamente este header.
                                         * Os nomes dos headers HTTP não diferenciam
                                         * maiúsculas e minúsculas, mas mantemos
                                         * exatamente a escrita usada no Thunder Client.
                                         */
                                        .header("apikey", apiKey)

                                        .header(
                                                        HttpHeaders.CACHE_CONTROL,
                                                        "no-cache")

                                        .body(body)
                                        .retrieve()
                                        .body(
                                                        new ParameterizedTypeReference<LinkedHashMap<String, Object>>() {
                                                        });

                        log.info(
                                        "Resposta recebida com sucesso do SGU: {}",
                                        uri);

                        return resposta == null
                                        ? Map.of("success", true)
                                        : resposta;

                } catch (RestClientResponseException ex) {
                        int status = ex.getStatusCode().value();

                        String corpo = ex.getResponseBodyAsString(
                                        StandardCharsets.UTF_8);

                        log.error(
                                        "Erro na chamada ao SGU. "
                                                        + "URL={}, status={}, resposta={}",
                                        uri,
                                        status,
                                        limitarLog(corpo));

                        if (status == 403) {
                                throw new IllegalArgumentException(
                                                "O SGU recusou a chamada do backend "
                                                                + "com HTTP 403 Forbidden. "
                                                                + "A URL e o header apikey foram enviados. "
                                                                + "Como a mesma chamada funciona diretamente "
                                                                + "no Thunder Client, verifique se o SGU/Kong "
                                                                + "possui restrição de IP para as conexões "
                                                                + "originadas pelo Render.",
                                                ex);
                        }

                        if (status == 401) {
                                throw new IllegalArgumentException(
                                                "O SGU recusou a API key com HTTP 401. "
                                                                + "Verifique o valor da variável "
                                                                + "SGU_API_KEY no Render.",
                                                ex);
                        }

                        throw new IllegalArgumentException(
                                        extrairMensagem(ex),
                                        ex);

                } catch (ResourceAccessException ex) {
                        log.error(
                                        "Não foi possível acessar o SGU. URL={}",
                                        uri,
                                        ex);

                        throw new IllegalStateException(
                                        "Não foi possível estabelecer conexão "
                                                        + "com a API do SGU em " + uri + ".",
                                        ex);

                } catch (Exception ex) {
                        log.error(
                                        "Erro inesperado ao chamar o SGU. URL={}",
                                        uri,
                                        ex);

                        throw new IllegalStateException(
                                        "Ocorreu um erro inesperado ao acessar "
                                                        + "a API do SGU: " + ex.getMessage(),
                                        ex);
                }
        }

        private URI montarUriAbsoluta(String path) {
                String caminho = normalizarPath(path);
                String enderecoCompleto = baseUrl + caminho;

                final URI uri;

                try {
                        uri = URI.create(enderecoCompleto);
                } catch (IllegalArgumentException ex) {
                        throw new IllegalStateException(
                                        "A URL montada para o SGU é inválida: "
                                                        + enderecoCompleto,
                                        ex);
                }

                if (!uri.isAbsolute()
                                || uri.getScheme() == null
                                || uri.getHost() == null) {
                        throw new IllegalStateException(
                                        "A URL montada para o SGU não é absoluta: "
                                                        + enderecoCompleto);
                }

                return uri;
        }

        private void validarChave() {
                if (apiKey.isBlank()) {
                        throw new IllegalStateException(
                                        "A variável SGU_API_KEY não foi "
                                                        + "configurada no backend.");
                }

                if (apiKey.contains("\n")
                                || apiKey.contains("\r")) {
                        throw new IllegalStateException(
                                        "A variável SGU_API_KEY contém "
                                                        + "uma quebra de linha inválida.");
                }
        }

        private String extrairMensagem(
                        RestClientResponseException ex) {
                String corpo = ex.getResponseBodyAsString(
                                StandardCharsets.UTF_8);

                if (corpo == null || corpo.isBlank()) {
                        return "Erro retornado pela API do SGU: HTTP "
                                        + ex.getStatusCode().value();
                }

                try {
                        Map<String, Object> json = mapper.readValue(
                                        corpo,
                                        new TypeReference<Map<String, Object>>() {
                                        });

                        Object mensagem = json.get("message");

                        if (mensagem == null) {
                                mensagem = json.get("error");
                        }

                        return mensagem == null
                                        ? corpo
                                        : String.valueOf(mensagem);

                } catch (Exception ignored) {
                        return corpo;
                }
        }

        private static String normalizarBaseUrl(
                        String baseUrl) {
                if (baseUrl == null || baseUrl.isBlank()) {
                        throw new IllegalStateException(
                                        "A variável SGU_API_BASE_URL está vazia.");
                }

                String valor = removerAspas(
                                baseUrl.trim());

                /*
                 * Corrige valores como:
                 * //api.lorena.sgusuite.com.br
                 */
                if (valor.startsWith("//")) {
                        valor = "https:" + valor;
                }

                /*
                 * Corrige valores sem protocolo:
                 * api.lorena.sgusuite.com.br
                 */
                if (!valor.startsWith("http://")
                                && !valor.startsWith("https://")) {
                        valor = "https://" + valor;
                }

                valor = removerBarraFinal(valor);

                final URI uri;

                try {
                        uri = URI.create(valor);
                } catch (IllegalArgumentException ex) {
                        throw new IllegalStateException(
                                        "A variável SGU_API_BASE_URL possui "
                                                        + "uma URL inválida: " + valor,
                                        ex);
                }

                if (!uri.isAbsolute()
                                || uri.getScheme() == null
                                || uri.getHost() == null) {
                        throw new IllegalStateException(
                                        "A variável SGU_API_BASE_URL deve conter "
                                                        + "uma URL absoluta. Valor recebido: "
                                                        + valor);
                }

                String protocolo = uri
                                .getScheme()
                                .toLowerCase(Locale.ROOT);

                if (!protocolo.equals("http")
                                && !protocolo.equals("https")) {
                        throw new IllegalStateException(
                                        "O protocolo da SGU_API_BASE_URL deve "
                                                        + "ser HTTP ou HTTPS.");
                }

                return valor;
        }

        private static String normalizarApiKey(
                        String apiKey) {
                if (apiKey == null) {
                        return "";
                }

                String valor = removerAspas(
                                apiKey.trim()).trim();

                String valorMinusculo = valor.toLowerCase(Locale.ROOT);

                if (valorMinusculo.startsWith("apikey:")
                                || valorMinusculo.startsWith("apikey=")
                                || valorMinusculo.startsWith("sgu_api_key=")) {
                        throw new IllegalStateException(
                                        "Na variável SGU_API_KEY, coloque apenas "
                                                        + "o valor da chave, sem 'apikey:', "
                                                        + "'apikey=' ou 'SGU_API_KEY='.");
                }

                return valor;
        }

        private static String normalizarPath(
                        String path) {
                String valor = path == null ? "" : path.trim();

                valor = removerAspas(valor);

                if (!valor.startsWith("/")) {
                        valor = "/" + valor;
                }

                return removerBarraFinal(valor);
        }

        private static String removerAspas(
                        String valor) {
                if (valor == null || valor.length() < 2) {
                        return valor == null ? "" : valor;
                }

                boolean aspasDuplas = valor.startsWith("\"")
                                && valor.endsWith("\"");

                boolean aspasSimples = valor.startsWith("'")
                                && valor.endsWith("'");

                if (aspasDuplas || aspasSimples) {
                        return valor.substring(
                                        1,
                                        valor.length() - 1);
                }

                return valor;
        }

        private static String removerBarraFinal(
                        String valor) {
                if (valor == null) {
                        return "";
                }

                String resultado = valor;

                while (resultado.length() > 1
                                && resultado.endsWith("/")) {
                        resultado = resultado.substring(
                                        0,
                                        resultado.length() - 1);
                }

                return resultado;
        }

        private static String limitarLog(
                        String texto) {
                if (texto == null || texto.isBlank()) {
                        return "(resposta vazia)";
                }

                String textoLimpo = texto
                                .replace("\r", " ")
                                .replace("\n", " ");

                int limite = 1000;

                if (textoLimpo.length() <= limite) {
                        return textoLimpo;
                }

                return textoLimpo.substring(0, limite)
                                + "...";
        }
}