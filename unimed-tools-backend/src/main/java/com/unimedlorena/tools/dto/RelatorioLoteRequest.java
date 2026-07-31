package com.unimedlorena.tools.dto;

import java.util.List;
import java.util.Map;

public record RelatorioLoteRequest(
    String nomeArquivo,
    String formato,
    List<Item> itens
) {
    public record Item(
        String apiNome,
        String nomeArquivo,
        List<Map<String, Object>> combinacoesFiltros
    ) {}
}
