package com.unimedlorena.tools.dto;

import java.util.Map;

public record RelatorioExportacaoRequest(
    Map<String, Object> filtros,
    String nomeArquivo
) {}
