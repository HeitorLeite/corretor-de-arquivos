package com.unimedlorena.tools.controller;

import java.nio.charset.StandardCharsets;

import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import com.unimedlorena.tools.dto.XmlAnaliseResponse;
import com.unimedlorena.tools.service.XmlService;

@RestController
@RequestMapping("/api/xml")
public class XmlController {

    private final XmlService xmlService;

    public XmlController(XmlService xmlService) {
        this.xmlService = xmlService;
    }

    /**
     * POST /api/xml/analisar
     * Params: file (multipart), corretor (bool), removedor (bool)
     * Returns: JSON com lista de prefixos e blocos encontrados
     */
    @PostMapping("/analisar")
    public ResponseEntity<XmlAnaliseResponse> analisar(
            @RequestParam("file") MultipartFile file,
            @RequestParam(defaultValue = "true") boolean corretor,
            @RequestParam(defaultValue = "true") boolean removedor) throws Exception {

        String content = new String(file.getBytes(), StandardCharsets.UTF_8);
        XmlAnaliseResponse response = xmlService.analisar(content, corretor, removedor);
        return ResponseEntity.ok(response);
    }

    /**
     * POST /api/xml/corrigir
     * Params: file (multipart), corretor (bool), removedor (bool)
     * Returns: XML corrigido como download
     */
    @PostMapping("/corrigir")
    public ResponseEntity<byte[]> corrigir(
            @RequestParam("file") MultipartFile file,
            @RequestParam(defaultValue = "true") boolean corretor,
            @RequestParam(defaultValue = "true") boolean removedor) throws Exception {

        String content = new String(file.getBytes(), StandardCharsets.UTF_8);
        String corrected = xmlService.corrigir(content, corretor, removedor);

        String originalName = file.getOriginalFilename();
        String outputName = originalName != null
                ? originalName.replace(".xml", "_corrigido.xml")
                : "corrigido.xml";

        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + outputName + "\"")
                .contentType(MediaType.APPLICATION_XML)
                .body(corrected.getBytes(StandardCharsets.UTF_8));
    }
}
