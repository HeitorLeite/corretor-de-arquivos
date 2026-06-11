package com.unimedlorena.tools.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.unimedlorena.tools.service.AnsService;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api/ans")
public class AnsController {

    private final AnsService svc;
    private final ObjectMapper mapper = new ObjectMapper();

    public AnsController(AnsService svc) { this.svc = svc; }

    /** POST /api/ans/filtrar-xlsx — XLSX multi-abas + TXT */
    @PostMapping("/filtrar-xlsx")
    public ResponseEntity<byte[]> filtrarXlsx(
            @RequestParam("xlsx") MultipartFile xlsx,
            @RequestParam("txt")  MultipartFile txt) throws Exception {

        var r = svc.processarXlsx(xlsx, txt);
        return buildResponse(r, txt.getOriginalFilename());
    }

    /** POST /api/ans/filtrar-csvs — CSVs individuais (todos opcionais) + TXT */
    @PostMapping("/filtrar-csvs")
    public ResponseEntity<byte[]> filtrarCsvs(
            @RequestParam(value = "ecnes",    required = false) MultipartFile ecnes,
            @RequestParam(value = "cnes",     required = false) MultipartFile cnes,
            @RequestParam(value = "municipio",required = false) MultipartFile municipio,
            @RequestParam(value = "prestador",required = false) MultipartFile prestador,
            @RequestParam(value = "aviso",    required = false) MultipartFile aviso,
            @RequestParam("txt") MultipartFile txt) throws Exception {

        var r = svc.processarCsvs(ecnes, cnes, municipio, prestador, aviso, txt);
        return buildResponse(r, txt.getOriginalFilename());
    }

    private ResponseEntity<byte[]> buildResponse(AnsService.Resultado r, String nomeOriginal) throws Exception {
        String stats = mapper.writeValueAsString(r.stats());
        String nome  = nomeOriginal != null
            ? nomeOriginal.replace(".txt", "_filtrado.txt") : "rede_filtrada.txt";

        return ResponseEntity.ok()
            .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + nome + "\"")
            .header("X-Stats", stats)
            .header("Access-Control-Expose-Headers", "X-Stats")
            .contentType(MediaType.TEXT_PLAIN)
            .body(r.arquivo());
    }
}
