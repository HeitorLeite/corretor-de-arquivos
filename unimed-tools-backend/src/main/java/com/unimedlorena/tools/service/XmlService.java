package com.unimedlorena.tools.service;

import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.springframework.stereotype.Service;

import com.unimedlorena.tools.dto.XmlAnaliseResponse;
import com.unimedlorena.tools.dto.XmlAnaliseResponse.BlocoZerado;
import com.unimedlorena.tools.dto.XmlAnaliseResponse.PrefixoErro;

@Service
public class XmlService {

    // ── Padrões ────────────────────────────────────────────────────────────────

    private static final Pattern P_PREFIXO = Pattern.compile(
            "(<ans:codigoTabela>00</ans:codigoTabela>\\s*<ans:codigoProcedimento>)(18|19|20)(\\d+)(</ans:codigoProcedimento>)");

    private static final Pattern P_DESPESA = Pattern.compile(
            "<ans:despesa>[\\s\\S]*?</ans:despesa>");

    private static final Pattern P_VALOR = Pattern.compile(
            "<ans:valorTotal>(0+\\.?0*)</ans:valorTotal>");

    /**
     * Remove o bloco outrasDespesas quando ele estiver vazio.
     *
     * Aceita tanto a forma autocontida:
     * <ans:outrasDespesas/>
     *
     * quanto a forma com abertura e fechamento sem conteúdo:
     * <ans:outrasDespesas></ans:outrasDespesas>
     */
    private static final Pattern P_OUTRAS_DESPESAS_VAZIA = Pattern.compile(
            "<ans:outrasDespesas\\s*/>|<ans:outrasDespesas\\s*>\\s*</ans:outrasDespesas\\s*>");

    // ── Análise ─────────────────────────────────────────────────────────────────

    public XmlAnaliseResponse analisar(String content, boolean corretor, boolean removedor) {
        List<PrefixoErro> prefixos = corretor ? analisarPrefixos(content) : List.of();
        List<BlocoZerado> blocos = removedor ? analisarBlocos(content) : List.of();
        return new XmlAnaliseResponse(prefixos, blocos);
    }

    private List<PrefixoErro> analisarPrefixos(String content) {
        List<PrefixoErro> erros = new ArrayList<>();
        Matcher m = P_PREFIXO.matcher(content);

        while (m.find()) {
            erros.add(new PrefixoErro(m.start(), m.group(2) + m.group(3), m.group(3)));
        }

        return erros;
    }

    private List<BlocoZerado> analisarBlocos(String content) {
        List<BlocoZerado> blocos = new ArrayList<>();
        Matcher m = P_DESPESA.matcher(content);

        while (m.find()) {
            String bloco = m.group();
            Matcher vm = P_VALOR.matcher(bloco);

            if (vm.find() && Double.parseDouble(vm.group(1)) == 0.0) {
                blocos.add(new BlocoZerado(
                        tag(bloco, "ans:dataExecucao"),
                        tag(bloco, "ans:codigoTabela") + " / " + tag(bloco, "ans:codigoProcedimento"),
                        tag(bloco, "ans:descricaoProcedimento"),
                        vm.group(1)));
            }
        }

        return blocos;
    }

    // ── Correção ────────────────────────────────────────────────────────────────

    public String corrigir(String content, boolean corretor, boolean removedor) {
        if (corretor) {
            content = P_PREFIXO.matcher(content)
                    .replaceAll(m -> m.group(1) + m.group(3) + m.group(4));
        }

        if (removedor) {
            content = P_DESPESA.matcher(content).replaceAll(m -> {
                Matcher vm = P_VALOR.matcher(m.group());
                return (vm.find() && Double.parseDouble(vm.group(1)) == 0.0) ? "" : m.group();
            });
        }

        // Correção estrutural TISS: um bloco outrasDespesas vazio é inválido.
        // A remoção é feita sempre, independentemente das ferramentas selecionadas.
        boolean possuiOutrasDespesasVazia = P_OUTRAS_DESPESAS_VAZIA.matcher(content).find();
        if (possuiOutrasDespesasVazia) {
            content = P_OUTRAS_DESPESAS_VAZIA.matcher(content).replaceAll("");
        }

        // Remove linhas em branco que possam ter sobrado após as exclusões.
        if (removedor || possuiOutrasDespesasVazia) {
            content = content.replaceAll("\\n\\s*\\n", "\n");
        }

        return content;
    }

    // ── Utilitário ──────────────────────────────────────────────────────────────

    private String tag(String text, String tagName) {
        Matcher m = Pattern.compile("<" + tagName + ">(.*?)</" + tagName + ">", Pattern.DOTALL).matcher(text);
        return m.find() ? m.group(1).trim() : "—";
    }
}