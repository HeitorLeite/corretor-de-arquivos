package com.unimedlorena.tools.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.unimedlorena.tools.service.EspecialidadeService;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api/bi")
public class EspecialidadeController {

    private final EspecialidadeService svc;
    private final ObjectMapper mapper = new ObjectMapper();

    public EspecialidadeController(EspecialidadeService svc) { this.svc = svc; }

    @PostMapping("/especialidade")
    public ResponseEntity<byte[]> processar(
            @RequestParam("despesas") MultipartFile despesas,
            @RequestParam("medicos")  MultipartFile medicos) throws Exception {

        var resultado = svc.processar(despesas, medicos);
        String statsJson = mapper.writeValueAsString(resultado.stats());
        String nomeArq = despesas.getOriginalFilename() != null
            ? despesas.getOriginalFilename().replaceAll("\\.(xlsx|csv)$", "_PREENCHIDO.xlsx")
            : "despesas_PREENCHIDO.xlsx";

        return ResponseEntity.ok()
            .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + nomeArq + "\"")
            .header("X-Stats", statsJson)
            .header("Access-Control-Expose-Headers", "X-Stats")
            .contentType(MediaType.parseMediaType(
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"))
            .body(resultado.arquivo());
    }
}
