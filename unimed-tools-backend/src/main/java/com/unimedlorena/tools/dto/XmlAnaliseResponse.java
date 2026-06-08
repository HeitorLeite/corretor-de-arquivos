package com.unimedlorena.tools.dto;
import java.util.List;

public record XmlAnaliseResponse(
    List<PrefixoErro> prefixos,
    List<BlocoZerado> blocos
) {
    public record PrefixoErro(int posicao, String original, String corrigido) {}
    public record BlocoZerado(String dataExecucao, String tabelaProcedimento, String descricao, String valorTotal) {}
}
