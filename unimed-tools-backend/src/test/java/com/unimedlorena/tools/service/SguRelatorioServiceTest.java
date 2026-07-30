package com.unimedlorena.tools.service;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;
import org.springframework.web.client.RestClient;

import com.fasterxml.jackson.databind.ObjectMapper;

class SguRelatorioServiceTest {

    @Test
    void deveEnviarHeaderConfiguravelParaOsgu() {
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();

        SguRelatorioService service = new SguRelatorioService(
                builder,
                new ObjectMapper(),
                "https://sgu.example.com",
                "segredo-teste",
                "apikey,x-api-key",
                "/api/procedure",
                "/api/procedure");

        server.expect(requestTo("https://sgu.example.com/api/procedure/lista_query_api"))
                .andExpect(header("x-api-key", "segredo-teste"))
                .andRespond(withSuccess("{\"ok\":true}", MediaType.APPLICATION_JSON));

        Map<String, Object> resposta = service.listar("relatorio");

        assertThat(resposta).containsEntry("ok", true);
        server.verify();
    }
}
